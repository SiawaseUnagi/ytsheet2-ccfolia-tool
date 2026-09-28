import type { Modifier } from "./analysis";
import { mountModifierSettings } from "./modifierSettings";
export type CheckChoiceControl = {
  modifier: Modifier;
  states: { checked: boolean; toggle: boolean }[];
  setChecked: (checked: boolean) => void;
  setToggle: (toggle: boolean) => void;
  getFlagName: () => string;
  renameFlag: (requested: string) => string;
  changed: () => void;
  rebuild: () => void;
};
/** All-roll effects are eligible, but the controls passed here belong to CHECK targets only. */
export function isAllChecksModifier(m: Modifier): boolean {
  return (
    m.kinds.includes("check") &&
    !m.judge &&
    !m.hitOnly &&
    !m.attack &&
    !m.onlySkill &&
    !m.attribute &&
    !m.magicOnly &&
    !m.penetrationOnly &&
    /(?:あらゆる|すべての|全ての)(?:判定|ダイスロール)/.test(m.effect.replace(/\s+/g, ""))
  );
}
export function setAllCheckChoices(controls: CheckChoiceControl[], checked: boolean): void {
  controls.forEach((control) => control.setChecked(checked));
  for (const rebuild of new Set(controls.map((control) => control.rebuild))) rebuild();
}
export function setAllCheckModes(controls: CheckChoiceControl[], toggle: boolean): void {
  controls.forEach((control) => control.setToggle(toggle));
  const active = controls.filter((control) => control.states.some((s) => s.checked));
  for (const rebuild of new Set(active.map((control) => control.rebuild))) rebuild();
  // A mode edit on unchecked rows is still saved; it never selects the effect or creates a flag.
  if (!active.length) controls[0]?.changed();
}
export function mountBulkCheckControls(
  parent: HTMLElement,
  controls: CheckChoiceControl[],
): (force?: boolean) => void {
  const groups = new Map<string, CheckChoiceControl[]>();
  for (const control of controls)
    if (isAllChecksModifier(control.modifier))
      groups.set(control.modifier.id, [...(groups.get(control.modifier.id) ?? []), control]);
  if (!groups.size) return () => {};
  const panel = document.createElement("section");
  panel.dataset.bulkChecks = "true";
  panel.style.cssText =
    "margin:8px 0;padding:8px;border:1px solid #ddd;border-radius:6px;overflow-wrap:anywhere";
  const heading = document.createElement("h4");
  heading.textContent = "すべての判定にまとめて加算";
  heading.style.margin = "0 0 8px";
  panel.append(heading);
  const help = document.createElement("p");
  help.textContent =
    "チェックは式に組み込むかどうかの選択です。卓中のフラグの0・1は別に操作します。不要な判定は個別に解除できます。";
  panel.append(help);
  const refreshers: ((force?: boolean) => void)[] = [];
  for (const group of groups.values()) {
    const m = group[0].modifier,
      row = document.createElement("div"),
      label = document.createElement("label"),
      box = document.createElement("input"),
      text = document.createElement("span");
    row.dataset.bulkModifier = m.id;
    row.style.margin = "12px 0";
    label.style.cssText = "display:flex;gap:8px;align-items:flex-start;padding:8px 0";
    box.type = "checkbox";
    box.dataset.bulkModifierId = m.id;
    const amount = [
      m.amount.dice !== "0" ? `ダイス ${m.amount.dice}` : "",
      m.amount.fixed !== "0" || m.amount.fixedExpression
        ? `固定値 ${m.amount.fixedExpression ?? m.amount.fixed}`
        : "",
    ]
      .filter(Boolean)
      .join(" / ");
    box.setAttribute("aria-label", `全判定：${m.source}（${amount}）`);
    label.append(box, text);
    row.append(label);
    const refreshSettings = mountModifierSettings(
      row,
      m,
      {
        states: group.flatMap((c) => c.states),
        getFlagName: group[0].getFlagName,
        renameFlag: group[0].renameFlag,
        setToggle: (toggle) => {
          setAllCheckModes(group, toggle);
          refresh();
        },
      },
      "全判定：",
    );
    const refresh = (force = false) => {
      const states = group.flatMap((c) => c.states),
        count = states.filter((s) => s.checked).length;
      box.checked = count === states.length;
      box.indeterminate = count > 0 && count < states.length;
      text.textContent = `${m.source}（${amount}）：${count}/${states.length}か所に選択`;
      refreshSettings(force);
    };
    refreshers.push(refresh);
    box.onchange = () => {
      setAllCheckChoices(group, box.checked);
      refresh();
    };
    panel.append(row);
  }
  parent.querySelector(":scope > summary")?.after(panel);
  const refresh = (force = false) => refreshers.forEach((fn) => fn(force));
  refresh();
  return refresh;
}
