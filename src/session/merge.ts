/** Three-way merge. User edits win provisionally; conflicts require an explicit choice. */
export type Conflict = { id: string; field: string; before: string; local: string; incoming: string; allowBoth?: boolean };
export type Choices = Record<string, "local" | "incoming" | "both">;
export type MergeResult = { text: string; conflicts: Conflict[] };
type Edit = { start: number; end: number; lines: string[] };

function edits(base: string[], next: string[]): Edit[] | null {
  if ((base.length + 1) * (next.length + 1) > 2500000) return null;
  const width = next.length + 1;
  const table = new Uint32Array((base.length + 1) * width);
  for (let i = base.length - 1; i >= 0; i--) for (let j = next.length - 1; j >= 0; j--) {
    table[i * width + j] = base[i] === next[j] ? table[(i + 1) * width + j + 1] + 1
      : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
  }
  let i = 0, j = 0;
  const result: Edit[] = [];
  while (i < base.length || j < next.length) {
    if (i < base.length && j < next.length && base[i] === next[j]) { i++; j++; continue; }
    const start = i, lines: string[] = [];
    while (i < base.length || j < next.length) {
      if (i < base.length && j < next.length && base[i] === next[j]) break;
      if (j < next.length && (i === base.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) lines.push(next[j++]);
      else i++;
    }
    result.push({ start, end: i, lines });
  }
  return result;
}
function overlap(a: Edit, b: Edit): boolean {
  // Insertions at the same position are ambiguous; adjacent replacements are not.
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return a.start > b.start && a.start < b.end;
  if (b.start === b.end) return b.start > a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}
function applyRegion(base: string[], start: number, end: number, changes: Edit[]): string[] {
  let cursor = start; const result: string[] = [];
  for (const e of changes.sort((a, b) => a.start - b.start)) {
    result.push(...base.slice(cursor, e.start), ...e.lines); cursor = e.end;
  }
  return [...result, ...base.slice(cursor, end)];
}

export function mergeText(before: string, local: string, incoming: string, field: string, choices: Choices = {}): MergeResult {
  if (local === before || local === incoming) return { text: incoming, conflicts: [] };
  if (incoming === before) return { text: local, conflicts: [] };
  const base = before.split("\n"), left = edits(base, local.split("\n")), right = edits(base, incoming.split("\n"));
  if (!left || !right) {
    const id = `${field}:whole`;
    return { text: choices[id] === "incoming" ? incoming : local, conflicts: [{ id, field, before, local, incoming }] };
  }
  const pending = [...left.map(e => ({ ...e, side: "local" })), ...right.map(e => ({ ...e, side: "incoming" }))]
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: string[] = [], conflicts: Conflict[] = [];
  let cursor = 0;
  while (pending.length) {
    const group = [pending.shift()!];
    let grew = true;
    while (grew) {
      grew = false;
      for (let n = 0; n < pending.length; n++) if (group.some(e => overlap(e, pending[n]))) {
        group.push(pending.splice(n, 1)[0]); grew = true; n--;
      }
    }
    const start = Math.min(...group.map(e => e.start)), end = Math.max(...group.map(e => e.end));
    result.push(...base.slice(cursor, start));
    const a = group.filter(e => e.side === "local"), b = group.filter(e => e.side === "incoming");
    if (!a.length || !b.length) result.push(...applyRegion(base, start, end, group));
    else {
      const mine = applyRegion(base, start, end, a).join("\n"), theirs = applyRegion(base, start, end, b).join("\n");
      if (mine === theirs) result.push(...applyRegion(base, start, end, a));
      else {
        const id = `${field}:${start}:${end}`;
        conflicts.push({ id, field: `${field}（元の${start + 1}行目付近）`, before: base.slice(start, end).join("\n"), local: mine, incoming: theirs, ...(start === end ? { allowBoth: true } : {}) });
        if (choices[id] === "both" && start === end) result.push(...applyRegion(base, start, end, b), ...applyRegion(base, start, end, a));
        else result.push(...(choices[id] === "incoming" ? applyRegion(base, start, end, b) : applyRegion(base, start, end, a)));
      }
    }
    cursor = end;
  }
  result.push(...base.slice(cursor));
  return { text: result.join("\n"), conflicts };
}

export function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.trim().split("\t").map(s => s.trim());
  if (/[=＝,，/]/.test(line)) return line.trim().split(/\s*[=＝,，/]\s*/);
  return line.trim().split(/\s+/);
}
type Row = { label: string; raw: string; cells: string[] };
function rows(text: string, columns: number): Row[] | null {
  const result: Row[] = [], names = new Set<string>();
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    const cells = splitRow(raw);
    if (columns === 3 && cells.length === 2) cells.push("0");
    if (!cells[0] || cells.length !== columns || names.has(cells[0])) return null;
    names.add(cells[0]); result.push({ label: cells[0], raw, cells });
  }
  return result;
}
const equal = (a?: Row, b?: Row) => JSON.stringify(a?.cells) === JSON.stringify(b?.cells);

/** Keep user row order and deletions. The caller specifies session-start resource overrides. */
export function mergeRows(
  before: string, local: string, incoming: string, field: string, columns: number,
  forced: ReadonlyMap<string, string[]> = new Map(), choices: Choices = {},
): MergeResult {
  const base = rows(before, columns), mine = rows(local, columns), next = rows(incoming, columns);
  if (!base || !mine || !next) {
    const id = `${field}:format`;
    return { text: choices[id] === "incoming" ? incoming : local,
      conflicts: [{ id, field: `${field}（区切り・重複を確認）`, before, local, incoming }] };
  }
  const b = new Map(base.map(r => [r.label, r])), l = new Map(mine.map(r => [r.label, r])), n = new Map(next.map(r => [r.label, r]));
  const labels = [...mine.map(r => r.label), ...next.filter(r => !l.has(r.label) && !b.has(r.label)).map(r => r.label)];
  const result: string[] = [], conflicts: Conflict[] = [];
  for (const label of labels) {
    const previous = b.get(label), edited = l.get(label), fresh = n.get(label);
    if (forced.has(label) && (fresh || edited)) { result.push(forced.get(label)!.join("\t")); continue; }
    if (equal(edited, previous) || equal(edited, fresh)) { if (fresh) result.push(fresh.raw); continue; }
    if (equal(fresh, previous)) { if (edited) result.push(edited.raw); continue; }
    const id = `${field}:${label}`;
    conflicts.push({ id, field: `${field}：${label}`, before: previous?.raw ?? "", local: edited?.raw ?? "", incoming: fresh?.raw ?? "" });
    const selected = choices[id] === "incoming" ? fresh : edited;
    if (selected) result.push(selected.raw);
  }
  // Rows deliberately deleted by the user are not silently restored, even after a level change.
  return { text: result.join("\n"), conflicts };
}

export function mergeMetadata(before: string, local: string, incoming: string, choices: Choices = {}): MergeResult {
  const a = JSON.parse(before), b = JSON.parse(local), c = JSON.parse(incoming);
  const result = { ...b, data: { ...b.data } }; const conflicts: Conflict[] = [];
  for (const key of new Set([...Object.keys(a.data ?? {}), ...Object.keys(c.data ?? {})])) {
    const old = JSON.stringify(a.data?.[key]), mine = JSON.stringify(b.data?.[key]), fresh = JSON.stringify(c.data?.[key]);
    const id = `コマ情報:${key}`;
    if (mine === old || mine === fresh || choices[id] === "incoming") {
      if (fresh === undefined) delete result.data[key]; else result.data[key] = c.data[key];
    } else if (fresh !== old) conflicts.push({ id, field: `コマ情報：${key}`, before: old ?? "", local: mine ?? "", incoming: fresh ?? "" });
  }
  return { text: JSON.stringify(result), conflicts };
}
