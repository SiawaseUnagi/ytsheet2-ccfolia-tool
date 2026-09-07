const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'), standalone=process.env.PATCH_COMPONENTS_ONLY==='1';
const ts=require(process.env.TYPESCRIPT_PATH||'typescript');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'ytsheet-layout-'));
after(()=>fs.rmSync(out,{recursive:true,force:true}));
if(standalone) {
 for(const name of ['palette/skillPlacement','calculation/bulkChecks']) {
  const result=ts.transpileModule(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal(result.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const dest=path.join(out,name+'.js');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,result.outputText);
 }
} else execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--module','commonjs','--moduleResolution','node','--outDir',out],{cwd:root,stdio:'inherit'});
const {simultaneousSkillNames,planSkillPlacement}=require(path.join(out,'palette/skillPlacement.js'));
const {isAllChecksModifier,setAllCheckChoices}=require(path.join(out,'calculation/bulkChecks.js'));
const skill=(name,effect='',timing='効果参照')=>({name,effect,timing,level:1,cost:'3',judge:'自動成功',target:'自身',range:'―',usage:'―'});
for(const timing of ['効果参照','DR直前','メジャー','イニシアチブ']) test('effect relation overrides section: '+timing,()=>{
 const p=planSkillPlacement([skill('子','《親》と同時に使用する。',timing),skill('親','','マイナー')]);
 assert.deepEqual(p.roots,[1]);assert.deepEqual(p.children.get(1),[0]);assert.deepEqual(p.warnings,[]);
});
test('explicit skill timing remains supported',()=>assert.deepEqual(simultaneousSkillNames(skill('子','','《親》')),['親']));
test('whitespace and equivalent use wording',()=>assert.deepEqual(simultaneousSkillNames(skill('子','《親》 の使用と同時に 使用できる。')),['親']));
test('repeated reference is not an ambiguity',()=>assert.deepEqual(simultaneousSkillNames(skill('子','《親》と同時に使用する。','《親》')),['親']));
for(const effect of ['《親》を取得している時に有効。','《親》の効果に+3する。','《親》と同時に使用できない。','《親》と同時に使用することはできない。'])test('not a simultaneous-use dependency: '+effect,()=>assert.deepEqual(simultaneousSkillNames(skill('子',effect)),[]));
test('nested children preserve sibling order',()=>{
 const p=planSkillPlacement([skill('孫','《子》と同時に使用する。'),skill('子','《親》と同時に使用する。'),skill('親'),skill('子2','《親》と同時に使用する。')]);
 assert.deepEqual(p.roots,[2]);assert.deepEqual(p.children.get(2),[1,3]);assert.deepEqual(p.children.get(1),[0]);
});
for(const data of [
 [skill('子','《不在》と同時に使用する。')],
 [skill('親'),skill('親'),skill('子','《親》と同時に使用する。')],
 [skill('自分','《自分》と同時に使用する。')],
 [skill('親'),skill('別親'),skill('子','《親》と同時に使用する。《別親》と同時に使用する。')],
])test('ambiguous/missing parent stays in original section: '+data.length,()=>{
 const p=planSkillPlacement(data);assert.equal(p.roots.length,data.length);assert.ok(p.warnings.length);
});
test('cycle edges break but unrelated descendants survive',()=>{
 const p=planSkillPlacement([skill('A','《B》と同時に使用する。'),skill('B','《A》と同時に使用する。'),skill('C','《A》と同時に使用する。')]);
 assert.deepEqual(p.roots,[0,1]);assert.deepEqual(p.children.get(0),[2]);assert.equal(p.warnings.length,2);
});
const modifier=(extra={})=>({id:'dance',source:'セイクリッドダンス',effect:'あらゆる判定に+1Dする。',kinds:['check'],amount:{dice:'1',fixed:'0'},flag:'dance',conditional:true,condition:'',...extra});
for(const effect of ['あらゆる判定に+1Dする。','すべての判定の達成値に+2する。','全ての判定に+1Dする。','あらゆるダイスロールに+1Dする。'])test('bulk candidate '+effect,()=>assert.ok(isAllChecksModifier(modifier({effect}))));
for(const extra of [{judge:'精神'},{hitOnly:true},{attack:'weapon'},{onlySkill:'バッシュ'},{attribute:'火'},{magicOnly:true},{kinds:['damage']},{effect:'命中判定に+1Dする。'}])test('not global: '+JSON.stringify(extra),()=>assert.equal(isAllChecksModifier(modifier(extra)),false));
test('bulk changes checks once per card, retaining modes and aliases',()=>{
 const a=[{checked:false,toggle:true},{checked:false,toggle:true}],b=[{checked:true,toggle:false}];let calls=0;
 const rebuild=()=>calls++,make=states=>({modifier:modifier(),states,rebuild,setChecked:value=>states.forEach(s=>s.checked=value)});
 setAllCheckChoices([make(a),make(b)],true);assert.equal(calls,1);assert.ok([...a,...b].every(s=>s.checked));
 assert.deepEqual([...a,...b].map(s=>s.toggle),[true,true,false]);
 a[0].checked=false;assert.equal(a[1].checked,true);
 setAllCheckChoices([make(a),make(b)],false);assert.ok([...a,...b].every(s=>!s.checked));
});
let parseYtsheet,buildPalette,buildStatus,prepare;
if(!standalone) {
 ({parseYtsheet}=require(path.join(out,'ytsheet/parseYtsheet.js')));
 ({buildPalette,buildStatus}=require(path.join(out,'output/enhancements.js')));
 ({prepareCalculationPalette:prepare}=require(path.join(out,'calculation/palette.js')));
}
const sheet=(extra={})=>parseYtsheet({id:'layouttest',characterName:'テスト',skill:[],hpTotal:'40',mpTotal:'50',fateTotal:'5',level:'3',...extra},'https://yutorize.work/ytsheet/ar2e/?id=layouttest');
test('empty inventory creates no starter statuses or declarations',{skip:standalone},()=>{
 const s=sheet(),statuses=buildStatus(s,{}),p=buildPalette(s,{}).text;
 for(const name of ['HPP','MPP','HHPP','HMPP','毒消し']){assert.ok(!statuses.some(x=>x.label===name));assert.ok(!p.includes(`で${name}を使用。`));}
 assert.ok(p.includes('//ダメージ属性=物理'));
});
test('spirit flag and table inventory are consecutive after damage buff',{skip:standalone},()=>{
 const s=sheet({items:'|ハイMPポーション|3|マイナー、メジャー。使用者の【MP】を［4D］点回復する。消耗品。|説明|@[1*3]|\n|試験薬|0|マイナー。消耗品。|説明|@[0]|'});
 const statuses=buildStatus(s,{}),index=statuses.findIndex(x=>x.label==='ダメバフ');
 assert.deepEqual(statuses.slice(index+1,index+4).map(x=>[x.label,x.value,x.max]),[['強心丹D','0','0'],['ハイMPポーション','3','0'],['試験薬','0','0']]);
 const p=buildPalette(s,{}).text;assert.ok(p.includes(':ハイMPポーション-1\n4D ハイMPポーション'));
});
test('preplay remains a single escaped line between checks and passives',{skip:standalone},()=>{
 const p=buildPalette(sheet({skill:[{name:'装備取得',timing:'アイテム',effect:'装備を取得。',lv:1},{name:'準備',timing:'パッシブ',effect:'プリプレイで資源を取得する。',lv:1}]}),{}).text;
 assert.ok(p.indexOf('### ■判定\n')<p.indexOf('### ■プリプレイ\n'));assert.ok(p.indexOf('### ■プリプレイ\n')<p.indexOf('### ■パッシブ\n'));
 assert.ok(p.includes('プリプレイ\\n《装備取得》1：装備を取得。\\n《準備》1：プリプレイで資源を取得する。'));
});
test('child keeps its cost and result beneath parent block regardless of timing',{skip:standalone},()=>{
 const s=sheet({skill:[{name:'補助',timing:'DR直前',effect:'《攻撃》と同時に使用する。',lv:1,cost:'2'},{name:'攻撃',timing:'メジャー',effect:'対象に武器攻撃を行なう。',lv:1,judge:'命中判定',cost:'4'}]});
 const p=prepare(s,buildPalette(s,{}).text).text,a=p.indexOf('《攻撃》1を使用。'),b=p.indexOf('《補助》1を使用。'),end=p.indexOf('### ■判定の直前');
 assert.ok(a<b&&b<end);assert.ok(p.slice(a,b).includes('{ダメージ属性}ダメージ'));assert.ok(p.slice(b,end).includes(':MP-2'));
 assert.equal(p.split('《補助》1を使用。').length-1,1);
});
