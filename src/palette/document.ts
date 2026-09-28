import type { CheckFormula } from "./checks";
export type SkillPlacementRef = { index: number; name: string; level: number };
export type PaletteRow = {
  text: string;
  skill?: SkillPlacementRef;
  declaration?: boolean;
  check?: CheckFormula;
  effectsAfter?: boolean;
  weaponDamage?: boolean;
  weaponCheck?: boolean;
  section?: string;
};
export type PaletteDocument = { rows: PaletteRow[] };
export type PaletteOutput = { text: string; warnings: string[]; document?: PaletteDocument };
export const textRow = (text: string): PaletteRow => ({ text });
/** Blank lines and headers are presentation. Source/check identity remains metadata. */
export function serializeSections(
  sections: Map<string, PaletteRow[]>,
  warnings: string[],
): PaletteOutput {
  const rows: PaletteRow[] = [];
  for (const [section, content] of sections) {
    if (rows.length) rows.push(textRow(""));
    rows.push({ text: `### ■${section}`, section });
    const lines = content.map((row) => ({ ...row, section }));
    while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop();
    rows.push(...lines);
  }
  return { text: rows.map((r) => r.text).join("\n"), warnings, document: { rows } };
}
