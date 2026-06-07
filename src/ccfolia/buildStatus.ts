import type { CustomCommandMap, ParsedSheet } from "../ytsheet/types";
import { detectUsageLimit } from "../palette/detectUsageLimit";
import { safeNumber } from "../utils/safeNumber";

const ALIASES: Record<string, string> = {
  物防: "物理防御力",
  魔防: "魔法防御力",
};

export function buildStatus(sheet: ParsedSheet, custom: CustomCommandMap) {
  const fixed = [
    ["HP", sheet.hp, sheet.hp],
    ["MP", sheet.mp, sheet.mp],
    ["フェイト", sheet.fate, sheet.fate],
    ["移動力", sheet.move, 0],
    ["物理防御力", sheet.phyDef, 0],
    ["魔法防御力", sheet.magDef, 0],
    ["携帯可能重量", sheet.carry, 0],
    ["判定BD", 0, 0],
    ["命中BD", 0, 0],
    ["回避BD", 0, 0],
    ["ダメBD", 0, 0],
    ["追加D", 0, 0],
    ["ダメバフ", 0, 0],
  ].map(([label, value, max]) => ({ label, value: String(value), max: String(max) }));

  const existing = new Set(fixed.map((s) => s.label));
  const extras: { label: string; value: string; max: string }[] = [];
  const raw = sheet.raw;
  const unitStatusNum = safeNumber(raw.unitStatusNum, 0);
  for (let i = 1; i <= unitStatusNum; i++) {
    const rawLabel = String(raw[`unitStatus${i}Label`] ?? "").trim();
    const label = ALIASES[rawLabel] ?? rawLabel;
    const value = safeNumber(raw[`unitStatus${i}Value`], 0);
    if (label && !existing.has(label)) {
      extras.push({ label, value: String(value), max: "0" });
      existing.add(label);
    }
  }

  for (const skill of sheet.skills) {
    const limit = detectUsageLimit(skill);
    if (limit && !existing.has(skill.name)) {
      extras.push({ label: skill.name, value: String(limit.max), max: String(limit.max) });
      existing.add(skill.name);
    }
  }

  for (const c of Object.values(custom)) {
    if (c.status) {
      const label = c.status.label ?? "カスタム";
      if (!existing.has(label)) extras.push({ label, value: String(c.status.initial ?? 0), max: String(c.status.max ?? 0) });
    }
  }

  return [...fixed, ...extras];
}
