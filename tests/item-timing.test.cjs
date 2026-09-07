const {test,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'ytsheet-item-timing-'));
after(()=>fs.rmSync(out,{recursive:true,force:true}));
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--module','commonjs','--moduleResolution','node','--outDir',out],{cwd:root,stdio:'inherit'});
const load=p=>require(path.join(out,p+'.js'));
const {parseYtsheet}=load('ytsheet/parseYtsheet');
const {buildStatus,buildPalette}=load('output/enhancements');
const {readConsumableTable,consumableCommands}=load('items/tableConsumables');
const {planSkillPlacement,alternateTimingUses}=load('palette/skillPlacement');
const {prepareCalculationPalette,renderRoll,TrackedPalette}=load('calculation/palette');
const {groupCalculationTargets}=load('calculation/groups');
const {emptyCalculationState,targetKey,modifierKey,applyCalculationState,locateSavedRanges}=load('calculation/sessionState');
const {generateSessionBase,planSessionUpdate}=load('session/generation');
const {fileFor,parseSaveFile}=load('session/model');
const url='https://yutorize.work/ytsheet/ar2e/?id=timingtest';
const sk=(name,effect,timing='メジャー',lv=1,judge='自動成功',cost='0',usage='―')=>({name,effect,timing,lv,judge,cost,usage,target:'単体',range:'20m'});
const raw=(extra={})=>({id:'timingtest',sheetURL:url,characterName:'タイミング試験',level:'5',hpTotal:'40',mpTotal:'50',fateTotal:'5',sttMndTotal:'5',rollMnd:'5',rollMagic:'5',rollMagicDice:'3',skill:[],...extra});
const make=x=>parseYtsheet(raw(x),url);
const section=(text,name)=>text.split('### ■'+name+'\n')[1]?.split('### ■')[0]??'';
const count=(text,value)=>text.split(value).length-1;
const item=(name,effect,n=1)=>`|${name}|${n}|${effect}|説明だけの文章|@[1*${n}]|`;
const hpBody='HP回復を行なう。使用者の【HP】を［6D］点回復する。消耗品。';
const talismanBody='取得時に属性からひとつ選択すること。マイナーアクション。使用者が行なう武器攻撃を、選択した属性の魔法ダメージに変更する。この効果はシーン終了まで持続する。消耗品。';
const heal=sk('ヒール','対象の【HP】を[3D+CL×3]点回復する。','メジャー',1,'魔術判定','6');
const quick=sk('クイックヒール','《ヒール》を同時に使用する。この効果により、《ヒール》がイニシアチブプロセスで使用可能となる。','イニシアチブ',1,'自動成功','5','シーン1回');
const dance=sk('セイクリッドダンス','あらゆる判定に+1Dする。この効果はあなたがクリンナッププロセスごとに【MP】を5点消費し続ける限り、シーン終了まで持続する。','メジャー',2,'精神','6','シナリオSL回');
const channel=sk('チャネリング','《セイクリッドダンス》と同時に使用する。この効果により、《セイクリッドダンス》がセットアッププロセスで使用可能となる。','セットアップ',1,'自動成功','6');
const cover=sk('カバーリング','対象にカバーを行なう。','DRの直後',1,'自動成功','2');
const move=sk('カバームーブ','《カバーリング》と同時に使用する。《カバーリング》を「射程：至近」から「射程：20m」に変更する。','《カバーリング》',2,'自動成功','4','シーンSL回');

test('spirit flag immediately below damage buff, followed by explicit consumables',()=>{
 const s=buildStatus(make({items:item('EXHPポーション','マイナー、メジャー。'+hpBody,3)}),{}),i=s.findIndex(x=>x.label==='ダメバフ');
 assert.deepEqual(s.slice(i,i+3).map(x=>x.label),['ダメバフ','強心丹D','EXHPポーション']);assert.equal(s.filter(x=>x.label==='強心丹D').length,1);
 assert.equal(buildStatus(make(),{}).findIndex(x=>x.label==='強心丹D'),i+1);
});
test('effect follows declaration on same line and timing-only sentence is omitted',()=>{
 const s=make({items:item('EXHPポーション','マイナーアクション、メジャーアクション。'+hpBody,3)}),p=buildPalette(s,{}).text;
 for(const t of ['マイナー','メジャー'])assert.ok(section(p,t).includes(`${t}アクションでEXHPポーションを使用。${hpBody}\n:EXHPポーション-1\n6D EXHPポーション`));
 assert.ok(!p.includes('説明だけの文章'));assert.ok(!p.includes('を使用。マイナーアクション'));
});
test('talisman timing in middle is read without treating duration as another timing',()=>{
 const data=readConsumableTable(raw({items:item('理力符（風）',talismanBody)}));assert.equal(data.items.length,1);assert.deepEqual(data.items[0].timings,['マイナー']);
 const c=consumableCommands(data.items[0],'マイナー');assert.equal(c[0],'マイナーアクションで理力符（風）を使用。'+talismanBody.replace('マイナーアクション。',''));assert.equal(c[1],':理力符（風）-1');assert.equal(c.length,2);
});
for(const timing of ['マイナーアクション。','タイミング：マイナーアクション。','マイナーアクションで使用する。','マイナーアクションで使用できる。'])test('explicit timing sentence anywhere: '+timing,()=>{
 const data=readConsumableTable(raw({items:item('試験薬','取得時に選択する。'+timing+hpBody)}));assert.deepEqual(data.items[0]?.timings,['マイナー']);
});
for(const effect of ['この効果はマイナーアクションで解除する。消耗品。','マイナーアクションでは使用できない。消耗品。','クリンナッププロセスごとにMPを消費する。消耗品。','「マイナーアクション」と記載されたスキルを強化する。消耗品。'])test('timing mention is not a usage declaration: '+effect,()=>{
 const data=readConsumableTable(raw({items:item('試験薬',effect)}));assert.equal(data.items.length,0);assert.ok(data.warnings.length);
});
test('flavour timing is never used and repeated valid timing is not duplicated',()=>{
 assert.equal(readConsumableTable(raw({items:'|試験薬|1|消耗品。|マイナーアクション。|@[1]|'})).items.length,0);
 const data=readConsumableTable(raw({items:item('試験薬','マイナー。取得時の説明。マイナー、メジャー。'+hpBody)}));assert.deepEqual(data.items[0].timings,['マイナー','メジャー']);
});
for(const items of ['',item('試験薬','マイナー。'+hpBody)])test('one blank line below minor waiver: '+Boolean(items),()=>{
 const p=buildPalette(make({items,skill:[sk('マイナー試験','効果の説明。','マイナー')]}),{}).text;
 assert.match(section(p,'マイナー'),/^マイナーアクション放棄。\n\n[^\n]/);
});
test('quick heal stays in initiative and heal remains major plus an initiative copy',()=>{
 const s=make({skill:[heal,quick]}),p=prepareCalculationPalette(s,buildPalette(s,{}).text);
 const ini=section(p.text,'イニシアチブ'),maj=section(p.text,'メジャー');
 assert.ok(ini.indexOf('《クイックヒール》1を使用。')<ini.indexOf('《ヒール》1を使用。'));
 assert.ok(ini.includes('イニシアチブプロセスで《ヒール》1を使用。'));assert.ok(maj.includes('メジャーアクションで《ヒール》1を使用。'));
 for(const text of [ini,maj]){assert.ok(text.includes(':MP-6'));assert.ok(text.includes('(3)D+{CL}*3 HP回復量'));assert.match(text,/\({魔術判定ダイス}\+{判定BD}\)D\+{魔術判定}>=0 魔術判定/);}
 assert.equal(count(p.text,'《ヒール》1を使用。'),2);assert.equal(count(p.text,'《クイックヒール》1を使用。'),1);
 assert.equal(new Set(p.ranges.map(r=>r.id)).size,p.ranges.length);
});
test('channel/dance stays in two timings; ordinary cover/move is moved only once',()=>{
 const s=make({skill:[dance,channel,move,cover]}),p=prepareCalculationPalette(s,buildPalette(s,{}).text).text;
 const setup=section(p,'セットアップ'),major=section(p,'メジャー'),dr=section(p,'DR直後');
 assert.ok(setup.indexOf('《チャネリング》1を使用。')<setup.indexOf('《セイクリッドダンス》2を使用。'));
 assert.ok(setup.includes('セットアッププロセスで《セイクリッドダンス》2を使用。'));assert.ok(major.includes('《セイクリッドダンス》2を使用。'));
 assert.ok(dr.indexOf('《カバーリング》1を使用。')<dr.indexOf('《カバームーブ》2を使用。'));
 assert.equal(count(p,'《カバームーブ》2を使用。'),1);assert.equal(count(section(p,'シナリオ終了時リセット'),':セイクリッドダンス=2'),1);
 const status=buildStatus(s,{});assert.equal(status.filter(x=>x.label==='セイクリッドダンス').length,1);
});
test('name-based behaviour works without hardcoded skill names and without source reordering',()=>{
 const s=make({skill:[sk('促進','《回復術》と同時に使用する。《回復術》がフリーアクションで使用可能となる。','フリー'),{...heal,name:'回復術'}]});
 const before=JSON.stringify(s),p=buildPalette(s,{}).text;assert.equal(count(p,'《回復術》1を使用。'),2);assert.equal(JSON.stringify(s),before);
});
test('missing or ambiguous timing-changing partners do not move their enabler',()=>{
 for(const skill of [[quick],[quick,heal,heal],[{...quick,effect:quick.effect.replace('イニシアチブプロセス','好きな時')},heal]]){
  const s=make({skill}),p=planSkillPlacement(s.skills);assert.ok(p.warnings.length);assert.equal(p.alternates.size,0);
 }
});
test('ordinary range-changing text does not count as timing change',()=>assert.deepEqual(alternateTimingUses(make({skill:[move]}).skills[0]),[]));
test('paired cycles do not generate an infinite palette',()=>{
 const a=sk('A','《B》と同時に使用する。《B》がセットアッププロセスで使用可能となる。','セットアップ'),b=sk('B','《A》と同時に使用する。《A》がセットアッププロセスで使用可能となる。','セットアップ');
 const p=buildPalette(make({skill:[a,b]}),{});assert.ok(p.warnings.length);assert.ok(p.text.length<20000);
});
test('both heal occurrences share compatible choices, without merging another skill',()=>{
 const s=make({skill:[heal,quick,sk('回復強化','HP回復の効果に+[SL×3]する。','パッシブ',2),{...heal,name:'別回復'}]}),p=prepareCalculationPalette(s,buildPalette(s,{}).text);
 const targets=p.targets.filter(t=>t.skillName==='ヒール'&&t.kind==='hpHeal'),m=p.modifiers.find(m=>m.source==='回復強化');assert.equal(targets.length,2);
 assert.equal(targetKey(targets[0]),targetKey(targets[1]));const groups=groupCalculationTargets(p.targets,p.modifiers),g=groups.find(g=>g.targets.includes(targets[0]));assert.equal(g.targets.length,2);
 const state=emptyCalculationState();state.choices.push({target:targetKey(targets[0]),modifier:modifierKey(m,p.modifiers),checked:true,toggle:false});
 const selected=applyCalculationState(p,state);assert.equal(count(selected.text,'(3)D+{CL}*3+6 HP回復量'),2);
});
test('manual edit in one copy is protected; the other still accepts changes and resumes',()=>{
 const s=make({skill:[heal,quick]}),p=prepareCalculationPalette(s,buildPalette(s,{}).text),targets=p.targets.filter(t=>t.kind==='hpHeal');
 const tracker=new TrackedPalette(p.text,p.ranges);tracker.observe(tracker.text.replace(renderRoll(targets[0]),'3D+999 手編集'));
 assert.equal(tracker.replace(targets[0].id,'3D+1 不可'),false);assert.equal(tracker.replace(targets[1].id,'3D+123 試験'),true);assert.ok(tracker.text.includes('3D+999 手編集'));
 const current=p.text.replace(renderRoll(targets[0]),'3D+999 手編集');const located=locateSavedRanges(p,current);
 assert.equal(located.ranges.find(r=>r.id===targets[0].id).edited,true);assert.equal(located.ranges.find(r=>r.id===targets[1].id).edited,false);
});
test('save/update retains shared choices and updates both recovery formulas after SL changes',()=>{
 const r=raw({skill:[heal,quick,sk('回復強化','HP回復の効果に+[SL×3]する。','パッシブ',2)]}),first=generateSessionBase(r,url,true),p=first.prepared;
 const m=p.modifiers.find(m=>m.source==='回復強化'),t=p.targets.find(t=>t.skillName==='ヒール'&&t.kind==='hpHeal'),state=emptyCalculationState();
 state.choices.push({target:targetKey(t),modifier:modifierKey(m,p.modifiers),checked:true,toggle:false});const b=generateSessionBase(r,url,true,state);
 const old={key:b.key,name:b.sheet.name,raw:r,url,useFormula:true,savedAt:new Date().toISOString(),calculation:state,base:b.fields,working:{...b.fields,palette:b.fields.palette+'\n自由な追記'}};
 const saved=parseSaveFile(JSON.stringify(fileFor(old))).current,nextRaw=structuredClone(r);nextRaw.skill[2].lv=3;nextRaw.hpTotal='45';
 const plan=planSessionUpdate(saved,nextRaw);assert.equal(plan.conflicts.length,0);assert.equal(count(plan.next.working.palette,'(3)D+{CL}*3+9 HP回復量'),2);assert.ok(plan.next.working.palette.endsWith('自由な追記'));
});
