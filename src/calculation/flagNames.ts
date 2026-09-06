export type FlagStatus = { label: string; value: string; max: string };
export type FlagParam = { label: string; value: string };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names are used both in {references} and in :name=1 commands. */
export function validateFlagName(input: string): string {
  const name = input.trim();
  if (!name) throw new Error("変数名を入力してください。");
  if (name.length > 80) throw new Error("変数名は80文字以内で入力してください。");
  if (/[\s\u0000-\u001f\u007f{}｛｝=＝,，/\\:+*<>\-]/u.test(name)) {
    throw new Error("空白、{ }、区切り記号や計算記号を含めずに入力してください。例：WB");
  }
  return name;
}

/** Rename exact tokens only, never skill names in prose or similarly named counters. */
export function replaceFlagReferences(text: string, from: string, to: string): string {
  if (from === to) return text;
  return text.split(`{${from}}`).join(`{${to}}`)
    .replace(new RegExp(`(^[ \\t]*:)${escape(from)}(?=[=+\\-])`, "gm"), (_match, prefix: string) => `${prefix}${to}`);
}

/** Preserve the user's row order, spacing and numeric values. */
export function replaceStatusLabel(text: string, from: string, to: string): string {
  if (from === to) return text;
  return text.replace(new RegExp(`(^[ \\t]*)${escape(from)}(?=[\\s=＝,，/]|$)`, "gm"), (_match, prefix: string) => `${prefix}${to}`);
}

/** Validate first so a failed rename cannot partially change the user's output. */
export function checkFlagRename(
  from: string, requested: string, statuses: FlagStatus[], params: FlagParam[], palette: string,
  reserved: (name: string) => boolean,
): string {
  const name = validateFlagName(requested);
  if (name === from) return name;
  if (reserved(name) || statuses.some(s => s.label === name) || params.some(p => p.label === name)) {
    throw new Error(`「${name}」は別の項目で使われています。別の名前にしてください。`);
  }
  const current = statuses.filter(s => s.label === from);
  if (reserved(from) || params.some(p => p.label === from) || current.length > 1 ||
      current.some(s => s.max.trim() === "" || Number(s.max) !== 0 || !["0", "1"].includes(s.value.trim()))) {
    throw new Error(`「${from}」は0・1の補正専用ステータスと確認できません。回数や数値を管理する項目は変更しません。`);
  }
  const definition = (label: string) => new RegExp(`^[ \\t]*//[ \\t]*${escape(label)}[ \\t]*=`, "m");
  if (definition(from).test(palette) || definition(name).test(palette)) {
    throw new Error("チャットパレット内の // 定義と名前が重なっています。別の名前にしてください。");
  }
  // Do not silently merge with a manually entered, not-yet-defined variable.
  if (palette.includes(`{${name}}`) || params.some(p => p.value.includes(`{${name}}`)) ||
      new RegExp(`^[ \\t]*:${escape(name)}(?=[=+\\-])`, "m").test(palette)) {
    throw new Error(`「${name}」はすでに式やコマンドで使われています。別の名前にしてください。`);
  }
  if (new RegExp(`^[ \\t]*:${escape(from)}[+\\-]`, "m").test(palette)) {
    throw new Error("回数の増減にも使われている名前は変更しません。補正専用の項目を使ってください。");
  }
  return name;
}
