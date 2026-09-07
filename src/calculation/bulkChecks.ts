import type { Modifier } from "./analysis";
export type CheckChoiceControl = {
  modifier: Modifier; states: { checked: boolean }[];
  setChecked: (checked: boolean) => void; rebuild: () => void;
};
/** All-roll effects are eligible, but the controls passed here must belong to CHECK targets only. */
export function isAllChecksModifier(m: Modifier): boolean {
  return m.kinds.includes("check") && !m.judge && !m.hitOnly && !m.attack && !m.onlySkill && !m.attribute && !m.magicOnly && !m.penetrationOnly
    && /(?:あらゆる|すべての|全ての)(?:判定|ダイスロール)/.test(m.effect.replace(/\s+/g, ""));
}
export function setAllCheckChoices(controls: CheckChoiceControl[], checked: boolean): void {
  controls.forEach(control => control.setChecked(checked));
  for (const rebuild of new Set(controls.map(control => control.rebuild))) rebuild();
}
export function mountBulkCheckControls(parent: HTMLElement, controls: CheckChoiceControl[]): () => void {
  const groups = new Map<string, CheckChoiceControl[]>();
  for (const control of controls) if (isAllChecksModifier(control.modifier)) groups.set(control.modifier.id, [...(groups.get(control.modifier.id) ?? []), control]);
  if (!groups.size) return () => {};
  const panel = document.createElement("section"); panel.dataset.bulkChecks = "true";
  panel.style.cssText = "margin:8px 0;padding:8px;border:1px solid #ddd;border-radius:6px";
  const heading = document.createElement("h4"); heading.textContent = "すべての判定にまとめて加算"; heading.style.margin = "0 0 8px"; panel.append(heading);
  const refreshers: (() => void)[] = [];
  for (const group of groups.values()) {
    const m = group[0].modifier, label = document.createElement("label"), box = document.createElement("input"), text = document.createElement("span");
    label.style.cssText = "display:flex;gap:8px;align-items:flex-start;padding:8px 0";
    box.type = "checkbox"; box.dataset.bulkModifierId = m.id;
    const amount = [m.amount.dice !== "0" ? `ダイス ${m.amount.dice}` : "", m.amount.fixed !== "0" ? `固定値 ${m.amount.fixed}` : ""].filter(Boolean).join(" / ");
    box.setAttribute("aria-label", `全判定：${m.source}（${amount}）`);
    const refresh = () => {
      const states = group.flatMap(c => c.states), count = states.filter(s => s.checked).length;
      box.checked = count === states.length; box.indeterminate = count > 0 && count < states.length;
      text.textContent = `${m.source}（${amount}）：${count}/${states.length}か所に選択`;
    };
    refreshers.push(refresh); box.onchange = () => { setAllCheckChoices(group, box.checked); refresh(); };
    label.append(box, text); panel.append(label);
  }
  parent.querySelector(":scope > summary")?.after(panel);
  const refresh = () => refreshers.forEach(fn => fn()); refresh(); return refresh;
}
