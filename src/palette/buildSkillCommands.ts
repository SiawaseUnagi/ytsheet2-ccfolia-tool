import type { CustomCommandMap, YtSkill } from "../ytsheet/types";
import { detectUsageLimit } from "./detectUsageLimit";

function hasText(value: string | undefined): boolean {
  return !!value && value !== "―" && value !== "-";
}

function displayCost(skill: YtSkill): string {
  if (!hasText(skill.cost) || skill.cost === "0") return "―";
  return skill.cost;
}

function timingPhrase(timing: string): string {
  const t = timing.trim();
  if (/^《.+》$/.test(t)) return `${t}と同時に`;
  if (/セットアップ/.test(t)) return "セットアッププロセスで";
  if (/イニシアチブ/.test(t)) return "イニシアチブプロセスで";
  if (/ムーブ/.test(t)) return "ムーブアクションで";
  if (/マイナー/.test(t)) return "マイナーアクションで";
  if (/メジャー/.test(t)) return "メジャーアクションで";
  if (/クリンナップ/.test(t)) return "クリンナッププロセスで";
  if (/フリー/.test(t)) return "フリーアクションで";
  if (/戦闘不能/.test(t)) return "戦闘不能と同時に";
  if (/アイテム/.test(t)) return "プリプレイで";
  if (/リアクション/.test(t)) return "リアクションで";
  if (/レガシー/.test(t)) return "レガシーアクションで";
  if (/効果参照/.test(t)) return "";
  if (/判定.*直前|判定.*直後|DR.*直前|DR.*直後|ダメージロール.*直前|ダメージロール.*直後/.test(t)) return `${t}に`;
  return t ? `${t}に` : "";
}

function extraInfo(skill: YtSkill): string {
  const parts: string[] = [];
  if (hasText(skill.judge) && !/自動成功|なし/.test(skill.judge)) parts.push(`判定：${skill.judge}`);
  if (hasText(skill.target) && skill.target !== "自身") parts.push(`対象：${skill.target}`);
  if (hasText(skill.range)) parts.push(`射程：${skill.range}`);
  if (hasText(skill.usage)) parts.push(`使用条件：${skill.usage}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function effectText(skill: YtSkill): string {
  const effect = hasText(skill.effect) ? skill.effect : "";
  return `${effect}${extraInfo(skill)}`.replace(/\s+/g, " ").trim();
}

function passiveLine(skill: YtSkill): string {
  return `《${skill.name}》${skill.level} /${skill.timing || "―"}/${skill.judge || "―"}/${skill.target || "―"}/${skill.range || "―"}/${displayCost(skill)}/ ${effectText(skill)}`.replace(/\s+/g, " ").trim();
}

function normalizeNumberText(value: string): string {
  return value.replace(/,/g, "").replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

function resourceCommands(skill: YtSkill): string[] {
  const lines: string[] = [];
  const cost = Number(skill.cost);
  if (Number.isFinite(cost) && cost > 0) lines.push(`:MP-${cost}`);

  const allText = `${skill.usage} ${skill.effect}`;
  const ep = allText.match(/EPを\s*(\d+)\s*点消費/);
  if (ep) lines.push(`:EP-${ep[1]}`);

  const exactFate = allText.match(/フェイトを\s*(\d+)\s*点消費/);
  if (exactFate) lines.push(`:フェイト-${exactFate[1]}`);
  else if (/フェイト.*消費/.test(allText)) lines.push(":フェイト-1");

  const hp = normalizeNumberText(allText).match(/(?:【?HP】?|ＨＰ)を\s*(\d+)\s*点?消費/);
  if (hp) lines.push(`:HP-${hp[1]}`);

  const gold = normalizeNumberText(allText).match(/(?:所持金を\s*)?(\d+)\s*G\s*消費/);
  if (gold) lines.push(`:所持金-${gold[1]}`);
  return lines;
}

function judgementCommand(skill: YtSkill): string | null {
  const judge = skill.judge.trim();
  if (!hasText(judge) || /自動成功|なし|―|-/.test(judge)) return null;
  if (/魔術/.test(judge)) return "{魔術D}D+{魔術判定}+{魔術判定修正}+{判定BD}D+{命中BD}D>=0 魔術判定";
  if (/呪歌/.test(judge)) return "{呪歌D}D+{呪歌判定}+{呪歌判定修正}+{判定BD}D>=0 呪歌判定";
  if (/錬金術/.test(judge)) return "{錬金術D}D+{錬金術判定}+{錬金術判定修正}+{判定BD}D>=0 錬金術判定";
  if (/命中/.test(judge)) return "{命中D}D+{命中判定}+{命中判定修正}+{判定BD}D+{命中BD}D>=0 命中判定";
  if (/回避/.test(judge)) return "{回避D}D+{回避判定}+{回避判定修正}+{判定BD}D+{回避BD}D>=0 回避判定";
  const ability = judge.match(/(筋力|器用|敏捷|知力|感知|精神|幸運)/)?.[1];
  if (ability) return `{${ability}D}D+{${ability}}+{${ability}判定修正}+{判定BD}D>=0 ${judge}`;
  return `2D>=0 ${judge}`;
}

function isToggleSkill(skill: YtSkill): boolean {
  const text = `${skill.timing} ${skill.effect}`;
  return /シーン終了まで持続|メインプロセス終了まで持続|ラウンド終了まで持続|影響がある場所にいる間|効果を受ける場所/.test(text);
}

function shouldResetHere(skill: YtSkill): boolean {
  return /メインプロセス終了まで持続|ラウンド終了まで持続/.test(skill.effect);
}

export function skillToLines(skill: YtSkill, custom: CustomCommandMap) {
  const lines: string[] = [];
  const resets: { scope: "scene" | "scenario"; line: string }[] = [];
  const c = custom[skill.name];
  const isPassive = /パッシブ/.test(skill.timing);
  const body = effectText(skill);

  if (isPassive) {
    lines.push(passiveLine(skill));
    if (isToggleSkill(skill)) lines.push(`:${skill.name}=1`, `:${skill.name}=0`);
  } else {
    const prefix = timingPhrase(skill.timing);
    lines.push(`${prefix}《${skill.name}》${skill.level}を使用。${body}`.trim());
    if (c?.use?.length) lines.push(...c.use);
    else lines.push(...resourceCommands(skill));
    const judge = judgementCommand(skill);
    if (judge) lines.push(judge);
    if (isToggleSkill(skill)) {
      lines.push(`:${skill.name}=1`);
      if (shouldResetHere(skill)) lines.push(`:${skill.name}=0`);
      else if (/シーン終了まで持続/.test(skill.effect)) resets.push({ scope: "scene", line: `:${skill.name}=0` });
    }
  }

  const lim = detectUsageLimit(skill);
  if (!isPassive && !c?.use && lim) {
    lines.push(`:${skill.name}-1`);
    resets.push({ scope: lim.scope, line: `:${skill.name}=${lim.max}` });
  }
  if (c?.reset?.length) resets.push(...c.reset.map((line) => ({ scope: "scene" as const, line })));
  return { lines, resets, usageLimit: lim };
}
