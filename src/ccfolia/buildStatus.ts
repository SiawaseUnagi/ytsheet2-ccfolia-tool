import type { CustomCommandMap, ParsedSheet } from "../ytsheet/types";
import { detectUsageLimit } from "../palette/detectUsageLimit";
import { safeNumber } from "../utils/safeNumber";

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

  const extras: { label: string; value: string; max: string }[] = [];
  const raw = sheet.raw;
  const unitStatusNum = safeNumber(raw.unitStatusNum, 0);
  for (let i = 1; i <= unitStatusNum; i++) {
    const label = String(raw[`unitStatus${i}Label`] ?? "").trim();
    const value = safeNumber(raw[`unitStatus${i}Value`], 0);
    if (label && !fixed.some((s) => s.label === label)) extras.push({ label, value: String(value), max: "0" });
  }

  for (const skill of sheet.skills) {
    const limit = detectUsageLimit(skill);
    if (limit && !extras.some((s) => s.label === skill.name)) extras.push({ label: skill.name, value: String(limit.max), max: String(limit.max) });
  }

  for (const c of Object.values(custom)) {
    if (c.status) extras.push({ label: c.status.label ?? "カスタム", value: String(c.status.initial ?? 0), max: String(c.status.max ?? 0) });
  }

  return [...fixed, ...extras];
}
