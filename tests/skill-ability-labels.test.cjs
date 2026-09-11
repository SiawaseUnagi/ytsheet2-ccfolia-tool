const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ytsheet-ability-labels-'));
after(() => fs.rmSync(out, { recursive: true, force: true }));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', path.join(root, 'tsconfig.json'), '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', out], { cwd: root, stdio: 'inherit' });
const load = p => require(path.join(out, p + '.js'));
const { parseYtsheet } = load('ytsheet/parseYtsheet');
const { buildPalette } = load('output/enhancements');
const { prepareCalculationPalette, renderRoll, TrackedPalette } = load('calculation/palette');
const { targetKey, modifierKey, applyCalculationState, emptyCalculationState } = load('calculation/sessionState');
const { generateSessionBase, characterJson } = load('session/generation');
const url = 'https://yutorize.work/ytsheet/ar2e/?id=ability-label-test';
const skill = (judge, extra = {}) => ({ name: '判定試験', lv: 1, judge, timing: 'メジャー', effect: '判定を行なう。', cost: '0', usage: '―', target: '単体', range: '至近', ...extra });
const raw = skills => ({ id: 'ability-label-test', sheetURL: url, characterName: '表示試験', level: '1', hpTotal: '20', mpTotal: '20', fateTotal: '5', skill: skills });
const prepare = skills => { const sheet = parseYtsheet(raw(skills), url); return prepareCalculationPalette(sheet, buildPalette(sheet, {}).text); };

for (const ability of ['筋力', '器用', '敏捷', '知力', '感知', '精神', '幸運']) {
  test('skill ability check label: ' + ability, () => {
    const prepared = prepare([skill(ability)]);
    const target = prepared.targets.find(t => t.skillName === '判定試験' && t.kind === 'check');
    assert.ok(target);
    const expectedDice = `{${ability}判定ダイス}+{判定BD}` + (ability === '精神' ? '+{強心丹D}' : '');
    assert.equal(renderRoll(target), `(${expectedDice})D+{${ability}判定}>=0 【${ability}】判定`);
    assert.ok(prepared.text.includes(renderRoll(target)));
    assert.equal(target.suffix, ability, 'source label stays stable for saved selections');
    assert.equal(targetKey(target), JSON.stringify(['skill', '判定試験', 'check', ability, ability]));
    const range = prepared.ranges.find(r => r.id === target.id);
    assert.equal(prepared.text.slice(range.start, range.end), renderRoll(target));
  });
}
for (const judge of ['器用判定', '【器用】', '【器用】判定']) {
  test('already decorated ability label is not doubled: ' + judge, () => {
    const prepared = prepare([skill(judge)]);
    const target = prepared.targets.find(t => t.skillName === '判定試験' && t.kind === 'check');
    assert.ok(renderRoll(target).endsWith('>=0 【器用】判定'));
    assert.ok(!renderRoll(target).includes('判定判定'));
  });
}
for (const judge of ['命中判定', '回避判定', '魔術判定', '呪歌判定', '錬金術判定']) {
  test('non-ability check label is unchanged: ' + judge, () => {
    const prepared = prepare([skill(judge)]);
    const target = prepared.targets.find(t => t.skillName === '判定試験' && t.kind === 'check');
    assert.ok(renderRoll(target).endsWith('>=0 ' + judge));
  });
}
test('First Aid output preserves declaration, target and arithmetic', () => {
  const firstAid = skill('器用', { name: 'ファーストエイド', effect: '難易度10の【器用】判定を行なう。対象の【HP】を1にする。' });
  const base = generateSessionBase(raw([firstAid]), url, true);
  assert.ok(base.fields.palette.includes('対象：\n({器用判定ダイス}+{判定BD})D+{器用判定}>=0 【器用】判定'));
  assert.ok(base.fields.palette.includes('難易度10の【器用】判定を行なう。'));
  assert.ok(base.fields.palette.includes(' 判定：器用 対象：単体 射程：至近'));
  assert.equal(JSON.parse(characterJson(base.fields)).data.commands, base.fields.palette);
});
test('selected modifiers keep canonical display and legacy selection keys', () => {
  const prepared = prepare([skill('器用'), skill('―', { name: '補正試験', timing: 'パッシブ', effect: 'あらゆる判定に+1Dする。' })]);
  const target = prepared.targets.find(t => t.skillName === '判定試験' && t.kind === 'check');
  const modifier = prepared.modifiers.find(m => m.source === '補正試験');
  const state = emptyCalculationState();
  state.choices.push({ target: JSON.stringify(['skill', '判定試験', 'check', '器用', '器用']), modifier: modifierKey(modifier, prepared.modifiers), checked: true, toggle: false });
  const selected = applyCalculationState(prepared, state);
  const expected = '({器用判定ダイス}+{判定BD}+1)D+{器用判定}>=0 【器用】判定';
  assert.ok(selected.text.includes(expected));
  const tracker = new TrackedPalette(selected.text, selected.ranges);
  const manual = selected.text.replace(expected, expected.replace('>=0', '>=10'));
  tracker.observe(manual);
  assert.equal(tracker.replace(target.id, renderRoll(target)), false);
  assert.equal(tracker.text, manual);
});
test('reaction qualifier and non-check effect names are preserved', () => {
  const target = { id: 'reaction', title: 'リアクション', kind: 'check', base: { dice: '{精神判定ダイス}+{判定BD}+{強心丹D}+1', fixed: '{精神判定}' }, suffix: '【精神】判定（リアクション）' };
  assert.ok(renderRoll(target).endsWith('>=0 【精神】判定（リアクション）'));
  assert.equal(renderRoll({ ...target, kind: 'effect', base: { dice: '2', fixed: '0' }, suffix: '精神' }), '2D 精神');
});
test('page title has no version suffix', () => {
  const source = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
  assert.ok(source.includes('<h1>ゆとシートⅡ→ココフォリア変換</h1>'));
  assert.ok(!source.includes('v0.1'));
});
