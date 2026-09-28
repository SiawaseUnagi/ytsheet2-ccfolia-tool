import { RESERVED_FLAG_LABELS } from "../resources/labels";
import type { YtSkill } from "../ytsheet/types";
import { normalizeEffect } from "../calculation/expression";
import { numericValue } from "../utils/safeNumber";
import { detectUsageLimit } from "./detectUsageLimit";

export function isToggleSkill(skill: YtSkill): boolean {
  return /シーン終了まで持続|メインプロセス終了まで持続|ラウンド終了まで持続|影響がある場所にいる間|効果を受ける場所/.test(
    `${skill.timing} ${skill.effect}`,
  );
}
/** The remaining-use counter and a boolean modifier are separate resources. */
export function skillFlagName(skill: YtSkill): string {
  return detectUsageLimit(skill) || RESERVED_FLAG_LABELS.has(skill.name)
    ? `${skill.name}_補正`
    : skill.name;
}
export function resourceCommands(skill: YtSkill): string[] {
  const result: string[] = [];
  const cost = numericValue(skill.cost);
  if (cost !== undefined && cost > 0) result.push(`:MP-${cost}`);
  const text = normalizeEffect(`${skill.usage}。${skill.effect}`);
  const statements = text
    .split("。")
    .filter(
      (s) =>
        !/(?:消費せず|消費しない|消費する必要はない|消費しなく|コストを消費せず|例[:：]|たとえば|例えば)/.test(
          s,
        ),
    );
  for (const resource of ["EP", "フェイト", "HP", "所持金"]) {
    const pattern =
      resource === "所持金"
        ? /(?:所持金を\s*)?(\d[\d,]*)\s*G\s*(?:を)?消費(?!せず|しない)/
        : new RegExp(
            `(?:【)?${resource}(?:】)?を\\s*(\\d[\\d,]*)\\s*点?(?:を)?消費(?!せず|しない)`,
          );
    const hit = statements.map((s) => s.match(pattern)).find(Boolean);
    const amount = hit ? numericValue(hit[1]) : undefined;
    if (amount !== undefined && amount > 0) result.push(`:${resource}-${amount}`);
    else if (resource === "フェイト" && statements.some((s) => /フェイトを[^。]*消費/.test(s)))
      result.push(":フェイト-1");
  }
  return [...new Set(result)];
}
