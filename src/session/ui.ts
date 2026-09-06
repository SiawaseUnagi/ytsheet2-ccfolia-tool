import { fetchYtsheetJson } from "../ytsheet/fetchYtsheet";
import { BrowserSaves, fileFor, fingerprint, MAX_FILE_BYTES, parseSaveFile, serializeSaveFile, sheetKey, type SaveFile, type Snapshot } from "./model";
import { planSessionUpdate } from "./generation";
import type { Choices } from "./merge";

export type SessionBridge = { capture: () => Snapshot; restore: (snapshot: Snapshot) => void };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
function button(text: string, id: string): HTMLButtonElement {
  const node = el("button", text); node.type = "button"; node.id = id; node.style.minHeight = "40px"; return node;
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function mountSessionTools(bridge: SessionBridge): void {
  if (document.getElementById("sessionTools")) return;
  const section = el("section"); section.id = "sessionTools"; section.setAttribute("aria-label", "編集の保存・再開と更新");
  section.style.cssText = "margin:16px 0;padding:12px;border:1px solid #ddd;border-radius:8px;line-height:1.7;overflow-wrap:anywhere";
  section.append(el("h2", "編集の保存・再開"));
  const toolbar = el("div"); toolbar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  const save = button("このブラウザに保存", "saveSession"), resume = button("続きから編集", "resumeSession"), update = button("更新を反映", "updateSession");
  const select = el("select"); select.id = "savedSessions"; select.setAttribute("aria-label", "保存したキャラクター"); select.style.cssText = "width:100%;box-sizing:border-box;margin:8px 0;font-size:16px";
  toolbar.append(save, resume, update); section.append(toolbar, select);
  const notice = el("p"); notice.id = "sessionNotice"; notice.setAttribute("role", "status"); section.append(notice);
  const dirty = el("p"); dirty.id = "sessionDirty"; dirty.style.fontSize = "0.9em"; section.append(dirty);
  section.append(el("p", "「続きから編集」は保存した編集内容をそのまま復元します。「更新を反映」は最新のキャラシを読み込み、変更点を確認してから取り込みます。更新時は、HP・MP・フェイトと使用回数を新しい最大値にそろえ、一時的な補正を0に戻します。消耗品は最新キャラシの所持数を使います。"));
  const options = el("details"); options.append(el("summary", "保存ファイル・更新前に戻す"));
  const exportFile = button("保存ファイルを書き出す", "exportSession"), importFile = button("保存ファイルを読み込む", "importSession"), undo = button("更新前に戻す", "undoSession"), remove = button("選択した保存を削除", "deleteSession");
  const more = el("div"); more.style.cssText = toolbar.style.cssText; more.append(exportFile, importFile, undo, remove);
  const fileInput = el("input"); fileInput.type = "file"; fileInput.accept = ".json,application/json"; fileInput.hidden = true; fileInput.id = "sessionFile";
  options.append(more, fileInput, el("p", "保存ファイルにはキャラシの内容・編集内容・直前の更新前データが含まれます。共有するときは内容にご注意ください。ファイルを読み込むだけでは、ブラウザの保存には上書きしません。")); section.append(options);
  const preview = el("section"); preview.id = "sessionUpdatePreview"; preview.hidden = true; section.append(preview);
  const place = document.getElementById("useYtsheetStyleParams")?.closest("label"); place?.after(section);
  const help = el("section"); help.style.cssText = "margin-top:16px;line-height:1.7";
  help.append(el("h3", "保存・再開とキャラシの更新"),
    el("p", "編集が終わったら「このブラウザに保存」を押してください（自動保存ではありません）。再開するときは一覧からキャラを選び「続きから編集」を押してください。補正のチェック、短縮名、手直しした文章も保存します。"),
    el("p", "レベルアップなどでキャラシを変更したら「更新を反映」を押し、変更点を確認してください。最後に「この内容で更新・保存」を押すと反映します。自動生成のままの箇所は更新し、手編集と同じ箇所が変わったときは残す内容を選べます。追加スキルは追加し、自分で削除した項目は勝手に復活させません。大きく並べ替えた部分や、直接入力した数値は自動で意味を判定せず確認に残す場合があります。"),
    el("p", "更新を反映する前に、更新前の状態もブラウザへ保存します。「更新前に戻す」は直前1回分に戻ります。戻した後の編集も含め、必要に応じて再び保存してください。"),
    el("p", "保存先は画像などのキャッシュとは別の、この端末・ブラウザのローカルストレージです。「Cookie・サイトデータ」「Webサイトデータ」などを消すと保存内容も失われます。キャッシュだけの削除とは区別してください。シークレット・プライベートモードでは終了時に失われるため、通常モードで利用してください。別端末へは自動共有されません。大切な編集はファイルにも書き出して保管してください。"));
  (document.querySelector("main") ?? section.parentElement)?.append(help);
  let busy = false, savedFingerprint = "", memoryFile: SaveFile | undefined;
  let priorStoreText: string | undefined;
  const isBusy = () => busy || (document.getElementById("gen") as HTMLButtonElement)?.disabled;
  const controls = [save, resume, update, exportFile, importFile, undo, remove, select];
  const store = () => new BrowserSaves(window.localStorage);
  const setBusy = (value: boolean) => {
    busy = value; for (const control of controls) control.disabled = value;
    const gen = document.getElementById("gen") as HTMLButtonElement | null; if (gen) gen.disabled = value;
  };
  const report = (error: unknown) => { notice.textContent = `${message(error)}（入力中の内容は保持しています。ブラウザに保存できない場合は、保存ファイルを書き出してください。）`; };
  const captureOrNull = () => { try { return bridge.capture(); } catch { return null; } };
  const updateDirty = () => {
    const current = captureOrNull();
    dirty.textContent = current ? (fingerprint(current) === savedFingerprint ? "表示中の編集は保存時と同じ状態です。" : "保存していない変更があります。") : "先にキャラシを出力するか、保存ファイルを読み込んでください。";
  };
  const refreshList = (preferred?: string) => {
    const previous = preferred ?? select.value; select.replaceChildren();
    try {
      const listing = store().list();
      for (const item of listing.saves) {
        const option = el("option", `${item.name} — ${new Date(item.savedAt).toLocaleString()}`); option.value = item.key; select.append(option);
      }
      if (!listing.saves.length) select.append(el("option", "ブラウザ内の保存はまだありません"));
      if (listing.saves.some(s => s.key === previous)) select.value = previous;
      if (listing.damaged) notice.textContent = `読み取れない保存が${listing.damaged}件あります。自動では削除していません。`;
    } catch { notice.textContent = "このブラウザでは保存領域を利用できません。ファイルへの書き出し・読み込みは利用できます。"; }
  };
  const browserFile = (key: string) => store().read(key);
  const remember = (file: SaveFile, saved: boolean) => {
    memoryFile = file; savedFingerprint = saved ? fingerprint(file.current) : "";
    preview.hidden = true; updateDirty();
    document.getElementById("checkVariables")?.click();
  };
  const confirmReplace = () => !captureOrNull() || window.confirm("表示中の編集を、選んだ保存内容に置き換えます。未保存の変更は失われます。続けますか？");
  save.onclick = () => {
    if (isBusy()) return;
    try {
      const current = bridge.capture(), existing = browserFile(current.key);
      if (existing && memoryFile?.current.key !== current.key && !window.confirm("同じキャラの保存がすでにあります。表示中の内容で上書きしますか？")) return;
      if (existing && priorStoreText && JSON.stringify(existing) !== priorStoreText && !window.confirm("別のタブなどで保存が変更されています。表示中の内容で上書きしますか？")) return;
      const file = fileFor(current, memoryFile?.current.key === current.key ? memoryFile.previous : existing?.previous);
      store().write(file); priorStoreText = JSON.stringify(file); remember(file, true); refreshList(current.key);
      notice.textContent = `「${current.name}」をこのブラウザに保存しました。`;
    } catch (error) { report(error); }
  };
  resume.onclick = () => {
    if (isBusy()) return;
    try {
      const file = browserFile(select.value); if (!file) throw new Error("保存を選んでください。");
      if (!confirmReplace()) return;
      bridge.restore(file.current); priorStoreText = JSON.stringify(file); remember(file, true);
      notice.textContent = `「${file.current.name}」の編集を再開しました。現在値は保存した値のままです。`;
    } catch (error) { report(error); }
  };
  exportFile.onclick = () => {
    if (isBusy()) return;
    try {
      const current = bridge.capture();
      const previous = memoryFile?.current.key === current.key ? memoryFile.previous : undefined;
      const text = serializeSaveFile(fileFor(current, previous));
      const href = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
      const a = el("a"); a.href = href; a.download = `${current.name.replace(/[\\/:*?"<>|\r\n]/g, "_") || "character"}-編集保存.json`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 60000);
      notice.textContent = "保存ファイルを書き出しました。ブラウザ内の保存とは別に保管できます。";
    } catch (error) { report(error); }
  };
  importFile.onclick = () => { if (!isBusy()) fileInput.click(); };
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0]; fileInput.value = ""; if (!file || isBusy()) return;
    setBusy(true);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("4MB以内の保存ファイルを選んでください。");
      const data = parseSaveFile(await file.text());
      if (!confirmReplace()) return;
      bridge.restore(data.current); remember(data, false); priorStoreText = undefined;
      notice.textContent = "保存ファイルを読み込みました。このブラウザにも残す場合は「このブラウザに保存」を押してください。";
    } catch (error) { report(error); } finally { setBusy(false); }
  };
  update.onclick = async () => {
    if (isBusy()) return;
    let before: Snapshot;
    try {
      before = bridge.capture();
      const typedUrl = (document.getElementById("url") as HTMLInputElement).value.trim();
      if (sheetKey(typedUrl) !== before.key) throw new Error("別のキャラのURLです。同じキャラのURLに戻すか、別のキャラとして出力してください。");
    } catch (error) { report(error); return; }
    setBusy(true); notice.textContent = "最新キャラシを読み込み、変更点を確認しています。";
    try {
      const storedBefore = browserFile(before.key);
      const raw = await fetchYtsheetJson(before.url) as Record<string, unknown>;
      if (fingerprint(bridge.capture()) !== fingerprint(before)) throw new Error("読み込み中に編集が変更されました。内容を保護するため更新を止めました。もう一度更新してください。");
      const plan = planSessionUpdate(before, raw); const choices: Choices = {};
      preview.replaceChildren(); preview.hidden = false; preview.append(el("h3", "更新内容の確認"));
      preview.append(el("p", "まだ編集内容は変更していません。手編集と重なる箇所の扱いを選んでから反映してください。"));
      const changes = el("details"); changes.open = true; changes.append(el("summary", `変更点・リセット内容（${plan.changes.length}件）`));
      for (const item of plan.changes) changes.append(el("p", item)); preview.append(changes);
      for (const warning of plan.warnings) preview.append(el("p", warning));
      for (const conflict of plan.conflicts) {
        const box = el("details"); box.open = true; box.append(el("summary", conflict.field));
        const source = el("details"); source.append(el("summary", "前回の自動生成")); const base = el("pre", conflict.before || "（なし）"); base.style.whiteSpace = "pre-wrap"; source.append(base); box.append(source);
        for (const [caption, text] of [["今の編集", conflict.local], ["最新キャラシから生成", conflict.incoming]]) {
          const p = el("pre", `${caption}\n${text || "（削除／なし）"}`); p.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;max-height:14em;overflow:auto"; box.append(p);
        }
        const pick = el("select"); pick.setAttribute("aria-label", `${conflict.field}の更新方法`); pick.style.cssText = "max-width:100%;font-size:16px";
        for (const [value, caption] of [["", "残す内容を選んでください"], ["local", "今の編集を残す"], ["incoming", "最新の生成内容を使う"]]) { const option = el("option", caption); option.value = value; pick.append(option); }
        if (conflict.allowBoth) { const option = el("option", "両方を残す（最新の追加 → 自分の追加）"); option.value = "both"; pick.append(option); }
        pick.onchange = () => { if (pick.value) choices[conflict.id] = pick.value as "local" | "incoming" | "both"; else delete choices[conflict.id]; }; box.append(pick); preview.append(box);
      }
      const apply = button("この内容で更新・保存", "applySessionUpdate"), cancel = button("更新をやめる", "cancelSessionUpdate");
      const actions = el("div"); actions.style.cssText = toolbar.style.cssText; actions.append(apply,cancel); preview.append(actions);
      cancel.onclick = () => { preview.hidden = true; notice.textContent = "更新を取り消しました。編集内容は変更していません。"; };
      apply.onclick = () => {
        if (isBusy()) return;
        try {
          if (fingerprint(bridge.capture()) !== fingerprint(before)) throw new Error("確認中に編集が変わっています。最新キャラシの更新をもう一度実行してください。");
          if (JSON.stringify(browserFile(before.key)) !== JSON.stringify(storedBefore)) throw new Error("確認中に別のタブで保存が変更されました。更新をもう一度確認してください。");
          if (plan.conflicts.some(c => !choices[c.id])) throw new Error("手編集と重なるすべての箇所で、残す内容を選んでください。");
          const result = planSessionUpdate(before, raw, choices), file = fileFor(result.next, before);
          // The old state and new state are stored together BEFORE changing the visible editor.
          store().write(file); bridge.restore(file.current); priorStoreText = JSON.stringify(file); remember(file,true); refreshList(file.current.key);
          notice.textContent = "更新を反映して保存しました。HP・MP・フェイト・使用回数は新しい最大値です。必要なら「更新前に戻す」が使えます。";
        } catch (error) { report(error); }
      };
      notice.textContent = `変更点を表示しました。手編集と重なる箇所は${plan.conflicts.length}件です。`;
    } catch (error) { report(error); } finally { setBusy(false); }
  };
  undo.onclick = () => {
    if (isBusy()) return;
    try {
      const current = bridge.capture(), previous = memoryFile?.current.key === current.key ? memoryFile.previous : browserFile(current.key)?.previous;
      if (!previous) throw new Error("このキャラには更新前の記録がありません。");
      if (!window.confirm("直前の更新前に戻します。表示中の未保存の編集は置き換わります。続けますか？")) return;
      const file = fileFor({ ...previous, savedAt: new Date().toISOString() });
      store().write(file); bridge.restore(file.current); priorStoreText = JSON.stringify(file); remember(file,true); refreshList(current.key);
      notice.textContent = "更新前の状態に戻して保存しました。";
    } catch (error) { report(error); }
  };
  remove.onclick = () => {
    if (isBusy()) return;
    try {
      const file = browserFile(select.value); if (!file) throw new Error("削除する保存を選んでください。");
      if (!window.confirm(`「${file.current.name}」のブラウザ内の保存と更新前記録を削除します。よろしいですか？`)) return;
      store().remove(file.current.key); refreshList(); savedFingerprint = ""; updateDirty(); notice.textContent = "選択した保存を削除しました。画面にある編集内容は残しています。";
    } catch (error) { report(error); }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => { if (timer) clearTimeout(timer); timer = setTimeout(updateDirty, 250); };
  for (const id of ["statusEdit", "paramsEdit", "palette", "outjson"]) document.getElementById(id)?.addEventListener("input", changed);
  document.getElementById("calculationEditor")?.addEventListener("change", changed);
  document.getElementById("calculationEditor")?.addEventListener("click", changed);
  document.addEventListener("ytsheet:generated", () => { memoryFile = undefined; savedFingerprint = ""; priorStoreText = undefined; preview.hidden = true; updateDirty(); });
  window.addEventListener("storage", e => { if (e.key?.startsWith("ytsheet2-ccfolia:session:")) { refreshList(); notice.textContent = "別のタブで保存内容が変更されました。画面の編集内容は変更していません。"; } });
  refreshList(); updateDirty();
}
