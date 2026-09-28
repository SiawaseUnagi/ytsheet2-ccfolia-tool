const { chromium } = require("playwright"),
  { spawn } = require("node:child_process"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const url = "http://127.0.0.1:4182/ytsheet2-ccfolia-tool/",
  server = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4182"], {
    stdio: "ignore",
  });
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/legacy-8083.json")));
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
    await page.route("https://yutorize.work/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(legacy.current.raw),
      }),
    );
    await page.goto(url);
    await page.locator("#sessionFile").setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await page.waitForFunction(() =>
      document.querySelector("#sessionNotice").textContent.includes("保存ファイルを読み込みました"),
    );
    assert.equal(await page.locator("#palette").inputValue(), legacy.current.working.palette);
    assert.match(await page.locator("#warn").innerText(), /生成形式/);
    await page.locator("#saveSession").click();
    const stored = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          Object.keys(localStorage).find((k) => k.startsWith("ytsheet2-ccfolia:session:")),
        ),
      ),
    );
    assert.deepEqual(
      stored.current.base,
      legacy.current.base,
      "re-save must retain the original baseline",
    );
    await page.reload();
    await page.locator("#resumeSession").click();
    let dialogs = 0;
    page.on("dialog", async (d) => {
      dialogs++;
      await d.dismiss();
    });
    await page.locator("#gen").click();
    assert.equal(dialogs, 1);
    assert.equal(await page.locator("#palette").inputValue(), legacy.current.working.palette);
    await page.locator("#updateSession").click();
    await page.locator("#applySessionUpdate").waitFor();
    assert.equal(
      await page.locator("#sessionUpdatePreview select").count(),
      0,
      "untouched legacy content is not a conflict",
    );
    assert.match(await page.locator("#sessionUpdatePreview").innerText(), /生成形式/);
    await page.locator("#applySessionUpdate").click();
    let migrated = await page.locator("#palette").inputValue();
    assert.notEqual(migrated, legacy.current.working.palette);
    assert.match(migrated, /回避判定と同時に/);
    await page.locator("#palette").fill(migrated + "\n手編集のメモ");
    await page.locator("#saveSession").click();
    await page.reload();
    await page.locator("#resumeSession").click();
    assert.equal(await page.locator("#palette").inputValue(), migrated + "\n手編集のメモ");
    await page.locator("#updateSession").click();
    await page.locator("#applySessionUpdate").waitFor();
    await page.locator("#applySessionUpdate").click();
    assert.ok((await page.locator("#palette").inputValue()).endsWith("手編集のメモ"));
    await page.unroute("https://yutorize.work/**");
    await page.route("https://yutorize.work/**", (route) =>
      route.fulfill({ status: 503, body: "offline" }),
    );
    const beforeFailure = await page.locator("#palette").inputValue();
    await page.locator("#updateSession").click();
    await page.waitForFunction(() =>
      document.querySelector("#sessionNotice").textContent.includes("503"),
    );
    assert.equal(
      await page.locator("#palette").inputValue(),
      beforeFailure,
      "failed update preserves displayed text",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual legacy import, re-save baseline, resume/reoutput confirmation, explicit migration, current save/update and manual text protection",
    );
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
