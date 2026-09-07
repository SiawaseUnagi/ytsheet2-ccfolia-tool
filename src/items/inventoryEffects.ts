import { normalizeEffect } from "../calculation/expression";
import { itemLines, readConsumableTable } from "./tableConsumables";

export type InventoryEffect = { name: string; effect: string; count: number; counted: boolean };
export type InventoryEffects = { items: InventoryEffect[]; warnings: { source: string; reason: string; effect: string }[] };
const keyOf = (name: string) => name.normalize("NFKC").trim();
const relevant = (text: string) => /(?:ダメージ|回復|判定|ダイスロール)[^。]*に\s*[+\-]/.test(normalizeEffect(text));

/** Read only the effect column of explicit five-column inventory rows, never names-only text or flavour. */
export function readInventoryEffects(raw: Record<string, unknown>): InventoryEffects {
  const items = new Map<string, InventoryEffect>(), rejected = new Set<string>();
  const warnings: InventoryEffects["warnings"] = [];
  const equipped = new Map<string, string[]>();
  for (const slot of ["HandR", "HandL", "Head", "Body", "Sub", "Other"]) {
    const name = String(raw[`armament${slot}Name`] ?? "").trim(), effect = String(raw[`armament${slot}Note`] ?? "").trim();
    if (name && effect) equipped.set(keyOf(name), [...(equipped.get(keyOf(name)) ?? []), normalizeEffect(effect)]);
  }
  const counters = new Set(readConsumableTable(raw).items.map(item => keyOf(item.label)));
  for (const [index, input] of itemLines(raw).entries()) {
    const line = input.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
    const name = (cells[0] ?? "").replace(/^[\s└┗├┣│┃─━┬┼]+/, "").trim();
    // Some exports put an explicitly labelled explanation after the mechanics.
    const effect = (cells[2] ?? "").replace(/解説[:：][\s\S]*$/, "").trim();
    const countText = (cells[1] ?? "").normalize("NFKC"), key = keyOf(name);
    if (!effect || !relevant(effect)) continue;
    if (cells.length !== 5 || !name || /[\s{}｛｝\\=＝,+\-/|<>\u0000-\u001f\u007f]/.test(name) || !/^\d+$/.test(countText) || !Number.isSafeInteger(Number(countText)) || Number(countText) > 1000000) {
      warnings.push({ source: name || `アイテム欄${index + 1}行目`, reason: "名前・個数・効果の列を確認できないため、補正候補には加えていません。", effect }); continue;
    }
    const count = Number(countText);
    if (count === 0 || rejected.has(key)) continue;
    const equipEffects = equipped.get(key);
    if (equipEffects) {
      if (!equipEffects.includes(normalizeEffect(effect))) warnings.push({ source: name, reason: "装備欄にも同名の品があり、効果文が異なります。二重加算を避けて装備欄だけを候補にしています。", effect });
      continue;
    }
    const prior = items.get(key);
    if (prior && normalizeEffect(prior.effect) !== normalizeEffect(effect)) {
      items.delete(key); rejected.add(key);
      warnings.push({ source: name, reason: "同名のアイテムで効果文が異なるため、補正を一つに確定できません。", effect }); continue;
    }
    if (prior) {
      prior.count += count;
      if (prior.count > 1000000) { items.delete(key); rejected.add(key); warnings.push({ source: name, reason: "合計個数が大きすぎるため、補正候補には加えていません。", effect }); }
    } else items.set(key, { name, effect, count, counted: counters.has(key) || /消耗品/.test(effect) });
  }
  // Owning several copies does not multiply a single item's bonus.
  return { items: [...items.values()], warnings };
}
