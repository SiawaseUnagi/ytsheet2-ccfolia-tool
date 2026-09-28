/** Static page layout; sheet content is assigned through text/value properties. */
export function mountMainView(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("編集画面の配置先が見つかりません。");
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
<details id='characterJsonDetails' style='margin:16px 0'><summary>ココフォリアJSON（内容を確認・直接編集するときに開く）</summary><textarea id='outjson' rows='16' style='width:100%;box-sizing:border-box'></textarea></details>
<h3>ステータス（ラベル / 現在値 / 最大値）</h3><textarea id='statusEdit' rows='10' style='width:100%;box-sizing:border-box'></textarea>
<h3>パラメータ（ラベル / 値）</h3><textarea id='paramsEdit' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<h3>チャットパレット編集用：変数一覧</h3><textarea id='vars' rows='12' style='width:100%;box-sizing:border-box'></textarea>
<h3>チャットパレット</h3><textarea id='palette' rows='20' style='width:100%;box-sizing:border-box'></textarea>
<section id='calculationEditor' style='margin:16px 0;line-height:1.7' aria-label='判定・ダメージ・回復量の補正'></section>
<section id='usageInstructions' style='margin-top:24px;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa;line-height:1.7'></section>
</main>`;
}
