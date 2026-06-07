import { buildCharacterJson } from "./ccfolia/buildCharacterJson";
import { buildCommands } from "./ccfolia/buildCommands";
import { buildParams } from "./ccfolia/buildParams";
import { buildStatus } from "./ccfolia/buildStatus";
import { parseCustomCommands } from "./config/parseCustomCommands";
import { buildPalette } from "./palette/buildPalette";
import { fetchYtsheetJson } from "./ytsheet/fetchYtsheet";
import { parseYtsheet } from "./ytsheet/parseYtsheet";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<main style="max-width:1000px;margin:auto;padding:16px;font-family:sans-serif">
<h1>ゆとシートⅡ→ココフォリア変換 v0.1</h1>
<label>ゆとシートURL<input id='url' style='width:100%'/></label><button id='fetch'>URLから読込</button>
<label>ゆとシートJSON<textarea id='json' rows='10' style='width:100%'></textarea></label>
<label>個別コマンド設定(JSON)<textarea id='custom' rows='8' style='width:100%'></textarea></label>
<button id='gen'>生成</button> <button id='copy'>ココフォリアJSONをコピー</button>
<h3>警告</h3><pre id='warn'></pre>
<h3>ココフォリアJSON</h3><textarea id='outjson' rows='16' style='width:100%'></textarea>
<h3>チャットパレット(編集可)</h3><textarea id='palette' rows='20' style='width:100%'></textarea>
</main>`;

let latest = "";
(document.getElementById("fetch") as HTMLButtonElement).onclick = async () => {
  const url = (document.getElementById("url") as HTMLInputElement).value;
  try { const j = await fetchYtsheetJson(url); (document.getElementById("json") as HTMLTextAreaElement).value = JSON.stringify(j, null, 2); }
  catch (e) { (document.getElementById("warn") as HTMLElement).textContent = `fetch失敗: ${String(e)}`; }
};

(document.getElementById("gen") as HTMLButtonElement).onclick = () => {
  const raw = JSON.parse((document.getElementById("json") as HTMLTextAreaElement).value || "{}");
  const url = (document.getElementById("url") as HTMLInputElement).value;
  const custom = parseCustomCommands((document.getElementById("custom") as HTMLTextAreaElement).value);
  const sheet = parseYtsheet(raw, url);
  const { text, warnings } = buildPalette(sheet, custom);
  const status = buildStatus(sheet, custom);
  const params = buildParams(sheet);
  const cc = buildCharacterJson(sheet.name, url, status, params, buildCommands(text), sheet.initiative);
  latest = JSON.stringify(cc, null, 2);
  (document.getElementById("outjson") as HTMLTextAreaElement).value = latest;
  (document.getElementById("palette") as HTMLTextAreaElement).value = text;
  (document.getElementById("warn") as HTMLElement).textContent = warnings.join("\n");
};

(document.getElementById("copy") as HTMLButtonElement).onclick = async () => {
  await navigator.clipboard.writeText(latest);
};
