import type { CustomCommandMap, YtSkill } from "../ytsheet/types";
import { detectUsageLimit } from "./detectUsageLimit";

export function skillToLines(skill: YtSkill, custom: CustomCommandMap) {
  const lines: string[] = [];
  const resets: { scope: "scene" | "scenario"; line: string }[] = [];
  const c = custom[skill.name];
  lines.push(`${skill.timing || "任意"}に《${skill.name}》${skill.level}を使用。${skill.effect}`);
  if (c?.use?.length) lines.push(...c.use);
  else if (/^\d+$/.test(skill.cost)) lines.push(`:MP-${skill.cost}`);
  const lim = detectUsageLimit(skill);
  if (!c?.use && lim) {
    lines.push(`:${skill.name}-1`);
    resets.push({ scope: lim.scope, line: `:${skill.name}=${lim.max}` });
  }
  if (c?.reset?.length) resets.push(...c.reset.map((line) => ({ scope: "scene" as const, line })));
  return { lines, resets, usageLimit: lim };
}
