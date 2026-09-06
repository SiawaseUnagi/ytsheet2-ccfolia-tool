const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],{stdio:'ignore'});
const url='http://127.0.0.1:4173/ytsheet2-ccfolia-tool/';
const sk=(name,effect,timing='パッシブ',lv=1,judge='自動成功')=>({name,effect,timing,lv,judge,cost:'0',usage:'―',target:'自身',range:'―'});
const raw={id:'autotest',characterName:'画面テスト',sheetURL:'https://yutorize.work/ytsheet/ar2e/?id=autotest',hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'5',sttMndTotal:'5',rollMnd:'5',rollMndDice:'2',battleTotalAtk:'10',battleDiceAtk:'2',skill:[sk('試験加算','攻撃のダメージに+[SL*3]する。','パッシブ',3),sk('セイクリッドダンス','あらゆる判定に+1Dする。この効果はシーン終了まで持続する。','メジャー',1,'精神')],items:'|ハイHPポーション|3|マイナーアクション、メジャーアクション。HP回復を行なう。使用者の【HP】を［4D］点回復する。消耗品。|説明|@[1*3]|'};
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
  assert.match(await page.locator('#statusEdit').inputValue(),/ハイHPポーション\t3\t0/);
  let text=await page.locator('#palette').inputValue();assert.equal((text.match(/4D ハイHPポーション/g)||[]).length,2);
  assert.ok(text.includes('+9 {ダメージ属性}ダメージ'));
  const card=page.locator('details[data-target-id="weapon-damage"]');await card.locator(':scope > summary').click();
  const box=card.locator('input[type="checkbox"]').first();assert.equal(await box.isChecked(),true);await box.uncheck();
  text=await page.locator('#palette').inputValue();assert.ok(!text.includes('+9 {ダメージ属性}ダメージ'));
  const selectedChecks=await page.locator('#calculationEditor details[data-target-id] input[type="checkbox"]').evaluateAll(nodes=>nodes.filter(n=>n.checked).length);assert.equal(selectedChecks,0);
  await page.locator('#copy').click();const exported=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));assert.equal(exported.data.commands,text);
  await page.locator('#saveSession').click();assert.ok(!(await page.locator('#sessionNotice').innerText()).includes('失敗'));
  await page.reload();await page.locator('#resumeSession').click();await page.locator('details[data-target-id="weapon-damage"]').waitFor({state:'attached'});
  assert.equal(await page.locator('details[data-target-id="weapon-damage"] input[type="checkbox"]').first().isChecked(),false);
  assert.equal(await page.locator('#palette').inputValue(),text);assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  console.log('PASS: mobile-width generation, damage defaults, item rolls, uncheck, copy, save and resume');
 } finally { if(browser)await browser.close();server.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
