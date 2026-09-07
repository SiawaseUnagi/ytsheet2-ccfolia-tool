const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4175'],{stdio:'ignore'});
const url='http://127.0.0.1:4175/ytsheet2-ccfolia-tool/';
const sk=(name,effect,timing='パッシブ',lv=1,judge='自動成功')=>({name,effect,timing,lv,judge,cost:'0',usage:'―',target:'自身',range:'―'});
const raw={id:'mode-test',characterName:'出力方式テスト',sheetURL:'https://yutorize.work/ytsheet/ar2e/?id=mode-test',hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'5',sttDexTotal:'6',rollDex:'7',rollDexDice:'2',sttMndTotal:'5',rollMnd:'5',rollMndDice:'2',battleTotalAcc:'6',battleTotalAtk:'10',battleDiceAtk:'2',skill:[
 sk('補正試験','攻撃のダメージに+[SL*3]する。','パッシブ',3),
 sk('セイクリッドダンス','あらゆる判定に+1Dする。この効果はシーン終了まで持続する。','メジャー',1,'精神'),
 sk('ヒール','対象の【HP】を[3D+CL×3]点回復する。','メジャー',1,'魔術判定'),
 sk('レイズ','対象の【HP】を[2D]点にする。','メジャー',1,'魔術判定'),
 sk('未確定回復','HPを半分回復する。','メジャー'),
],items:''};
(async()=>{
 let browser;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',d=>d.accept());
  let reads=0;await page.route('https://yutorize.work/**',route=>{reads++;return route.fulfill({json:raw});});
  await page.goto(url);await page.locator('#url').fill(raw.sheetURL);await page.locator('#gen').click();
  await page.waitForFunction(()=>!document.querySelector('#gen').disabled);
  assert.equal(reads,1);assert.ok(!(await page.locator('#warn').innerText()).includes('失敗'));
  const flag=page.locator('#useYtsheetStyleParams');assert.equal(await flag.isChecked(),true);
  const outer=page.locator('#calculationEditor > details');assert.equal(await outer.count(),5);
  assert.equal(await page.locator('#calculationEditor details').evaluateAll(nodes=>nodes.every(n=>!n.open)),true);
  const help=await page.locator('#usageInstructions').innerText();
  assert.ok(help.includes('アリアンロッド2E ココフォリア駒作成ツール 使い方'));
  assert.ok(help.includes('出力後もチェックを切り替えるだけ'));
  assert.ok(!/出力する前に選|出力ボタンを押す前|0・1で切り替え/.test(help));
  assert.ok(help.includes('//_ダメージ属性='));
  assert.equal((help.match(/データの保存と更新/g)||[]).length,1);
  assert.equal(await page.locator('#palette').evaluate(e=>e.nextElementSibling.id),'editorTools');
  assert.equal(await page.locator('#editorTools').evaluate(e=>e.nextElementSibling.id),'calculationEditor');
  const card=page.locator('[data-target-id="weapon-damage"]');
  await card.locator('..').locator(':scope > summary').click();await card.locator(':scope > summary').click();
  const mode=card.locator('select').first();
  assert.equal(await mode.locator('option[value="toggle"]').innerText(),'フラグ管理');
  await mode.selectOption('toggle');
  const rename=card.locator('details[data-flag-editor]').first();await rename.locator(':scope > summary').click();
  await rename.locator('input[type="text"]').fill('WB');await rename.getByText('名前を適用',{exact:true}).click();
  assert.match(await page.locator('#palette').inputValue(),/\{WB\}/);
  const initialPalette=(await page.locator('#palette').inputValue()).replace('//ダメージ属性=〈〉属性魔法\n','')+'\n手編集した宣言';
  await page.locator('#palette').fill(initialPalette);
  await page.locator('#statusEdit').fill((await page.locator('#statusEdit').inputValue()).replace('HP\t40\t40','HP 15 40'));
  const status=await page.locator('#statusEdit').inputValue();
  let params=(await page.locator('#paramsEdit').inputValue()).replace('器用\t6','器用\t8').replace(/呪歌判定\t[^\n]*/, '呪歌判定\t{精神判定}+7');
  params=params.split('\n').filter(l=>!l.startsWith('錬金術判定ダイス\t')).reverse().join('\n')+'\n独自 42';
  await page.locator('#paramsEdit').fill(params);
  const choices=await card.locator('input[type="checkbox"]').evaluateAll(ns=>ns.map(n=>n.checked));
  await flag.uncheck();assert.equal(reads,1);
  const fixed=await page.locator('#paramsEdit').inputValue();
  assert.match(fixed,/器用判定\t9/);assert.match(fixed,/命中\t8/);assert.match(fixed,/呪歌判定\t\{精神判定\}\+7/);
  assert.ok(!fixed.includes('錬金術判定ダイス'));assert.ok(fixed.endsWith('独自 42'));
  assert.equal(await page.locator('#statusEdit').inputValue(),status);assert.equal(await page.locator('#palette').inputValue(),initialPalette);
  assert.deepEqual(await card.locator('input[type="checkbox"]').evaluateAll(ns=>ns.map(n=>n.checked)),choices);
  assert.equal(await card.locator('select').first().inputValue(),'toggle');
  assert.match(await page.locator('#vars').inputValue(),/\{WB\}/);
  const json=JSON.parse(await page.locator('#outjson').inputValue());assert.equal(json.data.params.find(p=>p.label==='命中').value,'8');
  await page.locator('#copyBottom').click();assert.equal(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())).data.commands,initialPalette);
  await page.locator('#saveSession').click();
  assert.ok(!(await page.locator('#sessionNotice').innerText()).includes('失敗'));
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('ytsheet2-ccfolia:session:')))));
  assert.equal(stored.current.useFormula,false);assert.match(stored.current.base.paramsEdit,/命中\t8/);
  assert.ok(stored.current.calculation.flags.some(f=>f.name==='WB'));
  await page.reload();await page.locator('#resumeSession').click();
  assert.equal(await flag.isChecked(),false);assert.equal(await page.locator('#paramsEdit').inputValue(),fixed);
  assert.equal(await page.locator('#palette').inputValue(),initialPalette);assert.equal(await page.locator('#statusEdit').inputValue(),status);
  assert.equal(await page.locator('#calculationEditor details').evaluateAll(nodes=>nodes.every(n=>!n.open)),true);
  await flag.check();assert.equal(reads,1);
  assert.equal(await page.locator('#paramsEdit').inputValue(),params);
  await flag.uncheck();assert.equal(await page.locator('#paramsEdit').inputValue(),fixed);
  // Export/import preserves the mode and the conversion baseline, not just the visible values.
  await page.locator('#exportSession').evaluate(e=>{e.closest('details').open=true;});
  const pending=page.waitForEvent('download');await page.locator('#exportSession').click();const download=await pending;
  const file=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(file.current.useFormula,false);
  await flag.check();await page.locator('#sessionFile').setInputFiles({name:'mode.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
  await page.waitForFunction(()=>!document.querySelector('#useYtsheetStyleParams').checked);
  assert.equal(await page.locator('#paramsEdit').inputValue(),fixed);await flag.check();assert.equal(await page.locator('#paramsEdit').inputValue(),params);
  // Rejected switches leave both the editor and checkbox in their original state.
  const bad=params+'\n命中 999';await page.locator('#paramsEdit').fill(bad);
  await flag.click();assert.equal(await flag.isChecked(),true);assert.equal(await page.locator('#paramsEdit').inputValue(),bad);
  assert.match(await page.locator('#warn').innerText(),/中止/);
  await page.locator('#paramsEdit').fill(params);
  // Update after switching modes still uses the selected mode and saved user edits.
  await flag.uncheck();raw.hpTotal='45';raw.level='6';
  await page.locator('#updateSession').click();await page.locator('#applySessionUpdate').waitFor();await page.locator('#applySessionUpdate').click();
  await page.waitForFunction(()=>document.querySelector('#sessionNotice').textContent.includes('更新を反映して保存'));
  assert.equal(await flag.isChecked(),false);assert.match(await page.locator('#statusEdit').inputValue(),/HP\t45\t45/);
  assert.equal(await page.locator('#palette').inputValue(),initialPalette);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: live mode switch, hand edits, labels, collapsed groups, copy, browser save/resume, file export/import and sheet update');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
