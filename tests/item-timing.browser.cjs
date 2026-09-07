const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4175'],{stdio:'ignore'}),url='http://127.0.0.1:4175/ytsheet2-ccfolia-tool/';
const sk=(name,effect,timing='メジャー',lv=1,judge='自動成功',cost='0',usage='―')=>({name,effect,timing,lv,judge,cost,usage,target:'単体',range:'20m'});
const raw={id:'timingtest',sheetURL:'https://yutorize.work/ytsheet/ar2e/?id=timingtest',characterName:'配置と保存の画面テスト',level:'5',hpTotal:'40',mpTotal:'50',fateTotal:'5',rollMagic:'5',rollMagicDice:'3',rollMnd:'5',sttMndTotal:'5',skill:[
 sk('ヒール','対象の【HP】を[3D+CL×3]点回復する。','メジャー',1,'魔術判定','6'),
 sk('クイックヒール','《ヒール》を同時に使用する。この効果により、《ヒール》がイニシアチブプロセスで使用可能となる。','イニシアチブ',1,'自動成功','5','シーン1回'),
 sk('セイクリッドダンス','あらゆる判定に+1Dする。この効果はシーン終了まで持続する。','メジャー',2,'精神','6','シナリオSL回'),
 sk('チャネリング','《セイクリッドダンス》と同時に使用する。この効果により、《セイクリッドダンス》がセットアッププロセスで使用可能となる。','セットアップ'),
 sk('回復強化','HP回復の効果に+[SL×3]する。','パッシブ',2)
],items:'|EXHPポーション|3|マイナーアクション、メジャーアクション。HP回復を行なう。使用者の【HP】を［6D］点回復する。消耗品。|説明|@[3]|\n|理力符（風）|1|取得時に属性を選択する。マイナーアクション。武器攻撃を選択した属性に変更する。この効果はシーン終了まで持続する。消耗品。|説明|@[1]|'};
const count=(text,s)=>text.split(s).length-1;
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.goto(url);
 await page.locator('#url').fill(raw.sheetURL);await page.getByText('URLで読み込めない時だけ、ゆとシートJSONを手入力する',{exact:true}).click();
 await page.locator('#json').fill(JSON.stringify(raw));await page.locator('#gen').click();await page.waitForFunction(()=>document.querySelector('#warn').textContent!=='出力中...');
 assert.ok(!(await page.locator('#warn').innerText()).includes('失敗'));
 assert.match(await page.locator('#statusEdit').inputValue(),/ダメバフ\t0\t0\n強心丹D\t0\t0\nEXHPポーション\t3\t0\n理力符（風）\t1\t0/);
 let text=await page.locator('#palette').inputValue();assert.match(text,/マイナーアクション放棄。\n\nマイナーアクションでEXHPポーションを使用。HP回復/);
 assert.ok(text.includes('理力符（風）を使用。取得時に属性を選択する。武器攻撃'));
 assert.equal(count(text,'《ヒール》1を使用。'),2);assert.equal(count(text,'《セイクリッドダンス》2を使用。'),2);
 assert.equal(count(text,'(3)D+{CL}*3 HP回復量'),2);
 assert.equal(await page.locator('#calculationEditor details').evaluateAll(xs=>xs.every(x=>!x.open)),true);
 const healCard=()=>page.locator('details[data-target-id]').filter({hasText:'《ヒール》 HP回復量'});
 assert.equal(await healCard().count(),1);assert.match(await healCard().locator(':scope > summary').innerText(),/2か所/);
 await healCard().locator('..').locator(':scope > summary').click();await healCard().locator(':scope > summary').click();
 await healCard().locator('input[data-modifier-id]').first().check();text=await page.locator('#palette').inputValue();assert.equal(count(text,'(3)D+{CL}*3+6 HP回復量'),2);
 await page.locator('#useYtsheetStyleParams').uncheck();assert.equal(await page.locator('#palette').inputValue(),text);
 await page.locator('#saveSession').click();assert.match(await page.locator('#sessionNotice').innerText(),/保存しました/);
 await page.reload();await page.locator('#resumeSession').click();await healCard().waitFor({state:'attached'});
 assert.equal(await page.locator('#palette').inputValue(),text);assert.equal(await healCard().locator('input[data-modifier-id]').first().isChecked(),true);
 assert.equal(await page.locator('#useYtsheetStyleParams').isChecked(),false);
 const manual=text.replace('(3)D+{CL}*3+6 HP回復量','3D+777 手編集の回復');await page.locator('#palette').fill(manual);
 await healCard().locator('..').locator(':scope > summary').click();await healCard().locator(':scope > summary').click();await healCard().locator('input[data-modifier-id]').first().uncheck();
 text=await page.locator('#palette').inputValue();assert.ok(text.includes('3D+777 手編集の回復'));assert.equal(count(text,'(3)D+{CL}*3 HP回復量'),1);
 assert.match(await healCard().innerText(),/手編集した1行/);
 text=text.replace('//ダメージ属性=〈〉属性魔法\n','');await page.locator('#palette').fill(text);await page.locator('#copyBottom').click();
 const json=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));assert.equal(json.data.commands,text);assert.equal(json.data.status.filter(x=>x.label==='クイックヒール').length,1);
 await page.locator('#saveSession').click();await page.reload();await page.locator('#resumeSession').click();await healCard().waitFor({state:'attached'});assert.equal(await page.locator('#palette').inputValue(),text);
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS: item bodies/mid-text timing, spirit order, minor spacing, alternate occurrences, shared recovery controls, manual protection, live parameter mode, copy and save/resume');
 }finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
