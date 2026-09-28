import type { Modifier } from "./analysis";

export type ModifierSettings = {
  states: { toggle: boolean }[];
  getFlagName: () => string;
  setToggle: (toggle: boolean) => void;
  renameFlag: (requested: string) => string;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
/** Individual and all-check panels are views of the same settings, never separate state. */
export function mountModifierSettings(
  parent: HTMLElement,
  modifier: Modifier,
  settings: ModifierSettings,
  prefix = "",
): (force?: boolean) => void {
  const modeLabel = el("label", "加算方法："),
    mode = el("select");
  mode.setAttribute("aria-label", `${prefix}${modifier.source}の加算方法`);
  const mixedOption = el("option", "加算方法が混在");
  mixedOption.value = "mixed";
  mixedOption.disabled = true;
  for (const [value, caption] of [
    ["constant", "常時加算"],
    ["toggle", "フラグ管理"],
  ]) {
    const option = el("option", caption);
    option.value = value;
    option.disabled = value === "mixed";
    mode.append(option);
  }
  mode.append(mixedOption);
  modeLabel.append(mode);
  const mixed = el("p"),
    flagHelp = el("p");
  mixed.style.cssText = flagHelp.style.cssText = "margin:4px 0;font-size:0.9em";
  const rename = el("details");
  rename.dataset.flagEditor = modifier.id;
  rename.append(el("summary", "変数名を変更"));
  const nameLabel = el("label", "補正用の変数名："),
    nameInput = el("input");
  nameInput.type = "text";
  nameInput.placeholder = "例：WB";
  nameInput.maxLength = 80;
  nameInput.autocomplete = "off";
  nameInput.spellcheck = false;
  nameInput.style.cssText =
    "width:100%;max-width:24em;box-sizing:border-box;font-size:16px;margin:4px 0";
  nameInput.setAttribute("aria-label", `${prefix}${modifier.source}の補正用変数名`);
  nameLabel.append(nameInput);
  const applyName = el("button", "名前を適用");
  applyName.type = "button";
  const renameMessage = el("p");
  renameMessage.setAttribute("aria-live", "polite");
  rename.append(nameLabel, applyName, renameMessage);
  const refresh = (force = false) => {
    const states = settings.states,
      first = states[0]?.toggle ?? false;
    const mixedMode = states.some((s) => s.toggle !== first);
    mode.value = mixedMode ? "mixed" : first ? "toggle" : "constant";
    mixedOption.hidden = !mixedMode;
    mixed.textContent = mixedMode
      ? "加算方法が混在しています。選ぶと対象の加算方法をそろえます。チェックの選択状態は変えません。"
      : "";
    const name = settings.getFlagName(),
      toggled = states.some((s) => s.toggle);
    flagHelp.textContent = toggled ? `:${name}=1 / :${name}=0` : "";
    rename.hidden = !toggled;
    if (force || !rename.open) nameInput.value = name;
  };
  mode.onchange = () => {
    if (mode.value === "mixed") return;
    settings.setToggle(mode.value === "toggle");
    refresh();
  };
  const applyRename = () => {
    try {
      const actual = settings.renameFlag(nameInput.value.trim() || modifier.flag);
      refresh(true);
      renameMessage.textContent = `変数名を「${actual}」にしました。最後に「ココフォリアJSONをコピー」を押してください。`;
    } catch (error) {
      renameMessage.textContent =
        error instanceof Error ? error.message : "変数名を変更できませんでした。";
    }
  };
  applyName.onclick = applyRename;
  nameInput.onkeydown = (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      applyRename();
    }
  };
  const source = el("details");
  source.dataset.modifierEffect = modifier.id;
  source.append(el("summary", "スキルの効果を確認"), el("p", modifier.effect));
  if (modifier.condition) source.append(el("p", modifier.condition));
  parent.append(modeLabel, mixed, flagHelp, rename, source);
  refresh();
  return refresh;
}
