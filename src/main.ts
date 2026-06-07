import { buildCharacterJson } from "./ccfolia/buildCharacterJson";
import { buildCommands } from "./ccfolia/buildCommands";
import { buildParams } from "./ccfolia/buildParams";
import { buildStatus } from "./ccfolia/buildStatus";
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
<h3>チャットパレット編集用：変数一覧</h3><textarea id='vars' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<h3>チャットパレット(編集可)</h3><textarea id='palette' rows='20' style='width:100%;box-sizing:border-box'></textarea>
</main>`;

let latest = "";
let latestVars = "";

type NamedValue = { label?: unknown; value?: unknown; max?: unknown };

function labelOf(item: unknown): string | null {
  const label = (item as NamedValue)?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function buildVariableText(status: unknown[], params: unknown[]): string {
  const statusLabels = unique(status.map(labelOf).filter((v): v is string => !!v));
  const paramLabels = unique(params.map(labelOf).filter((v): v is string => !!v));
  const skillLike = statusLabels.filter((label) => !["HP", "MP", "フェイト", "移動力", "物理防御力", "魔法防御力", "携帯可能重量", "判定BD", "命中BD", "回避BD", "ダメBD", "ダメバフ", "EP", "所持金"].includes(label));

  const lines: string[] = [];
  lines.push("### ■よく使う補正");
  lines.push("{判定BD}D", "{命中BD}D", "{回避BD}D", "{ダメBD}D", "{ダメバフ}");
  if (skillLike.length) {
    lines.push("", "### ■スキル・フラグ");
    for (const label of skillLike) lines.push(`{${label}}`, `{${label}}D`);
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

async function loadRawSheet(): Promise<Record<string, unknown>> {
  const manual = (document.getElementById("json") as HTMLTextAreaElement).value.trim();
  if (manual) return JSON.parse(manual) as Record<string, unknown>;
  const url = (document.getElementById("url") as HTMLInputElement).value.trim();
  if (!url) throw new Error("ゆとシートURLを入力してください。");
  return await fetchYtsheetJson(url) as Record<string, unknown>;
}

(document.getElementById("gen") as HTMLButtonElement).onclick = async () => {
  const warn = document.getElementById("warn") as HTMLElement;
  warn.textContent = "出力中...";
  try {
    const raw = await loadRawSheet();
    const urlInput = (document.getElementById("url") as HTMLInputElement).value.trim();
    const url = urlInput || String(raw.sheetURL ?? "");
    const sheet = parseYtsheet(raw, url);
    const custom = {};
    const { text, warnings } = buildPalette(sheet, custom);
    const status = buildStatus(sheet, custom);
    const params = buildParams(sheet);
    const cc = buildCharacterJson(sheet.name, url, status, params, buildCommands(text), sheet.initiative);
    latest = JSON.stringify(cc, null, 2);
    latestVars = buildVariableText(status, params);
    (document.getElementById("outjson") as HTMLTextAreaElement).value = latest;
    (document.getElementById("vars") as HTMLTextAreaElement).value = latestVars;
    (document.getElementById("palette") as HTMLTextAreaElement).value = text;
    warn.textContent = warnings.join("\n") || "OK";
  } catch (e) {
    warn.textContent = `出力失敗: ${String(e)}`;
  }
};

(document.getElementById("copy") as HTMLButtonElement).onclick = async () => {
  await navigator.clipboard.writeText(latest);
};

(document.getElementById("copyVars") as HTMLButtonElement).onclick = async () => {
  await navigator.clipboard.writeText(latestVars);
};
