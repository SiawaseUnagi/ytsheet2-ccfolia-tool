const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4176'],{stdio:'ignore'}),url='http://127.0.0.1:4176/ytsheet2-ccfolia-tool/';
const row=(n,e,c='1')=>`|${n}|${c}|${e}|説明|@[${c}]|`;
const raw={id:'inventorybrowser',sheetURL:'https://yutorize.work/ytsheet/ar2e/?id=inventorybrowser',characterName:'アイテム補正画面テスト',hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'5',rollMagic:'5',rollMagicDice:'3',skill:[
 {name:'ヒール',effect:'対象の【HP】を[3D+CL×3]点回復する。',timing:'メジャー',lv:1,judge:'魔術判定',cost:'6',target:'単体',range:'20m'},
 {name:'クイックヒール',effect:'《ヒール》を同時に使用する。この効果により、《ヒール》がイニシアチブプロセスで使用可能となる。',timing:'イニシアチブ',lv:1,judge:'自動成功',cost:'5',usage:'シーン1回',target:'自身'}
 ],armamentOtherName:'回復装備',armamentOtherNote:'パッシブ。装備者が使用するHP回復を行なう「分類：魔術」の効果に+2Dする。',items:[row('携帯回復具','パッシブ。所持者が使用するHP回復を行なう「分類：魔術」の効果に+1Dする。'),row('増力薬','マイナーアクション。使用者が行なう武器攻撃のダメージに+5する。この効果はシーン終了まで持続する。消耗品。','3')].join('\n')};
const count=(t,s)=>t.split(s).length-1;
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.goto(url);await page.locator('#url').fill(raw.sheetURL);
 await page.getByText('URLで読み込めない時だけ、ゆとシートJSONを手入力する',{exact:true}).click();await page.locator('#json').fill(JSON.stringify(raw));await page.locator('#gen').click();
 await page.waitForFunction(()=>document.querySelector('#warn').textContent!=='出力中...');assert.ok(!(await page.locator('#warn').innerText()).includes('失敗'));
 assert.match(await page.locator('#inventoryCorrectionHelp').innerText(),/装備欄の備考/);
 assert.equal(await page.locator('#calculationEditor details').evaluateAll(xs=>xs.every(x=>!x.open)),true);
 const heal=()=>page.locator('details[data-target-id]').filter({hasText:'《ヒール》 HP回復量'});
 assert.equal(await heal().count(),1);assert.match(await heal().textContent(),/携帯回復具（アイテム）/);assert.match(await heal().textContent(),/回復装備（装備）/);
 await heal().locator('..').locator(':scope > summary').click();await heal().locator(':scope > summary').click();
 const item=heal().getByRole('checkbox',{name:/：携帯回復具$/}),equipment=heal().getByRole('checkbox',{name:/：回復装備$/});
 assert.equal(await item.isChecked(),false);assert.equal(await equipment.isChecked(),false);await item.check();await equipment.check();
 let text=await page.locator('#palette').inputValue();assert.equal(count(text,'(3+2+1)D+{CL}*3 HP回復量'),2);
 const damage=()=>page.locator('details[data-target-id="weapon-damage"]');await damage().locator('..').locator(':scope > summary').click();await damage().locator(':scope > summary').click();
 const boost=damage().getByRole('checkbox',{name:/：増力薬$/});assert.equal(await boost.isChecked(),true);
 const box=boost.locator('..').locator('..');assert.equal(await box.getByRole('combobox').inputValue(),'toggle');
 const rename=box.locator('details[data-flag-editor]');await rename.locator(':scope > summary').click();await rename.locator('input[type="text"]').fill('DP');await rename.getByRole('button',{name:'名前を適用',exact:true}).click();
 text=await page.locator('#palette').inputValue();assert.ok(text.includes('{DP}*5'));
 assert.match(await page.locator('#statusEdit').inputValue(),/増力薬\t3\t0/);assert.match(await page.locator('#statusEdit').inputValue(),/DP\t0\t0/);
 await page.locator('#saveSession').click();assert.match(await page.locator('#sessionNotice').innerText(),/保存しました/);await page.reload();await page.locator('#resumeSession').click();await heal().waitFor({state:'attached'});
 assert.equal(await page.locator('#palette').inputValue(),text);assert.equal(await heal().getByRole('checkbox',{name:/：携帯回復具$/}).isChecked(),true);assert.equal(await heal().getByRole('checkbox',{name:/：回復装備$/}).isChecked(),true);
 await heal().locator('..').locator(':scope > summary').click();await heal().locator(':scope > summary').click();await heal().getByRole('checkbox',{name:/：携帯回復具$/}).uncheck();
 text=await page.locator('#palette').inputValue();assert.equal(count(text,'(3+2)D+{CL}*3 HP回復量'),2);assert.ok(text.includes('{DP}*5'));
 await page.locator('#copyBottom').click();const exported=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));assert.equal(exported.data.commands,text);
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS: inventory and equipped recovery candidates, grouped alternate rolls, damage flags independent from counts, alias, checkbox defaults, copy and save/resume');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
