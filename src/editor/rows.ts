export type StatusRow = { label: string; value: string; max: string };
export type ParameterRow = { label: string; value: string };
/** Detect the separator between the label and the first value, not arithmetic
 * inside that value. Tabs can also carry spaces inside a label/expression. */
export function splitRow(line: string): string[] {
  const text = line.trim();
  if (text.includes("\t")) return text.split("\t").map((s) => s.trim());
  const explicit = /^([^\s=＝,，/]+)\s*([=＝,，/])\s*(.*)$/.exec(text);
  if (explicit) {
    const delimiter = explicit[2];
    const separator =
      delimiter === "=" || delimiter === "＝" ? /[=＝]/ : delimiter === "/" ? /\// : /[,，]/;
    return [explicit[1], ...explicit[3].split(separator).map((s) => s.trim())];
  }
  return text.split(/\s+/);
}
export function parseStatusText(text: string): StatusRow[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const [label, value = "0", max = "0"] = splitRow(line);
      return { label, value, max };
    })
    .filter((row) => row.label);
}
export function parseParamsText(text: string): ParameterRow[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const [label, value = "0"] = splitRow(line);
      return { label, value };
    })
    .filter((row) => row.label);
}
export const statusToText = (rows: readonly StatusRow[]): string =>
  rows.map((r) => [r.label, r.value, r.max].join("\t")).join("\n");
export const paramsToText = (rows: readonly ParameterRow[]): string =>
  rows.map((r) => [r.label, r.value].join("\t")).join("\n");
