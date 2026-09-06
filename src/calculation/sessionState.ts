import { compatible, type Modifier, type RollTarget } from "./analysis";
import { renderRoll, type PreparedPalette, type Selection } from "./palette";

export type CalculationState = {
  version: 1;
  flags: { key: string; name: string; actual?: string }[];
  choices: { target: string; modifier: string; checked: boolean; toggle: boolean }[];
};
export const emptyCalculationState = (): CalculationState => ({ version: 1, flags: [], choices: [] });
export type CalculationEditor = (() => void) & { getState: () => CalculationState };
export function targetKey(t: RollTarget): string {
  return JSON.stringify([t.skillName ? "skill" : "general", t.skillName ?? t.title, t.kind, t.judge ?? "", t.suffix]);
}
/** Exclude row numbers and computed SL amounts. Reordered/levelled skills retain their identity. */
const modifierKeyCache = new WeakMap<Modifier[], Map<Modifier, string>>();
export function modifierKey(m: Modifier, all: Modifier[]): string {
  let keys = modifierKeyCache.get(all);
  if (!keys) {
    keys = new Map(); const counts = new Map<string, number>();
    for (const x of all) {
      const signature = JSON.stringify([x.level === undefined ? "item" : "skill", x.source, x.effect,
        x.kinds, x.attack, x.judge, x.hitOnly, x.magicOnly, x.penetrationOnly, x.diceOnly, x.onlySkill, x.attribute]);
      const count = counts.get(signature) ?? 0; keys.set(x, `${signature}#${count}`); counts.set(signature, count + 1);
    }
    modifierKeyCache.set(all, keys);
  }
  return keys.get(m) ?? "";
}
export function selectionsFor(prepared: PreparedPalette, target: RollTarget, state: CalculationState): Selection[] {
  const choices = state.choices.filter(c => c.checked && c.target === targetKey(target));
  return prepared.modifiers.filter(m => compatible(m, target)).flatMap(modifier => {
    const choice = choices.find(c => c.modifier === modifierKey(modifier, prepared.modifiers));
    if (!choice) return [];
    const binding = state.flags.find(f => f.key === modifier.flag);
    return [{ modifier, flag: choice.toggle ? binding?.actual ?? binding?.name ?? modifier.flag : undefined }];
  });
}
export function applyCalculationState(prepared: PreparedPalette, state: CalculationState): PreparedPalette {
  let cursor = 0, text = "";
  const ranges = prepared.ranges.map(range => {
    text += prepared.text.slice(cursor, range.start);
    const target = prepared.targets.find(t => t.id === range.id)!;
    const expected = renderRoll(target, selectionsFor(prepared, target, state)), start = text.length;
    text += expected; cursor = range.end;
    return { ...range, start, end: text.length, expected, edited: false };
  });
  text += prepared.text.slice(cursor);
  return { ...prepared, text, ranges };
}

/** Remap only exact formula lines in the same skill/section. Other text is treated as user-owned. */
export function locateSavedRanges(prepared: PreparedPalette, text: string): PreparedPalette {
  // An unchanged palette already has exact positions, even when two formula lines match.
  // Only infer positions when loading text that differs from the generated document.
  if (text === prepared.text) return { ...prepared, ranges: prepared.ranges.map(range => ({ ...range })) };
  type Line = { text: string; scope: string; start: number };
  const lines = (input: string): Line[] => {
    let section = "", skill = "", start = 0;
    return input.split("\n").map(text => {
      if (text.startsWith("### ■")) { section = text; skill = ""; }
      const name = /《([^》]+)》\d+を使用。/.exec(text)?.[1];
      if (name) skill = name;
      const row = { text, scope: `${section}\0${skill}`, start }; start += text.length + 1;
      return row;
    });
  };
  const original = lines(prepared.text), current = lines(text), used = new Set<number>();
  const ranges = prepared.ranges.map(range => {
    const old = original.find(l => l.start === range.start);
    const matches = current.filter(l => l.scope === old?.scope && l.text === range.expected && !used.has(l.start));
    if (matches.length !== 1) return { ...range, start: 0, end: 0, edited: true };
    used.add(matches[0].start);
    return { ...range, start: matches[0].start, end: matches[0].start + range.expected.length, edited: false };
  });
  return { ...prepared, text, ranges };
}
