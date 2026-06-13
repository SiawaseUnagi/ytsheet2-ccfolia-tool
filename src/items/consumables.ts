import { safeNumber } from "../utils/safeNumber";

export type ConsumableDef = { label: string; aliases: string[] };

export const DEFAULT_CONSUMABLES: ConsumableDef[] = [
  { label: "HPP", aliases: ["HPP", "HPポーション"] },
  { label: "MPP", aliases: ["MPP", "MPポーション"] },
  { label: "HHPP", aliases: ["HHPP", "ハイHPポーション"] },
  { label: "HMPP", aliases: ["HMPP", "ハイMPポーション"] },
  { label: "毒消し", aliases: ["毒消し"] },
];

export const OPTIONAL_CONSUMABLES: ConsumableDef[] = [
  { label: "耐毒符", aliases: ["耐毒符"] },
  { label: "にく", aliases: ["にく"] },
  { label: "野菜", aliases: ["野菜"] },
  { label: "果実", aliases: ["果実"] },
  { label: "EXHPP", aliases: ["EXHPP", "EXHPポーション", "EXHPポーション"] },
  { label: "EXMPP", aliases: ["EXMPP", "EXMPポーション"] },
  { label: "GHPP", aliases: ["GHPP", "GHPポーション", "グレートHPポーション"] },
  { label: "GMPP", aliases: ["GMPP", "GMPポーション", "グレートMPポーション"] },
  { label: "強心丹", aliases: ["強心丹"] },
  { label: "万能薬", aliases: ["万能薬"] },
  { label: "蘇生薬", aliases: ["蘇生薬"] },
];

export const ALL_CONSUMABLES = [...DEFAULT_CONSUMABLES, ...OPTIONAL_CONSUMABLES];

export function isKnownConsumableLabel(label: string): boolean {
  return ALL_CONSUMABLES.some((item) => item.label === label) || /^理力符〈.+〉$/.test(label);
}

function normalizeNumberText(value: string): string {
  return value.replace(/,/g, "").replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

function itemText(raw: Record<string, unknown>): string {
  return normalizeNumberText(String(raw.items ?? ""))
    .replace(/&lt;br&gt;/g, "\n")
    .replace(/<br\s*\/?>/g, "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanCell(value: string): string {
  return value.replace(/^[\s　|└┗├┣│┃─━┬┼]+/, "").trim();
}

function countInItemCell(cell: string, alias: string): number | null {
  const escaped = escapeRegExp(alias);
  const match = cleanCell(cell).match(new RegExp(`^${escaped}\\s*(?:[＊*×xX]\\s*(\\d+)|[（(]\\s*(\\d+)\\s*[）)])?(?=$|[\\s　@,，、/|（(])`));
  if (!match) return null;
  return safeNumber(match[1] ?? match[2], 1);
}

function numericCell(cell: string): number | null {
  const cleaned = cleanCell(cell);
  if (!/^\d+$/.test(cleaned)) return null;
  return safeNumber(cleaned, 0);
}

function countInTableLine(line: string, aliases: string[]): number {
  if (!line.includes("|")) return 0;
  const cells = line.split("|");
  let total = 0;
  for (let i = 0; i < cells.length; i++) {
    for (const alias of aliases) {
      const countFromName = countInItemCell(cells[i], alias);
      if (countFromName === null) continue;
      const explicitCountInNextCell = numericCell(cells[i + 1] ?? "");
      total += countFromName !== 1 ? countFromName : explicitCountInNextCell ?? 1;
      break;
    }
  }
  return total;
}

function countInPlainLine(line: string, aliases: string[]): number {
  let total = 0;
  for (const alias of aliases) {
    const escaped = escapeRegExp(alias);
    const pattern = new RegExp(`(^|[\\s　,，、/|└┗├┣│┃])${escaped}\\s*(?:[＊*×xX]\\s*(\\d+)|[（(]\\s*(\\d+)\\s*[）)])?(?=$|[\\s　@,，、/|（(])`);
    const match = line.match(pattern);
    if (match) total += safeNumber(match[2] ?? match[3], 1);
  }
  return total;
}

function countByAliases(raw: Record<string, unknown>, aliases: string[]): number {
  let total = 0;
  for (const line of itemText(raw).split(/\r?\n/)) {
    total += countInTableLine(line, aliases);
    if (!line.includes("|")) total += countInPlainLine(line, aliases);
  }
  return total;
}

export function consumableCount(raw: Record<string, unknown>, def: ConsumableDef): number {
  return countByAliases(raw, def.aliases);
}

export function countConsumableLabel(raw: Record<string, unknown>, label: string): number {
  return countByAliases(raw, [label]);
}

export function detectRiryokufu(raw: Record<string, unknown>): { label: string; count: number }[] {
  const labels = new Set<string>();
  for (const line of itemText(raw).split(/\r?\n/)) {
    const matches = [...line.matchAll(/理力符\s*[〈<《(（]\s*([^〉>》)）\s]+)\s*[〉>》)）]/g)];
    for (const match of matches) {
      const attr = match[1]?.trim();
      if (attr) labels.add(`理力符〈${attr}〉`);
    }
  }
  return [...labels].map((label) => ({ label, count: countConsumableLabel(raw, label) })).filter((item) => item.count > 0);
}
