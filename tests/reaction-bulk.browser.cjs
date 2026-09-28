const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const url = "http://127.0.0.1:4186/ytsheet2-ccfolia-tool/";
const server = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4186"], {
  stdio: "ignore",
});
const sk = (name, effect, timing = "パッシブ", lv = 1, judge = "自動成功") => ({
  name,
  effect,
  timing,
  lv,
  judge,
  cost: "0",
  usage: "―",
  target: "自身",
  range: "―",
});
const raw = {
  id: "reaction-bulk",
  sheetURL: "https://yutorize.work/ytsheet/ar2e/?id=reaction-bulk",
  characterName: "一括補正テスト",
  level: "5",
  hpTotal: "40",
  mpTotal: "50",
  fateTotal: "5",
  sttDexTotal: "5",
  skill: [
    sk(
      "全判定補助",
      "あらゆる判定に+1Dする。この効果はシーン終了まで持続する。",
      "メジャー",
      1,
      "精神",
    ),
    sk(
      "全ロール補助",
      "あらゆるダイスロールに+1Dする。この効果はシーン終了まで持続する。",
      "マイナー",
    ),
    sk(
      "イメージボディ",
      "回避判定の達成値に+[SL×2]する。この効果はシーン終了まで持続する。",
      "メジャー",
    ),
    sk("加算試験", "武器攻撃のダメージに+[SL×3]する。", "パッシブ", 2),
    sk(
      "ドッジムーブ",
      "回避判定と同時に使用する。その回避判定の達成値に+[SL+2]する。",
      "効果参照",
      1,
    ),
  ],
};
(async () => {
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(url)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("dialog", (d) => d.accept());
    await page.route("https://yutorize.work/**", (r) => r.fulfill({ json: raw }));
    await page.goto(url);
    await page.locator("#url").fill(raw.sheetURL);
    await page.locator("#gen").click();
    await page.waitForFunction(() => !document.querySelector("#gen").disabled);
    const text = () => page.locator("#palette").inputValue();
    assert.deepEqual((await text()).match(/^### ■.+$/gm).slice(0, 3), [
      "### ■リソース操作",
      "### ■リアクション",
      "### ■戦闘前",
    ]);
    assert.ok((await text()).includes("+(2*3)"));
    assert.equal(
      await page
        .locator("#calculationEditor > details")
        .evaluateAll((a) => a.every((e) => !e.open)),
      true,
    );
    const panel = page.locator('[data-bulk-checks="true"]');
    await panel.locator("..").locator(":scope > summary").click();
    const global = panel
      .locator("[data-bulk-settings]")
      .filter({
        has: page.getByRole("combobox", { name: "全判定：全判定補助の加算方法", exact: true }),
      });
    const mode = global.getByRole("combobox", {
      name: "全判定：全判定補助の加算方法",
      exact: true,
    });
    const all = global.locator('input[type="checkbox"]');
    assert.equal(await all.isChecked(), false);
    assert.equal(await mode.inputValue(), "toggle");
    await global.getByText("スキルの効果を確認", { exact: true }).click();
    assert.ok((await global.innerText()).includes("あらゆる判定に+1Dする。"));
    assert.equal(await page.getByText("元の効果文・条件を確認する", { exact: true }).count(), 0);
    await global.getByText("変数名を変更", { exact: true }).click();
    await global
      .getByRole("textbox", { name: "全判定：全判定補助の補正用変数名", exact: true })
      .fill("ALL");
    await global.getByRole("button", { name: "名前を適用", exact: true }).click();
    await all.check();
    let palette = await text();
    assert.ok(palette.includes("{ALL}"));
    assert.ok(palette.includes(":ALL=1"));
    assert.ok(palette.includes(":ALL=0"));
    const per = page.locator(
      '#calculationEditor [data-target-id] input[aria-label$="：全判定補助"]',
    );
    assert.ok((await per.count()) > 10);
    assert.equal(await per.evaluateAll((a) => a.every((e) => e.checked)), true);
    const first = per.first();
    await first.evaluate((e) => {
      for (let p = e; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
    });
    await first.uncheck();
    assert.equal(await all.evaluate((e) => e.indeterminate), true);
    await mode.selectOption("constant");
    assert.equal(await first.isChecked(), false);
    assert.ok((await text()).includes("+1)D")); // numeric +1 for the selected checks
    assert.equal(
      await page
        .locator('#calculationEditor [data-target-id] select[aria-label="全判定補助の加算方法"]')
        .evaluateAll((a) => a.every((e) => e.value === "constant")),
      true,
    );
    const one = page
      .locator('#calculationEditor [data-target-id] select[aria-label="全判定補助の加算方法"]')
      .first();
    await one.selectOption("toggle");
    assert.equal(await mode.inputValue(), "mixed");
    await mode.selectOption("toggle");
    assert.equal(await first.isChecked(), false);
    // Mode in global check controls does not alter damage settings for an all-roll effect.
    const damage = page.locator('#calculationEditor [data-target-id="weapon-damage"]');
    const dmgMode = damage.locator('select[aria-label="全ロール補助の加算方法"]');
    assert.equal(await dmgMode.inputValue(), "toggle");
    await panel
      .getByRole("combobox", { name: "全判定：全ロール補助の加算方法", exact: true })
      .selectOption("constant");
    assert.equal(await dmgMode.inputValue(), "toggle");
    // Preserve hand-edited check text during batch changes and alias replacement.
    const manual = (await text()).split("\n").find((l) => l.endsWith(">=0 【器用】判定"));
    await page
      .locator("#palette")
      .fill((await text()).replace(manual, manual.replace(">=0", ">=13")));
    await all.uncheck();
    await all.check();
    assert.ok((await text()).includes(">=13 【器用】判定"));
    await global
      .getByRole("textbox", { name: "全判定：全判定補助の補正用変数名", exact: true })
      .fill("B");
    await global.getByRole("button", { name: "名前を適用", exact: true }).click();
    assert.ok(!(await text()).includes("{ALL}"));
    assert.ok((await text()).includes("{B}"));
    assert.ok((await text()).includes(">=13 【器用】判定"));
    const beforeCollision = await text();
    await global
      .getByRole("textbox", { name: "全判定：全判定補助の補正用変数名", exact: true })
      .fill("HP");
    await global.getByRole("button", { name: "名前を適用", exact: true }).click();
    assert.equal(await text(), beforeCollision);
    // Image-body fixed bonus shows SL arithmetic in its own control and output.
    const image = page
      .locator("#calculationEditor [data-target-id]")
      .filter({ has: page.locator('input[aria-label$="：イメージボディ"]') })
      .first();
    await image.evaluate((e) => {
      for (let p = e; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
    });
    await image.locator('input[aria-label$="：イメージボディ"]').check();
    assert.ok((await text()).includes("{イメージボディ}*(1*2)"));
    // Exclusion and per-check mixed mode survive real localStorage save/reload.
    await first.uncheck();
    await one.selectOption("constant");
    const saved = await text();
    await page.locator("#saveSession").click();
    assert.match(await page.locator("#sessionNotice").innerText(), /保存しました/);
    await page.reload();
    await page.locator("#resumeSession").click();
    assert.equal(await text(), saved);
    await panel.locator("..").locator(":scope > summary").click();
    assert.equal(await all.evaluate((e) => e.indeterminate), true);
    assert.equal(await mode.inputValue(), "mixed");
    await page.locator("#copyBottom").click();
    assert.equal(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).data.commands,
      saved,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: process.env.YTSHEET_SCREENSHOT || "/tmp/reaction-bulk.png",
      fullPage: true,
    });
    console.log(
      "PASS: reaction section, level-aware constants, bulk mode/name/source, per-check exclusion, alias collision, hand-edit protection, copy and save/resume",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
