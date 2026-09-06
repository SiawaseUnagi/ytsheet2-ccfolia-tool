import { compatible, type Modifier, type RollTarget } from "./analysis";

export type TargetGroup = { title: string; targets: RollTarget[] };

/** Only shared, non-skill checks with identical formulas and scopes are linked.
 * Original IDs/keys stay intact for saved choices and manual-edit protection.
 */
export function groupCalculationTargets(targets: RollTarget[], modifiers: Modifier[]): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const target of targets) {
    const shared = target.kind === "check" && !target.skillName;
    const key = shared ? JSON.stringify([
      target.kind, target.judge, target.suffix, target.base.dice, target.base.fixed,
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
