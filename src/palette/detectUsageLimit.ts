import type { YtSkill } from "../ytsheet/types";

export type UsageLimit = { scope: "scene" | "scenario"; max: number; sourceText: string } | null;

export function detectUsageLimit(skill: YtSkill): UsageLimit {
  const src = `${skill.usage} ${skill.effect}`;
  const m = src.match(/(シーン|シナリオ)\s*[\[［]?\s*(SL(?:\s*[＋+]\s*\d+)?)\s*[\]］]?\s*回|(シーン|シナリオ)\s*[\[［]?\s*(\d+)\s*[\]］]?\s*回/);
  if (!m) return null;
  const scope = (m[1] ?? m[3]) === "シーン" ? "scene" : "scenario";
  const txt = m[0];
  let max = 1;
  if (m[4]) max = Number(m[4]);
  else if (m[2]) {
    const plus = m[2].match(/[＋+]\s*(\d+)/)?.[1];
    max = skill.level + (plus ? Number(plus) : 0);
  }
  return { scope, max, sourceText: txt };
}
