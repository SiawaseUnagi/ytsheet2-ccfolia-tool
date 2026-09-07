// Run after npm install: node tests/calculation.test.cjs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const out = mkdtempSync(path.join(tmpdir(), 'ytsheet-calc-'));
const flags = ['--project', path.join(root, 'tsconfig.json'), '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', out];
const localTsc = path.join(root, 'node_modules/typescript/bin/tsc');
try { existsSync(localTsc) ? execFileSync(process.execPath, [localTsc, ...flags], { cwd: root }) : execFileSync('tsc', flags, { cwd: root }); }
catch (e) { rmSync(out, { recursive: true, force: true }); throw e; }
after(() => rmSync(out, { recursive: true, force: true }));
const { parseAmount } = require(path.join(out, 'calculation/expression.js'));
const { compatible } = require(path.join(out, 'calculation/analysis.js'));
const { prepareCalculationPalette, renderRoll, TrackedPalette } = require(path.join(out, 'calculation/palette.js'));
const { parseYtsheet } = require(path.join(out, 'ytsheet/parseYtsheet.js'));
const { buildPalette } = require(path.join(out, 'palette/buildPalette.js'));
const { buildStatus } = require(path.join(out, 'ccfolia/buildStatus.js'));
const { buildParams } = require(path.join(out, 'ccfolia/buildParams.js'));
const fixture = require('./calculation-fixture.cjs');
const sheet = parseYtsheet(fixture, '');
const generated = buildPalette(sheet, {});
const prepared = prepareCalculationPalette(sheet, generated.text);
const target = (name, kind) => prepared.targets.find(t => t.skillName === name && t.kind === kind);
const modifier = name => prepared.modifiers.find(m => m.source === name);

for (const [input, level, expected] of [
  ['3D+CL×3', 1, { dice: '3', fixed: '{CL}*3' }],
  ['[SL×3]', 3, { dice: '0', fixed: '9' }],
  ['［（SL×2）D］', 3, { dice: '6', fixed: '0' }],
  ['【筋力】', 1, { dice: '0', fixed: '{筋力}' }],
  ['2D+SL*2+CL*3', 3, { dice: '2', fixed: '6+({CL}*3)' }],
]) test(`safe expression: ${input}`, () => assert.deepEqual(parseAmount(input, level), expected));
for (const input of ['alert(1)', '2D*3D', '2D*2', '(2D+3)*2', 'SL/2', '1;2', '[3D', '0.5D', '2D20', '9'.repeat(250)]) {
  test(`unsupported expression rejected: ${input.slice(0, 25)}`, () => assert.equal(parseAmount(input, 2), null));
}

test('HP heal base below check; CL remains a parameter', () => {
  assert.deepEqual(target('ヒール', 'hpHeal').base, { dice: '3', fixed: '{CL}*3' });
  assert.ok(prepared.text.includes('対象：\n({魔術判定ダイス}+{判定BD})D+{魔術判定}>=0 魔術判定\n(3)D+{CL}*3 HP回復量'));
});
test('MP healing resolves SL, independently from HP', () => assert.deepEqual(target('MP回復テスト', 'mpHeal').base, { dice: '2', fixed: '6' }));
test('healing has no damage or hit buff variables', () => {
  const t = target('ヒール', 'hpHeal');
  assert.doesNotMatch(renderRoll(t), /ダメBD|ダメバフ|命中BD/);
  assert.doesNotMatch(renderRoll(target('ヒール', 'check')), /命中BD/);
});
test('recovery buffs do not cross HP, MP, damage or HP setting', () => {
  const hp = modifier('HP回復強化');
  assert.equal(compatible(hp, target('ヒール', 'hpHeal')), true);
  for (const t of [target('MP回復テスト', 'mpHeal'), target('レイズ', 'hpSet'), target('水の魔法', 'damage')]) assert.equal(compatible(hp, t), false);
});
test('equipment recovery dice require a dice-based magic recovery', () => {
  const m = modifier('回復の聖印');
  assert.equal(compatible(m, target('ヒール', 'hpHeal')), true);
  assert.equal(compatible(m, target('単体固定回復', 'hpHeal')), false);
  assert.equal(compatible(m, target('レイズ', 'hpSet')), false);
});
test('HP heal formula with selected SL bonus and equipment dice', () => {
  assert.equal(renderRoll(target('ヒール', 'hpHeal'), [{ modifier: modifier('HP回復強化') }, { modifier: modifier('回復の聖印') }]), '(3+2)D+{CL}*3+9 HP回復量');
});
test('fixed healing produces a calculation command', () => assert.equal(renderRoll(target('単体固定回復', 'hpHeal')), 'C({CL}*10) HP回復量'));
test('magic base has its own damage and attribute, not weapon attack', () => {
  const t = target('水の魔法', 'damage');
  assert.equal(renderRoll(t), '(2+{ダメBD})D+5+{ダメバフ} 〈水〉属性魔法ダメージ');
  assert.doesNotMatch(renderRoll(t), /攻撃力|ダメージ属性/);
});
test('penetration and elemental restrictions do not leak', () => {
  assert.equal(compatible(modifier('ビリーブ'), target('貫通魔法', 'damage')), true);
  assert.equal(compatible(modifier('ビリーブ'), target('水の魔法', 'damage')), false);
  assert.equal(compatible(modifier('火の強化'), target('水の魔法', 'damage')), false);
});
test('attack-only bonuses do not modify healing checks', () => {
  assert.equal(compatible(modifier('命中強化'), target('水の魔法', 'check')), true);
  assert.equal(compatible(modifier('命中強化'), target('ヒール', 'check')), false);
});
test('attack action bonus is offered only for that skill', () => {
  assert.equal(compatible(modifier('バッシュ'), target('バッシュ', 'damage')), true);
  assert.equal(compatible(modifier('バッシュ'), prepared.targets.find(t => t.id === 'weapon-damage')), false);
});
test('flags gate only the selected effect', () => {
  const t = prepared.targets.find(t => t.id === 'weapon-damage');
  assert.match(renderRoll(t, [{ modifier: modifier('スマッシュ'), flag: 'スマッシュ' }]), /\{スマッシュ\}\*\{筋力\}/);
  assert.equal(compatible(modifier('スマッシュ'), target('水の魔法', 'damage')), false);
});
test('unknown, recipient-side and rewriting effects are not auto-added', () => {
  for (const name of ['書き換えテスト', '受ける回復強化', '危険な入力']) {
    assert.equal(modifier(name), undefined);
    assert.ok(prepared.reviews.some(r => r.source === name));
  }
  assert.ok(prepared.reviews.some(r => r.source === '複雑回復'));
});
test('resource declarations and section order survive calculation without starter item templates', () => {
  assert.ok(prepared.text.includes(':フェイト-\n:initiative=\n//ダメージ属性=物理\n//ダメージ属性=〈〉属性魔法'));
  for (const name of ['HPP', 'MPP', 'HHPP', 'HMPP', '毒消し']) assert.ok(!prepared.text.includes(`マイナーアクションで${name}を使用。\n:${name}-1`));
  assert.deepEqual(prepared.text.match(/^### .*$/gm), generated.text.match(/^### .*$/gm));
  assert.ok(prepared.text.includes('プリプレイ\\n《プリプレイテスト》'));
  assert.ok(prepared.text.indexOf('### ■判定\n') < prepared.text.indexOf('### ■プリプレイ\n'));
  assert.ok(prepared.text.indexOf('### ■プリプレイ\n') < prepared.text.indexOf('### ■パッシブ\n'));
});
test('all-skills default statuses do not return, and max stays present', () => {
  const status = buildStatus(sheet, {});
  assert.ok(!status.some(s => s.label === 'HP回復強化'));
  assert.ok(status.every(s => Object.hasOwn(s, 'max')));
  assert.equal(status.find(s => s.label === 'HPP').value, '6');
});
test('both parameter modes use the same names and retain CL', () => {
  const a = buildParams(sheet, true), b = buildParams(sheet, false);
  assert.deepEqual(a.map(p => p.label), b.map(p => p.label));
  assert.equal(a.find(p => p.label === 'CL').value, '6');
  assert.ok(a.find(p => p.label === '魔術判定').value.includes('{'));
  assert.equal(b.find(p => p.label === '魔術判定').value, '9');
});
test('checkbox changes can be repeated and fully removed without accumulating', () => {
  const t = target('ヒール', 'hpHeal'), tracker = new TrackedPalette(prepared.text, prepared.ranges);
  const line = renderRoll(t, [{ modifier: modifier('HP回復強化') }]);
  for (let n = 0; n < 5; n++) assert.equal(tracker.replace(t.id, line), true);
  assert.equal(tracker.text.split(line).length - 1, 1);
  assert.equal(tracker.replace(t.id, renderRoll(t)), true);
  assert.equal(tracker.text, prepared.text);
});
test('editing another line is preserved when a bonus changes', () => {
  const tracker = new TrackedPalette(prepared.text, prepared.ranges), t = target('ヒール', 'hpHeal');
  tracker.observe(tracker.text.replace('マイナーアクション放棄。', '手で直した宣言。'));
  assert.equal(tracker.replace(t.id, renderRoll(t, [{ modifier: modifier('HP回復強化') }])), true);
  assert.ok(tracker.text.includes('手で直した宣言。'));
});
test('manually edited formula is never overwritten', () => {
  const t = target('ヒール', 'hpHeal'), tracker = new TrackedPalette(prepared.text, prepared.ranges);
  const manual = tracker.text.replace(renderRoll(t), '3D+999 手で直した回復量');
  tracker.observe(manual);
  assert.equal(tracker.replace(t.id, renderRoll(t, [{ modifier: modifier('HP回復強化') }])), false);
  assert.equal(tracker.text, manual);
});
test('unsafe names and ambiguous recovery amounts do not become formulas', () => {
  const raw = structuredClone(fixture);
  raw.skill = [{ ...raw.skill[6], name: '{HP}' }, { ...raw.skill[0], effect: 'HPを[3D]点回復する。またはHPを[5D]点回復する。' }];
  const s = parseYtsheet(raw, ''), p = prepareCalculationPalette(s, buildPalette(s, {}).text);
  assert.equal(p.modifiers.length, 1); // equipment only
  assert.equal(p.targets.filter(t => t.kind === 'hpHeal').length, 0);
});
