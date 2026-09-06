import { groupCalculationTargets } from "./groups";
import { compatible, type Modifier, type RollTarget } from "./analysis";
import { renderRoll, TrackedPalette, type PreparedPalette, type Selection } from "./palette";
import { validateFlagName } from "./flagNames";
import { emptyCalculationState, locateSavedRanges, modifierKey, targetKey, type CalculationState, type CalculationEditor } from "./sessionState";

type Hooks = { ensureFlag: (label: string) => string; renameFlag: (previous: string, requested: string) => string; changed: () => void };
type FlagBinding = { name: string; actual?: string };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
function describe(modifier: Modifier): string {
  const p: string[] = [];
  if (modifier.amount.dice !== "0") p.push(`ダイス ${modifier.amount.dice}`);
  if (modifier.amount.fixed !== "0") p.push(`固定値 ${modifier.amount.fixed}`);
  return `${modifier.source}${modifier.level === undefined ? "（装備）" : `（スキルレベル${modifier.level}）`}：${p.join(" / ")}`;
}

/** Save/restore uses semantic keys, not the source sheet's shifting row numbers. */
export function mountCalculationEditor(host: HTMLElement, prepared: PreparedPalette, palette: HTMLTextAreaElement, hooks: Hooks, initial = emptyCalculationState()): CalculationEditor {
  host.replaceChildren();
  const located = locateSavedRanges(prepared, palette.value);
  const tracker = new TrackedPalette(located.text, located.ranges);
  const onInput = () => tracker.observe(palette.value); palette.addEventListener("input", onInput);
  const bindings = new Map<string, FlagBinding>();
  for (const m of prepared.modifiers) if (!bindings.has(m.flag)) {
    const saved = initial.flags.find(f => f.key === m.flag);
    bindings.set(m.flag, saved ? { name: saved.name, actual: saved.actual } : { name: m.flag });
  }
  const snapshots: CalculationState["choices"] = [];
  const defaultToggles = new Map(prepared.modifiers.map(m => [modifierKey(m, prepared.modifiers), m.conditional]));
  const views: { key: string; refresh: (force?: boolean) => void; rebuild: () => void; active: () => boolean }[] = [];
  host.append(el("h3", "式に加える補正（試用版）"));
  const groups: { name: string; matches: (t: RollTarget) => boolean }[] = [
    { name: "回復量", matches: t => ["hpHeal", "mpHeal"].includes(t.kind) },
    { name: "スキルの効果", matches: t => ["hpSet", "effect"].includes(t.kind) },
    { name: "ダメージ", matches: t => t.kind === "damage" },
    { name: "判定", matches: t => t.kind === "check" },
  ];
  for (const group of groups) {
    const targets = prepared.targets.filter(group.matches).filter(t => t.kind !== "check" || prepared.modifiers.some(m => compatible(m, t)));
    if (!targets.length) continue;
    const linkedGroups = groupCalculationTargets(targets, prepared.modifiers);
    const outer = el("details"); outer.open = true; outer.append(el("summary", `${group.name}（${linkedGroups.length}項目）`));
    for (const linkedGroup of linkedGroups) {
      const linked = linkedGroup.targets, target = linked[0];
      const title = linkedGroup.title + (linked.length > 1 ? `（${linked.length}か所）` : "");
      const card = el("details"); card.dataset.targetId = target.id;
      card.style.cssText = "margin:8px 0;padding:8px;border:1px solid #ddd;border-radius:6px;overflow-wrap:anywhere";
      const summary = el("summary", title); card.append(summary);
      const candidates = prepared.modifiers.filter(m => compatible(m, target));
      const states = new Map<string, CalculationState["choices"]>();
      const preview = el("textarea"); preview.readOnly = true; preview.rows = 3;
      preview.setAttribute("aria-label", `${title}の候補式`); preview.style.cssText = "width:100%;box-sizing:border-box;margin-top:8px";
      const message = el("p"); message.setAttribute("aria-live", "polite");
      const selections = (ensure: boolean, member = 0): Selection[] => candidates.flatMap(modifier => {
        const state = states.get(modifier.id)?.[member]; if (!state?.checked) return [];
        const binding = bindings.get(modifier.flag)!;
        if (state.toggle && ensure) binding.actual = hooks.ensureFlag(binding.actual ?? binding.name);
        return [{ modifier, flag: state.toggle ? binding.actual ?? binding.name : undefined }];
      });
      const refreshPreview = () => {
        const formulas = linked.map((member, index) => renderRoll(member, selections(false, index)));
        preview.value = [...new Set(formulas)].join("\n");
        const count = [...states.values()].filter(values => values.some(value => value.checked)).length;
        summary.textContent = `${title}（選択 ${count}件）`;
      };
      const rebuild = () => {
        tracker.observe(palette.value);
        let protectedCount = 0;
        linked.forEach((member, index) => {
          if (!tracker.replace(member.id, renderRoll(member, selections(true, index)))) protectedCount++;
        });
        palette.value = tracker.text;
        refreshPreview();
        message.textContent = protectedCount
          ? `手編集した${protectedCount}行は上書きしていません。必要な部分だけ候補式から反映してください。`
          : "補正を反映しました。";
        for (const view of views) view.refresh(); hooks.changed();
      };
      if (!candidates.length) card.append(el("p", "読み取れた補正候補はありません。必要な補正はチャットパレットで追加できます。"));
      for (const modifier of candidates) {
        const mk = modifierKey(modifier, prepared.modifiers);
        const memberStates = linked.map(member => {
          const tk = targetKey(member);
          const saved = initial.choices.find(c => c.target === tk && c.modifier === mk);
          return { target: tk, modifier: mk, checked: saved?.checked ?? false, toggle: saved?.toggle ?? modifier.conditional };
        });
        snapshots.push(...memberStates); states.set(modifier.id, memberStates);
        const state = memberStates[0];
        const binding = bindings.get(modifier.flag)!;
        const box = el("div"); box.style.cssText = "margin:12px 0";
        const label = el("label"); label.style.cssText = "display:flex;gap:8px;align-items:flex-start;padding:6px 0";
        const checkbox = el("input"); checkbox.type = "checkbox"; checkbox.checked = memberStates.every(s => s.checked);
        checkbox.indeterminate = memberStates.some(s => s.checked) && !checkbox.checked;
        checkbox.dataset.modifierId = modifier.id; checkbox.setAttribute("aria-label", `${title}：${modifier.source}`);
        label.append(checkbox, el("span", describe(modifier))); box.append(label);
        const modeLabel = el("label", "加算方法："), mode = el("select"); mode.setAttribute("aria-label", `${modifier.source}の加算方法`);
        for (const [value, caption] of [["constant", "常時加算"], ["toggle", "0・1で切り替え"]]) { const option = el("option", caption); option.value = value; mode.append(option); }
        const mixedMode = memberStates.some(s => s.toggle !== state.toggle);
        if (mixedMode) { const option = el("option", "保存時の指定が混在"); option.value = "mixed"; mode.append(option); }
        mode.value = mixedMode ? "mixed" : state.toggle ? "toggle" : "constant";
        modeLabel.append(mode); box.append(modeLabel);
        const mixed = el("p"); mixed.style.cssText = "margin:4px 0;font-size:0.9em"; box.append(mixed);
        const flagHelp = el("p"); flagHelp.style.cssText = "margin:4px 0;font-size:0.9em";
        const rename = el("details"); rename.dataset.flagEditor = modifier.id; rename.append(el("summary", "変数名を変更"));
        const nameLabel = el("label", "補正用の変数名："), nameInput = el("input"); nameInput.type = "text"; nameInput.value = binding.actual ?? binding.name;
        nameInput.placeholder = "例：WB"; nameInput.maxLength = 80; nameInput.autocomplete = "off"; nameInput.spellcheck = false;
        nameInput.style.cssText = "width:100%;max-width:24em;box-sizing:border-box;font-size:16px;margin:4px 0";
        nameInput.setAttribute("aria-label", `${modifier.source}の補正用変数名`); nameLabel.append(nameInput); rename.append(nameLabel);
        const applyName = el("button", "名前を適用"); applyName.type = "button";
        rename.append(applyName);
        const renameMessage = el("p"); renameMessage.setAttribute("aria-live", "polite"); rename.append(renameMessage);
        const updateFlagHelp = (force = false) => {
          const name = binding.actual ?? binding.name;
          const toggled = memberStates.some(s => s.toggle);
          flagHelp.textContent = toggled ? `:${name}=1 / :${name}=0` : "";
          mixed.textContent = memberStates.some(s => s.checked !== memberStates[0].checked || s.toggle !== memberStates[0].toggle)
            ? "保存時の指定が混在しています。変更した補正から共通の設定になります。" : "";
          rename.hidden = !toggled; if (force || !rename.open) nameInput.value = name;
        };
        const applyRename = () => {
          try {
            const next = validateFlagName(nameInput.value.trim() || modifier.flag), previous = binding.actual ?? binding.name;
            for (const [key, other] of bindings) if (key !== modifier.flag && (other.actual ?? other.name) === next) throw new Error(`「${next}」は別の補正で使われています。別の名前にしてください。`);
            tracker.observe(palette.value); const actual = hooks.renameFlag(previous, next); tracker.renameFlag(previous, actual);
            binding.name = actual; if (binding.actual) binding.actual = actual;
            const affected = views.filter(view => view.key === modifier.flag);
            for (const fn of new Set(affected.filter(view => view.active()).map(view => view.rebuild))) fn();
            for (const view of affected) view.refresh(true); nameInput.value = actual;
            renameMessage.textContent = `変数名を「${actual}」にしました。最後に「ココフォリアJSONをコピー」を押してください。`; hooks.changed();
          } catch (error) { renameMessage.textContent = error instanceof Error ? error.message : "変数名を変更できませんでした。"; }
        };
        applyName.onclick = applyRename;
        nameInput.onkeydown = event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); applyRename(); } };
        views.push({ key: modifier.flag, refresh: updateFlagHelp, rebuild, active: () => memberStates.some(s => s.checked && s.toggle) });
        updateFlagHelp(); box.append(flagHelp, rename);
        if (target.attack === "weapon" && (modifier.attack === "melee" || modifier.attack === "ranged")) box.append(el("p", `${modifier.attack === "melee" ? "白兵" : "射撃"}攻撃専用です。この式を使う武器に適用できるか確認してください。`));
        const source = el("details"); source.append(el("summary", "元の効果文・条件を確認する"), el("p", modifier.effect)); box.append(source);
        checkbox.onchange = () => {
          memberStates.forEach(s => { s.checked = checkbox.checked; }); checkbox.indeterminate = false;
          rebuild(); updateFlagHelp();
        };
        mode.onchange = () => {
          if (mode.value === "mixed") return;
          memberStates.forEach(s => { s.toggle = mode.value === "toggle"; });
          if (memberStates.some(s => s.checked)) rebuild(); else hooks.changed(); updateFlagHelp();
        };
        card.append(box);
      }
      refreshPreview();
      const copy = el("button", "候補式をコピー"); copy.type = "button";
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(preview.value); message.textContent = "候補式をコピーしました。"; }
        catch { message.textContent = "コピーできませんでした。候補式の欄を選択してコピーしてください。"; }
      };
      card.append(preview, copy, message); outer.append(card);
    }
    host.append(outer);
  }
  if (prepared.reviews.length) {
    const review = el("details"); review.append(el("summary", `要確認：自動で式にしなかった効果（${prepared.reviews.length}件）`));
    for (const item of prepared.reviews) review.append(el("p", `《${item.source}》：${item.reason}`), el("p", item.effect));
    host.append(review);
  }
  return Object.assign(() => palette.removeEventListener("input", onInput), {
    getState: (): CalculationState => ({ version: 1, flags: [...bindings].filter(([key, value]) => value.actual !== undefined || value.name !== key).map(([key, value]) => ({ key, ...value })), choices: snapshots.filter(s => s.checked || s.toggle !== defaultToggles.get(s.modifier)).map(s => ({ ...s })) }),
  });
}
