import { compatible, type Modifier, type RollTarget } from "./analysis";
import { renderRoll, TrackedPalette, type PreparedPalette, type Selection } from "./palette";
import { validateFlagName } from "./flagNames";

type Hooks = {
  ensureFlag: (label: string) => string;
  renameFlag: (previous: string, requested: string) => string;
  changed: () => void;
};
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

/** Uses textContent for all sheet-provided text. No sheet data is interpreted as HTML. */
export function mountCalculationEditor(host: HTMLElement, prepared: PreparedPalette, palette: HTMLTextAreaElement, hooks: Hooks): () => void {
  host.replaceChildren();
  const tracker = new TrackedPalette(prepared.text, prepared.ranges);
  const onInput = () => tracker.observe(palette.value);
  palette.addEventListener("input", onInput);
  // A source may occur in several roll cards. Keep its toggle name shared.
  const bindings = new Map<string, FlagBinding>();
  for (const m of prepared.modifiers) if (!bindings.has(m.flag)) bindings.set(m.flag, { name: m.flag });
  const views: { key: string; refresh: (force?: boolean) => void; rebuild: () => void; active: () => boolean }[] = [];
  host.append(el("h3", "式に加える補正（試用版）"));
  host.append(el("p", "補正を加えたい式を開き、使う効果にチェックを入れてください。最初はすべて未選択です。ゆとシートの命中・攻撃力などに反映済みの効果は、二重に足さないよう選ばないでください。"));
  host.append(el("p", "スキルレベルは出力時に計算し、CL・能力値は変数で残します。チェックは「式に組み込む」操作です。条件付きの効果は、卓中に0・1で切り替えてください。"));
  const groups: { name: string; matches: (t: RollTarget) => boolean }[] = [
    { name: "回復量・HP設定値", matches: t => ["hpHeal", "mpHeal", "hpSet"].includes(t.kind) },
    { name: "ダメージ", matches: t => t.kind === "damage" },
    { name: "判定", matches: t => t.kind === "check" },
  ];
  for (const group of groups) {
    const targets = prepared.targets.filter(group.matches).filter(t => t.kind !== "check" || prepared.modifiers.some(m => compatible(m, t)));
    if (!targets.length) continue;
    const outer = el("details"); outer.open = true;
    outer.append(el("summary", `${group.name}（${targets.length}式）`));
    for (const target of targets) {
      const card = el("details"); card.dataset.targetId = target.id;
      card.style.cssText = "margin:8px 0;padding:8px;border:1px solid #ddd;border-radius:6px;overflow-wrap:anywhere";
      const summary = el("summary", target.title); card.append(summary);
      const candidates = prepared.modifiers.filter(m => compatible(m, target));
      const states = new Map<string, { checked: boolean; toggle: boolean }>();
      const preview = el("textarea"); preview.readOnly = true; preview.rows = 3;
      preview.setAttribute("aria-label", `${target.title}の候補式`);
      preview.style.cssText = "width:100%;box-sizing:border-box;margin-top:8px";
      preview.value = renderRoll(target);
      const message = el("p"); message.setAttribute("aria-live", "polite");
      const rebuild = () => {
        const selections: Selection[] = [];
        for (const modifier of candidates) {
          const state = states.get(modifier.id);
          if (!state?.checked) continue;
          const binding = bindings.get(modifier.flag)!;
          if (state.toggle) binding.actual = hooks.ensureFlag(binding.actual ?? binding.name);
          selections.push({ modifier, flag: state.toggle ? binding.actual : undefined });
        }
        preview.value = renderRoll(target, selections);
        tracker.observe(palette.value);
        if (tracker.replace(target.id, preview.value)) {
          palette.value = tracker.text;
          message.textContent = "この式の補正を反映しました。最後に「ココフォリアJSONをコピー」を押してください。";
        } else {
          message.textContent = "この式は手で編集されているため、上書きしていません。下の候補式をコピーし、必要な部分だけチャットパレットへ反映してください。";
        }
        summary.textContent = `${target.title}（選択 ${selections.length}件）`;
        for (const view of views) view.refresh();
        hooks.changed();
      };
      if (target.kind === "hpSet") card.append(el("p", "これは「HPを○点にする」式です。通常のHP回復量を増やす補正は候補に含めていません。"));
      if (!candidates.length) card.append(el("p", "読み取れた補正候補はありません。必要な補正はチャットパレットで追加できます。"));
      for (const modifier of candidates) {
        const state = { checked: false, toggle: modifier.conditional };
        const binding = bindings.get(modifier.flag)!;
        states.set(modifier.id, state);
        const box = el("div"); box.style.cssText = "margin:12px 0";
        const label = el("label"); label.style.cssText = "display:flex;gap:8px;align-items:flex-start;padding:6px 0";
        const checkbox = el("input"); checkbox.type = "checkbox";
        checkbox.dataset.modifierId = modifier.id;
        checkbox.setAttribute("aria-label", `${target.title}：${modifier.source}`);
        label.append(checkbox, el("span", describe(modifier))); box.append(label);
        const modeLabel = el("label", "加算方法：");
        const mode = el("select"); mode.setAttribute("aria-label", `${modifier.source}の加算方法`);
        for (const [value, caption] of [["constant", "常時加算"], ["toggle", "0・1で切り替え"]]) {
          const option = el("option", caption); option.value = value; mode.append(option);
        }
        mode.value = state.toggle ? "toggle" : "constant"; modeLabel.append(mode); box.append(modeLabel);
        const flagHelp = el("p"); flagHelp.style.cssText = "margin:4px 0;font-size:0.9em";
        const rename = el("details"); rename.dataset.flagEditor = modifier.id;
        rename.append(el("summary", "変数名を変更"));
        const nameLabel = el("label", "補正用の変数名：");
        const nameInput = el("input"); nameInput.type = "text"; nameInput.value = binding.actual ?? binding.name;
        nameInput.placeholder = "例：WB"; nameInput.maxLength = 80;
        nameInput.autocomplete = "off"; nameInput.spellcheck = false;
        nameInput.style.cssText = "width:100%;max-width:24em;box-sizing:border-box;font-size:16px;margin:4px 0";
        nameInput.setAttribute("aria-label", `${modifier.source}の補正用変数名`);
        nameLabel.append(nameInput); rename.append(nameLabel);
        const applyName = el("button", "名前を適用"); applyName.type = "button";
        rename.append(applyName, el("p", "WBのように、{ }を付けずに入力します。同じ補正を使う式にも反映します。使用回数の名前は変えません。空欄で適用すると元の名前に戻ります。"));
        const renameMessage = el("p"); renameMessage.setAttribute("aria-live", "polite"); rename.append(renameMessage);
        const updateFlagHelp = (force = false) => {
          const name = binding.actual ?? binding.name;
          flagHelp.textContent = state.toggle ? `切り替え用：:${name}=1 / :${name}=0。未登録なら現在値0・最大値0のステータスを追加します。` : modifier.condition;
          rename.hidden = !state.toggle;
          // Keep a user's in-progress draft; synchronize other copies after applying.
          if (force || !rename.open) nameInput.value = name;
        };
        const applyRename = () => {
          try {
            const next = validateFlagName(nameInput.value.trim() || modifier.flag);
            const previous = binding.actual ?? binding.name;
            for (const [key, other] of bindings) {
              if (key !== modifier.flag && (other.actual ?? other.name) === next) {
                throw new Error(`「${next}」は別の補正で使われています。別の名前にしてください。`);
              }
            }
            tracker.observe(palette.value);
            const actual = hooks.renameFlag(previous, next);
            // Only names change, so tracked formulas remain editable through checkboxes.
            tracker.renameFlag(previous, actual);
            binding.name = actual;
            if (binding.actual) binding.actual = actual;
            const affected = views.filter(view => view.key === modifier.flag);
            for (const fn of new Set(affected.filter(view => view.active()).map(view => view.rebuild))) fn();
            for (const view of affected) view.refresh(true);
            nameInput.value = actual;
            renameMessage.textContent = `変数名を「${actual}」にしました。最後に「ココフォリアJSONをコピー」を押してください。`;
            hooks.changed();
          } catch (error) {
            renameMessage.textContent = error instanceof Error ? error.message : "変数名を変更できませんでした。";
          }
        };
        applyName.onclick = applyRename;
        nameInput.onkeydown = event => {
          if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); applyRename(); }
        };
        views.push({ key: modifier.flag, refresh: updateFlagHelp, rebuild, active: () => state.checked && state.toggle });
        updateFlagHelp(); box.append(flagHelp, rename);
        if (target.attack === "weapon" && (modifier.attack === "melee" || modifier.attack === "ranged")) {
          box.append(el("p", `${modifier.attack === "melee" ? "白兵" : "射撃"}攻撃専用です。この式を使う武器に適用できるか確認してください。`));
        }
        const source = el("details"); source.append(el("summary", "元の効果文・条件を確認する"), el("p", modifier.effect)); box.append(source);
        checkbox.onchange = () => { state.checked = checkbox.checked; rebuild(); updateFlagHelp(); };
        mode.onchange = () => { state.toggle = mode.value === "toggle"; if (state.checked) rebuild(); updateFlagHelp(); };
        card.append(box);
      }
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
    for (const item of prepared.reviews) {
      review.append(el("p", `《${item.source}》：${item.reason}`), el("p", item.effect));
    }
    host.append(review);
  }
  host.append(el("p", "手で編集した式は自動で上書きしません。変数名の変更時だけ、同じ名前の参照と操作コマンドを置き換えます。追加した切り替え用ステータスは、チェックを外しても残します。不要ならステータス欄から削除してください。"));
  return () => palette.removeEventListener("input", onInput);
}
