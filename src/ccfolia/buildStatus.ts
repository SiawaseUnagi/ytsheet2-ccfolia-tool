import type { CustomCommandMap, ParsedSheet } from "../ytsheet/types";

export function buildStatus(sheet: ParsedSheet, custom: CustomCommandMap) {
  const fixed = [
    ["HP", sheet.hp, sheet.hp],["MP", sheet.mp, sheet.mp],["フェイト", sheet.fate, sheet.fate],["移動力", sheet.move, 0],["物理防御力", sheet.phyDef, 0],["魔法防御力", sheet.magDef, 0],["携帯可能重量", sheet.carry, 0],["判定BD", 0, 0],["命中BD", 0, 0],["回避BD", 0, 0],["ダメBD", 0, 0],["追加D", 0, 0],["ダメバフ", 0, 0],
  ].map(([label, value, max]) => ({ label, value: String(value), max: String(max) }));
  const extra = Object.values(custom).flatMap((c) => c.status ? [{ label: c.status.label ?? "カスタム", value: String(c.status.initial ?? 0), max: String(c.status.max ?? 0) }] : []);
  return [...fixed, ...extra];
}
