const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{stdio:'ignore'});
const url='http://127.0.0.1:4173/ytsheet2-ccfolia-tool/';
const sk=(name,effect,timing='パッシブ',lv=1,judge='自動成功')=>({name,effect,timing,lv,judge,cost:'0',usage:'―',target:'自身',range:'―'});
const raw={id:'autotest',characterName:'画面テスト',sheetURL:'https://yutorize.work/ytsheet/ar2e/?id=autotest',hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'5',sttMndTotal:'5',rollMnd:'5',rollMndDice:'2',battleTotalAtk:'10',battleDiceAtk:'2',skill:[sk('試験加算','攻撃のダメージに+[SL*3]する。','パッシブ',3),sk('セイクリッドダンス','あらゆる判定に+1Dする。この効果はシーン終了まで持続する。','メジャー',1,'精神'),sk('ファミリア','使い魔を取得する。','アイテム',1)],items:'|ハイHPポーション|3|マイナーアクション、メジャーアクション。HP回復を行なう。使用者の【HP】を［4D］点回復する。消耗品。|説明|@[1*3]|'};
(async()=>{
 let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.locator('#useYtsheetStyleParams').waitFor();
  await page.locator('#url').fill(raw.sheetURL);await page.getByText('URLで読み込めない時だけ、ゆとシートJSONを手入力する',{exact:true}).click();
  await page.locator('#json').fill(JSON.stringify(raw));await page.locator('#gen').click();await page.waitForFunction(()=>document.querySelector('#warn').textContent!=='出力中...');
  assert.ok(!(await page.locator('#warn').innerText()).includes('失敗'));
  const status=await page.locator('#statusEdit').inputValue();assert.match(status,/ダメバフ\t0\t0\nハイHPポーション\t3\t0/);
  assert.ok(!/^HPP\t/m.test(status));
  let text=await page.locator('#palette').inputValue();assert.equal((text.match(/4D ハイHPポーション/g)||[]).length,2);
  assert.ok(text.includes('+9 {ダメージ属性}ダメージ'));
  assert.ok(text.includes(':initiative=\n//ダメージ属性=物理\n//ダメージ属性=〈〉属性魔法'));
  assert.ok(text.includes('プリプレイ\\n《ファミリア》1：使い魔を取得する。'));
  assert.equal(await page.locator('#vars').evaluate(e=>e.nextElementSibling.textContent),'チャットパレット');
  assert.equal(await page.locator('#palette').evaluate(e=>Boolean(e.compareDocumentPosition(document.querySelector('#calculationEditor')) & Node.DOCUMENT_POSITION_FOLLOWING)),true);
  const help=await page.locator('#usageInstructions').innerText();
  assert.ok(help.includes('ステータス欄に「ハイHPポーション 3 0」'));assert.ok(help.includes('チャットパレットの「マイナー」と「メジャー」の両方'));
  assert.ok(!/従来|旧版|更新前と比較|以前の保存/.test(help));
  assert.equal(await page.locator('#calculationEditor h3').first().innerText(),'式に加える補正');
  const card=page.locator('details[data-target-id="weapon-damage"]');
  assert.equal(await card.locator('..').evaluate(e=>e.open),false);
  await card.locator('..').locator(':scope > summary').click();await card.locator(':scope > summary').click();
  const box=card.locator('input[type="checkbox"]').first();assert.equal(await box.isChecked(),true);await box.uncheck();
  text=await page.locator('#palette').inputValue();assert.ok(!text.includes('+9 {ダメージ属性}ダメージ'));
  const selectedChecks=await page.locator('#calculationEditor details[data-target-id] input[type="checkbox"]').evaluateAll(nodes=>nodes.filter(n=>n.checked).length);assert.equal(selectedChecks,0);
  const bulkPanel=page.locator('[data-bulk-checks="true"]'), checks=bulkPanel.locator('..');
  assert.equal(await checks.evaluate(e=>e.open),false);await checks.locator(':scope > summary').click();
  const allChecks=bulkPanel.locator('input[type="checkbox"]').first();
  assert.equal(await allChecks.isChecked(),false);await allChecks.check();
  const individualChecks=checks.locator('details[data-target-id] input[type="checkbox"]');
  assert.ok(await individualChecks.count()>10);assert.equal(await individualChecks.evaluateAll(nodes=>nodes.every(n=>n.checked)),true);
  const firstCheck=individualChecks.first();
  await firstCheck.evaluate(e=>{let p=e.parentElement;while(p){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}});
  await firstCheck.uncheck();assert.equal(await allChecks.evaluate(e=>e.indeterminate),true);
  await allChecks.click();await allChecks.uncheck();
  assert.equal(await individualChecks.evaluateAll(nodes=>nodes.every(n=>!n.checked)),true);assert.equal(await page.locator('#palette').inputValue(),text);
  // The two attribute definitions are alternatives. Preserve validation until one is removed.
  await page.locator('#checkVariables').click();assert.match(await page.locator('#validationResults').innerText(),/ダメージ属性/);
  text=text.replace('//ダメージ属性=〈〉属性魔法\n','');await page.locator('#palette').fill(text);
  await page.locator('#copyBottom').click();const exported=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));assert.equal(exported.data.commands,text);
  await page.locator('#saveSession').click();assert.ok(!(await page.locator('#sessionNotice').innerText()).includes('失敗'));
  await page.reload();await page.locator('#resumeSession').click();await page.locator('details[data-target-id="weapon-damage"]').waitFor({state:'attached'});
  assert.equal(await page.locator('details[data-target-id="weapon-damage"] input[type="checkbox"]').first().isChecked(),false);
  assert.equal(await page.locator('#palette').inputValue(),text);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  console.log('PASS: mobile generation, help, declaration, bulk/individual choices, copy and save/resume');
  // Mouse-driven textarea resizing on a desktop viewport.
  await page.setViewportSize({width:1440,height:1000});
  for(const id of ['statusEdit','paramsEdit','vars','palette']) {
   const input=page.locator('#'+id);await input.scrollIntoViewIfNeeded();
   assert.equal(await input.evaluate(e=>getComputedStyle(e).resize),'both');
   const before=await input.boundingBox();
   await page.mouse.move(before.x+before.width-4,before.y+before.height-4);await page.mouse.down();
   await page.mouse.move(before.x+before.width-84,before.y+before.height+36,{steps:6});await page.mouse.up();
   const after=await input.boundingBox();assert.ok(after.width<before.width-20,id+' width');assert.ok(after.height>before.height+10,id+' height');
  }
  console.log('PASS: actual desktop drag resize on all four editors');
 } finally { if(browser)await browser.close();server.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
