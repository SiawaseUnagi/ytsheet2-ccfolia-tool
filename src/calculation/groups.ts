import { compatible, type Modifier, type RollTarget } from "./analysis";

export type TargetGroup = { title: string; targets: RollTarget[] };

/** Link identical common checks and repeated occurrences of the SAME skill.
 * Different skills and different formula scopes are never combined. Original semantic
 * save keys stay intact, while each occurrence retains its own protected text range. */
export function groupCalculationTargets(targets: RollTarget[], modifiers: Modifier[]): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const target of targets) {
    const shared = target.kind === "check" && !target.skillName;
    const key = shared || target.skillName ? JSON.stringify([
      target.skillName ?? "", target.kind, target.judge, target.suffix, target.base.dice, target.base.fixed,
      target.attack, target.magic, target.attribute,
      modifiers.filter(m => compatible(m, target)).map(m => m.id),
    ]) : `single:${target.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { title: shared ? target.suffix : target.title, targets: [] };
      groups.set(key, group);
    }
    group.targets.push(target);
  }
  return [...groups.values()];
}
