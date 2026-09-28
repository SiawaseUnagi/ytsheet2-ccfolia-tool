import type { ParsedSheet, CustomCommandMap } from "../ytsheet/types";
import { safeNumber } from "../utils/safeNumber";
import { singleLineText } from "../utils/normalizeText";
import { isToggleSkill, skillFlagName, resourceCommands } from "../palette/skillResources";
import { detectUsageLimit } from "../palette/detectUsageLimit";
import { ALL_CONSUMABLES, consumableCount, detectRiryokufu } from "../items/consumables";
import { plainItemRaw, readConsumableTable, matchesConsumable } from "../items/tableConsumables";
import type { StatusRow } from "../editor/rows";

export type ResourceKind = "resource" | "statistic" | "flag" | "consumable" | "uses" | "custom";
export type Resource = StatusRow & {
  kind: ResourceKind;
  reset: "maximum" | "zero" | "source" | "none";
};
export function buildStatusPlan(sheet: ParsedSheet, custom: CustomCommandMap = {}): Resource[] {
  const result: Resource[] = [],
    names = new Set<string>();
  const add = (
    label: string,
    value: number | string,
    max: number | string,
    kind: ResourceKind,
    reset: Resource["reset"] = "none",
  ) => {
    if (!label || names.has(label)) return;
    names.add(label);
    result.push({ label, value: String(value), max: String(max), kind, reset });
  };
  for (const [label, n] of [
    ["HP", sheet.hp],
    ["MP", sheet.mp],
    ["フェイト", sheet.fate],
  ] as const)
    add(label, n, n, "resource", "maximum");
  for (const [label, n] of [
    ["移動力", sheet.move],
    ["物理防御力", sheet.phyDef],
    ["魔法防御力", sheet.magDef],
  ] as const)
    add(label, n, 0, "statistic");
  add(
    "携帯可能重量",
    sheet.carry,
    safeNumber(sheet.raw.weightLimitItems, sheet.carry),
    "statistic",
  );
  for (const name of ["判定BD", "命中BD", "回避BD", "ダメBD", "ダメバフ", "強心丹D"])
    add(name, 0, 0, "flag", "zero");
  const table = readConsumableTable(sheet.raw).items,
    plain = plainItemRaw(sheet.raw);
  for (const item of table) add(item.label, item.count, 0, "consumable", "source");
  for (const def of ALL_CONSUMABLES) {
    if (table.some((item) => matchesConsumable(item, def))) continue;
    const n = consumableCount(plain, def);
    if (n > 0) add(def.label, n, 0, "consumable", "source");
  }
  for (const item of detectRiryokufu(plain)) add(item.label, item.count, 0, "consumable", "source");
  const engraved = sheet.skills.find((s) => s.name === "エングレイブド");
  if (engraved) {
    let ep: unknown = sheet.raw.EP;
    for (let i = 1; i <= safeNumber(sheet.raw.unitStatusNum, 0); i++)
      if (sheet.raw[`unitStatus${i}Label`] === "EP") ep = sheet.raw[`unitStatus${i}Value`];
    add("EP", safeNumber(ep, engraved.level * 3 + 1), 0, "resource", "source");
  }
  if (sheet.skills.some((s) => resourceCommands(s).some((c) => c.startsWith(":所持金-"))))
    add("所持金", safeNumber(sheet.raw.moneyTotal ?? sheet.raw.money), 0, "resource");
  for (let i = 1; i <= safeNumber(sheet.raw.unitStatusNum, 0); i++) {
    const original = singleLineText(sheet.raw[`unitStatus${i}Label`]),
      label =
        ({ 物防: "物理防御力", 魔防: "魔法防御力" } as Record<string, string>)[original] ??
        original;
    if (label === "EP" && !engraved) continue;
    add(label, safeNumber(sheet.raw[`unitStatus${i}Value`]), 0, "custom");
  }
  for (const skill of sheet.skills) {
    const limit = detectUsageLimit(skill);
    if (limit) add(skill.name, limit.max, limit.max, "uses", "maximum");
    if (isToggleSkill(skill)) add(skillFlagName(skill), 0, 0, "flag", "zero");
  }
  for (const item of Object.values(custom))
    if (item.status)
      add(
        item.status.label ?? "カスタム",
        item.status.initial ?? 0,
        item.status.max ?? 0,
        "custom",
      );
  return result;
}
export function statusRows(plan: readonly Resource[]): StatusRow[] {
  return plan.map(({ label, value, max }) => ({ label, value, max }));
}
