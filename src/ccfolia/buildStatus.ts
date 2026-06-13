import type { CustomCommandMap, ParsedSheet, YtSkill } from "../ytsheet/types";
import { detectUsageLimit } from "../palette/detectUsageLimit";
import { safeNumber } from "../utils/safeNumber";

const ALIASES: Record<string, string> = {
  物防: "物理防御力",
  魔防: "魔法防御力",
};

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

function itemCount(raw: Record<string, unknown>, label: string): number {
  const text = String(raw.items ?? "").replace(/&lt;br&gt;/g, "\n").replace(/<br\s*\/?>/g, "\n");
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}\\s*[＊*×xX]\\s*(\\d+)`),
    new RegExp(`${escaped}[^@\\n]*@\\[[^\\d]*(\\d+)`),
  ];
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit) return safeNumber(hit[1], 0);
  }
  return 0;
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

  for (const label of ["HPP", "MPP", "HHPP", "HMPP", "毒消し"]) {
    addStatus(extras, existing, label, itemCount(raw, label), 0);
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
