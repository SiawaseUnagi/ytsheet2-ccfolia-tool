const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {execFileSync} = require('node:child_process');
const root=path.join(__dirname,'..'), out=fs.mkdtempSync(path.join(os.tmpdir(),'modifier-edges-'));
after(()=>fs.rmSync(out,{recursive:true,force:true}));
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--module','commonjs','--moduleResolution','node','--outDir',out],{cwd:root,stdio:'inherit'});
const {analyzeModifiers,compatible,skillRolls}=require(path.join(out,'calculation/analysis.js'));
const skill=(name,effect,timing='メジャー')=>({name,effect,timing,level:3,judge:'命中判定',usage:'―',cost:'4',range:'武器',target:'単体'});
const analyze=s=>analyzeModifiers({raw:{},skills:[s],warnings:[]}).modifiers;
test('critical result metadata does not turn an unconditional own-attack bonus into a flag',()=>{
 const s=skill('攻撃テスト','対象に武器攻撃を行なう。その攻撃のダメージに+[(SL)D]する。クリティカル：ダイスロール増加');
 const m=analyze(s)[0];assert.equal(m.conditional,false);assert.equal(m.onlySkill,s.name);assert.equal(m.amount.dice,'3');
});
test('an actual critical-only bonus still defaults to a toggle',()=>{
 const s=skill('条件テスト','クリティカルした場合に有効。攻撃のダメージに+3する。','パッシブ');
 assert.equal(analyze(s)[0].conditional,true);
});
test('non-attacking accuracy checks retain accuracy modifiers without creating damage',()=>{
 const m=analyze(skill('命中補正','武器を使用した命中判定に+1Dする。','パッシブ'))[0];
 const t={id:'opposed-check',title:'妨害',kind:'check',base:{dice:'2',fixed:'5'},suffix:'命中判定',judge:'命中判定'};
 assert.equal(compatible(m,t),true);
 const s=skill('妨害','射撃攻撃を行なう武器を使用した命中判定を行なう。','判定の直後');
 assert.equal(skillRolls(s,0,[]).some(t=>t.kind==='damage'),false);
 assert.equal(compatible(m,{...t,judge:'魔術判定'}),false);
});
