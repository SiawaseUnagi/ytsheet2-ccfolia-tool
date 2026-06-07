import type { CustomCommandMap, YtSkill } from "../ytsheet/types";
import { detectUsageLimit } from "./detectUsageLimit";

function hasText(value: string | undefined): boolean {
  return !!value && value !== "―" && value !== "-";
}

function detailLine(skill: YtSkill): string {
  return `タイミング：${skill.timing || "―"}／判定：${skill.judge || "―"}／対象：${skill.target || "―"}／射程：${skill.range || "―"}／コスト：${skill.cost || "―"}`;
}

function resourceCommands(skill: YtSkill): string[] {
  const lines: string[] = [];
  const cost = Number(skill.cost);
  if (Number.isFinite(cost) && cost > 0) lines.push(`:MP-${cost}`);

  const allText = `${skill.usage} ${skill.effect}`;
  const ep = allText.match(/EPを\s*(\d+)\s*点消費/);
  if (ep) lines.push(`:EP-${ep[1]}`);
  const fate = allText.match(/フェイトを\s*(\d+)\s*点消費/);
  if (fate) lines.push(`:フェイト-${fate[1]}`);
  return lines;
}

export function skillToLines(skill: YtSkill, custom: CustomCommandMap) {
  const lines: string[] = [];
  const resets: { scope: "scene" | "scenario"; line: string }[] = [];
  const c = custom[skill.name];
  const isPassive = /パッシブ/.test(skill.timing);

  if (isPassive) {
    lines.push(`【効果参照】《${skill.name}》${skill.level}`);
    lines.push(detailLine(skill));
    if (hasText(skill.effect)) lines.push(`効果：${skill.effect}`);
  } else {
    const timing = skill.timing || "任意";
    lines.push(`${timing}に《${skill.name}》${skill.level}を使用。${skill.effect}`.trim());
    if (c?.use?.length) lines.push(...c.use);
    else lines.push(...resourceCommands(skill));
  }

  const lim = detectUsageLimit(skill);
  if (!isPassive && !c?.use && lim) {
    lines.push(`:${skill.name}-1`);
    resets.push({ scope: lim.scope, line: `:${skill.name}=${lim.max}` });
  }
  if (c?.reset?.length) resets.push(...c.reset.map((line) => ({ scope: "scene" as const, line })));
  return { lines, resets, usageLimit: lim };
}
