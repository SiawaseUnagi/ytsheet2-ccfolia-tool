import type { StatusRow, ParameterRow } from "../editor/rows";
import { RESERVED_FLAG_LABELS } from "./labels";
/** Shared allocator. A flag must never reuse a counter, parameter or base statistic. */
export function ensureFlag(
  statuses: StatusRow[],
  parameters: ParameterRow[],
  requested: string,
  consumable: (label: string) => boolean,
): string {
  let label = requested,
    suffix = 0;
  for (;;) {
    const existing = statuses.find((s) => s.label === label);
    if (
      !parameters.some((p) => p.label === label) &&
      !RESERVED_FLAG_LABELS.has(label) &&
      !consumable(label)
    ) {
      if (existing && Number(existing.max) === 0 && ["0", "1"].includes(existing.value.trim()))
        return label;
      if (!existing) {
        statuses.push({ label, value: "0", max: "0" });
        return label;
      }
    }
    label = `${requested}_補正${suffix++ || ""}`;
  }
}
