import type { CustomCommandMap, ParsedSheet, YtSkill } from "../ytsheet/types";
import { detectUsageLimit } from "../palette/detectUsageLimit";
import { safeNumber } from "../utils/safeNumber";

const ALIASES: Record<string, string> = {
  物防: "物理防御力",
  魔防: "魔法防御力",
};

const DEFAULT_CONSUMABLES = ["HPP", "MPP", "HHPP", "HMPP", "毒消し"];

const OPTIONAL_CONSUMABLES = [
  "EXHPP",
  "EXMPP",
  "GHPP",
  "GMPP",
  "耐毒符",
  "にく",
  "野菜",
  "果実",
  "強心丹",
  "万能薬",
  "蘇生薬",
];

function hasSkill(sheet: ParsedSheet, name: string): boolean {
  return sheet.skills.some((s) => s.name === name);
}

function isToggleSkill(skill: YtSkill): boolean {
  const text = `${skill.timing} ${skill.effect}`;
  return /シーン終了まで持続|メインプロセス終了まで持続|ラウンド終了まで持続|影響がある場所にいる間|効果を受ける場所/.test(text);
}

function normalizeNumberText(value: string): string {
  return value.replace(/,/g, "").replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

function consumesGold(skill: YtSkill): boolean {
  const text = normalizeNumberText(`${skill.usage} ${skill.effect}`);
  return /(?:所持金を\s*)?\d+\s*G\s*消費/.test(text);
}

function addStatus(list: { label: string; value: string; max: string }[], existing: Set<string>, label: string, value: number | string, max: number | string) {
  if (!label || existing.has(label)) return;
  list.push({ label, value: String(value), max: String(max) });
  existing.add(label);
}

function itemText(raw: Record<string, unknown>): string {
  return normalizeNumberText(String(raw.items ?? ""))
    .replace(/&lt;br&gt;/g, "\n")
    .replace(/<br\s*\/?>/g, "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countForLabelInLine(line: string, label: string): number {
  const escaped = escapeRegExp(label);
  const match = line.match(new RegExp(`(^|[\\s　,，、/])${escaped}\\s*(?:[＊*×xX]\\s*(\\d+)|[（(]\\s*(\\d+)\\s*[）)])?(?=$|[\\s　@,，、/（(])`));
  if (!match) return 0;
  return safeNumber(match[2] ?? match[3], 1);
}

function itemCount(raw: Record<string, unknown>, label: string): number {
  let total = 0;
  for (const line of itemText(raw).split(/\r?\n/)) {
    total += countForLabelInLine(line, label);
  }
  return total;
}

function detectRiryokufu(raw: Record<string, unknown>): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const line of itemText(raw).split(/\r?\n/)) {
    const matches = [...line.matchAll(/理力符\s*[〈<《(（]\s*([^〉>》)）\s]+)\s*[〉>》)）]/g)];
    for (const match of matches) {
      const attr = match[1]?.trim();
      if (!attr) continue;
      const label = `理力符〈${attr}〉`;
      counts.set(label, (counts.get(label) ?? 0) + countForLabelInLine(line, label));
    }
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

export function buildStatus(sheet: ParsedSheet, custom: CustomCommandMap) {
  const carryMax = safeNumber(sheet.raw.weightLimitItems, sheet.carry);
  const fixed = [
    ["HP", sheet.hp, sheet.hp],
    ["MP", sheet.mp, sheet.mp],
    ["フェイト", sheet.fate, sheet.fate],
    ["移動力", sheet.move, 0],
    ["物理防御力", sheet.phyDef, 0],
    ["魔法防御力", sheet.magDef, 0],
    ["携帯可能重量", sheet.carry, carryMax],
    ["判定BD", 0, 0],
    ["命中BD", 0, 0],
    ["回避BD", 0, 0],
    ["ダメBD", 0, 0],
    ["ダメバフ", 0, 0],
  ].map(([label, value, max]) => ({ label: String(label), value: String(value), max: String(max) }));

  const existing = new Set(fixed.map((s) => s.label));
  const extras: { label: string; value: string; max: string }[] = [];
  const raw = sheet.raw;

  for (const label of DEFAULT_CONSUMABLES) {
    addStatus(extras, existing, label, itemCount(raw, label), 0);
  }
  for (const label of OPTIONAL_CONSUMABLES) {
    const count = itemCount(raw, label);
    if (count > 0) addStatus(extras, existing, label, count, 0);
  }
  for (const item of detectRiryokufu(raw)) {
    addStatus(extras, existing, item.label, item.count, 0);
  }

  if (hasSkill(sheet, "エングレイブド")) {
    const epFromSheet = safeNumber(raw.unitStatus1Label === "EP" ? raw.unitStatus1Value : raw.EP, 0);
    const engraved = sheet.skills.find((s) => s.name === "エングレイブド");
    const calculated = engraved ? engraved.level * 3 + 1 : 0;
    addStatus(extras, existing, "EP", epFromSheet || calculated, 0);
  }

  if (sheet.skills.some(consumesGold)) {
    addStatus(extras, existing, "所持金", safeNumber(raw.moneyTotal ?? raw.money, 0), 0);
  }

  const unitStatusNum = safeNumber(raw.unitStatusNum, 0);
  for (let i = 1; i <= unitStatusNum; i++) {
    const rawLabel = String(raw[`unitStatus${i}Label`] ?? "").trim();
    const label = ALIASES[rawLabel] ?? rawLabel;
    if (label === "EP" && !hasSkill(sheet, "エングレイブド")) continue;
    const value = safeNumber(raw[`unitStatus${i}Value`], 0);
    addStatus(extras, existing, label, value, 0);
  }

  for (const skill of sheet.skills) {
    const limit = detectUsageLimit(skill);
    if (limit) addStatus(extras, existing, skill.name, limit.max, limit.max);
    if (isToggleSkill(skill)) addStatus(extras, existing, skill.name, 0, 0);
  }

  for (const c of Object.values(custom)) {
    if (c.status) addStatus(extras, existing, c.status.label ?? "カスタム", c.status.initial ?? 0, c.status.max ?? 0);
  }

  return [...fixed, ...extras];
}
