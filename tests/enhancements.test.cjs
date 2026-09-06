const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'ytsheet-enhance-'));
after(() => fs.rmSync(out, { recursive: true, force: true }));
execFileSync(process.execPath, [path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--module','commonjs','--moduleResolution','node','--outDir',out], {cwd:root,stdio:'inherit'});
const {parseYtsheet} = require(path.join(out,'ytsheet/parseYtsheet.js'));
const {attackKind,analyzeModifiers,compatible,skillRolls} = require(path.join(out,'calculation/analysis.js'));
const {prepareCalculationPalette,renderRoll,TrackedPalette} = require(path.join(out,'calculation/palette.js'));
const {createDefaultCalculationState} = require(path.join(out,'calculation/defaults.js'));
const {applyCalculationState,selectionsFor,emptyCalculationState} = require(path.join(out,'calculation/sessionState.js'));
const {buildPalette,buildStatus,spiritReaction} = require(path.join(out,'output/enhancements.js'));
const {readConsumableTable,isSheetConsumableLabel} = require(path.join(out,'items/tableConsumables.js'));
const {generateSessionBase,planSessionUpdate} = require(path.join(out,'session/generation.js'));
const url='https://yutorize.work/ytsheet/ar2e/?id=autotest';
const sk=(name,effect,timing='パッシブ',lv=1,judge='自動成功')=>({name,effect,timing,lv,judge,cost:'0',usage:'―',target:'自身',range:'―'});
const raw=(extra={})=>({id:'autotest',characterName:'自動テスト',sheetURL:url,hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'5',skill:[],sttMndTotal:'5',rollMnd:'5',rollMndDice:'2',battleTotalAtk:'10',battleDiceAtk:'2',...extra});
const sheet=extra=>parseYtsheet(raw(extra),url);
const prep=s=>prepareCalculationPalette(s,buildPalette(s,{}).text);
const row=(name='ハイHPポーション',count='3',effect='マイナーアクション、メジャーアクション。HP回復を行なう。使用者の【HP】を［4D］点回復する。消耗品。',flavour='効果の高いHPポーション。',weight='@[1*3]')=>`|${name}|${count}|${effect}|${flavour}|${weight}|`;
const dance=sk('セイクリッドダンス','あらゆる判定に+1Dする。この効果はシーン終了まで持続する。','メジャー',2,'精神');

test('all-check bonuses are compatible with every check, never result rolls',()=>{
 const p=prep(sheet({skill:[dance,sk('攻撃魔術','対象に魔法攻撃を行なう。その攻撃のダメージは2D（貫通ダメージ）となる。','メジャー',1,'魔術判定')]}));
 const m=p.modifiers.find(x=>x.source===dance.name);assert.ok(m);
 assert.ok(p.targets.filter(t=>t.kind==='check').length>15);
 for(const t of p.targets) assert.equal(compatible(m,t),t.kind==='check');
});
for(const prefix of ['あらゆる判定','すべての判定','全ての判定']) test(prefix+' supports fixed modifiers too',()=>{
 const m=analyzeModifiers(sheet({skill:[sk('全判定',prefix+'の達成値に+2する。')]})).modifiers[0];
 assert.deepEqual(m.kinds,['check']); assert.equal(m.amount.fixed,'2');
});
for(const timing of ['パッシブ','DRの直前','ダメージロールの直前','効果参照']) test('equipment default: '+timing,()=>{
 const m=analyzeModifiers(sheet({armamentOtherName:'試験装備',armamentOtherNote:`${timing}。暗闇の時に有効。攻撃のダメージに+3する。`})).modifiers[0];
 assert.equal(m.conditional,timing!=='パッシブ');
});
test('one equipment can have both passive and activated modifiers',()=>{
 const a=analyzeModifiers(sheet({armamentOtherName:'試験装備',armamentOtherNote:'パッシブ。攻撃のダメージに+2する。DRの直前。攻撃のダメージに+1Dする。'}));
 assert.deepEqual(a.modifiers.map(m=>m.conditional),[false,true]);
});
for(const [name,effect] of [
 ['クローズショット','エンゲージしているキャラクターを対象として、射撃攻撃を行なうことができる。この効果はメインプロセス終了まで持続する。'],
 ['インターフィアレンス','対象が行なう攻撃の命中判定の直後に使用する。その命中判定の達成値を難易度として、射撃攻撃を行なう武器を使用した命中判定を行なう。命中判定に成功した場合、対象の攻撃は失敗となる。'],
 ['武器条件','射撃攻撃を行う武器を装備している時に有効。'],
 ['条件','白兵攻撃を行なう場合、命中判定に+1Dする。'],
 ['引用','効果を「対象に武器攻撃を行なう」に変更する。'],
]) test('no false damage: '+name,()=>{
 const s=sheet({skill:[sk(name,effect,'ムーブ')]}).skills[0];
 assert.equal(attackKind(s),undefined);assert.ok(skillRolls(s,0,[]).every(t=>t.kind!=='damage'));
});
for(const [prefix,kind] of [['武器','weapon'],['射撃','ranged'],['白兵','melee'],['魔法','magic']]) test('direct attack: '+prefix,()=>{
 assert.equal(attackKind(sheet({skill:[sk('攻撃',`対象に${prefix}攻撃を行なう。`,'メジャー')]}).skills[0]),kind);
});
test('only own attack receives SL dice and +3D; checks stay unchecked by default',()=>{
 const p=prep(sheet({skill:[dance,sk('攻撃A','対象に武器攻撃を行なう。その攻撃のダメージに+［（SL）D］する。','メジャー',2,'命中判定'),sk('攻撃B','対象に武器攻撃を行なう。攻撃によるダメージに＋3Dする。','メジャー',1,'命中判定'),sk('共通加算','攻撃のダメージに+7する。')]}));
 const state=createDefaultCalculationState(p,n=>n), result=applyCalculationState(p,state);
 for(const t of p.targets){
  const selected=selectionsFor(p,t,state);
  assert.equal(selected.length>0,t.kind==='damage');
  if(t.kind==='damage'){
   assert.equal(selected.some(x=>x.modifier.source==='攻撃A'),t.skillName==='攻撃A');
   assert.equal(selected.some(x=>x.modifier.source==='攻撃B'),t.skillName==='攻撃B');
  }
 }
 assert.ok(result.text.includes('({攻撃ダイス}+{ダメBD}+2)D'));
 assert.ok(result.text.includes('({攻撃ダイス}+{ダメBD}+3)D'));
 assert.equal(applyCalculationState(p,emptyCalculationState()).text,p.text);
});
test('table full item name, quantity, two timings and recovery roll',()=>{
 const s=sheet({items:row()}), data=readConsumableTable(s.raw), text=buildPalette(s,{}).text;
 assert.equal(data.items[0].label,'ハイHPポーション');assert.equal(data.items[0].count,3);
 assert.deepEqual(data.items[0].rolls,['4D ハイHPポーション']);
 assert.deepEqual(buildStatus(s,{}).find(x=>x.label==='ハイHPポーション'),{label:'ハイHPポーション',value:'3',max:'0'});
 for(const timing of ['マイナー','メジャー'])assert.ok(text.includes(`${timing}アクションでハイHPポーションを使用。\n:ハイHPポーション-1\n4D ハイHPポーション`));
 assert.ok(!text.includes('でHHPPを使用。'));assert.ok(text.includes('でHMPPを使用。'));
 assert.ok(!buildStatus(s,{}).some(x=>x.label==='HHPP'));
});
test('tree prefixes, identical rows, zero counts and weight do not inflate inventory',()=>{
 const data=readConsumableTable(raw({items:[row('┗HMPP','2'),row('└HMPP','3','マイナーアクション、メジャーアクション。HP回復を行なう。使用者の【HP】を［4D］点回復する。消耗品。','説明','@[1*999]'),row('試験薬','0')].join('&lt;br&gt;')}));
 assert.deepEqual(data.items.map(i=>[i.label,i.count]),[['HMPP',5],['試験薬',0]]);
});
test('flavour mentions never create other inventory entries',()=>{
 const status=buildStatus(sheet({items:row('試験薬','2',undefined,'HPポーション HPP*100 ハイMPポーション*100')}),{});
 assert.equal(status.find(s=>s.label==='HPP').value,'0');assert.equal(status.find(s=>s.label==='HMPP').value,'0');
});
for(const bad of [row('試験薬','不明'),row('試験薬','2','好きな時。HPを4D点回復する。消耗品。'),row('試験薬','2').replace('|@[1*3]|','|'),row('HP','2'),row('{試験薬}','2')]) test('unsupported row remains manual: '+bad.slice(0,24),()=>{
 const parsed=readConsumableTable(raw({items:bad}));assert.equal(parsed.items.length,0);assert.ok(parsed.warnings.length);
});
test('same label with conflicting effects is not guessed',()=>{
 const parsed=readConsumableTable(raw({items:row('試験薬')+'\n'+row('試験薬','2','マイナー。HPを2D点回復する。消耗品。')}));
 assert.equal(parsed.items.length,0);assert.ok(parsed.warnings.length);
});
test('unreadable healing amount still allows declaration without invented dice',()=>{
 const s=sheet({items:row('試験薬','2','マイナー。HPを半分回復する。消耗品。')}), p=buildPalette(s,{});
 assert.ok(p.text.includes('試験薬を使用。\n:試験薬-1'));assert.ok(p.warnings.length);
 assert.deepEqual(readConsumableTable(s.raw).items[0].rolls,[]);
});
test('plain quantity-only notation and default templates remain',()=>{
 const s=sheet({items:'HPP*3 @[1*0]\nHPP*3 @[1*3]'});assert.equal(buildStatus(s,{}).find(x=>x.label==='HPP').value,'6');
 assert.ok(buildPalette(s,{}).text.includes('マイナーアクションでHPPを使用。\n:HPP-1'));
});
for(const name of ['ベアアップ','ペアアップ']) test(name+' only affects dedicated spirit reaction; never appears as a modifier',()=>{
 const s=sheet({skill:[sk(name,'スキルに対するリアクションとして行なう【精神】判定に+1Dする。'),dance]});
 const p=buildPalette(s,{}).text;
 assert.ok(p.includes('回避判定\n({精神判定ダイス}+{判定BD}+{強心丹D}+1)D+{精神判定}>=0 【精神】判定（リアクション）'));
 assert.ok(p.includes('({精神判定ダイス}+{判定BD}+{強心丹D})D+{精神判定}>=0 【精神】判定\n'));
 assert.ok(p.includes('({精神判定ダイス}+{判定BD}+{強心丹D})D+{精神判定}>=0 精神'));
 assert.ok(!analyzeModifiers(s).modifiers.some(m=>m.source===name));
});
test('no Bear Up means no fixed reaction bonus',()=>assert.ok(!spiritReaction(sheet({})).includes('+1')));
test('spirit consumable quantity and toggle are separate',()=>{
 const s=sheet({items:row('強心丹','2','マイナー、メジャー。使用者が行なう【精神】判定に+1Dする。この効果はシーン終了まで持続する。消耗品。')});
 const status=buildStatus(s,{}),text=buildPalette(s,{}).text;
 assert.equal(status.find(x=>x.label==='強心丹').value,'2');assert.equal(status.find(x=>x.label==='強心丹D').value,'0');
 assert.ok(text.includes(':強心丹-1\n:強心丹D=1'));assert.ok(text.includes(':強心丹D=0'));
});
test('unknown named consumables participate in saved-session update and spirit flags reset',()=>{
 const a=raw({items:row('試験薬','2')}),base=generateSessionBase(a,url,true);
 assert.equal(isSheetConsumableLabel(a,'試験薬'),true);
 const old={key:base.key,name:base.sheet.name,raw:a,url,useFormula:true,savedAt:new Date().toISOString(),calculation:base.calculation,base:base.fields,working:{...base.fields,statusEdit:base.fields.statusEdit.replace('強心丹D\t0\t0','強心丹D\t1\t0'),palette:base.fields.palette+'\n手編集した宣言。'}};
 const plan=planSessionUpdate(old,raw({items:row('試験薬','4'),hpTotal:'45'}));
 assert.ok(plan.next.working.statusEdit.includes('試験薬\t4\t0'));assert.ok(plan.next.working.statusEdit.includes('強心丹D\t0\t0'));
 assert.ok(plan.next.working.statusEdit.includes('HP\t45\t45'));assert.ok(plan.next.working.palette.endsWith('手編集した宣言。'));
});
