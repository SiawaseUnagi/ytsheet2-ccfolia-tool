const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ytsheet-session-'));
const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
const flags = ['--project', path.join(root, 'tsconfig.json'), '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', out];
try { fs.existsSync(tsc) ? execFileSync(process.execPath, [tsc, ...flags], {cwd: root, stdio: 'pipe'}) : execFileSync('tsc', flags, {cwd: root, stdio: 'pipe'}); }
catch(e) { console.error(String(e.stdout)); fs.rmSync(out, { recursive:true, force:true }); throw e; }
after(() => fs.rmSync(out, { recursive:true, force:true }));
const { mergeText, mergeRows, mergeMetadata } = require(path.join(out,'session/merge.js'));
const { BrowserSaves, fileFor, parseSaveFile, sheetKey, SAVE_PREFIX } = require(path.join(out,'session/model.js'));

const check = (a,b,c,expected) => assert.equal(mergeText(a,b,c,'palette').text,expected);
test('incoming changes update untouched text',()=>check('a\nb','a\nb','a\nc','a\nc'));
test('user-only edits survive',()=>check('a\nb','manual\nb','a\nb','manual\nb'));
test('disjoint edits and new skills merge',()=>check('a\nb\nc','mine\nb\nc','a\nb\nnew\nc','mine\nb\nnew\nc'));
test('overlap requires choice and defaults to keep',()=>{
 const m=mergeText('a\nb','a\nhand','a\nnew','palette'); assert.equal(m.conflicts.length,1);assert.equal(m.text,'a\nhand');
 assert.equal(mergeText('a\nb','a\nhand','a\nnew','palette',{[m.conflicts[0].id]:'incoming'}).text,'a\nnew');
});
test('deleted user command never resurrects',()=>check('a\nb\nc','a\nc','A\nb\nc','A\nc'));
test('line order maintained when source has no changes',()=>check('a\nb\nc','c\na\nb','a\nb\nc','c\na\nb'));
test('literal backslash-n preplay remains a single command',()=>check('プリプレイ\\nA\nend','プリプレイ\\nA\nmanual\nend','プリプレイ\\nA\\nB\nend','プリプレイ\\nA\\nB\nmanual\nend'));
test('new characters cannot share source identity accidentally',()=>{
 assert.equal(sheetKey('https://yutorize.work/ytsheet/ar2e/?mode=json&id=AbC#x'),'https://yutorize.work/ytsheet/ar2e/?id=AbC');
 assert.notEqual(sheetKey('https://a.test/?id=abc'),sheetKey('https://a.test/?id=AbC'));
 assert.throws(()=>sheetKey('javascript:alert(1)')); assert.throws(()=>sheetKey('https://u:p@a.test/?id=1'));
});
test('rows preserve manual order, additions and deletions',()=>{
 const m=mergeRows('筋力 5\n器用 3\n不要 1','器用 3\n筋力 5\nWB 0','筋力 6\n器用 3\n不要 1\nCL 2','params',2);
 assert.equal(m.text,'器用 3\n筋力 6\nWB 0\nCL 2');assert.equal(m.conflicts.length,0);
});
test('row conflict never silently discards manual value',()=>{
 const r=mergeRows('筋力 5','筋力 99','筋力 6','params',2);assert.equal(r.text,'筋力 99');assert.equal(r.conflicts.length,1);
 assert.equal(mergeRows('筋力 5','筋力 99','筋力 6','params',2,new Map(),{[r.conflicts[0].id]:'incoming'}).text,'筋力 6');
});
test('fresh resource maxima and flags override expended counts',()=>{
 const force=new Map([['HP',['HP','60','60']],['技',['技','3','3']],['WB',['WB','0','0']]]);
 const r=mergeRows('HP 50 50\n技 2 2\nWB 0 0','HP 10 50\n技 0 2\nWB 1 0','HP 60 60\n技 3 3\nWB 0 0','status',3,force);
 assert.equal(r.text,'HP\t60\t60\n技\t3\t3\nWB\t0\t0');assert.equal(r.conflicts.length,0);
});
test('bad and duplicate row text preserved as a conflict',()=>{
 const r=mergeRows('HP 50 50','HP abc\nHP 3 3','HP 60 60','status',3);assert.equal(r.text,'HP abc\nHP 3 3');assert.equal(r.conflicts.length,1);
});
test('hand edited memo preserved, unchanged initiative refreshed',()=>{
 const a=JSON.stringify({kind:'character',data:{memo:'old',initiative:5.1}}),b=JSON.stringify({kind:'character',data:{memo:'mine',initiative:5.1}}),c=JSON.stringify({kind:'character',data:{memo:'new',initiative:6.1}});
 const r=mergeMetadata(a,b,c);assert.equal(JSON.parse(r.text).data.memo,'mine');assert.equal(JSON.parse(r.text).data.initiative,6.1);assert.equal(r.conflicts.length,1);
});
function snapshot(){ const url='https://example.test/ar2e/?id=A';const fields={statusEdit:'HP 4 8',paramsEdit:'CL 1',palette:'手で編集',metadata:'{"kind":"character","data":{"name":"試験"}}'};
 return {key:sheetKey(url),name:'試験',url,savedAt:new Date().toISOString(),useFormula:true,raw:{id:'A'},calculation:{version:1,flags:[{key:'長い名前',name:'WB',actual:'WB'}],choices:[]},base:{...fields,palette:'元'},working:fields}; }
class MemoryStorage { map=new Map();get length(){return this.map.size} key(i){return [...this.map.keys()][i]??null}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,v)}removeItem(k){this.map.delete(k)}}
test('save resume restores exact depleted working values, no reset',()=>{const s=snapshot();assert.deepEqual(parseSaveFile(JSON.stringify(fileFor(s))).current,s)});
test('browser saves separate characters and protect previous snapshot',()=>{
 const storage=new MemoryStorage(),repo=new BrowserSaves(storage),s=snapshot();repo.write(fileFor(s));
 const next={...s,working:{...s.working,palette:'new'}};repo.write(fileFor(next,s));assert.equal(repo.read(s.key).previous.working.palette,'手で編集');
 const b={...s,key:sheetKey('https://example.test/ar2e/?id=B'),url:'https://example.test/ar2e/?id=B',raw:{id:'B'}};repo.write(fileFor(b));assert.equal(repo.list().saves.length,2);
});
test('quota failure does not replace old save',()=>{
 const storage=new MemoryStorage(),repo=new BrowserSaves(storage),s=snapshot();repo.write(fileFor(s));
 storage.setItem=()=>{throw Error('quota')};assert.throws(()=>repo.write(fileFor({...s,name:'lost'})));assert.equal(repo.read(s.key).current.name,'試験');
});
test('unreadable saves are reported and never erased',()=>{
 const storage=new MemoryStorage(),repo=new BrowserSaves(storage);storage.setItem(SAVE_PREFIX+'bad','bad');assert.equal(repo.list().damaged,1);assert.equal(storage.length,1);
});
for (const value of [
 '{"format":"ytsheet2-ccfolia-session","version":2}',
 '{"kind":"character","data":{}}',
 '{"__proto__":{"polluted":true}}',
]) test('invalid import rejected: '+value.slice(0,35),()=>assert.throws(()=>parseSaveFile(value)));
test('wrong-character backup and mismatched source rejected',()=>{
 const s=snapshot();assert.throws(()=>parseSaveFile(JSON.stringify(fileFor({...s,raw:{id:'OTHER'}}))));
 const b={...s,key:sheetKey('https://example.test/?id=B'),url:'https://example.test/?id=B',raw:{id:'B'}};assert.throws(()=>parseSaveFile(JSON.stringify(fileFor(s,b))));
});
const { generateSessionBase, planSessionUpdate, characterJson } = require(path.join(out,'session/generation.js'));
const { targetKey, modifierKey, locateSavedRanges } = require(path.join(out,'calculation/sessionState.js'));
function testRaw() {
 const skill=(name,lv,timing,effect,usage='―',judge='自動成功',target='自身')=>({name,lv,timing,effect,usage,judge,target,range:'20m',cost:'3'});
 return {id:'SessionTest',sheetURL:'https://example.test/ar2e/?id=SessionTest',result:'OK',characterName:'保存機能の試験',playerName:'テスト',level:'5',hpTotal:'54',mpTotal:'69',fateTotal:'5',battleTotalIni:'8',sttStrTotal:'6',sttDexTotal:'6',sttAgiTotal:'4',sttIntTotal:'3',sttSenTotal:'4',sttMndTotal:'5',sttLukTotal:'3',rollStr:'6',rollDex:'6',rollInt:'3',rollMagic:'4',rollMagicDice:'3',battleTotalAcc:'5',battleTotalAtk:'8',battleDiceAcc:'3',battleDiceAtk:'2',weightItems:'6',weightLimitItems:'10',items:'HPP*3\nMPP*2',skill:[
 skill('補正試験',3,'DR直前','武器攻撃のダメージに+[SL×3]する。','シーンSL回'),
 skill('ヒール',1,'メジャー','対象の【HP】を[3D+CL×3]点回復する。','―','魔術判定','単体'),
 skill('回復強化試験',2,'パッシブ','HP回復の効果に+[SL×3]する。'),
 ]};
}
function selectedSession() {
 const raw=testRaw(),initial=generateSessionBase(raw,raw.sheetURL,true),m=initial.prepared.modifiers.find(m=>m.source==='補正試験'),t=initial.prepared.targets.find(t=>t.id==='weapon-damage');
 const state={version:1,flags:[{key:m.flag,name:'WB',actual:'WB'}],choices:[{target:targetKey(t),modifier:modifierKey(m,initial.prepared.modifiers),checked:true,toggle:true}]};
 const base=generateSessionBase(raw,raw.sheetURL,true,state);
 return {key:base.key,url:raw.sheetURL,name:raw.characterName,savedAt:new Date().toISOString(),raw,useFormula:true,calculation:state,base:base.fields,working:{...base.fields}};
}
function levelUp(raw) {
 const next=structuredClone(raw);next.level='6';next.hpTotal='60';next.mpTotal='75';next.fateTotal='6';next.sttDexTotal='7';next.rollDex='7';next.battleTotalAcc='6';next.battleTotalIni='9';next.items='HPP*2\nMPP*4';next.skill[0].lv=4;
 next.skill.unshift({name:'追加試験',lv:1,timing:'セットアップ',effect:'次のセッションで使う。',usage:'シナリオ1回',judge:'自動成功',target:'自身',range:'―',cost:'2'});return next;
}
test('level-up updates selected SL formula even when skill rows shift',()=>{
 const s=selectedSession();s.working.palette=s.working.palette.replace('マイナーアクション放棄。','手で直した宣言。').replace('マイナーアクションでHPPを使用。\n:HPP-1\n','');
 s.working.paramsEdit+='\n手動追加 42';
 s.working.statusEdit=s.working.statusEdit.replace('HP\t54\t54','HP 10 54').replace('MP\t69\t69','MP 5 69').replace('フェイト\t5\t5','フェイト 0 5').replace('補正試験\t3\t3','補正試験 0 3').replace('WB\t0\t0','WB 1 0').replace('HPP\t3\t0','HPP 0 0');
 const p=planSessionUpdate(s,levelUp(s.raw));assert.equal(p.conflicts.length,0,JSON.stringify(p.conflicts));
 assert.ok(p.next.working.palette.includes('{WB}*(12)'));assert.ok(p.next.working.palette.includes('手で直した宣言。'));assert.ok(p.next.working.palette.includes('《追加試験》1'));assert.ok(!p.next.working.palette.includes('マイナーアクションでHPPを使用。'));
 const statuses=JSON.parse(characterJson(p.next.working)).data.status;const status=name=>statuses.find(s=>s.label===name);
 for(const [name,n]of [['HP','60'],['MP','75'],['フェイト','6'],['補正試験','4']])assert.deepEqual(status(name),{label:name,value:n,max:n});
 assert.deepEqual(status('WB'),{label:'WB',value:'0',max:'0'});assert.equal(status('HPP').value,'2');assert.equal(status('MPP').value,'4');
 assert.ok(p.next.working.paramsEdit.includes('手動追加 42'));assert.equal(p.next.calculation.choices.length,1);assert.equal(p.warnings.length,0);
});
test('directly edited damage line is a visible conflict, not rewritten',()=>{
 const s=selectedSession();s.working.palette=s.working.palette.replace('{WB}*(9)','{WB}*(9)+999');
 const p=planSessionUpdate(s,levelUp(s.raw));assert.ok(p.conflicts.some(c=>c.field.startsWith('チャットパレット')));assert.ok(p.next.working.palette.includes('{WB}*(9)+999'));
});
test('resume retains short flags, selected healing correction and exact text',()=>{
 const s=selectedSession();s.working.palette+='\n独自の宣言';s.working.statusEdit=s.working.statusEdit.replace('HP\t54\t54','HP 3 54');
 const copy=parseSaveFile(JSON.stringify(fileFor(s))).current;assert.deepEqual(copy.working,s.working);assert.deepEqual(copy.calculation,s.calculation);
 const g=generateSessionBase(copy.raw,copy.url,copy.useFormula,copy.calculation),located=locateSavedRanges(g.prepared,copy.working.palette);
 assert.equal(located.ranges.find(r=>r.id==='weapon-damage').edited,false);
});
test('restore marks hand-edited formula as protected while keeping other rolls editable',()=>{
 const s=selectedSession(),g=generateSessionBase(s.raw,s.url,true,s.calculation);const t=g.prepared.targets.find(t=>t.id==='weapon-damage');
 const range=g.prepared.ranges.find(r=>r.id===t.id);const text=g.prepared.text.replace(range.expected,'2D+999 独自');
 const mapped=locateSavedRanges(g.prepared,text);assert.equal(mapped.ranges.find(r=>r.id===t.id).edited,true);assert.ok(mapped.ranges.filter(r=>r.id!==t.id).some(r=>!r.edited));
});
test('changed source effects do not silently receive an old checkbox',()=>{
 const s=selectedSession(),raw=levelUp(s.raw);raw.skill.find(s=>s.name==='補正試験').effect='武器攻撃のダメージに+[SL×4]する。';
 const p=planSessionUpdate(s,raw);assert.ok(p.warnings.length);assert.equal(p.next.calculation.choices.filter(c=>c.checked).length,0);
});
test('update refuses a different sheet before any merge',()=>{const s=selectedSession(),raw=levelUp(s.raw);raw.id='Other';assert.throws(()=>planSessionUpdate(s,raw));});
test('each successful update becomes the baseline for the following update',()=>{
 const s=selectedSession();s.working.palette+='\nカスタム';const one=planSessionUpdate(s,levelUp(s.raw)).next;
 const raw=structuredClone(one.raw);raw.skill.find(s=>s.name==='補正試験').lv=5;const two=planSessionUpdate(one,raw);
 assert.equal(two.conflicts.length,0);assert.ok(two.next.working.palette.includes('{WB}*(15)'));assert.ok(two.next.working.palette.endsWith('カスタム'));
});
test('simultaneous insertions can explicitly keep both sets of lines',()=>{
 const p=mergeText('head','head\nmy footer','head\n:newSkill=1','p');assert.equal(p.conflicts[0].allowBoth,true);
 assert.equal(mergeText('head','head\nmy footer','head\n:newSkill=1','p',{[p.conflicts[0].id]:'both'}).text,'head\n:newSkill=1\nmy footer');
});
test('missing or invalid fresh HP never silently becomes zero',()=>{
 const s=selectedSession(),r=levelUp(s.raw);delete r.hpTotal;assert.throws(()=>planSessionUpdate(s,r));r.hpTotal='not a number';assert.throws(()=>planSessionUpdate(s,r));
});
test('status max may be omitted consistently with the editor',()=>assert.equal(mergeRows('WB 0 0','WB 0','WB 0 0','s',3).conflicts.length,0));
