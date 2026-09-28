import { normalizeText } from "../utils/normalizeText";
export type InventoryRow = { line: number; cells: string[] };
export function itemLines(raw: Record<string, unknown>): string[] {
  return String(raw.items ?? "")
    .replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "\n")
    .split(/\r?\n/);
}
export function inventoryRows(raw: Record<string, unknown>): InventoryRow[] {
  return itemLines(raw).flatMap((input, index) => {
    const line = input.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) return [];
    return [{ line: index + 1, cells: line.slice(1, -1).split("|").map(normalizeText) }];
  });
}
