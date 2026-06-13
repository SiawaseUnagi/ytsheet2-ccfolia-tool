import { buildCharacterJson } from "./ccfolia/buildCharacterJson";
import { buildCommands } from "./ccfolia/buildCommands";
import { buildMemo } from "./ccfolia/buildMemo";
import { buildParams } from "./ccfolia/buildParams";
import { buildStatus } from "./ccfolia/buildStatus";
import { DEFAULT_CONSUMABLES, isKnownConsumableLabel } from "./items/consumables";
import { buildPalette } from "./palette/buildPalette";
import { fetchYtsheetJson } from "./ytsheet/fetchYtsheet";
import { parseYtsheet } from "./ytsheet/parseYtsheet";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main style="max-width:1000px;margin:auto;padding:16px;font-family:sans-serif">
<h1>ゆとシートⅡ→ココフォリア変換 v0.1</h1>
<label>ゆとシートURL<input id='url' placeholder='https://yutorize.work/ytsheet/ar2e/?id=...' style='width:100%;box-sizing:border-box;margin:4px 0 8px'/></label>
<div style='display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px'>
  <button id='gen'>出力</button>
  <button id='copy'>ココフォリアJSONをコピー</button>
  <button id='copyVars'>変数一覧をコピー</button>
</div>
<details style='margin:8px 0 16px'>
  <summary>URLで読み込めない時だけ、ゆとシートJSONを手入力する</summary>
  <textarea id='json' rows='8' style='width:100%;box-sizing:border-box;margin-top:8px'></textarea>
</details>
<h3>警告</h3><pre id='warn' style='white-space:pre-wrap'></pre>
<h3>ココフォリアJSON</h3><textarea id='outjson' rows='16' style='width:100%;box-sizing:border-box'></textarea>
<h3>ステータス（編集してからコピーすると反映：ラベル / 現在値 / 最大値）</h3><textarea id='statusEdit' rows='10' style='width:100%;box-sizing:border-box'></textarea>
<h3>パラメータ（編集してからコピーすると反映：ラベル / 値）</h3><textarea id='paramsEdit' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<h3>チャットパレット編集用：変数一覧</h3><textarea id='vars' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<h3>チャットパレット（ここを編集してからコピーすると反映）</h3><textarea id='palette' rows='20' style='width:100%;box-sizing:border-box'></textarea>
</main>`;

let latest = "";
let latestVars = "";
let latestSkillNames: string[] = [];

type NamedValue = { label?: unknown; value?: unknown; max?: unknown };
type CcfoliaCharacterJson = { data?: { commands?: string; status?: unknown[]; params?: unknown[]; color?: string; [key: string]: unknown }; [key: string]: unknown };

const BASE_STATUS_LABELS = ["HP", "MP", "フェイト", "移動力", "物理防御力", "魔法防御力", "携帯可能重量", "判定BD", "命中BD", "回避BD", "ダメBD", "ダメバフ", "EP", "所持金"];
const DEFAULT_CONSUMABLE_LABELS = DEFAULT_CONSUMABLES.map((item) => item.label);

function labelOf(item: unknown): string | null {
  const label = (item as NamedValue)?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildVariableText(status: unknown[], params: unknown[], skillNames: string[] = []): string {
  const statusLabels = unique(status.map(labelOf).filter((v): v is string => !!v));
  const paramLabels = unique(params.map(labelOf).filter((v): v is string => !!v));
  const consumableLabels = statusLabels.filter(isKnownConsumableLabel);
  const extraStatusFlags = statusLabels.filter((label) => !BASE_STATUS_LABELS.includes(label) && !isKnownConsumableLabel(label));
  const allSkillFlags = unique([...skillNames, ...extraStatusFlags]);
  const optionalConsumableLabels = consumableLabels.filter((label) => !DEFAULT_CONSUMABLE_LABELS.includes(label));

  const lines: string[] = [];
  lines.push("### ■よく使う補正");
  lines.push("{判定BD}D", "{命中BD}D", "{回避BD}D", "{ダメBD}D", "{ダメバフ}");
  if (allSkillFlags.length) {
    lines.push("", "### ■スキル・フラグ候補");
    for (const label of allSkillFlags) lines.push(`{${label}}`, `{${label}}D`, `:${label}=1`, `:${label}=0`);
  }
  if (optionalConsumableLabels.length) {
    lines.push("", "### ■消耗品コマンド");
    for (const label of optionalConsumableLabels) lines.push(`:${label}-1`);
  }
  lines.push("", "### ■基本ステータス");
  for (const label of statusLabels) lines.push(`{${label}}`);
  lines.push("", "### ■判定・能力値");
  for (const label of paramLabels) lines.push(`{${label}}`);
  lines.push("", "### ■式の部品");
  lines.push(
    "{命中D}D+{命中判定}+{命中判定修正}+{判定BD}D+{命中BD}D",
    "{回避D}D+{回避判定}+{回避判定修正}+{判定BD}D+{回避BD}D",
    "{魔術D}D+{魔術判定}+{魔術判定修正}+{判定BD}D+{命中BD}D",
    "{攻撃力D}D+{攻撃力}+{ダメBD}D+{ダメバフ}",
    "c(-{物理防御力})",
    "c(-{魔法防御力})",
  );
  return lines.join("\n");
}

function statusToText(status: unknown[]): string {
  return status.map((s) => {
    const item = s as NamedValue;
    return [item.label ?? "", item.value ?? "0", item.max ?? "0"].join("\t");
  }).join("\n");
}

function paramsToText(params: unknown[]): string {
  return params.map((p) => {
    const item = p as NamedValue;
    return [item.label ?? "", item.value ?? "0"].join("\t");
  }).join("\n");
}

function splitEditableLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (/[=＝,，/]/.test(line)) return line.split(/\s*[=＝,，/]\s*/);
  return line.split(/\s+/);
}

function parseStatusText(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = splitEditableLine(line);
    return { label: parts[0]?.trim() ?? "", value: String(parts[1] ?? "0").trim(), max: String(parts[2] ?? "0").trim() };
  }).filter((s) => s.label);
}

function parseParamsText(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = splitEditableLine(line);
    return { label: parts[0]?.trim() ?? "", value: String(parts[1] ?? "0").trim() };
  }).filter((p) => p.label);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function extractColor(raw: Record<string, unknown>): string | undefined {
  const colorKeys = Object.keys(raw).filter((key) => /color|colour|palette|chat/i.test(key));
  for (const key of colorKeys) {
    const value = String(raw[key] ?? "");
    const hit = value.match(/#[0-9a-fA-F]{6}/);
    if (hit) return hit[0];
  }
  const h = safeNum(raw.colorHeadBgH, NaN);
  const s = safeNum(raw.colorHeadBgS, NaN);
  const l = safeNum(raw.colorHeadBgL, NaN);
  if (Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l)) return hslToHex(((h % 360) + 360) % 360, s, l);
  return undefined;
}

async function loadRawSheet(): Promise<Record<string, unknown>> {
  const manual = (document.getElementById("json") as HTMLTextAreaElement).value.trim();
  if (manual) return JSON.parse(manual) as Record<string, unknown>;
  const url = (document.getElementById("url") as HTMLInputElement).value.trim();
  if (!url) throw new Error("ゆとシートURLを入力してください。");
  return await fetchYtsheetJson(url) as Record<string, unknown>;
}

function refreshOutputJsonFromEditedFields(): string {
  const warn = document.getElementById("warn") as HTMLElement;
  const out = (document.getElementById("outjson") as HTMLTextAreaElement).value.trim() || latest;
  const palette = (document.getElementById("palette") as HTMLTextAreaElement).value;
  if (!out) throw new Error("先に出力してください。");

  const parsed = JSON.parse(out) as CcfoliaCharacterJson;
  if (!parsed.data || typeof parsed.data !== "object") throw new Error("ココフォリアJSONの data が見つかりません。");

  parsed.data.commands = buildCommands(palette);
  parsed.data.status = parseStatusText((document.getElementById("statusEdit") as HTMLTextAreaElement).value);
  parsed.data.params = parseParamsText((document.getElementById("paramsEdit") as HTMLTextAreaElement).value);
  latest = JSON.stringify(parsed, null, 2);
  latestVars = buildVariableText(parsed.data.status, parsed.data.params, latestSkillNames);
  (document.getElementById("outjson") as HTMLTextAreaElement).value = latest;
  (document.getElementById("vars") as HTMLTextAreaElement).value = latestVars;
  warn.textContent = "編集内容をココフォリアJSONに反映しました。";
  return latest;
}

(document.getElementById("gen") as HTMLButtonElement).onclick = async () => {
  const warn = document.getElementById("warn") as HTMLElement;
  warn.textContent = "出力中...";
  try {
    const raw = await loadRawSheet();
    const urlInput = (document.getElementById("url") as HTMLInputElement).value.trim();
    const url = urlInput || String(raw.sheetURL ?? "");
    const sheet = parseYtsheet(raw, url);
    latestSkillNames = unique(sheet.skills.map((skill) => skill.name));
    const custom = {};
    const { text, warnings } = buildPalette(sheet, custom);
    const status = buildStatus(sheet, custom);
    const params = buildParams(sheet);
    const memo = buildMemo(raw);
    const color = extractColor(raw);
    const cc = buildCharacterJson(sheet.name, url, status, params, buildCommands(text), sheet.initiative, memo, color);
    latest = JSON.stringify(cc, null, 2);
    latestVars = buildVariableText(status, params, latestSkillNames);
    (document.getElementById("outjson") as HTMLTextAreaElement).value = latest;
    (document.getElementById("statusEdit") as HTMLTextAreaElement).value = statusToText(status);
    (document.getElementById("paramsEdit") as HTMLTextAreaElement).value = paramsToText(params);
    (document.getElementById("vars") as HTMLTextAreaElement).value = latestVars;
    (document.getElementById("palette") as HTMLTextAreaElement).value = text;
    warn.textContent = warnings.join("\n") || "OK";
  } catch (e) {
    warn.textContent = `出力失敗: ${String(e)}`;
  }
};

(document.getElementById("copy") as HTMLButtonElement).onclick = async () => {
  try {
    const text = refreshOutputJsonFromEditedFields();
    await navigator.clipboard.writeText(text);
  } catch (e) {
    (document.getElementById("warn") as HTMLElement).textContent = `コピー失敗: ${String(e)}`;
  }
};

(document.getElementById("copyVars") as HTMLButtonElement).onclick = async () => {
  latestVars = buildVariableText(
    parseStatusText((document.getElementById("statusEdit") as HTMLTextAreaElement).value),
    parseParamsText((document.getElementById("paramsEdit") as HTMLTextAreaElement).value),
    latestSkillNames,
  );
  (document.getElementById("vars") as HTMLTextAreaElement).value = latestVars;
  await navigator.clipboard.writeText(latestVars);
};
