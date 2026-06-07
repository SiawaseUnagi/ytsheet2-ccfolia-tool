import { safeNumber } from "../utils/safeNumber";
import { normalizeText } from "../utils/normalizeText";
import type { ParsedSheet, WeaponData, YtSkill } from "./types";

const ABI = ["筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"] as const;

function pick(raw: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const k of keys) if (k in raw) return safeNumber(raw[k], fallback);
  return fallback;
}

function parseSkills(raw: Record<string, unknown>): YtSkill[] {
  const table = raw.skill as unknown[] | undefined;
  if (!Array.isArray(table)) return [];
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

function parseWeapons(raw: Record<string, unknown>): WeaponData[] {
  const items = raw.weapon as unknown[] | undefined;
  if (!Array.isArray(items)) return [];
  return items.map((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    return {
      name: normalizeText(String(o.name ?? "")),
      hit: safeNumber(o.hit, 0),
      hitDice: safeNumber(o.hitDice, 2),
      atk: safeNumber(o.atk, 0),
      atkDice: safeNumber(o.atkDice, 2),
    };
  }).filter((w) => w.name);
}

export function parseYtsheet(raw: Record<string, unknown>, baseUrl: string): ParsedSheet {
  const warnings: string[] = [];
  const abilities: Record<string, number> = {};
  for (const key of ABI) abilities[key] = pick(raw, [key], 0);
  const parsed: ParsedSheet = {
    raw,
    name: String(raw.characterName ?? raw.pcName ?? "(名称不明)"),
    baseUrl,
    hp: pick(raw, ["maxHp", "hp"], 0),
    mp: pick(raw, ["maxMp", "mp"], 0),
    fate: pick(raw, ["fate", "フェイト"], 0),
    move: pick(raw, ["move", "移動力"], 0),
    phyDef: pick(raw, ["phyDef", "物理防御力"], 0),
    magDef: pick(raw, ["magDef", "魔法防御力"], 0),
    carry: pick(raw, ["carry", "携帯可能重量"], 0),
    abilities,
    skills: parseSkills(raw),
    weapons: parseWeapons(raw),
    warnings,
  };
  if (parsed.weapons.length === 0) warnings.push("武器データを読み取れなかったため、汎用の攻撃雛形のみ出力しました。");
  return parsed;
}
