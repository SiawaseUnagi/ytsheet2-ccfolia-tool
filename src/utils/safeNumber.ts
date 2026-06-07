export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const m = value.match(/-?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return fallback;
}
