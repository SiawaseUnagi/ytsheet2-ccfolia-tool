import { safeNumber } from "../utils/safeNumber";
import type { ParsedSheet } from "../ytsheet/types";

function pick(raw: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const k of keys) if (k in raw) return safeNumber(raw[k], fallback);
  return fallback;
}

function delta(n: number): string {
  if (n === 0) return "";
  return n > 0 ? `+${n}` : String(n);
}

function ref(base: string, n: number): string {
  return `{${base}}${delta(n)}`;
}

function valueOrFormula(useFormula: boolean, formulaBase: string, modifier: number, directValue: number): string {
  return useFormula ? ref(formulaBase, modifier) : String(directValue);
}

export function buildParams(sheet: ParsedSheet, useYtsheetStyleParams = true) {
  const raw = sheet.raw;
  const p: { label: string; value: string }[] = [];

  p.push({ label: "CL", value: String(pick(raw, ["level", "CL", "cl"], 0)) });

  const abilities = [
    ["筋力", "rollStr", "rollStrDice"],
    ["器用", "rollDex", "rollDexDice"],
    ["敏捷", "rollAgi", "rollAgiDice"],
    ["知力", "rollInt", "rollIntDice"],
    ["感知", "rollSen", "rollSenDice"],
    ["精神", "rollMnd", "rollMndDice"],
    ["幸運", "rollLuk", "rollLukDice"],
  ] as const;

  const abilityRolls = new Map<string, number>();
  for (const [label] of abilities) p.push({ label, value: String(sheet.abilities[label] ?? 0) });
  for (const [label, rollKey, diceKey] of abilities) {
    const base = sheet.abilities[label] ?? 0;
    const roll = pick(raw, [rollKey], base);
    abilityRolls.set(label, roll);
    p.push({ label: `${label}判定`, value: valueOrFormula(useYtsheetStyleParams, label, roll - base, roll) });
    p.push({ label: `${label}判定ダイス`, value: String(pick(raw, [diceKey], 2)) });
  }

  const dexRoll = abilityRolls.get("器用") ?? (sheet.abilities["器用"] ?? 0);
  const agiRoll = abilityRolls.get("敏捷") ?? (sheet.abilities["敏捷"] ?? 0);
  const intRoll = abilityRolls.get("知力") ?? (sheet.abilities["知力"] ?? 0);
  const senRoll = abilityRolls.get("感知") ?? (sheet.abilities["感知"] ?? 0);
  const mndRoll = abilityRolls.get("精神") ?? (sheet.abilities["精神"] ?? 0);

  const acc = pick(raw, ["battleTotalAcc"], dexRoll);
  const atk = pick(raw, ["battleTotalAtk"], 0);
  const eva = pick(raw, ["battleTotalEva"], agiRoll);
  const trapDetect = pick(raw, ["rollTrapDetect"], senRoll + pick(raw, ["rollTrapDetectAdd"], 0));
  const trapRelease = pick(raw, ["rollTrapRelease"], dexRoll + pick(raw, ["rollTrapReleaseAdd"], 0));
  const dangerDetect = pick(raw, ["rollDangerDetect"], senRoll + pick(raw, ["rollDangerDetectAdd"], 0));
  const enemyLore = pick(raw, ["rollEnemyLore"], intRoll + pick(raw, ["rollEnemyLoreAdd"], 0));
  const appraisal = pick(raw, ["rollAppraisal"], intRoll + pick(raw, ["rollAppraisalAdd"], 0));
  const magic = pick(raw, ["rollMagic"], intRoll + pick(raw, ["rollMagicAdd"], 0));
  const song = pick(raw, ["rollSong"], mndRoll + pick(raw, ["rollSongAdd"], 0));
  const alchemy = pick(raw, ["rollAlchemy"], dexRoll + pick(raw, ["rollAlchemyAdd"], 0));

  p.push(
    { label: "命中", value: valueOrFormula(useYtsheetStyleParams, "器用判定", acc - dexRoll, acc) },
    { label: "命中ダイス", value: String(pick(raw, ["battleDiceAcc"], 2)) },
    { label: "攻撃力", value: String(atk) },
    { label: "攻撃ダイス", value: String(pick(raw, ["battleDiceAtk"], 2)) },
    { label: "回避", value: valueOrFormula(useYtsheetStyleParams, "敏捷判定", eva - agiRoll, eva) },
    { label: "回避ダイス", value: String(pick(raw, ["battleDiceEva"], 2)) },
    { label: "トラップ探知", value: valueOrFormula(useYtsheetStyleParams, "感知判定", trapDetect - senRoll, trapDetect) },
    { label: "トラップ探知ダイス", value: String(pick(raw, ["rollTrapDetectDice"], 2)) },
    { label: "トラップ解除", value: valueOrFormula(useYtsheetStyleParams, "器用判定", trapRelease - dexRoll, trapRelease) },
    { label: "トラップ解除ダイス", value: String(pick(raw, ["rollTrapReleaseDice"], 2)) },
    { label: "危険感知", value: valueOrFormula(useYtsheetStyleParams, "感知判定", dangerDetect - senRoll, dangerDetect) },
    { label: "危険感知ダイス", value: String(pick(raw, ["rollDangerDetectDice"], 2)) },
    { label: "エネミー識別", value: valueOrFormula(useYtsheetStyleParams, "知力判定", enemyLore - intRoll, enemyLore) },
    { label: "エネミー識別ダイス", value: String(pick(raw, ["rollEnemyLoreDice"], 2)) },
    { label: "アイテム鑑定", value: valueOrFormula(useYtsheetStyleParams, "知力判定", appraisal - intRoll, appraisal) },
    { label: "アイテム鑑定ダイス", value: String(pick(raw, ["rollAppraisalDice"], 2)) },
    { label: "魔術判定", value: valueOrFormula(useYtsheetStyleParams, "知力判定", magic - intRoll, magic) },
    { label: "魔術判定ダイス", value: String(pick(raw, ["rollMagicDice"], 2)) },
    { label: "呪歌判定", value: valueOrFormula(useYtsheetStyleParams, "精神判定", song - mndRoll, song) },
    { label: "呪歌判定ダイス", value: String(pick(raw, ["rollSongDice"], 2)) },
    { label: "錬金術判定", value: valueOrFormula(useYtsheetStyleParams, "器用判定", alchemy - dexRoll, alchemy) },
    { label: "錬金術判定ダイス", value: String(pick(raw, ["rollAlchemyDice"], 2)) },
  );

  for (const w of sheet.weapons) {
    p.push({ label: `${w.name}_武器攻撃力`, value: String(w.weaponAtk) });
  }
  return p;
}
