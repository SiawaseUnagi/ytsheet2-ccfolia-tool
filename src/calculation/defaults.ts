import { compatible } from "./analysis";
import type { PreparedPalette } from "./palette";
import { modifierKey, targetKey, type CalculationState } from "./sessionState";

/** Only used for a brand-new output. Saved and imported choices are never defaulted again. */
export function createDefaultCalculationState(prepared: PreparedPalette, ensureFlag: (name: string) => string): CalculationState {
  const choices: CalculationState["choices"] = [], flags = new Map<string, CalculationState["flags"][number]>();
  for (const target of prepared.targets) for (const modifier of prepared.modifiers) {
    if (!compatible(modifier, target)) continue;
    const checked = target.kind === "damage", toggle = modifier.conditional;
    choices.push({ target: targetKey(target), modifier: modifierKey(modifier, prepared.modifiers), checked, toggle });
    if (checked && toggle && !flags.has(modifier.flag)) {
      const name = ensureFlag(modifier.flag); flags.set(modifier.flag, { key: modifier.flag, name, actual: name });
    }
  }
  return { version: 1, flags: [...flags.values()], choices };
}
