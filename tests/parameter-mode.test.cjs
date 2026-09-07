const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'ytsheet-mode-'));
after(()=>fs.rmSync(out,{recursive:true,force:true}));
const root=path.join(__dirname,'..'), local=path.join(root,'node_modules/typescript/bin/tsc');
const args=[path.join(root,'src/editor/parameterMode.ts'),'--target','ES2022','--module','commonjs','--strict','--outDir',out];
fs.existsSync(local)?execFileSync(process.execPath,[local,...args]):execFileSync('tsc',args);
const {switchParameterMode}=require(path.join(out,'parameterMode.js'));
const formula=[{label:'器用',value:'6'},{label:'器用判定',value:'{器用}+1'},{label:'命中',value:'{器用判定}-1'},{label:'命中ダイス',value:'3'}];
const fixed=formula.map((p,i)=>({...p,value:['6','7','6','3'][i]}));
const text=p=>p.map(x=>`${x.label}\t${x.value}`).join('\n');
const convert=(current,base=text(formula),mode=false)=>switchParameterMode(current,base,formula,fixed,mode);
test('switch both ways without changing names',()=>{
 const a=convert(text(formula));assert.equal(a.text,text(fixed));assert.equal(a.changed,2);
 assert.equal(convert(a.text,a.baseline,true).text,text(formula));
});
test('uses edited abilities and survives another round trip',()=>{
 const current=text(formula).replace('器用\t6','器用\t8');const a=convert(current);
 assert.match(a.text,/器用判定\t9/);assert.match(a.text,/命中\t8/);
 const b=convert(a.text,a.baseline,true);assert.equal(b.text,current);
 assert.equal(convert(b.text,b.baseline).text,a.text);
});
test('manual changes to derived parameters are retained',()=>{
 const current=text(formula).replace('{器用}+1','{器用}+4');const a=convert(current);
 assert.match(a.text,/器用判定\t\{器用\}\+4/);assert.match(a.text,/命中\t9/);
 assert.deepEqual(a.retained,['器用判定']);
 assert.equal(convert(a.text,a.baseline,true).text,current);
});
test('manual fixed values remain when switching on',()=>{
 const current=text(fixed).replace('命中\t6','命中\t99');const a=convert(current,text(fixed),true);
 assert.match(a.text,/命中\t99/);assert.match(a.text,/器用判定\t\{器用\}\+1/);assert.deepEqual(a.retained,['命中']);
});
test('deletions, additions, reordered rows and blank lines survive',()=>{
 const current='命中 {器用判定}-1\n\n独自 42\n器用 6\n器用判定 {器用}+1\n';
 assert.equal(convert(current).text,'命中\t6\n\n独自 42\n器用 6\n器用判定\t7\n');
});
for(const delimiter of [' ', '\t', ',', '/', '=', '＝'])test('delimiter: '+JSON.stringify(delimiter),()=>{
 const current=formula.map(p=>p.label+delimiter+p.value).join('\n');assert.match(convert(current).text,/命中\t6/);
});
for(const value of ['{命中}', '{不明}', 'alert(1)', '2D', '1/0', '1e999'])test('unresolved input retained, not zeroed: '+value,()=>{
 const current=text(formula).replace('器用\t6','器用\t'+value);
 const a=convert(current);assert.equal(a.text,current);assert.deepEqual(a.retained,['器用判定','命中']);
});
test('numeric arithmetic in a referenced manual parameter is safe to calculate',()=>{
 const a=convert(text(formula).replace('器用\t6','器用\t(3+1)*2'));
 assert.match(a.text,/命中\t8/);
});
test('duplicates and malformed rows abort without mutating arguments',()=>{
 for(const current of [text(formula)+'\n命中 8',text(formula)+'\ninvalid'])assert.throws(()=>convert(current));
});
test('CRLF and negative or zero results remain valid',()=>{
 const a=convert(text(formula).replace('器用\t6','器用\t-1').replaceAll('\n','\r\n'));
 assert.match(a.text,/器用判定\t0\r\n命中\t-1/);
});
test('branching reference chains have a bounded evaluation cost',()=>{
 const extra=Array.from({length:30},(_,i)=>({label:'x'+i,value:i===29?'1':`{x${i+1}}+{x${i+1}}`}));
 const current=text(formula).replace('器用\t6','器用\t{x0}')+'\n'+text(extra);
 const a=convert(current);assert.equal(a.text,current);assert.deepEqual(a.retained,['器用判定','命中']);
});
