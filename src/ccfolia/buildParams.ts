import type { ParsedSheet } from "../ytsheet/types";

export function buildParams(sheet: ParsedSheet) {
  const p: { label: string; value: string }[] = [];
  for (const k of ["筋力","器用","敏捷","知力","感知","精神","幸運"]) p.push({ label: k, value: String(sheet.abilities[k] ?? 0) });
  for (const k of ["筋力","器用","敏捷","知力","感知","精神","幸運"]) { p.push({ label: `${k}判定修正`, value: "0" }); p.push({ label: `${k}D`, value: "2" }); }
  for (const k of ["命中判定","回避判定","魔術判定","呪歌判定","錬金術判定","攻撃力"]) p.push({ label: k, value: "0" });
  for (const k of ["命中判定修正","回避判定修正","魔術判定修正","呪歌判定修正","錬金術判定修正","トラップ探知修正","トラップ解除修正","危険感知修正","エネミー識別修正","アイテム鑑定修正","命中D","回避D","魔術D","呪歌D","錬金術D","攻撃力D"]) p.push({ label: k, value: /D$/.test(k) ? "2" : "0" });
  for (const w of sheet.weapons) p.push({ label: `${w.name}_命中判定`, value: String(w.hit) },{ label: `${w.name}_命中D`, value: String(w.hitDice) },{ label: `${w.name}_攻撃力`, value: String(w.atk) },{ label: `${w.name}_攻撃力D`, value: String(w.atkDice) });
  return p;
}
