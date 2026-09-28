import type { Modifier } from "./analysis";

export type ModifierSettings = { element: HTMLElement; refresh: (force?: boolean) => void };
export type ModifierSettingsOptions = {
  modifier: Modifier;
  scope?: string;
  getModes: () => boolean[];
  getFlagName: () => string;
  setMode: (toggle: boolean) => void;
  renameFlag: (requested: string) => string;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

/** Shared controls keep bulk and per-formula settings on the same state and rename path. */
export function mountModifierSettings(options: ModifierSettingsOptions): ModifierSettings {
  const { modifier } = options;
  const caption = `${options.scope ?? ""}${modifier.source}`;
  const element = el("div");
  const modeLabel = el("label", "加算方法："),
    mode = el("select");
  mode.setAttribute("aria-label", `${caption}の加算方法`);
  for (const [value, name] of [
    ["constant", "常時加算"],
    ["toggle", "フラグ管理"],
    ["mixed", "個別の指定が混在"],
  ]) {
    const option = el("option", name);
    option.value = value;
    mode.append(option);
  }
  modeLabel.append(mode);
  element.append(modeLabel);
  const flagHelp = el("p");
  flagHelp.style.cssText = "margin:4px 0;font-size:0.9em";
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
  nameInput.setAttribute("aria-label", `${caption}の補正用変数名`);
  nameLabel.append(nameInput);
  rename.append(nameLabel);
  const applyName = el("button", "名前を適用");
  applyName.type = "button";
  rename.append(applyName);
  const renameMessage = el("p");
  renameMessage.setAttribute("aria-live", "polite");
  rename.append(renameMessage);
  const refresh = (force = false) => {
    const modes = options.getModes(),
      first = modes[0] ?? false;
    mode.value = modes.some((value) => value !== first) ? "mixed" : first ? "toggle" : "constant";
    const name = options.getFlagName(),
      toggled = modes.some(Boolean);
    flagHelp.textContent = toggled ? `:${name}=1 / :${name}=0` : "";
    rename.hidden = !toggled;
    if (force || !rename.open) nameInput.value = name;
  };
  mode.onchange = () => {
    if (mode.value === "mixed") return;
    options.setMode(mode.value === "toggle");
    refresh();
  };
  const apply = () => {
    try {
      const actual = options.renameFlag(nameInput.value.trim() || modifier.flag);
      refresh(true);
      renameMessage.textContent = `変数名を「${actual}」にしました。最後に「ココフォリアJSONをコピー」を押してください。`;
    } catch (error) {
      renameMessage.textContent =
        error instanceof Error ? error.message : "変数名を変更できませんでした。";
    }
  };
  applyName.onclick = apply;
  nameInput.onkeydown = (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      apply();
    }
  };
  const source = el("details");
  source.append(el("summary", "スキルの効果を確認"), el("p", modifier.effect));
  element.append(flagHelp, rename, source);
  refresh();
  return { element, refresh };
}
