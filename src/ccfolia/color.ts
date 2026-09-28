function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
function safeNum(value: unknown, fallback = 0): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export function extractColor(raw: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(raw).filter((key) => /color|colour|palette|chat/i.test(key))) {
    const hit = String(raw[key] ?? "").match(/#[0-9a-fA-F]{6}/);
    if (hit) return hit[0];
  }
  const h = safeNum(raw.colorHeadBgH, NaN),
    s = safeNum(raw.colorHeadBgS, NaN),
    l = safeNum(raw.colorHeadBgL, NaN);
  if (Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l))
    return hslToHex(((h % 360) + 360) % 360, s, l);
  return undefined;
}
