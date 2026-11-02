const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const raw = require('./handoff-fixture.cjs');

const remote = process.env.YTSHEET_BROWSER_BASE_URL;
const url = remote || 'http://127.0.0.1:4187/ytsheet2-ccfolia-tool/';
const server = remote ? null : spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4187'], {stdio: 'ignore'});
(async () => {
  let browser;
  try {
    if (!remote) {
      let ready = false;
      for (let i=0; i<80; i++) {
        try { if ((await fetch(url)).ok) { ready=true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve,200));
      }
      assert.ok(ready, 'Preview server must be reachable');
    }
    browser = await chromium.launch();
    const ctx = await browser.newContext({permissions: ['clipboard-read','clipboard-write']});
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(url);
    const commit = process.env.YTSHEET_EXPECTED_COMMIT;
    if (commit) {
      const result = await page.request.get(new URL('build-info.json', url).href+'?verify='+commit);
      assert.equal(result.status(),200);
      assert.equal((await result.json()).commit, commit);
    }
    await page.locator('#url').fill(raw.sheetURL);
    await page.getByText('URLで読み込めない時だけ、ゆとシートJSONを手入力する',{exact:true}).click();
    await page.locator('#json').fill(JSON.stringify(raw));
    await page.locator('#gen').click();
    await page.waitForFunction(() => !document.querySelector('#gen').disabled);
    const palette=page.locator('#palette');
    const text=await palette.inputValue();
    assert.match(text, /### ■シナリオ終了時リセット\n:HP=40\n:MP=50\n:フェイト=5/);
    assert.match(text, /^:全判定テスト=1$/m);
    const block=(text.split('### ■判定\n')[1] || '').split('\n### ■')[0];
    assert.equal((block.match(/>=\? /g)||[]).length,17);
    assert.doesNotMatch(block,/>=0 /);
    assert.match(text.split('### ■リアクション\n')[1],/>=0 回避判定/);
    assert.match(text.split('### ■メジャー\n')[1],/>=0 命中判定/);
    await page.locator('#copyBottom').click();
    assert.equal(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).data.commands,text);
    const edited=text.replace('D+{筋力判定}>=? 【筋力】判定','D+{筋力判定}>=12 【筋力】判定');
    await palette.fill(edited);
    await page.locator('#saveSession').click();
    await page.reload();
    await page.locator('#resumeSession').click();
    assert.equal(await palette.inputValue(),edited, 'resume must not regenerate manually edited checks');
    assert.deepEqual(errors,[]);
    console.log('PASS scenario reset, general optional goals, copied JSON, and saved manual edit');
    await ctx.close();
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
