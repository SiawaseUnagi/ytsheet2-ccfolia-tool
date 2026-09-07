const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'ytsheet-resource-'));
after(()=>fs.rmSync(out,{recursive:true,force:true}));
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),'--noEmit','false','--module','commonjs','--moduleResolution','node','--outDir',out],{cwd:root,stdio:'inherit'});
const {buildPalette}=require(path.join(out,'output/enhancements.js'));
const {parseYtsheet}=require(path.join(out,'ytsheet/parseYtsheet.js'));
const {validateEditor}=require(path.join(out,'editor/validation.js'));
const sheet=parseYtsheet({id:'resource-test',characterName:'出力テスト',level:'3',hpTotal:'40',mpTotal:'50',fateTotal:'5',skill:[{name:'ファミリア',lv:1,timing:'アイテム',effect:'使い魔を取得する。'},{name:'準備',lv:3,timing:'パッシブ',effect:'プリプレイで資源を取得する。'}]},'https://yutorize.work/ytsheet/ar2e/?id=resource-test');
const text=buildPalette(sheet,{}).text;
test('attribute alternatives occur exactly once, directly below initiative',()=>{
 assert.ok(text.includes(':initiative=\n//ダメージ属性=物理\n//ダメージ属性=〈〉属性魔法\n'));
 assert.equal((text.match(/^\/\/ダメージ属性=/gm)||[]).length,2);
 assert.ok(text.indexOf('//ダメージ属性=物理')<text.indexOf('### ■戦闘前'));
 assert.ok(!text.split('### ■マイナー\n')[1].split('### ■メジャー')[0].includes('//ダメージ属性='));
});
test('preplay includes each skill level and literal backslash-n',()=>{
 const part=text.split('### ■プリプレイ\n')[1].split('\n\n')[0];
 assert.equal(part,'プリプレイ\\n《ファミリア》1：使い魔を取得する。\\n《準備》3：プリプレイで資源を取得する。');
 assert.equal(part.split('\n').length,1);
});
test('both definitions are detected; keeping one resolves the duplicate',()=>{
 const source={statusEdit:'',paramsEdit:'',palette:'//ダメージ属性=物理\n//ダメージ属性=〈〉属性魔法\n2D {ダメージ属性}ダメージ'};
 assert.ok(validateEditor(source).some(i=>i.message.includes('ダメージ属性')));
 for(const line of ['//ダメージ属性=物理','//ダメージ属性=〈地〉属性魔法']) assert.equal(validateEditor({...source,palette:line+'\n2D {ダメージ属性}ダメージ'}).length,0);
});
