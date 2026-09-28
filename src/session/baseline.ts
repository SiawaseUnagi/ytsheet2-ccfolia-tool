import type { Fields } from "./model";
import { mergeRows, mergeText } from "./merge";

/** Preserve the actual historical generator baseline. Only apply changes caused
 * by an explicit modifier operation; do not silently migrate the whole document. */
export function advanceCalculationBaseline(base: Fields, before: Fields, next: Fields): Fields {
  return {
    ...base,
    statusEdit: mergeRows(before.statusEdit, base.statusEdit, next.statusEdit, "baseline", 3).text,
    palette: mergeText(before.palette, base.palette, next.palette, "baseline").text,
  };
}

export const GENERATOR_VERSION = "2026-09-reaction-bulk-2";
export function baselineNotice(version?: string): string[] {
  return version === GENERATOR_VERSION
    ? []
    : [
        "この保存は別の生成形式で作成されています。保存した編集はそのまま開いています。新しい生成内容を取り込むには「更新を反映」で変更点を確認してください。",
      ];
}

import type { CalculationState } from "../calculation/sessionState";
/** Opening an old save must not discard choices that this generator cannot map.
 * Explicit update can report and retire these bindings after source comparison. */
export function unmappedCalculation(
  saved: CalculationState,
  mapped: CalculationState,
): CalculationState {
  return {
    version: 1,
    choices: saved.choices.filter(
      (old) =>
        !mapped.choices.some((row) => row.target === old.target && row.modifier === old.modifier),
    ),
    flags: saved.flags.filter((old) => !mapped.flags.some((row) => row.key === old.key)),
  };
}
export function combineCalculation(
  current: CalculationState,
  retained: CalculationState,
): CalculationState {
  return {
    version: 1,
    choices: [
      ...current.choices,
      ...retained.choices.filter(
        (old) =>
          !current.choices.some(
            (row) => row.target === old.target && row.modifier === old.modifier,
          ),
      ),
    ],
    flags: [
      ...current.flags,
      ...retained.flags.filter((old) => !current.flags.some((row) => row.key === old.key)),
    ],
  };
}
