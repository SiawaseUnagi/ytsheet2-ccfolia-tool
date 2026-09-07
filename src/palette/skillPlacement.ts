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
  for (const m of effect.matchAll(/《([^》]+)》\s*(?:(?:の使用)?と|を)同時に\s*使用(?:する|できる|可能)/g)) {
    const tail = effect.slice(m.index! + m[0].length);
    if (/^(?:こと(?:は|が)できない|必要はない|ことを禁止|ではない)/.test(tail)) continue;
    names.add(m[1].trim());
  }
  return [...names];
}
export type AlternateUse = { name: string; timing: string };
/** A timing-changing skill stays at its own timing. Its named partner gets an extra
 * occurrence there, without moving the partner out of its original section. */
export function alternateTimingUses(skill: YtSkill): AlternateUse[] {
  const effect = clean(skill.effect);
  const pattern = /《([^》]+)》\s*(?:が|を)\s*(?:「(?:タイミング[:：])?)?((?:セットアップ|イニシアチブ|クリンナップ)(?:プロセス)?|(?:ムーブ|マイナー|メジャー|フリー|レガシー)(?:アクション)?|リアクション|戦闘前|(?:DR|ダメージロール)(?:の)?直[前後])」?\s*で(?:も)?\s*使用(?:可能となる|可能になる|することができる|できる|可能)(?=[。.!?]|$)/g;
  const result = new Map<string, AlternateUse>();
  for (const m of effect.matchAll(pattern)) {
    const use = { name: m[1].trim(), timing: m[2].replace(/(?:アクション|プロセス)$/, "").replace(/ダメージロール/g, "DR").replace(/の直/g, "直") };
    result.set(JSON.stringify(use), use);
  }
  return [...result.values()];
}
export type SkillPlacement = { roots: number[]; children: Map<number, number[]>; alternates: Map<number, { index: number; timing: string }[]>; warnings: string[] };
export function planSkillPlacement(skills: YtSkill[]): SkillPlacement {
  const parents = new Map<number, number>(), warnings: string[] = [];
  const proposed = new Map<number, { index: number; timing: string }>();
  const byName = new Map<string, number[]>();
  skills.forEach((s, i) => byName.set(s.name, [...(byName.get(s.name) ?? []), i]));
  skills.forEach((s, i) => {
    const names = simultaneousSkillNames(s), changes = alternateTimingUses(s);
    const mentionsTimingChange = /《[^》]+》\s*(?:が|を)[^。]*で(?:も)?\s*使用(?:可能|できる|することができる)/.test(clean(s.effect));
    if (changes.length || mentionsTimingChange) {
      const use = changes[0], matches = use ? byName.get(use.name) ?? [] : [];
      if (changes.length !== 1 || names.length !== 1 || names[0] !== use?.name || matches.length !== 1 || matches[0] === i || /パッシブ|アイテム/.test(skills[matches[0]]?.timing ?? "")) {
        warnings.push(`《${s.name}》：使用タイミングを変える対象を一意に確認できないため、追加配置せず元のタイミングに残しました。`);
      } else {
        const timing = clean(s.timing).replace(/(?:アクション|プロセス)$/, "").replace(/ダメージロール/g, "DR").replace(/の直/g, "直");
        if (timing !== use.timing) warnings.push(`《${s.name}》：自身のタイミングと変更先が異なるため、追加配置は手動で確認してください。`);
        else proposed.set(i, { index: matches[0], timing: use.timing });
      }
      return;
    }
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
  const alternates: SkillPlacement["alternates"] = new Map();
  const reaches = (from: number, target: number): boolean => {
    const stack = [from], visited = new Set<number>();
    while (stack.length) {
      const node = stack.pop()!;
      if (node === target) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      stack.push(...(children.get(node) ?? []), ...(alternates.get(node) ?? []).map(x => x.index));
    }
    return false;
  };
  for (const [owner, copy] of proposed) {
    if (reaches(copy.index, owner)) warnings.push(`《${skills[owner].name}》：追加配置が循環するため、元の配置だけを残しました。`);
    else alternates.set(owner, [copy]);
  }
  return { roots, children, alternates, warnings };
}
