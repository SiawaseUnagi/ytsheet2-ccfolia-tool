// Run: node tests/editorValidation.test.cjs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const out = mkdtempSync(path.join(tmpdir(), 'ytsheet-validation-'));
const local = path.join(root, 'node_modules/typescript/bin/tsc');
const args = ['--strict', '--target', 'ES2022', '--module', 'commonjs', '--outDir', out, path.join(root, 'src/editor/validation.ts')];
try { existsSync(local) ? execFileSync(process.execPath, [local, ...args]) : execFileSync('tsc', args); }
catch (e) { rmSync(out, { recursive: true, force: true }); throw e; }
after(() => rmSync(out, { recursive: true, force: true }));
const { validateEditor } = require(path.join(out, 'validation.js'));
const check = (patch = {}) => validateEditor({ statusEdit: '', paramsEdit: '', palette: '', ...patch });
const has = (issues, code) => issues.some(i => i.code === code);

test('valid space-separated statuses, formulas and local string definitions', () => {
  assert.deepEqual(check({ statusEdit: 'HPP 2 0\nHP 54 54\n判定BD 0 0', paramsEdit: '器用 5\n器用判定 {器用}+1\n命中 {器用判定}-1\n命中ダイス 2', palette: '//ダメージ属性=物理\n:HPP-1\n:HP+\n:initiative=\n({命中ダイス}+{判定BD})D+{命中} {ダメージ属性}ダメージ' }), []);
});
test('undefined flags report the actual line', () => {
  const issues = check({ palette: '説明\n2D+{WB}*15' });
  assert.equal(issues[0].code, 'undefined'); assert.equal(issues[0].line, 2); assert.equal(issues[0].label, 'WB');
});
test('parameters can refer to later definitions', () => {
  assert.deepEqual(check({ paramsEdit: '命中 {器用}+1\n器用 6' }), []);
});
test('undefined references inside parameter values are checked', () => assert.ok(has(check({ paramsEdit: '命中 {器用}+1' }), 'undefined')));
test('undefined references inside // definitions are checked', () => assert.ok(has(check({ palette: '//補正={未知}\n2D+{補正}' }), 'undefined')));
test('// definitions may be later than their use', () => assert.deepEqual(check({ palette: '2D {ダメージ属性}ダメージ\n//ダメージ属性=物理' }), []));
test('string parameters are not treated as malformed numbers', () => assert.deepEqual(check({ paramsEdit: '属性 〈火〉属性魔法' }), []));
test('status duplicates are reported', () => assert.ok(has(check({ statusEdit: 'HPP 2 0\nHPP 3 0' }), 'duplicate')));
test('cross-kind duplicates are reported', () => assert.ok(has(check({ statusEdit: 'HP 54 54', paramsEdit: 'HP 54', palette: '//HP=10' }), 'duplicate')));
test('multiple // definitions are reported', () => assert.ok(has(check({ palette: '//属性=物理\n//属性=魔法' }), 'duplicate')));
test('unknown command destinations are reported', () => assert.ok(has(check({ palette: ':WB=1' }), 'status')));
test('parameters do not suffice for a status command', () => assert.ok(has(check({ paramsEdit: 'WB 0', palette: ':WB=1' }), 'status')));
test('initiative is a built-in command, not a missing status', () => assert.deepEqual(check({ palette: ':initiative=\n:initiative+1' }), []));
test('zero maximum and negative current value are supported', () => assert.deepEqual(check({ statusEdit: '補正 -1 0\n物理防御力 20 0' }), []));
test('non-numeric status and positive maximum overflow are reported', () => {
  assert.ok(has(check({ statusEdit: 'HP x 54' }), 'number')); assert.ok(has(check({ statusEdit: 'HP 60 54' }), 'number'));
});
test('negative maximum is reported', () => assert.ok(has(check({ statusEdit: 'HP 1 -1' }), 'number')));
test('too many columns and undelimited rows are reported', () => {
  assert.ok(has(check({ statusEdit: 'HPP 2 0 extra' }), 'columns')); assert.ok(has(check({ paramsEdit: 'CL' }), 'columns'));
});
test('existing delimiter formats stay supported', () => {
  for (const sep of [' ', '  ', '\t', ',', '/', '=']) assert.deepEqual(check({ statusEdit: ['HPP', '2', '0'].join(sep), paramsEdit: ['CL', '6'].join(sep) }), []);
});
test('CRLF preserves human-facing line numbers', () => assert.equal(check({ paramsEdit: 'CL 6\r\n命中 {未知}' })[0].line, 2));
test('self-reference is reported', () => assert.ok(has(check({ paramsEdit: '命中 {命中}+1' }), 'cycle')));
test('mutual references, including // definitions, are reported', () => assert.ok(has(check({ paramsEdit: 'A {B}', palette: '//B={A}' }), 'cycle')));
test('ordinary nested references are not cycles', () => assert.deepEqual(check({ paramsEdit: 'A {B}\nB {C}\nC 3', palette: '2D+{A}' }), []));
test('checking does not mutate input or execute content', () => {
  const text = { statusEdit: 'HP 54 54', paramsEdit: '本文 <img src=x onerror=alert(1)>', palette: '2D+{不明}' };
  const before = JSON.stringify(text); validateEditor(text); assert.equal(JSON.stringify(text), before);
});
test('large reference chain does not overflow the call stack', () => {
  assert.deepEqual(check({ paramsEdit: Array.from({ length: 4000 }, (_, i) => `A${i} ${i === 3999 ? '3' : `{A${i + 1}}`}`).join('\n') }), []);
});
