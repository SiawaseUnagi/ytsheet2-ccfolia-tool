import type { YtSkill } from "../ytsheet/types";
/** Match actual simultaneous-use instructions, not any mention of evasion. */
export function isEvasionCompanion(skill: YtSkill): boolean {
  if (/パッシブ|アイテム/.test(skill.timing)) return false;
  const timing = skill.timing.trim().replace(/\s+/g, "");
  if (/^回避判定(?:と同時(?:に)?)?$/.test(timing)) return true;
  const effect = skill.effect.replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, " ").replace(/\s+/g, "");
  return /(?:^|[。！？])(?:あなたが行(?:な)?う)?回避判定(?:の使用)?と同時に使用(?:する|できる|可能)(?=[。！]|$)/.test(effect);
}
