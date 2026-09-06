/** Advisory checks only: never evaluate expressions or mutate the user's fields. */
export type EditorField = "statusEdit" | "paramsEdit" | "palette";
export type ValidationIssue = {
  code: "columns" | "name" | "number" | "duplicate" | "undefined" | "status" | "cycle";
  field: EditorField; line: number; label: string; message: string;
};
export type EditorText = { statusEdit: string; paramsEdit: string; palette: string };
type Definition = { name: string; value: string; field: EditorField; line: number };

// Match the current editor's delimiter rules. Diagnostics must describe what is actually exported.
function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (/[=＝,，/]/.test(line)) return line.split(/\s*[=＝,，/]\s*/);
  return line.split(/\s+/);
}
const references = (text: string): string[] => [...text.matchAll(/\{([^{}\r\n]+)\}/g)].map(m => m[1]);
const invalidName = (name: string) => /[{}｛｝\u0000-\u001f\u007f]/.test(name);

export function validateEditor(text: EditorText): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const definitions = new Map<string, Definition[]>();
  const statuses = new Set<string>();
  const pending: Definition[] = [];
  const seen = new Set<string>();
  const report = (code: ValidationIssue["code"], d: Definition, message: string, label = d.name) => {
    const key = JSON.stringify([code, d.field, d.line, label]);
    if (seen.has(key)) return;
    seen.add(key); issues.push({ code, field: d.field, line: d.line, label, message });
  };
  const define = (d: Definition) => {
    if (!d.name || invalidName(d.name)) report("name", d, "名前が空、または名前に { }・改行などが含まれています。区切り方を確認してください。");
    const existing = definitions.get(d.name) ?? [];
    if (existing.length) report("duplicate", d, `「${d.name}」が複数の場所で定義されています。意図した重複か確認してください。`);
    existing.push(d); definitions.set(d.name, existing);
    pending.push(d);
  };
  for (const field of ["statusEdit", "paramsEdit"] as const) {
    text[field].split(/\r?\n/).forEach((original, index) => {
      const line = original.trim();
      if (!line) return;
      const parts = splitLine(line).map(p => p.trim());
      const d: Definition = { name: parts[0] ?? "", value: parts[1] ?? "0", field, line: index + 1 };
      const expected = field === "statusEdit" ? 3 : 2;
      if (parts.length < 2 || parts.length > expected) report("columns", d,
        field === "statusEdit" ? "「名前 現在値 最大値」の区切りを確認してください。例：HPP 2 0" : "「名前 値」の区切りを確認してください。値の途中の区切り記号で分割されていないか確認してください。");
      define(d);
      if (field === "statusEdit") {
        statuses.add(d.name);
        const value = parts[1] ?? "0", max = parts[2] ?? "0";
        if (!value || !max || !Number.isFinite(Number(value)) || !Number.isFinite(Number(max))) {
          report("number", d, `「${d.name}」の現在値・最大値に数値以外が入っています。文字や参照式はパラメータ欄に置いてください。`);
        } else if (Number(max) < 0 || (Number(max) > 0 && Number(value) > Number(max))) {
          report("number", d, `「${d.name}」の最大値が負、または現在値が最大値を超えています。最大値0は上限なしとして確認します。`);
        }
      }
    });
  }
  const commands: Definition[] = [];
  text.palette.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    const d: Definition = { name: "", value: line, field: "palette", line: index + 1 };
    if (trimmed.startsWith("###")) return;
    if (trimmed.startsWith("//")) {
      const m = /^\/\/\s*([^=]*?)\s*=(.*)$/.exec(trimmed);
      if (m) define({ ...d, name: m[1], value: m[2] });
      return;
    }
    pending.push(d);
    const m = /^\s*:([^=+\-\r\n]+)[=+\-]/.exec(line);
    if (m) commands.push({ ...d, name: m[1].trim() });
  });
  for (const d of pending) {
    for (const name of references(d.value)) {
      if (!definitions.has(name)) report("undefined", d, `「{${name}}」の定義がこの出力内にありません。ステータス・パラメータ・//定義を確認してください（ルーム変数なら対応不要）。`, name);
    }
  }
  for (const d of commands) {
    if (d.name === "initiative" || statuses.has(d.name)) continue;
    report("status", d, `「:${d.name}」で操作するステータスがありません。パラメータや//定義だけではステータスの増減先になりません。`);
  }
  // Do not assume which duplicate definition wins. Check unique definitions with iterative DFS.
  const graph = new Map<string, string[]>();
  for (const [name, values] of definitions) {
    if (values.length !== 1) continue;
    const d = values[0];
    graph.set(name, d.field === "statusEdit" ? [] : references(d.value).filter(n => definitions.get(n)?.length === 1));
  }
  const color = new Map<string, number>();
  const reportedCycles = new Set<string>();
  for (const root of graph.keys()) {
    if (color.has(root)) continue;
    const stack = [{ name: root, edge: 0 }];
    const active = new Map<string, number>([[root, 0]]);
    color.set(root, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = graph.get(frame.name) ?? [];
      if (frame.edge >= edges.length) {
        color.set(frame.name, 2); active.delete(frame.name); stack.pop(); continue;
      }
      const next = edges[frame.edge++];
      if (color.get(next) === 1) {
        const names = stack.slice(active.get(next)!).map(f => f.name);
        const key = [...names].sort().join("\0");
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          const path = names.length <= 8 ? [...names, next].join(" → ") : `${names.slice(0, 6).join(" → ")} → … → ${next}`;
          report("cycle", definitions.get(next)![0], `参照が循環しています：${path}。参照先を見直してください。`);
        }
      } else if (!color.has(next)) {
        color.set(next, 1); active.set(next, stack.length); stack.push({ name: next, edge: 0 });
      }
    }
  }
  return issues;
}
