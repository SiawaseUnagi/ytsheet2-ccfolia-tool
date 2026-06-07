import { safeNumber } from "../utils/safeNumber";
import { normalizeText } from "../utils/normalizeText";
import type { ParsedSheet, WeaponData, YtSkill } from "./types";

const ABI_MAP = [
  ["筋力", "sttStrTotal"],
  ["器用", "sttDexTotal"],
  ["敏捷", "sttAgiTotal"],
  ["知力", "sttIntTotal"],
  ["感知", "sttSenTotal"],
  ["精神", "sttMndTotal"],
  ["幸運", "sttLukTotal"],
] as const;

function pick(raw: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const k of keys) if (k in raw) return safeNumber(raw[k], fallback);
  return fallback;
}

function getText(raw: Record<string, unknown>, key: string): string {
  return normalizeText(String(raw[key] ?? ""));
}

function isWeaponLike(type: string): boolean {
  const t = type.trim();
  if (!t || t === "―" || t === "-" || t === "盾" || t === "道具") return false;
  return true;
}

function parseSkills(raw: Record<string, unknown>): YtSkill[] {
  const table = raw.skill as unknown[] | undefined;
  if (Array.isArray(table)) {
    return table.map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        name: normalizeText(String(o.name ?? "")),
        level: safeNumber(o.lv, 1),
        timing: normalizeText(String(o.timing ?? "")),
        judge: normalizeText(String(o.judge ?? "")),
        target: normalizeText(String(o.target ?? "")),
        range: normalizeText(String(o.range ?? "")),
        cost: normalizeText(String(o.cost ?? "")),
        usage: normalizeText(String(o.usage ?? "")),
        effect: normalizeText(String(o.effect ?? "")),
      };
    }).filter((s) => s.name);
  }

  const count = pick(raw, ["skillNum"], 0);
  const skills: YtSkill[] = [];
  for (let i = 1; i <= count; i++) {
    const name = getText(raw, `skill${i}Name`);
    if (!name) continue;
    skills.push({
      name,
      level: pick(raw, [`skill${i}Lv`], 1),
      timing: getText(raw, `skill${i}Timing`),
      judge: getText(raw, `skill${i}Roll`),
      target: getText(raw, `skill${i}Target`),
      range: getText(raw, `skill${i}Range`),
      cost: getText(raw, `skill${i}Cost`),
      usage: getText(raw, `skill${i}Reqd`),
      effect: getText(raw, `skill${i}Note`),
    });
  }
  return skills;
}

function parseWeapons(raw: Record<string, unknown>): WeaponData[] {
  const items = raw.weapon as unknown[] | undefined;
  if (Array.isArray(items)) {
    return items.map((w) => {
      const o = (w ?? {}) as Record<string, unknown>;
      return {
        name: normalizeText(String(o.name ?? "")),
        hit: safeNumber(o.hit, 0),
        hitDice: safeNumber(o.hitDice, 2),
        atk: safeNumber(o.atk, 0),
        atkDice: safeNumber(o.atkDice, 2),
      };
    }).filter((w) => w.name && isWeaponLike(normalizeText(String((items.find((x) => (x as Record<string, unknown>).name === w.name) as Record<string, unknown> | undefined)?.type ?? ""))));
  }

  const weapons: WeaponData[] = [];
  const right = getText(raw, "armamentHandRName");
  const rightType = getText(raw, "armamentHandRType");
  if (right && isWeaponLike(rightType)) weapons.push({
    name: right,
    hit: pick(raw, ["battleTotalAccR", "battleTotalAcc"], 0),
    hitDice: pick(raw, ["battleDiceAcc"], 2),
    atk: pick(raw, ["battleTotalAtkR", "battleTotalAtk"], 0),
    atkDice: pick(raw, ["battleDiceAtk"], 2),
  });
  const left = getText(raw, "armamentHandLName");
  const leftType = getText(raw, "armamentHandLType");
  if (left && isWeaponLike(leftType)) weapons.push({
    name: left,
    hit: pick(raw, ["battleTotalAccL", "battleTotalAcc"], 0),
    hitDice: pick(raw, ["battleDiceAcc"], 2),
    atk: pick(raw, ["battleTotalAtkL", "battleTotalAtk"], 0),
    atkDice: pick(raw, ["battleDiceAtk"], 2),
  });
  return weapons;
}

export function parseYtsheet(raw: Record<string, unknown>, baseUrl: string): ParsedSheet {
  const warnings: string[] = [];
  const abilities: Record<string, number> = {};
  for (const [label, key] of ABI_MAP) abilities[label] = pick(raw, [key, label], 0);
  const actionValue = pick(raw, ["battleTotalIni", "initiative", "行動値"], 0);
  const parsed: ParsedSheet = {
    raw,
    name: String(raw.characterName ?? raw.pcName ?? "(名称不明)"),
    baseUrl,
    hp: pick(raw, ["hpTotal", "maxHp", "hp"], 0),
    mp: pick(raw, ["mpTotal", "maxMp", "mp"], 0),
    fate: pick(raw, ["fateTotal", "fate", "フェイト"], 0),
    move: pick(raw, ["battleTotalMove", "move", "移動力"], 0),
    initiative: actionValue + 0.1,
    phyDef: pick(raw, ["battleTotalDef", "phyDef", "物理防御力"], 0),
    magDef: pick(raw, ["battleTotalMDef", "magDef", "魔法防御力"], 0),
    carry: pick(raw, ["weightItems", "carry", "携帯重量"], 0),
    abilities,
    skills: parseSkills(raw),
    weapons: parseWeapons(raw),
    warnings,
  };
  if (parsed.weapons.length === 0) warnings.push("武器データを読み取れなかったため、汎用の攻撃雛形のみ出力しました。");
  if (parsed.skills.length === 0) warnings.push("スキル一覧を読み取れませんでした。");
  return parsed;
}
