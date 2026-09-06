const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ytsheet-roll-ui-'));
// Test the calculation modules in isolation. The existing test suites typecheck the whole app.
const flags = ['--target','ES2020','--module','commonjs','--moduleResolution','node','--strict','--lib','ES2020,DOM,DOM.Iterable','--outDir',out,'src/calculation/ui.ts'];
const localTsc = path.join(root,'node_modules/typescript/bin/tsc');
try { fs.existsSync(localTsc) ? execFileSync(process.execPath,[localTsc,...flags],{cwd:root,stdio:'pipe'}) : execFileSync('tsc',flags,{cwd:root,stdio:'pipe'}); }
catch(e) { console.error(String(e.stdout));fs.rmSync(out,{recursive:true,force:true});throw e; }
after(()=>fs.rmSync(out,{recursive:true,force:true}));
const { skillRolls, analyzeModifiers, compatible } = require(path.join(out,'calculation/analysis.js'));
const { renderRoll, prepareCalculationPalette } = require(path.join(out,'calculation/palette.js'));
const { gatedTerm } = require(path.join(out,'calculation/expression.js'));
const { groupCalculationTargets } = require(path.join(out,'calculation/groups.js'));
const { mountCalculationEditor } = require(path.join(out,'calculation/ui.js'));
const { targetKey, modifierKey, applyCalculationState, selectionsFor } = require(path.join(out,'calculation/sessionState.js'));
const { replaceFlagReferences } = require(path.join(out,'calculation/flagNames.js'));
const skill=(name,level,timing,effect,judge='自動成功')=>({name,level,timing,effect,judge,target:'単体',range:'20m',cost:'3',usage:'―'});
const protection=skill('プロテクション',5,'DR直後','ダメージ軽減を行なう。対象が受けるダメージに-[(SL)D]する。');
const discord=skill('ディスコード',3,'DR直前','ダメージ増加を行なう。その攻撃のダメージに+[(SL)D]する。');
const raise=skill('レイズ',1,'メジャー','対象の戦闘不能を回復し、【HP】を[2D]点にする。','魔術判定');
const sheet=skills=>({raw:{},skills,warnings:[]});
for(const [s,expected] of [[protection,'5D プロテクション'],[discord,'3D ディスコード'],[raise,'2D レイズ']]) {
 test(s.name+' uses only its own effect amount and name',()=>{
  const rolls=skillRolls(s,0,[]);assert.equal(rolls.length,1);assert.equal(renderRoll(rolls[0]),expected);
  assert.doesNotMatch(renderRoll(rolls[0]),/攻撃力|ダメBD|ダメバフ|HP設定値|ダメージ/);
 });
}
test('protection dice follow the sheet skill level',()=>assert.equal(renderRoll(skillRolls({...protection,level:2},0,[])[0]),'2D プロテクション'));
test('full width dice expression and fixed contribution are retained',()=>{
 const s={...protection,effect:'ダメージ軽減を行なう。対象が受けるダメージに－［（ＳＬ）Ｄ＋２］する。'};
 assert.equal(renderRoll(skillRolls(s,0,[])[0]),'5D+2 プロテクション');
});
test('ambiguous support rolls are reviewed, not guessed',()=>{
 const reviews=[];const rolls=skillRolls({...protection,effect:protection.effect+'または、対象が受けるダメージに-[2D]する。'},0,reviews);
 assert.equal(rolls.length,0);assert.ok(reviews.length);
});
test('a passive damage bonus does not create a standalone action',()=>assert.equal(skillRolls({...discord,timing:'パッシブ'},0,[]).length,0));
test('ability-only boost remains a modifier, not a new damage roll',()=>assert.equal(skillRolls(skill('スマッシュ',1,'マイナー','白兵攻撃のダメージに+【筋力】する。'),0,[]).length,0));
test('damage/healing bonuses do not leak into effect rolls; all-roll bonuses can',()=>{
 const a=analyzeModifiers(sheet([skill('攻撃補正',1,'パッシブ','攻撃のダメージに+3する。'),skill('回復補正',1,'パッシブ','HP回復の効果に+3する。'),skill('全ダイス',1,'パッシブ','あらゆるダイスロールに+1Dする。')]));
 for(const s of [protection,discord,raise]) {
  const t=skillRolls(s,0,[])[0];assert.deepEqual(a.modifiers.filter(m=>compatible(m,t)).map(m=>m.source),['全ダイス']);
 }
});
test('heal output and HP-set separation remain',()=>{
 const s=skill('ヒール',1,'メジャー','対象の【HP】を[3D+CL×3]点回復する。');
 assert.equal(renderRoll(skillRolls(s,0,[])[0]),'(3)D+{CL}*3 HP回復量');
 assert.equal(skillRolls(raise,0,[])[0].kind,'hpSet');
});
test('effect rolls appear after target/check and before a following skill',()=>{
 const s=sheet([protection,raise]);
 const text='### ■DR直後\n《プロテクション》5を使用。\n:MP-3\n対象：\n\n### ■メジャー\n《レイズ》1を使用。\n:MP-10\n対象：\n({魔術判定ダイス}+{判定BD}+{命中BD})D+{魔術判定}>=0 魔術判定\n';
 const p=prepareCalculationPalette(s,text);
 assert.ok(p.text.includes('対象：\n5D プロテクション\n\n'));
 assert.ok(p.text.includes('>=0 魔術判定\n2D レイズ'));
});
for(const term of ['{筋力}','{精神}','{CL}']) test('atomic '+term+' has no unnecessary parentheses',()=>assert.equal(gatedTerm(term,'補正'),'{補正}*'+term));
test('composite expression stays grouped including when toggle is zero',()=>{
 assert.equal(gatedTerm('{筋力}+3','補正'),'{補正}*({筋力}+3)');
 assert.equal(gatedTerm('{CL}*10','補正'),'{補正}*({CL}*10)');
 assert.equal(gatedTerm('1','補正'),'{補正}');assert.equal(gatedTerm('0','補正'),'0');
});
const check=(id,title,extra={})=>({id,title,kind:'check',base:{dice:'{回避ダイス}+{判定BD}+{回避BD}',fixed:'{回避}'},suffix:'回避判定',judge:'回避判定',...extra});
const checks=[check('a','リソース操作：回避判定'),check('b','判定：回避判定')];
const m={id:'m',source:'回避強化',effect:'回避判定に+2する。',amount:{dice:'0',fixed:'2'},kinds:['check'],judge:'回避',flag:'回避強化',conditional:false,condition:''};
function prepared(targets=checks,modifiers=[m]){
 let text='',ranges=[];
 for(const t of targets){const expected=renderRoll(t);ranges.push({id:t.id,start:text.length,end:text.length+expected.length,expected,edited:false});text+=expected+'\n';}
 return {text,targets,ranges,modifiers,reviews:[]};
}
test('identical general checks become one card',()=>{const g=groupCalculationTargets(checks,[m]);assert.equal(g.length,1);assert.equal(g[0].title,'回避判定');assert.equal(g[0].targets.length,2)});
test('skill-specific checks and distinct formulas stay separate',()=>{
 const targets=[...checks,check('c','専用',{skillName:'回避技'}),check('d','別の式',{base:{dice:'3',fixed:'2'}}),check('e','別の用途',{attack:'magic'})];
 assert.equal(groupCalculationTargets(targets,[m]).length,4);
});
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners={};this.value='';this.textContent='';this.open=false;this.checked=false;this.indeterminate=false;}
 append(...nodes){this.children.push(...nodes)} replaceChildren(...nodes){this.children=nodes} setAttribute(k,v){this.attributes[k]=v}
 addEventListener(k,v){this.listeners[k]=v} removeEventListener(k){delete this.listeners[k]}
}
const walk=(e,fn)=>[e,...e.children.flatMap(c=>walk(c,fn))].filter(fn);
function mount(p=prepared(),state={version:1,flags:[],choices:[]}){
 const original=global.document;global.document={createElement:tag=>new Element(tag)};
 const host=new Element('section'),palette=new Element('textarea');palette.value=p.text;const statuses=[];
 const editor=mountCalculationEditor(host,p,palette,{ensureFlag:name=>{if(!statuses.includes(name))statuses.push(name);return name},renameFlag:(from,to)=>{palette.value=replaceFlagReferences(palette.value,from,to);const i=statuses.indexOf(from);if(i>=0)statuses[i]=to;return to},changed:()=>{}},state);
 return {host,palette,statuses,editor,boxes:walk(host,e=>e.type==='checkbox'),dispose:()=>{editor();global.document=original}};
}
test('one checkbox updates/removes both identical checks without accumulation',()=>{
 const u=mount();try{assert.equal(u.boxes.length,1);for(let i=0;i<3;i++){u.boxes[0].checked=true;u.boxes[0].onchange();assert.equal((u.palette.value.match(/\+2>=0/g)||[]).length,2);u.boxes[0].checked=false;u.boxes[0].onchange();assert.equal(u.palette.value,prepared().text)}}finally{u.dispose()}
});
test('shared checkbox protects a manually edited occurrence',()=>{
 const u=mount();try{u.palette.value=u.palette.value.replace(renderRoll(checks[0]),'2D+999 手編集');u.palette.listeners.input();u.boxes[0].checked=true;u.boxes[0].onchange();assert.ok(u.palette.value.startsWith('2D+999 手編集'));assert.equal((u.palette.value.match(/\+2>=0/g)||[]).length,1)}finally{u.dispose()}
});
test('saved choices still use each old semantic key, not a UI group id',()=>{
 const u=mount();try{u.boxes[0].checked=true;u.boxes[0].onchange();const state=u.editor.getState();assert.deepEqual(state.choices.map(c=>c.target),checks.map(targetKey));assert.equal(state.choices.length,2)}finally{u.dispose()}
});
test('legacy differing choices remain intact until an explicit checkbox change',()=>{
 const p=prepared(),state={version:1,flags:[],choices:[{target:targetKey(checks[0]),modifier:modifierKey(m,p.modifiers),checked:true,toggle:false}]};
 const q=applyCalculationState(p,state),u=mount(q,state);try{assert.equal(u.boxes.length,1);assert.equal(u.boxes[0].indeterminate,true);assert.equal(u.palette.value,q.text);assert.equal(u.editor.getState().choices.length,1);u.boxes[0].checked=true;u.boxes[0].onchange();assert.equal((u.palette.value.match(/\+2>=0/g)||[]).length,2)}finally{u.dispose()}
});
test('legacy hpSet key and all-dice modifier key survive presentation changes',()=>{
 const old={...skillRolls(raise,0,[])[0],suffix:'HP設定値（回復量とは別）'},next=skillRolls(raise,0,[])[0];assert.equal(targetKey(old),targetKey(next));
 const oldM={...m,kinds:['check','damage','hpHeal','mpHeal','hpSet']},newM={...oldM,kinds:[...oldM.kinds,'effect']};assert.equal(modifierKey(oldM,[oldM]),modifierKey(newM,[newM]));
});
test('shared alias rename remains synchronized with checkbox ownership',()=>{
 const p=prepared(checks,[{...m,conditional:true}]),u=mount(p);try{
  u.boxes[0].checked=true;u.boxes[0].onchange();const input=walk(u.host,e=>e.type==='text')[0];input.value='EV';walk(u.host,e=>e.textContent==='名前を適用')[0].onclick();assert.equal((u.palette.value.match(/\{EV\}/g)||[]).length,2);assert.deepEqual(u.statuses,['EV']);
  u.boxes[0].checked=false;u.boxes[0].onchange();assert.equal(u.palette.value,p.text);
 }finally{u.dispose()}
});
test('persistent explanations are in help, not the main correction panel',()=>{
 const main=fs.readFileSync(path.join(root,'src/main.ts'),'utf8'),ui=fs.readFileSync(path.join(root,'src/calculation/ui.ts'),'utf8'),session=fs.readFileSync(path.join(root,'src/session/ui.ts'),'utf8');
 assert.ok(main.includes('ゆとシートのデフォルト変数を使用する'));assert.ok(main.includes("id='usageInstructions'"));assert.ok(!main.includes('ステータス（編集してからコピーすると反映'));
 assert.ok(!main.includes('パラメータ（編集してからコピーすると反映'));assert.ok(!ui.includes('回復量・HP設定値'));assert.ok(session.includes('document.getElementById("usageInstructions")'));
 assert.ok(!ui.includes('host.append(el("p", "補正を加えたい式'));
});
test('generic weapon attack and next skill have a blank separator',()=>{
 const source=fs.readFileSync(path.join(root,'src/palette/buildPalette.ts'),'utf8');assert.ok(source.includes('s.get("メジャー")?.push(...weaponAttackLines(), "");'));
});

test('a successfully extracted protection roll is not reported as an unread modifier',()=>{
 const a=analyzeModifiers(sheet([protection]));assert.equal(a.modifiers.length,0);assert.equal(a.reviews.length,0);
});
