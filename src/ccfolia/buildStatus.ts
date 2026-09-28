import type { ParsedSheet, CustomCommandMap } from "../ytsheet/types";
import { buildStatusPlan, statusRows } from "../resources/statusPlan";
export function buildStatus(sheet: ParsedSheet, custom: CustomCommandMap) {
  return statusRows(buildStatusPlan(sheet, custom));
}
