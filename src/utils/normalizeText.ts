export function normalizeText(input: string | undefined | null): string {
  return (input ?? "").replace(/\r\n?/g, "\n").replace(/[ 　]+/g, " ").trim();
}
