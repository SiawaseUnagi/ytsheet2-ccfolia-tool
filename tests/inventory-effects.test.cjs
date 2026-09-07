const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-effects-'));
after(()=>fs.rmSync(out,{recursive:true,force:true}));
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--module','commonjs','--moduleResolution','node','--outDir',out],{cwd:root,stdio:'inherit'});
const {parseYtsheet}=require(path.join(out,'ytsheet/parseYtsheet.js'));
const {readInventoryEffects}=require(path.join(out,'items/inventoryEffects.js'));
const {analyzeModifiers,compatible}=require(path.join(out,'calculation/analysis.js'));
const {prepareCalculationPalette,renderRoll}=require(path.join(out,'calculation/palette.js'));
const {createDefaultCalculationState}=require(path.join(out,'calculation/defaults.js'));
const {selectionsFor,modifierKey,targetKey}=require(path.join(out,'calculation/sessionState.js'));
const {buildPalette,buildStatus}=require(path.join(out,'output/enhancements.js'));
const {generateSessionBase,planSessionUpdate}=require(path.join(out,'session/generation.js'));
const url='https://yutorize.work/ytsheet/ar2e/?id=inventorytest';
const sk=(name,effect,timing='メジャー',lv=1,judge='魔術判定')=>({name,effect,timing,lv,judge,cost:'3',usage:'―',target:'単体',range:'20m'});
const heal=sk('ヒール','対象の【HP】を[3D+CL×3]点回復する。');
const quick=sk('クイックヒール','《ヒール》を同時に使用する。この効果により、《ヒール》がイニシアチブプロセスで使用可能となる。','イニシアチブ',1,'自動成功');
const flower='効果をダイスで求める「分類：魔術」に有効。パッシブ。所持者が使用するHP回復を行なう「分類：魔術」の効果に+1Dする。';
const accuracy='パッシブ。所持者が行なう武器攻撃の命中判定の達成値に+1し、さらに所持者の【行動値】に+1する。';
const boost='マイナーアクション。使用者が行なう武器攻撃のダメージに+5する。この効果はシーン終了まで持続する。消耗品。';
const row=(name,effect,count='1',flavour='説明')=>`|${name}|${count}|${effect}|${flavour}|@[${count}]|`;
const raw=(extra={})=>({id:'inventorytest',sheetURL:url,characterName:'所持品テスト',hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'5',rollMagic:'5',rollMagicDice:'3',skill:[heal,quick],...extra});
const sheet=extra=>parseYtsheet(raw(extra),url),prep=s=>prepareCalculationPalette(s,buildPalette(s,{}).text);

test('inventory recovery, accuracy and damage become separate candidates',()=>{
 const a=analyzeModifiers(sheet({items:[row('携帯回復具',flower),row('携帯命中具',accuracy),row('増力薬',boost,'3')].join('\n')}));
 assert.equal(a.modifiers.length,3);assert.ok(a.modifiers.every(m=>m.origin==='inventory'&&m.level===undefined));
 assert.deepEqual(a.modifiers.map(m=>m.kinds),[['hpHeal'],['check'],['damage']]);
 assert.equal(a.modifiers[0].conditional,false);assert.equal(a.modifiers[1].conditional,false);assert.equal(a.modifiers[2].conditional,true);
 assert.equal(a.modifiers[1].amount.fixed,'1');assert.equal(a.modifiers[2].flag,'増力薬_補正');
});
test('a later defence clause is not added as damage',()=>{
 const a=analyzeModifiers(sheet({items:row('携帯戦闘具','パッシブ。所持者が行なう武器攻撃のダメージに+1し、さらに所持者の【物理防御力】に+4する。')}));
 assert.equal(a.modifiers.length,1);assert.equal(a.modifiers[0].amount.fixed,'1');
});
test('multiple actual roll clauses stay independent',()=>{
 const a=analyzeModifiers(sheet({armamentOtherName:'複合装備',armamentOtherNote:'パッシブ。魔術判定の達成値に+1、魔法攻撃のダメージに+2する。'}));
 assert.equal(a.modifiers.length,2);assert.deepEqual(a.modifiers.map(m=>[m.kinds[0],m.amount.fixed]),[['check','1'],['damage','2']]);
});
test('equipment remains available for checks, damage and recovery',()=>{
 const p=prep(sheet({armamentHandRName:'判定装備',armamentHandRNote:'パッシブ。装備者が行なう魔術判定の達成値に+2する。',armamentHeadName:'攻撃装備',armamentHeadNote:'パッシブ。装備者が行なう攻撃のダメージに+3する。',armamentOtherName:'回復装備',armamentOtherNote:'効果をダイスで求める「分類：魔術」に有効。パッシブ。装備者が使用するHP回復、MP回復を行なう「分類：魔術」の効果に+2Dする。'}));
 assert.equal(p.modifiers.length,3);assert.ok(p.modifiers.every(m=>m.origin==='equipment'&&!m.conditional));
 assert.ok(p.targets.some(t=>compatible(p.modifiers[0],t)));assert.ok(p.targets.some(t=>compatible(p.modifiers[1],t)));assert.ok(p.targets.some(t=>compatible(p.modifiers[2],t)));
});
test('holder magic healing never applies to nonmagic healing, MP, damage or revival',()=>{
 const p=prep(sheet({items:row('携帯回復具',flower),skill:[heal,sk('治療','対象の【HP】を[2D]点回復する。','メジャー',1,'器用'),sk('MP回復','対象の【MP】を[2D]点回復する。'),sk('レイズ','対象の【HP】を[2D]点にする。')]}));
 const m=p.modifiers[0];assert.ok(m.magicOnly&&m.diceOnly);
 for(const t of p.targets)assert.equal(compatible(m,t),t.kind==='hpHeal'&&t.skillName==='ヒール');
});
test('damage defaults checked; recovery and checks default unchecked for both source types',()=>{
 const p=prep(sheet({items:[row('携帯回復具',flower),row('携帯命中具',accuracy),row('増力薬',boost,'3')].join('\n'),armamentHeadName:'攻撃装備',armamentHeadNote:'パッシブ。攻撃のダメージに+3する。'}));
 const state=createDefaultCalculationState(p,n=>n);
 for(const t of p.targets)assert.equal(selectionsFor(p,t,state).length>0,t.kind==='damage');
 const damage=p.targets.find(t=>t.id==='weapon-damage'),line=renderRoll(damage,selectionsFor(p,damage,state));
 assert.ok(line.includes('{増力薬_補正}*(5)'),line);assert.ok(!line.includes('*(15)'));
});
test('quantity does not multiply modifiers and duplicate rows make one candidate',()=>{
 const input={items:row('┗携帯回復具',flower,'2')+'\n'+row('└携帯回復具',flower,'3')};
 const inv=readInventoryEffects(input);assert.equal(inv.items.length,1);assert.equal(inv.items[0].count,5);
 const a=analyzeModifiers(sheet(input));assert.equal(a.modifiers.length,1);assert.equal(a.modifiers[0].amount.dice,'1');
});
test('zero quantity, names-only and flavour-only effects are not candidates',()=>{
 const a=analyzeModifiers(sheet({items:[row('空の道具',flower,'0'),row('説明だけの品','マイナー。消耗品。','2','魔術判定に+99する。'),'携帯回復具*3'].join('\n')}));
 assert.equal(a.modifiers.length,0);
});
for(const bad of [row('{不正}',flower),row('道具',flower,'不明'),row('道具',flower,'-1'),row('道具',flower).replace('|@[1]|','|')])test('bad structured item is reviewed without generating a bonus',()=>{
 const inv=readInventoryEffects({items:bad});assert.equal(inv.items.length,0);assert.ok(inv.warnings.length);
});
test('same equipped inventory item does not appear twice',()=>{
 const note='パッシブ。装備者が行なう魔術判定の達成値に+2する。';
 const a=analyzeModifiers(sheet({armamentHandRName:'判定装備',armamentHandRNote:note,items:row('判定装備',note,'2')}));
 assert.equal(a.modifiers.length,1);assert.equal(a.modifiers[0].origin,'equipment');assert.equal(a.reviews.length,0);
});
test('conflicting equipment/inventory text uses equipment and warns',()=>{
 const a=analyzeModifiers(sheet({armamentHeadName:'攻撃装備',armamentHeadNote:'パッシブ。攻撃のダメージに+2する。',items:row('攻撃装備','パッシブ。攻撃のダメージに+99する。')}));
 assert.equal(a.modifiers.length,1);assert.equal(a.modifiers[0].amount.fixed,'2');assert.ok(a.reviews.some(r=>/装備欄/.test(r.reason)));
});
test('conflicting inventory rows are not guessed',()=>{
 const a=analyzeModifiers(sheet({items:row('道具',flower)+'\n'+row('道具','パッシブ。所持者のHP回復の効果に+9する。')}));
 assert.equal(a.modifiers.length,0);assert.ok(a.reviews.length);
});
test('unequipped equipment defaults to a zero-one flag, not an always-active bonus',()=>{
 const a=analyzeModifiers(sheet({items:row('予備装備','パッシブ。装備者が行なう攻撃のダメージに+20する。')}));
 assert.equal(a.modifiers[0].conditional,true);
});
test('activated reusable item defaults to a flag even without consumable marker',()=>{
 const a=analyzeModifiers(sheet({items:row('再利用する道具','DRの直前。使用者が行なう武器攻撃のダメージに+1Dする。')}));
 assert.equal(a.modifiers[0].conditional,true);
});
test('strong-heart medicine does not duplicate built-in spirit dice',()=>{
 const s=sheet({items:row('強心丹','マイナー。使用者が行なう【精神】判定に+1Dする。この効果はシーン終了まで持続する。消耗品。','2')});
 assert.equal(analyzeModifiers(s).modifiers.length,0);const status=buildStatus(s,{});
 assert.equal(status.find(x=>x.label==='強心丹').value,'2');assert.equal(status.filter(x=>x.label==='強心丹D').length,1);
});
test('potion-only healing bonus is reviewed, not attached to Heal',()=>{
 const a=analyzeModifiers(sheet({items:row('薬の道具','パッシブ。所持者が使用するポーションのHP回復の効果に+2Dする。')}));
 assert.equal(a.modifiers.length,0);assert.ok(a.reviews.some(x=>/特定のアイテム/.test(x.reason)));
});
test('unknown item skill level is not treated as zero',()=>{
 const a=analyzeModifiers(sheet({items:row('不明な道具','パッシブ。所持者のHP回復の効果に+[SL×3]する。')}));
 assert.equal(a.modifiers.length,0);assert.ok(a.reviews.length);
});
test('save-update retains item correction choices and shortened flag names',()=>{
 const a=raw({items:row('携帯回復具',flower)+'\n'+row('増力薬',boost,'3')}),p=prep(parseYtsheet(a,url));
 const state=createDefaultCalculationState(p,n=>n),m=p.modifiers.find(m=>m.source==='携帯回復具');
 for(const t of p.targets.filter(t=>t.skillName==='ヒール'&&t.kind==='hpHeal'))state.choices.push({target:targetKey(t),modifier:modifierKey(m,p.modifiers),checked:true,toggle:false});
 const binding=state.flags.find(f=>f.key==='増力薬_補正');binding.name='DP';binding.actual='DP';
 const base=generateSessionBase(a,url,true,state),old={key:base.key,name:base.sheet.name,raw:a,url,useFormula:true,savedAt:new Date().toISOString(),calculation:state,base:base.fields,working:{...base.fields,palette:base.fields.palette+'\n手編集の宣言。'}};
 const next=planSessionUpdate(old,raw({level:'6',hpTotal:'44',items:row('携帯回復具',flower)+'\n'+row('増力薬',boost,'4')}));
 assert.equal(next.conflicts.length,0);assert.ok(next.next.working.palette.includes('(3+1)D+{CL}*3 HP回復量'));
 assert.ok(next.next.working.palette.includes('{DP}*(5)'));assert.ok(next.next.working.statusEdit.includes('DP\t0\t0'));assert.ok(next.next.working.statusEdit.includes('増力薬\t4\t0'));
 assert.ok(next.next.working.palette.endsWith('手編集の宣言。'));
});
