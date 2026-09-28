import { checkFormula, renderCheck, type CheckFormula } from "./checks";
import { isToggleSkill, skillFlagName, resourceCommands } from "./skillResources";
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
  if (/判定.*直前|判定.*直後|DR.*直前|DR.*直後|ダメージロール.*直前|ダメージロール.*直後/.test(t))
    return `${t}に`;
  return t ? `${t}に` : "";
}

function extraInfo(skill: YtSkill): string {
  const parts: string[] = [];
  if (hasText(skill.judge) && !/自動成功|なし/.test(skill.judge))
    parts.push(`判定：${skill.judge}`);
  if (shouldShowTargetInput(skill)) parts.push(`対象：${skill.target}`);
  if (hasText(skill.range)) parts.push(`射程：${skill.range}`);
  if (hasText(skill.usage)) parts.push(`使用条件：${skill.usage}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function effectText(skill: YtSkill): string {
  const effect = hasText(skill.effect) ? skill.effect : "";
  return `${effect}${extraInfo(skill)}`.replace(/\s+/g, " ").trim();
}

function passiveLine(skill: YtSkill): string {
  return `《${skill.name}》${skill.level} /${skill.timing || "―"}/${skill.judge || "―"}/${skill.target || "―"}/${skill.range || "―"}/${displayCost(skill)}/ ${effectText(skill)}`
    .replace(/\s+/g, " ")
    .trim();
}

function shouldShowTargetInput(skill: YtSkill): boolean {
  const target = skill.target.trim();
  if (!hasText(target)) return false;
  return !/^(自身|なし|無し|無|―|-)$/.test(target);
}

function judgementCommand(skill: YtSkill): string | null {
  const judge = skill.judge.trim();
  if (!hasText(judge) || /^(?:自動成功|なし|―|-)$/u.test(judge)) return null;
  const check = checkFormula(judge);
  return check ? renderCheck(check) : `2D>=0 ${judge}`;
}

function shouldResetHere(skill: YtSkill): boolean {
  return /メインプロセス終了まで持続|ラウンド終了まで持続/.test(skill.effect);
}

export function skillToLines(skill: YtSkill, custom: CustomCommandMap) {
  const lines: string[] = [];
  const resets: { scope: "scene" | "scenario"; line: string }[] = [];
  const c = custom[skill.name];
  let check: CheckFormula | undefined;
  let checkIndex = -1,
    effectsAfter = -1;
  const isPassive = /パッシブ/.test(skill.timing);
  const body = effectText(skill);
  const flag = skillFlagName(skill);

  if (isPassive) {
    lines.push(passiveLine(skill));
    if (isToggleSkill(skill)) lines.push(`:${flag}=1`, `:${flag}=0`);
  } else {
    const prefix = timingPhrase(skill.timing);
    lines.push(`${prefix}《${skill.name}》${skill.level}を使用。${body}`.trim());
    if (c?.use?.length) lines.push(...c.use);
    else lines.push(...resourceCommands(skill));
    if (shouldShowTargetInput(skill)) lines.push("対象：");
    const judge = judgementCommand(skill);
    if (judge) {
      checkIndex = lines.length;
      check = checkFormula(skill.judge);
      lines.push(judge);
    }
    effectsAfter = lines.length - 1;
    if (isToggleSkill(skill)) {
      lines.push(`:${flag}=1`);
      if (shouldResetHere(skill)) lines.push(`:${flag}=0`);
      else if (/シーン終了まで持続/.test(skill.effect))
        resets.push({ scope: "scene", line: `:${flag}=0` });
    }
  }

  const lim = detectUsageLimit(skill);
  if (!isPassive && !c?.use && lim) {
    lines.push(`:${skill.name}-1`);
    resets.push({ scope: lim.scope, line: `:${skill.name}=${lim.max}` });
  }
  if (c?.reset?.length) resets.push(...c.reset.map((line) => ({ scope: "scene" as const, line })));
  return { lines, resets, usageLimit: lim, check, checkIndex, effectsAfter };
}
