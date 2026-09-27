import type { Modifier } from "./analysis";
import type { Selection, TrackedPalette } from "./palette";

type Line = { text: string; start: number; end: number };
function linesOf(text: string): Line[] {
  let start = 0;
  return text.split("\n").map(line => {
    const row = { text: line, start, end: start + line.length };
    start += line.length + 1;
    return row;
  });
}
function declaredSkill(line: string): string | undefined {
  const used = line.indexOf("を使用。");
  if (used >= 0) return /《([^》]+)》\d+$/.exec(line.slice(0, used))?.[1];
  return /^《([^》]+)》\d+\s*\//.exec(line)?.[1];
}
function declarationMatches(line: string, modifier: Modifier): boolean {
  if (modifier.level !== undefined) return declaredSkill(line) === modifier.source;
  const used = line.indexOf("を使用。");
  if (used >= 0 && line.slice(0, used).endsWith(`で${modifier.source}`)) return true;
  return ["右手", "左手", "頭部", "胴部", "補助防具", "装身具"].some(slot => line.startsWith(`${slot}：${modifier.source}。`));
}
function isDeclaration(line: string): boolean {
  return declaredSkill(line) !== undefined || /を使用。/.test(line)
    || /^(?:右手|左手|頭部|胴部|補助防具|装身具)：/.test(line);
}
/** Add generated controls without marking unrelated formula ranges as hand edits. */
function insert(tracker: TrackedPalette, at: number, value: string): void {
  for (const range of tracker.ranges) {
    if (range.edited) continue;
    if (range.start >= at) { range.start += value.length; range.end += value.length; }
    else if (range.end > at) range.edited = true;
  }
  tracker.text = tracker.text.slice(0, at) + value + tracker.text.slice(at);
}
function addAtLineEnd(tracker: TrackedPalette, line: Line, commands: string[]): void {
  if (commands.length) insert(tracker, line.end, `\n${commands.join("\n")}`);
}
/** Add local on/off commands only for selected flag-mode modifiers. Additions are
 * idempotent; deselection never deletes the user's text or resource counters. */
export function ensureFlagCommands(tracker: TrackedPalette, selections: Selection[]): void {
  const unique = new Map<string, { modifier: Modifier; flag: string }>();
  for (const selection of selections) {
    if (!selection.flag || /[\r\n{}]/.test(selection.flag)) continue;
    const key = JSON.stringify([selection.modifier.level === undefined ? "item" : "skill", selection.modifier.source, selection.flag]);
    unique.set(key, { modifier: selection.modifier, flag: selection.flag });
  }
  for (const { modifier, flag } of unique.values()) {
    const commands = [`:${flag}=1`, `:${flag}=0`];
    const rows = linesOf(tracker.text);
    const anchors = rows.map((row, index) => ({ row, index })).filter(({ row }) => declarationMatches(row.text, modifier));
    if (anchors.length) {
      // Work backwards so earlier declaration positions do not shift.
      for (const { row, index } of anchors.reverse()) {
        let end = index + 1;
        while (end < rows.length && rows[end].text !== "" && !rows[end].text.startsWith("### ") && !isDeclaration(rows[end].text)) end++;
        const block = rows.slice(index + 1, end);
        const missing = commands.filter(command => !block.some(r => r.text.trim() === command));
        if (!missing.length) continue;
        const existing = block.filter(r => commands.includes(r.text.trim()));
        if (existing.length) { addAtLineEnd(tracker, existing[existing.length - 1], missing); continue; }
        let after = row;
        for (const next of block) {
          // Costs precede switches; target input and rolls remain afterwards.
          if (!/^:[^\n]+-[0-9]+$/.test(next.text.trim())) break;
          after = next;
        }
        addAtLineEnd(tracker, after, missing);
      }
      continue;
    }
    // A carried passive item might not have a declaration. Keep its controls
    // together before resets, rather than inventing a use timing for the item.
    const heading = "### ■補正フラグ";
    const current = linesOf(tracker.text), start = current.findIndex(r => r.text === heading);
    if (start >= 0) {
      let end = start + 1;
      while (end < current.length && !current[end].text.startsWith("### ")) end++;
      const block = current.slice(start + 1, end);
      const missing = commands.filter(command => !block.some(r => r.text.trim() === command));
      const filled = block.filter(r => r.text.trim());
      addAtLineEnd(tracker, filled[filled.length - 1] ?? current[start], missing);
    } else {
      const boundary = current.find(r => /^### ■(?:シーン|シナリオ).*リセット/.test(r.text));
      if (boundary) insert(tracker, boundary.start, `${heading}\n${commands.join("\n")}\n\n`);
      else insert(tracker, tracker.text.length, `${tracker.text.endsWith("\n\n") ? "" : "\n\n"}${heading}\n${commands.join("\n")}`);
    }
  }
}
