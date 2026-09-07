import { leadingAmount, normalizeEffect } from "../calculation/expression";
import { DEFAULT_CONSUMABLES, ALL_CONSUMABLES, isKnownConsumableLabel, type ConsumableDef } from "./consumables";

export type TableConsumable = { label: string; count: number; effect: string; timings: string[]; rolls: string[] };
export type ConsumableTable = { items: TableConsumable[]; warnings: string[] };
const TIMINGS: Record<string, [string, string]> = {
  マイナー: ["マイナー", "マイナーアクションで"], メジャー: ["メジャー", "メジャーアクションで"],
  ムーブ: ["ムーブ", "ムーブアクションで"], レガシー: ["レガシー", "レガシーアクションで"],
  フリー: ["フリー", "フリーアクションで"], セットアップ: ["セットアップ", "セットアッププロセスで"],
  イニシアチブ: ["イニシアチブ", "イニシアチブプロセスで"], クリンナップ: ["クリンナップ", "クリンナッププロセスで"],
  リアクション: ["リアクション", "リアクションで"], 戦闘前: ["戦闘前", "戦闘前に"],
  DR直前: ["DR直前", "ダメージロールの直前に"], DR直後: ["DR直後", "ダメージロールの直後に"],
  効果参照: ["効果参照", ""],
};
export function itemLines(raw: Record<string, unknown>): string[] {
  return String(raw.items ?? "").replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "\n").split(/\r?\n/);
}
/** Shorthand is quantity-only; never scan table prose or flavour for item names. */
export function plainItemRaw(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, items: itemLines(raw).filter(line => !line.includes("|")).join("\n") };
}
const nameKey = (s: string) => s.normalize("NFKC").trim();
export function matchesConsumable(item: TableConsumable, def: ConsumableDef): boolean {
  return def.aliases.some(alias => nameKey(alias) === nameKey(item.label));
}
/** Only complete timing declarations count. References to expiry, cancelling an effect,
 * prerequisites, examples and quoted text are not additional usage timings. */
function timingSentence(sentence: string): string[] | null {
  const text = normalizeEffect(sentence).trim().replace(/^タイミング[:：]\s*/, "")
    .replace(/(?:で|に)(?:も)?使用(?:することができる|可能となる|可能|できる|する)$/, "").trim();
  const tokens = text.split(/[、,／/・]/).map(t => t.trim().replace(/(?:アクション|プロセス)$/, "").replace(/ダメージロール/g, "DR").replace(/の直/g, "直"));
  if (!tokens.length || tokens.some(t => !Object.prototype.hasOwnProperty.call(TIMINGS, t))) return null;
  return [...new Set(tokens.map(t => TIMINGS[t][0]))];
}
function effectParts(effect: string): { text: string; timing: string[] | null }[] {
  // Preserve original characters in the displayed body, including brackets and numerals.
  const clean = effect.replace(/\s+/g, " ").trim();
  return (clean.match(/[^。]+。?/g) ?? []).map(text => ({ text, timing: timingSentence(text.replace(/。$/, "")) }));
}
function readTimings(effect: string): string[] | null {
  const timings = [...new Set(effectParts(effect).flatMap(part => part.timing ?? []))];
  return timings.length ? timings : null;
}
export function consumableEffectText(effect: string): string {
  return effectParts(effect).filter(part => !part.timing).map(part => part.text).join("").trim();
}
function readRecoveryRolls(effect: string, label: string, warnings: string[]): string[] {
  const text = normalizeEffect(effect), values: { resource: string; formula: string }[] = [];
  for (const m of text.matchAll(/(?:【)?(HP|MP)(?:】)?を\s*/g)) {
    const tail = text.slice(m.index! + m[0].length);
    // Consumables have no skill level. Never turn an unknown SL into zero.
    if (/^\s*[\[（(]?\s*SL/.test(tail)) continue;
    const value = leadingAmount(tail, 0);
    if (!value || /SL/.test(tail.slice(0, tail.length - value.rest.length)) || !/^点?回復(?:する|$|[。、])/.test(value.rest)) continue;
    const { dice, fixed } = value.amount;
    if (/^-/.test(dice) || /^-/.test(fixed)) continue;
    const formula = dice === "0" ? `C(${fixed})` : `${/^\d+$/.test(dice) ? dice : `(${dice})`}D${fixed === "0" ? "" : `+${fixed}`}`;
    values.push({ resource: m[1], formula });
  }
  if (values.length > 1 || /(?:または|いずれか|最大|上限|最低|まで|割合|半分|倍)/.test(text) && values.length) {
    warnings.push(`${label}：回復量に複数の候補・上限などがあるため、ロールは手動で追加してください。`);
    return [];
  }
  if (!values.length && /(?:HP|MP).*回復/.test(text)) warnings.push(`${label}：回復量を確定できなかったため、ロールは手動で追加してください。`);
  return values.map(v => `${v.formula} ${label}`);
}

/** Supported row: |name|count|effect including explicit timing and consumable.|flavour|@[weight]| */
export function readConsumableTable(raw: Record<string, unknown>): ConsumableTable {
  const items = new Map<string, TableConsumable>(), rejected = new Set<string>(), warnings: string[] = [];
  const skillNames = new Set(Object.keys(raw).filter(key => /^skill\d+Name$/.test(key)).map(key => String(raw[key])));
  if (Array.isArray(raw.skill)) for (const skill of raw.skill) if (skill && typeof skill === "object") skillNames.add(String((skill as Record<string, unknown>).name ?? ""));
  for (const [index, input] of itemLines(raw).entries()) {
    const line = input.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cells = line.slice(1, -1).split("|").map(c => c.trim());
    if (!cells.some(c => /消耗品/.test(c))) continue;
    const [name = "", countText = "", effect = ""] = cells;
    const label = name.replace(/^[\s└┗├┣│┃─━┬┼]+/, "").trim();
    const count = countText.normalize("NFKC");
    const timings = readTimings(effect);
    const reserved = /^(HP|MP|フェイト|CL|initiative|強心丹D|筋力|器用|敏捷|知力|感知|精神|幸運|判定BD|命中BD|回避BD|ダメBD|ダメバフ|移動力|攻撃力|物理防御力|魔法防御力|携帯可能重量|所持金|EP)$/;
    if (cells.length !== 5 || !label || /[\s{}｛｝\\=＝,+\-/|<>\u0000-\u001f\u007f]/.test(label) || reserved.test(label) || skillNames.has(label) || !/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)) || Number(count) > 1000000 || !/消耗品/.test(effect) || !timings) {
      warnings.push(`アイテム欄${index + 1}行目：名前・個数・使用タイミングを確定できないため、自動出力していません。`); continue;
    }
    if (rejected.has(label)) continue;
    const prior = items.get(label);
    if (prior && normalizeEffect(prior.effect) !== normalizeEffect(effect)) {
      items.delete(label); rejected.add(label); warnings.push(`${label}：同名の行で効果が異なるため、自動出力していません。`); continue;
    }
    if (prior) {
      prior.count += Number(count);
      if (prior.count > 1000000) { items.delete(label); rejected.add(label); warnings.push(`${label}：合計個数が大きすぎるため、自動出力していません。`); }
      continue;
    }
    items.set(label, { label, count: Number(count), effect, timings, rolls: readRecoveryRolls(effect, label, warnings) });
  }
  return { items: [...items.values()], warnings };
}
export function consumableCommands(item: TableConsumable, timing: string): string[] {
  if (!item.timings.includes(timing)) return [];
  const prefix = TIMINGS[timing]?.[1] ?? "";
  const lines = [`${prefix}${item.label}を使用。${consumableEffectText(item.effect)}`, `:${item.label}-1`, ...item.rolls];
  if (nameKey(item.label) === "強心丹") lines.push(":強心丹D=1");
  return lines;
}
export function tableReplacesDefault(items: TableConsumable[], def: ConsumableDef): boolean { return items.some(item => matchesConsumable(item, def)); }
export function isSheetConsumableLabel(raw: Record<string, unknown>, label: string): boolean {
  return isKnownConsumableLabel(label) || ALL_CONSUMABLES.some(def => def.aliases.includes(label)) || readConsumableTable(raw).items.some(item => item.label === label);
}
export function unusedDefaultConsumables(items: TableConsumable[]): ConsumableDef[] {
  return DEFAULT_CONSUMABLES.filter(def => !tableReplacesDefault(items, def));
}
