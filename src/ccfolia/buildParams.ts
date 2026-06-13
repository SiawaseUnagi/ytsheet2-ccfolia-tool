import { safeNumber } from "../utils/safeNumber";
import type { ParsedSheet } from "../ytsheet/types";

function pick(raw: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const k of keys) if (k in raw) return safeNumber(raw[k], fallback);
  return fallback;
}

export function buildParams(sheet: ParsedSheet) {
  const raw = sheet.raw;
  const p: { label: string; value: string }[] = [];

  p.push({ label: "CL", value: String(pick(raw, ["level", "CL", "cl"], 0)) });

  const abilityPairs = [
    ["筋力", "rollStr", "rollStrDice"],
    ["器用", "rollDex", "rollDexDice"],
    ["敏捷", "rollAgi", "rollAgiDice"],
    ["知力", "rollInt", "rollIntDice"],
    ["感知", "rollSen", "rollSenDice"],
    ["精神", "rollMnd", "rollMndDice"],
    ["幸運", "rollLuk", "rollLukDice"],
  ] as const;

  for (const [label] of abilityPairs) p.push({ label, value: String(sheet.abilities[label] ?? 0) });
  for (const [label, rollKey, diceKey] of abilityPairs) {
    const roll = pick(raw, [rollKey], sheet.abilities[label] ?? 0);
    const base = sheet.abilities[label] ?? 0;
    p.push({ label: `${label}判定修正`, value: String(roll - base) });
    p.push({ label: `${label}D`, value: String(pick(raw, [diceKey], 2)) });
  }

  p.push(
    { label: "命中判定", value: String(pick(raw, ["battleTotalAcc"], 0)) },
    { label: "回避判定", value: String(pick(raw, ["battleTotalEva"], 0)) },
    { label: "魔術判定", value: String(pick(raw, ["rollMagic"], 0)) },
    { label: "呪歌判定", value: String(pick(raw, ["rollSong"], 0)) },
    { label: "錬金術判定", value: String(pick(raw, ["rollAlchemy"], 0)) },
    { label: "攻撃力", value: String(pick(raw, ["battleTotalAtk"], 0)) },
  );

  p.push(
    { label: "命中判定修正", value: "0" },
    { label: "回避判定修正", value: "0" },
    { label: "魔術判定修正", value: String(pick(raw, ["rollMagicAdd"], 0)) },
    { label: "呪歌判定修正", value: String(pick(raw, ["rollSongAdd"], 0)) },
    { label: "錬金術判定修正", value: String(pick(raw, ["rollAlchemyAdd"], 0)) },
    { label: "トラップ探知修正", value: String(pick(raw, ["rollTrapDetectAdd"], 0)) },
    { label: "トラップ解除修正", value: String(pick(raw, ["rollTrapReleaseAdd"], 0)) },
    { label: "危険感知修正", value: String(pick(raw, ["rollDangerDetectAdd"], 0)) },
    { label: "エネミー識別修正", value: String(pick(raw, ["rollEnemyLoreAdd"], 0)) },
    { label: "アイテム鑑定修正", value: String(pick(raw, ["rollAppraisalAdd"], 0)) },
    { label: "命中D", value: String(pick(raw, ["battleDiceAcc"], 2)) },
    { label: "回避D", value: String(pick(raw, ["battleDiceEva"], 2)) },
    { label: "魔術D", value: String(pick(raw, ["rollMagicDice"], 2)) },
    { label: "呪歌D", value: String(pick(raw, ["rollSongDice"], 2)) },
    { label: "錬金術D", value: String(pick(raw, ["rollAlchemyDice"], 2)) },
    { label: "攻撃力D", value: String(pick(raw, ["battleDiceAtk"], 2)) },
  );

  for (const w of sheet.weapons) {
    p.push({ label: `${w.name}_武器攻撃力`, value: String(w.weaponAtk) });
  }
  return p;
}
