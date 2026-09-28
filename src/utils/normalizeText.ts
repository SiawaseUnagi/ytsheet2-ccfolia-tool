/** Decode one layer of exported HTML entities as text, never as executable markup. */
export function decodeSheetText(value: unknown): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return String(value ?? "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, key: string) => {
      if (!key.startsWith("#")) return named[key.toLowerCase()] ?? whole;
      const hex = /^#x/i.test(key),
        n = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : whole;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n");
}
export function normalizeText(input: string | undefined | null): string {
  return decodeSheetText(input)
    .replace(/[ 　]+/g, " ")
    .trim();
}
export function singleLineText(input: unknown): string {
  return decodeSheetText(input).replace(/\s+/g, " ").trim();
}
