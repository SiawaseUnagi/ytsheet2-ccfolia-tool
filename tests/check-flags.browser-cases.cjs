const assert = require('node:assert/strict');
const sk = (name, effect, timing = 'パッシブ', lv = 1, judge = '自動成功') => ({ name, effect, timing, lv, judge, cost: '0', usage: '―', target: '自身', range: '―' });
module.exports = async function checkFlagBrowserCases(context, url) {
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('dialog', dialog => dialog.accept());
  const raw = { id: 'check-flags-browser', sheetURL: 'https://yutorize.work/ytsheet/ar2e/?id=check-flags-browser', characterName: '回避補正テスト', level: '5', hpTotal: '40', mpTotal: '50', fateTotal: '5', skill: [
    sk('ドッジムーブ', '回避判定と同時に使用する。その回避判定の達成値に+[SL+2]する。', '効果参照', 2),
    sk('探知の補正', 'トラップ探知の判定に+1Dする。'),
    sk('危険の補正', '危険感知の判定に+2する。'),
    sk('全判定の補正', 'あらゆる判定に+1Dする。この効果はシーン終了まで持続する。', 'メジャー'),
  ] };
  const count = (text, token) => text.split(token).length - 1;
  const text = () => page.locator('#palette').inputValue();
  const openCard = async source => {
    const card = page.locator('#calculationEditor [data-target-id]').filter({ has: page.locator(`input[aria-label$="：${source}"]`) }).first();
    await card.evaluate(node => { for (let x = node; x; x = x.parentElement) if (x.tagName === 'DETAILS') x.open = true; });
    return card;
  };
  try {
    await page.route('https://yutorize.work/**', route => route.fulfill({ json: raw }));
    await page.goto(url); await page.locator('#url').fill(raw.sheetURL); await page.locator('#gen').click();
    await page.waitForFunction(() => !document.querySelector('#gen').disabled);
    const before = await text();
    assert.equal(count(before, '回避判定と同時に《ドッジムーブ》2を使用。'), 2);
    assert.ok(!before.includes(':ドッジムーブ=1'));
    const card = await openCard('ドッジムーブ');
    const check = card.locator('input[type="checkbox"][aria-label$="：ドッジムーブ"]');
    assert.equal(await check.isChecked(), false); await check.check();
    const withFlag = await text();
    assert.equal(count(withFlag, ':ドッジムーブ=1'), 2); assert.equal(count(withFlag, ':ドッジムーブ=0'), 2);
    assert.match(withFlag, /\{ドッジムーブ\}\*\(4\)/);
    assert.match(await page.locator('#statusEdit').inputValue(), /ドッジムーブ\t0\t0/);
    await check.uncheck(); await check.check(); assert.equal(await text(), withFlag);
    const names = card.locator('details[data-flag-editor]').filter({ has: page.locator('input[aria-label="ドッジムーブの補正用変数名"]') });
    await names.locator(':scope > summary').click(); await names.locator('input').fill('DM');
    await names.getByText('名前を適用', { exact: true }).click();
    const renamed = await text(); assert.equal(count(renamed, ':DM=1'), 2); assert.equal(count(renamed, ':DM=0'), 2);
    assert.ok(!renamed.includes(':ドッジムーブ=1')); assert.match(renamed, /\{DM\}\*\(4\)/);
    // Preserve an edited evasion formula while another copy still changes.
    const oldRoll = renamed.split('\n').find(line => line.endsWith('>=0 回避判定'));
    const edited = renamed.replace(oldRoll, oldRoll.replace('>=0', '>=12'));
    await page.locator('#palette').fill(edited); await check.uncheck();
    assert.ok((await text()).includes('>=12 回避判定'));
    const otherRoll = (await text()).split('\n').find(line => line.endsWith('>=0 回避判定'));
    assert.ok(!otherRoll.includes('{DM}')); await check.check();
    assert.ok((await text()).includes('>=12 回避判定'));
    // A named check gets the modifier; its base ability and other checks do not.
    const trap = await openCard('探知の補正');
    const trapCheck = trap.locator('input[type="checkbox"][aria-label$="：探知の補正"]');
    await trapCheck.check();
    const mode = trap.getByRole('combobox', { name: '探知の補正の加算方法', exact: true });
    await mode.selectOption('toggle');
    const afterTrap = await text();
    assert.equal(count(afterTrap, ':探知の補正=1'), 1); assert.equal(count(afterTrap, ':探知の補正=0'), 1);
    assert.ok(afterTrap.split('\n').find(l => l.endsWith('>=0 トラップ探知判定')).includes('{探知の補正}'));
    assert.ok(!afterTrap.split('\n').find(l => l.endsWith('>=0 危険感知判定')).includes('{探知の補正}'));
    assert.equal(await page.locator('#calculationEditor [data-target-id] input[aria-label$="：危険の補正"]').count(), 1);
    await page.locator('#copyBottom').click();
    assert.equal(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).data.commands, afterTrap);
    await page.locator('#saveSession').click();
    assert.ok(!(await page.locator('#sessionNotice').innerText()).includes('失敗'));
    await page.reload();
    // Select this character explicitly; another regression may have saved a character.
    const selector = page.locator('#savedSessions');
    if (await selector.count()) {
      const value = await selector.locator('option').evaluateAll(options => options.find(o => o.textContent.includes('回避補正テスト'))?.value);
      if (value) await selector.selectOption(value);
    }
    await page.locator('#resumeSession').click();
    assert.equal(await text(), afterTrap);
    const resumed = await openCard('探知の補正');
    const resumedCheck = resumed.locator('input[type="checkbox"][aria-label$="：探知の補正"]');
    await resumedCheck.uncheck(); await resumedCheck.check();
    assert.equal(await text(), afterTrap); assert.deepEqual(errors, []);
    console.log('PASS: evasion placement, named-check controls, flag insertion/rename, hand edits, copy and save/resume');
  } finally { await page.close(); }
};
