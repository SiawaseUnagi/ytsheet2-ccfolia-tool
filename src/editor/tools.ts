import { validateEditor, type EditorField } from "./validation";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}

/** Mount after the main editor. Copying always delegates to its existing handler. */
export function mountEditorTools(): void {
  const json = document.getElementById("outjson") as HTMLTextAreaElement | null;
  const palette = document.getElementById("palette") as HTMLTextAreaElement | null;
  const copy = document.getElementById("copy") as HTMLButtonElement | null;
  const status = document.getElementById("statusEdit") as HTMLTextAreaElement | null;
  const params = document.getElementById("paramsEdit") as HTMLTextAreaElement | null;
  if (!json || !palette || !copy || !status || !params || document.getElementById("editorTools")) return;

  const details = el("details"); details.id = "characterJsonDetails";
  details.style.cssText = "margin:16px 0";
  details.append(el("summary", "ココフォリアJSON（内容を確認・直接編集するときに開く）"));
  const heading = json.previousElementSibling;
  json.before(details); details.append(json);
  if (heading?.tagName === "H3" && heading.textContent === "ココフォリアJSON") heading.remove();

  const section = el("section"); section.id = "editorTools";
  section.setAttribute("aria-label", "コピーと変数の確認");
  section.style.cssText = "margin:12px 0 24px;line-height:1.7;overflow-wrap:anywhere";
  const buttons = el("div"); buttons.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  const copyBottom = el("button", "ココフォリアJSONをコピー"); copyBottom.id = "copyBottom";
  const check = el("button", "変数を確認"); check.id = "checkVariables";
  for (const button of [copyBottom, check]) { button.type = "button"; button.style.minHeight = "40px"; }
  buttons.append(copyBottom, check); section.append(buttons);
  const result = el("details"); result.id = "validationResults";
  const summary = el("summary", "変数の確認結果（未確認）");
  const body = el("div"); result.append(summary, body); section.append(result);
  const note = el("p", "名前の重複、未登録の変数、参照の循環、操作先のステータスなどを確認します。ルーム変数・ゲームのルール・補正の二重加算までは判定しません。確認しても入力内容は変えず、注意があってもコピーは続けます。");
  note.style.fontSize = "0.9em"; section.append(note); palette.after(section);
  const notice = el("p"); notice.id = "validationNotice";
  notice.setAttribute("role", "status"); notice.style.cssText = "margin:4px 0;font-size:0.9em";
  copy.parentElement?.after(notice);
  const fields: Record<EditorField, HTMLTextAreaElement> = { statusEdit: status, paramsEdit: params, palette };
  const captions: Record<EditorField, string> = { statusEdit: "ステータス", paramsEdit: "パラメータ", palette: "チャットパレット" };
  let checkedSnapshot = "";
  const snapshot = () => JSON.stringify([status.value, params.value, palette.value]);
  const run = (show: boolean) => {
    body.replaceChildren();
    if (!json.value.trim()) {
      summary.textContent = "先にキャラシを読み込んで出力してください。";
      if (show) result.open = true;
      return;
    }
    const issues = validateEditor({ statusEdit: status.value, paramsEdit: params.value, palette: palette.value });
    checkedSnapshot = snapshot();
    summary.textContent = issues.length ? `確認したい項目が${issues.length}件あります` : "定義・参照の範囲では問題を検出しませんでした";
    notice.textContent = issues.length ? `変数の確認：${issues.length}件の注意があります。詳細はチャットパレット下の「変数の確認結果」に表示しています。` : "変数の確認：定義・参照の範囲では問題を検出しませんでした。";
    for (const issue of issues.slice(0, 100)) {
      const p = el("p", `${captions[issue.field]} ${issue.line}行目：${issue.message} `);
      const jump = el("button", "この行を編集"); jump.type = "button";
      jump.onclick = () => {
        if (snapshot() !== checkedSnapshot) { run(true); return; }
        const input = fields[issue.field];
        let start = 0;
        for (let n = 1; n < issue.line; n++) { const index = input.value.indexOf("\n", start); if (index < 0) break; start = index + 1; }
        const newline = input.value.indexOf("\n", start), end = newline < 0 ? input.value.length : newline;
        input.scrollIntoView({ block: "center" }); input.focus(); input.setSelectionRange(start, end);
      };
      p.append(jump); body.append(p);
    }
    if (issues.length > 100) body.append(el("p", "表示は先頭100件です。修正後にもう一度確認してください。"));
    if (!issues.length) body.append(el("p", "効果の適用条件や数式の意味が正しいことを保証する確認ではありません。"));
    result.open = show || issues.length > 0;
  };
  check.onclick = () => run(true);
  copyBottom.onclick = () => copy.click();
  // A capture listener runs before main.ts copies the edited fields, without changing that code.
  copy.addEventListener("click", () => run(false), { capture: true });
  const markStale = () => {
    if (checkedSnapshot && snapshot() !== checkedSnapshot) {
      summary.textContent = "編集後は未確認です。「変数を確認」を押してください。";
      notice.textContent = "編集後は未確認です。コピー時にもう一度確認します。";
    }
  };
  for (const field of Object.values(fields)) field.addEventListener("input", markStale);
  // Checkbox-generated changes do not emit textarea input events.
  document.getElementById("calculationEditor")?.addEventListener("change", markStale);
  document.getElementById("calculationEditor")?.addEventListener("click", () => queueMicrotask(markStale));
  document.getElementById("gen")?.addEventListener("click", () => {
    checkedSnapshot = ""; body.replaceChildren(); result.open = false;
    summary.textContent = "変数の確認結果（未確認）"; notice.textContent = "";
  });
}
