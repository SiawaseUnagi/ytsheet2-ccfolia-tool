import type { YtSkill } from "../ytsheet/types";
import { normalizeEffect } from "./expression";

/** An attack declaration, not permission to attack or an attack used to describe a weapon. */
export function directAttackKind(skill: YtSkill): "weapon" | "melee" | "ranged" | "magic" | undefined {
  const text = normalizeEffect(skill.effect).replace(/「[^「」]*」/g, "");
  for (const sentence of text.split(/[。\n]/)) {
    // Rewritten effects, examples and another character's actions are not this action's damage.
    if (/たとえば|例えば|一例|効果を.*変更|効果.*に変更|(?:対象|敵|他のキャラクター)(?:が|は)[^、,]*攻撃を/.test(sentence)) continue;
    const match = /(魔法|白兵|射撃|武器)攻撃を\s*(?:\d+回\s*)?行(?:な)?う(?=\s*(?:$|[、,](?:さらに|その|同時に)))/.exec(sentence);
    if (match) return ({ 魔法: "magic", 白兵: "melee", 射撃: "ranged", 武器: "weapon" } as const)[match[1] as "魔法" | "白兵" | "射撃" | "武器"];
  }
  return undefined;
}
export function isBearUp(name: string): boolean {
  return /^(?:ベアアップ|ペアアップ)$/.test(name.normalize("NFKC").trim());
}
/** Last explicit timing before this bonus, so an item may have passive and activated effects. */
export function equipmentToggle(effectBeforeBonus: string, fallback: boolean): boolean {
  const timings = [...effectBeforeBonus.matchAll(/パッシブ|効果参照|(?:ダメージロール|DR)(?:の)?直(?:前|後)|(?:セットアップ|イニシアチブ|クリンナップ)(?:プロセス)?|(?:マイナー|メジャー|ムーブ|フリー|レガシー)(?:アクション)?/g)];
  return timings.length ? timings[timings.length - 1][0] !== "パッシブ" : fallback;
}
