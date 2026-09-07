import type { YtSkill } from "../ytsheet/types";

function clean(value: string): string {
  return value.replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
}
/** Match simultaneous use, not prerequisites, effect replacements, or prohibitions. */
export function simultaneousSkillNames(skill: YtSkill): string[] {
  const names = new Set<string>();
  const timing = clean(skill.timing).match(/^《([^》]+)》$/);
  if (timing) names.add(timing[1].trim());
  const effect = clean(skill.effect);
  for (const m of effect.matchAll(/《([^》]+)》\s*(?:の使用)?と同時に\s*使用(?:する|できる|可能)/g)) {
    const tail = effect.slice(m.index! + m[0].length);
    if (/^(?:こと(?:は|が)できない|必要はない|ことを禁止|ではない)/.test(tail)) continue;
    names.add(m[1].trim());
  }
  return [...names];
}
export type SkillPlacement = { roots: number[]; children: Map<number, number[]>; warnings: string[] };
export function planSkillPlacement(skills: YtSkill[]): SkillPlacement {
  const parents = new Map<number, number>(), warnings: string[] = [];
  const byName = new Map<string, number[]>();
  skills.forEach((s, i) => byName.set(s.name, [...(byName.get(s.name) ?? []), i]));
  skills.forEach((s, i) => {
    const names = simultaneousSkillNames(s);
    if (!names.length) return;
    if (names.length !== 1) {
      warnings.push(`《${s.name}》：同時使用先が複数あるため、元のタイミングに残しました。`); return;
    }
    const matches = byName.get(names[0]) ?? [];
    if (matches.length !== 1 || matches[0] === i) {
      warnings.push(`《${s.name}》：同時使用先の《${names[0]}》を一意に確認できないため、元のタイミングに残しました。`); return;
    }
    parents.set(i, matches[0]);
  });
  const cycles = new Set<number>();
  for (const start of parents.keys()) {
    const path: number[] = [], seen = new Map<number, number>();
    let cursor: number | undefined = start;
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.set(cursor, path.length); path.push(cursor); cursor = parents.get(cursor);
    }
    if (cursor !== undefined) for (const i of path.slice(seen.get(cursor)!)) cycles.add(i);
  }
  for (const i of cycles) {
    parents.delete(i); warnings.push(`《${skills[i].name}》：同時使用の参照が循環しているため、元のタイミングに残しました。`);
  }
  const children = new Map<number, number[]>(), roots: number[] = [];
  skills.forEach((_, i) => {
    const parent = parents.get(i);
    if (parent === undefined) roots.push(i);
    else children.set(parent, [...(children.get(parent) ?? []), i]);
  });
  return { roots, children, warnings };
}
