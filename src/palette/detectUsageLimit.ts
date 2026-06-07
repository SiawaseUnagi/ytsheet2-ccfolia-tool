import type { YtSkill } from "../ytsheet/types";

export type UsageLimit = { scope: "scene" | "scenario"; max: number; sourceText: string } | null;

export function detectUsageLimit(skill: YtSkill): UsageLimit {
  const src = `${skill.usage} ${skill.effect}`;
  const m = src.match(/(シーン|シナリオ)\s*[\[［]?(SL(?:\+1)?)?[\]］]?\s*回|(シーン|シナリオ)\s*(\d+)\s*回/);
  if (!m) return null;
  const scope = (m[1] ?? m[3]) === "シーン" ? "scene" : "scenario";
  const txt = m[0];
  let max = 1;
  if (m[4]) max = Number(m[4]);
  else if (/SL\+1/.test(txt)) max = skill.level + 1;
  else if (/SL/.test(txt)) max = skill.level;
  return { scope, max, sourceText: txt };
}
