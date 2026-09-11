import { checkFlagRename, replaceFlagReferences, replaceStatusLabel } from "./calculation/flagNames";
import { prepareCalculationPalette } from "./calculation/palette";
import { mountCalculationEditor } from "./calculation/ui";
import { emptyCalculationState, applyCalculationState, type CalculationEditor } from "./calculation/sessionState";
import { buildCharacterJson } from "./ccfolia/buildCharacterJson";
import { buildCommands } from "./ccfolia/buildCommands";
import { buildMemo } from "./ccfolia/buildMemo";
import { buildParams } from "./ccfolia/buildParams";
import { buildStatus, buildPalette } from "./output/enhancements";
import { createDefaultCalculationState } from "./calculation/defaults";
import { isSheetConsumableLabel } from "./items/tableConsumables";
import { DEFAULT_CONSUMABLES } from "./items/consumables";
import { fetchYtsheetJson } from "./ytsheet/fetchYtsheet";
import { parseYtsheet } from "./ytsheet/parseYtsheet";
import { characterJson, generateSessionBase, metadataOnly } from "./session/generation";
import { type Fields, type Snapshot } from "./session/model";
import { switchParameterMode } from "./editor/parameterMode";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main style="max-width:1000px;margin:auto;padding:16px;font-family:sans-serif">
<h1>ゆとシートⅡ→ココフォリア変換</h1>
<label>ゆとシートURL<input id='url' placeholder='https://yutorize.work/ytsheet/ar2e/?id=...' style='width:100%;box-sizing:border-box;margin:4px 0 8px'/></label>
<div style='display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px'>
  <button id='gen'>出力</button>
  <button id='copy'>ココフォリアJSONをコピー</button>
  <button id='copyVars'>変数一覧をコピー</button>
</div>
<label style='display:block;margin:8px 0 16px'>
  <input id='useYtsheetStyleParams' type='checkbox' checked /> ゆとシートのデフォルト変数を使用する
</label>
<details style='margin:8px 0 16px'>
  <summary>URLで読み込めない時だけ、ゆとシートJSONを手入力する</summary>
  <textarea id='json' rows='8' style='width:100%;box-sizing:border-box;margin-top:8px'></textarea>
</details>
<h3>警告</h3><pre id='warn' style='white-space:pre-wrap'></pre>
<h3>ココフォリアJSON</h3><textarea id='outjson' rows='16' style='width:100%;box-sizing:border-box'></textarea>
<h3>ステータス（ラベル / 現在値 / 最大値）</h3><textarea id='statusEdit' rows='10' style='width:100%;box-sizing:border-box'></textarea>
<h3>パラメータ（ラベル / 値）</h3><textarea id='paramsEdit' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<h3>チャットパレット編集用：変数一覧</h3><textarea id='vars' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<section id='calculationEditor' style='margin:16px 0;line-height:1.7' aria-label='判定・ダメージ・回復量の補正'></section>
<h3>チャットパレット</h3><textarea id='palette' rows='20' style='width:100%;box-sizing:border-box'></textarea>
<section id='usageInstructions' style='margin-top:24px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;line-height:1.7'></section>
</main>`;

let latest = "", latestVars = "", latestSkillNames: string[] = [], outputSnapshot = "";
let disposeCalculationEditor: CalculationEditor | undefined;
let activeSource: { raw: Record<string, unknown>; url: string; useFormula: boolean; metadata: string; parameterBase: string } | undefined;
type NamedValue = { label?: unknown; value?: unknown; max?: unknown };
type CcfoliaCharacterJson = { data?: { commands?: string; status?: unknown[]; params?: unknown[]; color?: string; [key: string]: unknown }; [key: string]: unknown };
const BASE_STATUS_LABELS = ["HP", "MP", "フェイト", "移動力", "物理防御力", "魔法防御力", "携帯可能重量", "判定BD", "命中BD", "回避BD", "ダメBD", "ダメバフ", "EP", "所持金", "強心丹D"];
const DEFAULT_CONSUMABLE_LABELS = DEFAULT_CONSUMABLES.map(item => item.label);
const area = (id: string) => document.getElementById(id) as HTMLTextAreaElement;
function editableSnapshot(): string { return JSON.stringify([area("statusEdit").value, area("paramsEdit").value, area("palette").value, area("outjson").value, disposeCalculationEditor?.getState(), activeSource?.useFormula]); }
function labelOf(item: unknown): string | null { const label = (item as NamedValue)?.label; return typeof label === "string" && label.trim() ? label.trim() : null; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function isCurrentConsumableLabel(label: string): boolean { return isSheetConsumableLabel(activeSource?.raw ?? {}, label); }
function buildVariableText(status: unknown[], params: unknown[], skillNames: string[] = []): string {
  const statusLabels = unique(status.map(labelOf).filter((v): v is string => !!v)), paramLabels = unique(params.map(labelOf).filter((v): v is string => !!v));
  const consumableLabels = statusLabels.filter(isCurrentConsumableLabel), extraStatusFlags = statusLabels.filter(label => !BASE_STATUS_LABELS.includes(label) && !isCurrentConsumableLabel(label));
  const allSkillFlags = unique([...skillNames, ...extraStatusFlags]), optionalConsumableLabels = consumableLabels.filter(label => !DEFAULT_CONSUMABLE_LABELS.includes(label));
  const lines = ["### ■よく使う補正", "{判定BD}D", "{命中BD}D", "{回避BD}D", "{ダメBD}D", "{ダメバフ}", "{強心丹D}", ":強心丹D=1", ":強心丹D=0", "", "### ■ダメージ属性", "{ダメージ属性}"];
  if (allSkillFlags.length) { lines.push("", "### ■スキル・フラグ候補"); for (const label of allSkillFlags) lines.push(`{${label}}`, `{${label}}D`, `:${label}=1`, `:${label}=0`); }
  if (optionalConsumableLabels.length) { lines.push("", "### ■消耗品コマンド"); for (const label of optionalConsumableLabels) lines.push(`:${label}-1`); }
  lines.push("", "### ■基本ステータス"); for (const label of statusLabels) lines.push(`{${label}}`);
  lines.push("", "### ■判定・能力値"); for (const label of paramLabels) lines.push(`{${label}}`);
  lines.push("", "### ■式の部品", "({命中ダイス}+{判定BD}+{命中BD})D+{命中}", "({回避ダイス}+{判定BD}+{回避BD})D+{回避}", "({魔術判定ダイス}+{判定BD}+{命中BD})D+{魔術判定}", "({攻撃ダイス}+{ダメBD})D+{攻撃力}+{ダメバフ}", "c(-{物理防御力})", "c(-{魔法防御力})");
  return lines.join("\n");
}
function statusToText(status: unknown[]): string { return status.map(s => { const item = s as NamedValue; return [item.label ?? "", item.value ?? "0", item.max ?? "0"].join("\t"); }).join("\n"); }
function paramsToText(params: unknown[]): string { return params.map(p => { const item = p as NamedValue; return [item.label ?? "", item.value ?? "0"].join("\t"); }).join("\n"); }
function splitEditableLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t"); if (/[=＝,，/]/.test(line)) return line.split(/\s*[=＝,，/]\s*/); return line.split(/\s+/);
}
function parseStatusText(text: string) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const parts = splitEditableLine(line); return { label: parts[0]?.trim() ?? "", value: String(parts[1] ?? "0").trim(), max: String(parts[2] ?? "0").trim() }; }).filter(s => s.label);
}
function parseParamsText(text: string) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const parts = splitEditableLine(line); return { label: parts[0]?.trim() ?? "", value: String(parts[1] ?? "0").trim() }; }).filter(p => p.label);
}
function ensureCorrectionFlag(requested: string): string {
  const input = area("statusEdit"), statuses = parseStatusText(input.value), parameters = parseParamsText(area("paramsEdit").value);
  let label = requested, suffix = 0;
  while (true) {
    const existing = statuses.find(s => s.label === label);
    if (!parameters.some(p => p.label === label) && !BASE_STATUS_LABELS.includes(label) && !isCurrentConsumableLabel(label)) {
      if (existing && Number(existing.max) === 0 && Number.isFinite(Number(existing.value))) return label; if (!existing) break;
    }
    label = `${requested}_補正${suffix++ || ""}`;
  }
  input.value = `${input.value.trimEnd()}${input.value.trim() ? "\n" : ""}${label}\t0\t0`; return label;
}
function renameCorrectionFlag(previous: string, requested: string): string {
  const s = area("statusEdit"), p = area("paramsEdit"), palette = area("palette");
  const name = checkFlagRename(previous, requested, parseStatusText(s.value), parseParamsText(p.value), palette.value, label => BASE_STATUS_LABELS.includes(label) || label === "initiative" || isCurrentConsumableLabel(label));
  s.value = replaceStatusLabel(s.value, previous, name); p.value = replaceFlagReferences(p.value, previous, name); palette.value = replaceFlagReferences(palette.value, previous, name); return name;
}
function refreshVariableHelpers(): void { latestVars = buildVariableText(parseStatusText(area("statusEdit").value), parseParamsText(area("paramsEdit").value), latestSkillNames); area("vars").value = latestVars; }
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r,g,b] = [c,x,0]; else if (h < 120) [r,g,b] = [x,c,0]; else if (h < 180) [r,g,b] = [0,c,x]; else if (h < 240) [r,g,b] = [0,x,c]; else if (h < 300) [r,g,b] = [x,0,c]; else [r,g,b] = [c,0,x];
  const hex = (v: number) => Math.round((v+m)*255).toString(16).padStart(2,"0"); return `#${hex(r)}${hex(g)}${hex(b)}`;
}
function safeNum(value: unknown, fallback = 0): number { const n = Number(String(value ?? "").replace(/,/g,"")); return Number.isFinite(n) ? n : fallback; }
function extractColor(raw: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(raw).filter(key => /color|colour|palette|chat/i.test(key))) { const hit = String(raw[key] ?? "").match(/#[0-9a-fA-F]{6}/); if (hit) return hit[0]; }
  const h = safeNum(raw.colorHeadBgH,NaN), s = safeNum(raw.colorHeadBgS,NaN), l = safeNum(raw.colorHeadBgL,NaN);
  if (Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l)) return hslToHex(((h%360)+360)%360,s,l); return undefined;
}
async function loadRawSheet(): Promise<Record<string, unknown>> {
  const manual = area("json").value.trim(); if (manual) return JSON.parse(manual) as Record<string, unknown>;
  const url = (document.getElementById("url") as HTMLInputElement).value.trim(); if (!url) throw new Error("ゆとシートURLを入力してください。"); return await fetchYtsheetJson(url) as Record<string, unknown>;
}
function refreshOutputJsonFromEditedFields(): string {
  const out = area("outjson").value.trim() || latest; if (!out) throw new Error("先に出力してください。");
  const parsed = JSON.parse(out) as CcfoliaCharacterJson;
  if (!parsed.data || typeof parsed.data !== "object") throw new Error("ココフォリアJSONの data が見つかりません。");
  parsed.data.commands = buildCommands(area("palette").value); parsed.data.status = parseStatusText(area("statusEdit").value); parsed.data.params = parseParamsText(area("paramsEdit").value);
  latest = JSON.stringify(parsed,null,2); area("outjson").value = latest; refreshVariableHelpers(); document.getElementById("warn")!.textContent = "編集内容をココフォリアJSONに反映しました。"; return latest;
}

export const sessionBridge = {
  capture(): Snapshot {
    if (!activeSource || !latest) throw new Error("先にキャラシを出力してください。");
    const calculation = disposeCalculationEditor?.getState() ?? emptyCalculationState();
    const base = generateSessionBase(activeSource.raw, activeSource.url, activeSource.useFormula, calculation);
    base.fields.metadata = activeSource.metadata;
    base.fields.paramsEdit = activeSource.parameterBase;
    const working: Fields = { statusEdit: area("statusEdit").value, paramsEdit: area("paramsEdit").value, palette: area("palette").value, metadata: metadataOnly(area("outjson").value || latest) };
    return { key: base.key, name: base.sheet.name, raw: structuredClone(activeSource.raw), url: activeSource.url, useFormula: activeSource.useFormula,
      savedAt: new Date().toISOString(), calculation: structuredClone(calculation), base: base.fields, working };
  },
  restore(snapshot: Snapshot): void {
    // Prepare everything before changing the editor. Loading alone never refills resources.
    const base = generateSessionBase(snapshot.raw, snapshot.url, snapshot.useFormula, snapshot.calculation);
    const json = characterJson(snapshot.working);
    disposeCalculationEditor?.();
    activeSource = { raw: structuredClone(snapshot.raw), url: snapshot.url, useFormula: snapshot.useFormula, metadata: snapshot.base.metadata, parameterBase: snapshot.base.paramsEdit };
    latest = json; latestSkillNames = unique(base.sheet.skills.map(s => s.name));
    (document.getElementById("url") as HTMLInputElement).value = snapshot.url; area("json").value = "";
    (document.getElementById("useYtsheetStyleParams") as HTMLInputElement).checked = snapshot.useFormula;
    area("statusEdit").value = snapshot.working.statusEdit; area("paramsEdit").value = snapshot.working.paramsEdit; area("palette").value = snapshot.working.palette; area("outjson").value = json;
    refreshVariableHelpers();
    disposeCalculationEditor = mountCalculationEditor(document.getElementById("calculationEditor")!, base.prepared, area("palette"), { ensureFlag: ensureCorrectionFlag, renameFlag: renameCorrectionFlag, changed: refreshVariableHelpers }, snapshot.calculation);
    outputSnapshot = editableSnapshot();
    document.getElementById("warn")!.textContent = base.warnings.join("\n") || "保存内容を復元しました。";
  },
};

(document.getElementById("useYtsheetStyleParams") as HTMLInputElement).onchange = () => {
  const option = document.getElementById("useYtsheetStyleParams") as HTMLInputElement;
  if (!activeSource || option.checked === activeSource.useFormula) return;
  const previous = activeSource.useFormula, warn = document.getElementById("warn")!;
  if ((document.getElementById("gen") as HTMLButtonElement).disabled) {
    option.checked = previous; warn.textContent = "読み込み中です。完了後に変数の設定を切り替えてください。"; return;
  }
  try {
    const sheet = parseYtsheet(activeSource.raw, activeSource.url);
    const plan = switchParameterMode(area("paramsEdit").value, activeSource.parameterBase, buildParams(sheet, true), buildParams(sheet, false), option.checked);
    // Validate and serialize before committing any changes to the visible editor.
    const json = characterJson({ statusEdit: area("statusEdit").value, paramsEdit: plan.text, palette: area("palette").value, metadata: metadataOnly(area("outjson").value || latest) });
    area("paramsEdit").value = plan.text; area("outjson").value = json; latest = json;
    activeSource.useFormula = option.checked; activeSource.parameterBase = plan.baseline;
    refreshVariableHelpers();
    area("paramsEdit").dispatchEvent(new Event("input", { bubbles: true }));
    warn.textContent = `パラメータを${option.checked ? "参照式" : "固定値"}に切り替えました。チャットパレットと補正の選択は保持しています。`;
    if (plan.retained.length) warn.textContent += `\n手編集した項目や数値を確定できない項目は、そのまま残しました：${plan.retained.join("、")}`;
  } catch (error) {
    option.checked = previous;
    warn.textContent = `切り替えを中止しました：${error instanceof Error ? error.message : String(error)}`;
  }
};

(document.getElementById("gen") as HTMLButtonElement).onclick = async () => {
  const warn = document.getElementById("warn")!;
  if (latest && editableSnapshot() !== outputSnapshot && !window.confirm("再出力すると、手で編集した内容と補正の選択をリセットします。再出力しますか？")) return;
  const button = document.getElementById("gen") as HTMLButtonElement; button.disabled = true; warn.textContent = "出力中...";
  try {
    const raw = await loadRawSheet(), url = (document.getElementById("url") as HTMLInputElement).value.trim() || String(raw.sheetURL ?? "");
    const sheet = parseYtsheet(raw,url), generated = buildPalette(sheet,{}), prepared = prepareCalculationPalette(sheet,generated.text);
    const status = buildStatus(sheet,{}), useFormula = (document.getElementById("useYtsheetStyleParams") as HTMLInputElement).checked, params = buildParams(sheet,useFormula);
    const cc = buildCharacterJson(sheet.name,url,status,params,buildCommands(prepared.text),sheet.initiative,buildMemo(raw),extractColor(raw));
    disposeCalculationEditor?.(); latest = JSON.stringify(cc,null,2); latestSkillNames = unique(sheet.skills.map(s => s.name));
    activeSource = { raw, url, useFormula, metadata: metadataOnly(latest), parameterBase: paramsToText(params) };
    area("outjson").value = latest; area("statusEdit").value = statusToText(status); area("paramsEdit").value = paramsToText(params); area("palette").value = prepared.text; refreshVariableHelpers();
    const calculation = createDefaultCalculationState(prepared, ensureCorrectionFlag);
    const selectedPrepared = applyCalculationState(prepared, calculation);
    area("palette").value = selectedPrepared.text;
    disposeCalculationEditor = mountCalculationEditor(document.getElementById("calculationEditor")!,selectedPrepared,area("palette"),{ ensureFlag: ensureCorrectionFlag, renameFlag: renameCorrectionFlag, changed: refreshVariableHelpers }, calculation);
    refreshOutputJsonFromEditedFields();
    outputSnapshot = editableSnapshot();
    const warnings = [...generated.warnings]; if (prepared.reviews.length) warnings.push(`自動で式にできない効果が${prepared.reviews.length}件あります。「式に加える補正」の要確認欄を確認してください。`);
    warn.textContent = warnings.join("\n") || "OK"; document.dispatchEvent(new Event("ytsheet:generated"));
  } catch (error) { warn.textContent = `出力失敗: ${String(error)}`; } finally { button.disabled = false; }
};
(document.getElementById("copy") as HTMLButtonElement).onclick = async () => {
  try { await navigator.clipboard.writeText(refreshOutputJsonFromEditedFields()); } catch(error) { document.getElementById("warn")!.textContent = `コピー失敗: ${String(error)}`; }
};
(document.getElementById("copyVars") as HTMLButtonElement).onclick = async () => { refreshVariableHelpers(); await navigator.clipboard.writeText(latestVars); };
