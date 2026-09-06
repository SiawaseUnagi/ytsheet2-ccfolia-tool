import type { ParsedSheet, CustomCommandMap } from "../ytsheet/types";
import { buildStatus as baseStatus } from "../ccfolia/buildStatus";
import { buildPalette as basePalette } from "../palette/buildPalette";
import { ALL_CONSUMABLES, DEFAULT_CONSUMABLES } from "../items/consumables";
import { consumableCommands, matchesConsumable, plainItemRaw, readConsumableTable } from "../items/tableConsumables";
import { isBearUp } from "../calculation/attack";

/** Enhance the existing generator without changing the user's editable fields afterwards. */
export function buildStatus(sheet: ParsedSheet, custom: CustomCommandMap) {
  const { items } = readConsumableTable(sheet.raw);
  const status = baseStatus({ ...sheet, raw: plainItemRaw(sheet.raw) }, custom);
  const replaced = new Set(items.flatMap(item => [item.label, ...ALL_CONSUMABLES.filter(def => matchesConsumable(item, def)).map(def => def.label)]));
  const result = status.filter(s => !replaced.has(s.label));
  for (const item of items) result.push({ label: item.label, value: String(item.count), max: "0" });
  if (!result.some(s => s.label === "強心丹D")) result.push({ label: "強心丹D", value: "0", max: "0" });
  return result;
}

export function spiritReaction(sheet: ParsedSheet): string {
  const extra = sheet.skills.some(s => isBearUp(s.name) && s.level > 0) ? "+1" : "";
  return `({精神判定ダイス}+{判定BD}+{強心丹D}${extra})D+{精神判定}>=0 【精神】判定（リアクション）`;
}
export function buildPalette(sheet: ParsedSheet, custom: CustomCommandMap): { text: string; warnings: string[] } {
  const original = basePalette(sheet, custom), parsed = readConsumableTable(sheet.raw);
  const byTiming = new Map<string, string[]>();
  for (const item of parsed.items) for (const timing of item.timings) {
    const lines = byTiming.get(timing) ?? [];
    lines.push(...consumableCommands(item, timing), ""); byTiming.set(timing, lines);
  }
  const replaced = DEFAULT_CONSUMABLES.filter(def => parsed.items.some(item => matchesConsumable(item, def)));
  const rows = original.text.split("\n"), result: string[] = [];
  let section = "";
  for (let i = 0; i < rows.length; i++) {
    let line = rows[i];
    if (line.startsWith("### ■")) {
      section = line.slice(5); result.push(line);
      // Preserve the existing 'minor action waived' line before the consumable commands.
      if (section === "マイナー" && rows[i + 1] === "マイナーアクション放棄。") result.push(rows[++i]);
      result.push(...(byTiming.get(section) ?? []));
      if (section === "シーン終了時リセット" && parsed.items.some(item => item.label === "強心丹" && /シーン終了まで持続/.test(item.effect))) result.push(":強心丹D=0");
      continue;
    }
    if (section === "マイナー" && replaced.some(def => line === `マイナーアクションで${def.label}を使用。` && rows[i + 1] === `:${def.label}-1`)) {
      i++; if (rows[i + 1] === "") i++; continue;
    }
    if (line.startsWith("({精神判定ダイス}+{判定BD}") && !line.includes("{強心丹D}")) line = line.replace("{精神判定ダイス}+{判定BD}", "{精神判定ダイス}+{判定BD}+{強心丹D}");
    result.push(line);
    if (section === "リソース操作" && line.endsWith(">=0 回避判定")) result.push(spiritReaction(sheet));
  }
  return { text: result.join("\n"), warnings: [...original.warnings, ...parsed.warnings] };
}
