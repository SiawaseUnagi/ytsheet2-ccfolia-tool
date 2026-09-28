/** Read a complete decimal value. Never mistake an expression or prose for a number. */
export function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.normalize("NFKC").trim().replace(/[−–]/g, "-");
  if (!/^[+\-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return undefined;
  const result = Number(text.replace(/,/g, ""));
  return Number.isFinite(result) ? result : undefined;
}
export function safeNumber(value: unknown, fallback = 0): number {
  return numericValue(value) ?? fallback;
}
