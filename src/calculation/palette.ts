import type { ParsedSheet } from "../ytsheet/types";
import { analyzeModifiers, attackKind, skillRolls, type Analysis, type Modifier, type RollTarget } from "./analysis";
import { addTerm, gatedTerm, type Amount } from "./expression";
import { replaceFlagReferences } from "./flagNames";

export type Selection = { modifier: Modifier; flag?: string };
export type FormulaRange = { id: string; start: number; end: number; expected: string; edited: boolean };
export type PreparedPalette = Analysis & { text: string; targets: RollTarget[]; ranges: FormulaRange[] };
type Row = { text: string; target?: RollTarget };

export function renderRoll(target: RollTarget, selected: Selection[] = []): string {
  let { dice, fixed } = target.base;
  for (const { modifier, flag } of selected) {
    dice = addTerm(dice, gatedTerm(modifier.amount.dice, flag));
    fixed = addTerm(fixed, gatedTerm(modifier.amount.fixed, flag));
  }
  const simpleDice = (target.kind === "hpSet" || target.kind === "effect") && /^\d+$/.test(dice);
  const formula = dice === "0" ? `C(${fixed})` : `${simpleDice ? dice : `(${dice})`}D${fixed === "0" ? "" : (fixed.startsWith("-") ? fixed : `+${fixed}`)}`;
  return `${formula}${target.kind === "check" ? ">=0" : ""} ${target.suffix}`;
}

function checkTarget(line: string, id: string, title: string, skillName?: string, attack?: RollTarget["attack"]): RollTarget | null {
  const m = /^\((.+)\)D\+(.+)>=0 (.+)$/.exec(line);
  if (!m) return null;
  return { id, title, kind: "check", base: { dice: m[1], fixed: m[2] }, suffix: m[3],
    skillName, attack, magic: /魔術/.test(m[3]), judge: m[3] };
}
function damageBase(base: Amount): Amount {
  return { dice: addTerm(base.dice, "{ダメBD}"), fixed: addTerm(base.fixed, "{ダメバフ}") };
}

/** Every active occurrence gets its own tracked ranges. Copies share semantic skill
 * keys and modifier choices, but editing one formula never overwrites that line. */
export function prepareCalculationPalette(sheet: ParsedSheet, palette: string): PreparedPalette {
  const analysis = analyzeModifiers(sheet);
  const rows: Row[] = palette.split("\n").map(text => ({ text }));
  const claimed = new Set<Row>();
  for (let index = 0; index < sheet.skills.length; index++) {
    const skill = sheet.skills[index];
    if (/パッシブ|アイテム/.test(skill.timing)) continue;
    const declarations = rows.filter(row => !claimed.has(row) && row.text.includes(`《${skill.name}》${skill.level}を使用。`));
    if (!declarations.length) continue;
    const rolls = skillRolls(skill, index, analysis.reviews), attack = attackKind(skill);
    const usable = rolls.filter(roll => {
      if (rolls.filter(r => r.kind === roll.kind).length > 1) {
        analysis.reviews.push({ source: skill.name, reason: "同じ種類の量が複数あり、式を一つに確定できません。", effect: skill.effect }); return false;
      }
      return true;
    });
    for (let occurrence = 0; occurrence < declarations.length; occurrence++) {
      const declaration = declarations[occurrence], start = rows.indexOf(declaration);
      if (start < 0) continue;
      claimed.add(declaration);
      const idSuffix = occurrence ? `-copy-${occurrence}` : "";
      let end = start + 1;
      while (end < rows.length && rows[end].text !== "" && !rows[end].text.startsWith("### ") && !/《[^》]+》\d+を使用。/.test(rows[end].text)) end++;
      let insertion = start + 1, checks = 0;
      for (let j = start + 1; j < end; j++) {
        if (rows[j].text.startsWith(":" ) || rows[j].text === "対象：") {
          if (!rows[j].text.startsWith(`:${skill.name}`)) insertion = j + 1;
        }
        const checkId = `skill-${index}-check${idSuffix}${checks ? `-${checks}` : ""}`;
        const check = checkTarget(rows[j].text, checkId, `《${skill.name}》 ${skill.judge}`, skill.name, attack);
        if (check) {
          checks++;
          check.attribute = rolls.find(r => r.kind === "damage")?.attribute;
          if (!attack && rolls.some(r => r.kind !== "damage")) check.base.dice = check.base.dice.replace(/\+\{命中BD\}/g, "");
          rows[j] = { text: renderRoll(check), target: check }; insertion = j + 1;
        }
      }
      rows.splice(insertion, 0, ...usable.map(roll => {
        const target = { ...roll, id: roll.id + idSuffix, base: roll.kind === "damage" ? damageBase(roll.base) : { ...roll.base } };
        return { text: renderRoll(target), target };
      }));
    }
  }
  let section = "";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.text.startsWith("### ■")) section = row.text.slice(5);
    if (row.target) continue;
    const isWeapon = i > 0 && rows[i - 1].text === "メジャーアクションで武器攻撃を行う。";
    const check = checkTarget(row.text, `general-${i}`, `${section}：${row.text.split(">=0 ")[1] ?? "判定"}`, undefined,
      isWeapon || / 命中判定$/.test(row.text) ? "weapon" : undefined);
    if (check) { row.target = check; continue; }
    if (i >= 2 && rows[i - 2].text === "メジャーアクションで武器攻撃を行う。") {
      const target: RollTarget = { id: "weapon-damage", title: "通常の武器攻撃：ダメージ", kind: "damage", attack: "weapon",
        base: damageBase({ dice: "{攻撃ダイス}", fixed: "{攻撃力}" }), suffix: "{ダメージ属性}ダメージ" };
      row.text = renderRoll(target); row.target = target;
    }
  }
  const targets: RollTarget[] = [], ranges: FormulaRange[] = [];
  let offset = 0;
  for (const row of rows) {
    if (row.target) {
      targets.push(row.target);
      ranges.push({ id: row.target.id, start: offset, end: offset + row.text.length, expected: row.text, edited: false });
    }
    offset += row.text.length + 1;
  }
  return { ...analysis, text: rows.map(r => r.text).join("\n"), targets, ranges };
}

/** Tracks user edits; never replaces a formula once the user has edited its text. */
export class TrackedPalette {
  text: string;
  ranges: FormulaRange[];
  constructor(text: string, ranges: FormulaRange[]) {
    this.text = text; this.ranges = ranges.map(r => ({ ...r }));
  }
  observe(next: string): void {
    if (next === this.text) return;
    let start = 0;
    while (start < this.text.length && start < next.length && this.text[start] === next[start]) start++;
    let oldEnd = this.text.length, newEnd = next.length;
    while (oldEnd > start && newEnd > start && this.text[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
    const shift = newEnd - oldEnd;
    for (const range of this.ranges) {
      if (range.end < start) continue;
      if (range.start > oldEnd) { range.start += shift; range.end += shift; continue; }
      range.edited = true;
    }
    this.text = next;
  }
  renameFlag(from: string, to: string): void {
    if (from === to) return;
    const previous = this.text;
    for (const range of this.ranges) {
      if (range.edited) continue;
      if (previous.slice(range.start, range.end) !== range.expected) { range.edited = true; continue; }
      const start = replaceFlagReferences(previous.slice(0, range.start), from, to).length;
      range.expected = replaceFlagReferences(range.expected, from, to);
      range.start = start;
      range.end = start + range.expected.length;
    }
    this.text = replaceFlagReferences(previous, from, to);
  }
  replace(id: string, line: string): boolean {
    const range = this.ranges.find(r => r.id === id);
    if (!range || range.edited || this.text.slice(range.start, range.end) !== range.expected) return false;
    const shift = line.length - (range.end - range.start), end = range.end;
    this.text = this.text.slice(0, range.start) + line + this.text.slice(end);
    for (const other of this.ranges) if (other !== range && !other.edited && other.start >= end) {
      other.start += shift; other.end += shift;
    }
    range.end += shift; range.expected = line;
    return true;
  }
}
