/** Shared check definitions: parameter names and display labels are not inferred
 * from an already-rendered declaration. */
export const ABILITIES = ["筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"] as const;
const special = [
  "トラップ探知",
  "トラップ解除",
  "危険感知",
  "エネミー識別",
  "アイテム鑑定",
  "魔術",
  "呪歌",
  "錬金術",
  "命中",
  "回避",
];
export type CheckFormula = { dice: string; fixed: string; suffix: string; judge: string };
export function checkFormula(input: string, spiritExtra = 0): CheckFormula | undefined {
  const name = input
    .replace(/[【】\s]/g, "")
    .replace(/[（(].*$/, "")
    .replace(/(?:の)?判定$/, "");
  if (![...ABILITIES, ...special].some((x) => x === name)) return undefined;
  const ability = ABILITIES.some((x) => x === name),
    key = ability || ["魔術", "呪歌", "錬金術"].includes(name) ? `${name}判定` : name;
  let dice = `{${key}ダイス}+{判定BD}`;
  if (name === "魔術" || name === "命中") dice += "+{命中BD}";
  if (name === "回避") dice += "+{回避BD}";
  if (name === "精神") dice += "+{強心丹D}" + (spiritExtra ? `+${spiritExtra}` : "");
  const suffix = ability ? `【${name}】判定` : `${name}判定`;
  return { dice, fixed: `{${key}}`, suffix, judge: suffix };
}
export const renderCheck = (check: CheckFormula): string =>
  `(${check.dice})D+${check.fixed}>=0 ${check.suffix}`;
export const GENERAL_CHECKS = [
  ...ABILITIES,
  "命中",
  "回避",
  "トラップ探知",
  "トラップ解除",
  "危険感知",
  "エネミー識別",
  "アイテム鑑定",
  "魔術",
  "呪歌",
  "錬金術",
];
