const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = require('./compile.cjs')();
const load = p => require(path.join(out, p + '.js'));
const { parseYtsheet } = load('ytsheet/parseYtsheet');
const { buildPalette, buildStatus } = load('output/enhancements');
const { prepareCalculationPalette, renderRoll, TrackedPalette } = load('calculation/palette');
const { analyzeModifiers, compatible } = load('calculation/analysis');
const { checkModifierNames, matchesCheckNames } = load('calculation/checkNames');
const { isEvasionCompanion } = load('palette/checkPlacement');
const { ensureFlagCommands } = load('calculation/flagCommands');
const { emptyCalculationState, targetKey, modifierKey, applyCalculationState, locateSavedRanges } = load('calculation/sessionState');
const { createDefaultCalculationState } = load('calculation/defaults');
const { generateSessionBase, planSessionUpdate, characterJson } = load('session/generation');
const { fileFor, parseSaveFile } = load('session/model');
const url = 'https://yutorize.work/ytsheet/ar2e/?id=check-flags-test';
const skill = (name, effect, timing = 'パッシブ', level = 1, judge = '自動成功', cost = '0', usage = '―') => ({ name, effect, timing, lv: level, judge, cost, usage, target: '自身', range: '―' });
const raw = (extra = {}) => ({ id: 'check-flags-test', sheetURL: url, characterName: '判定補正のテスト', level: '5', hpTotal: '40', mpTotal: '50', fateTotal: '5', skill: [], ...extra });
const make = extra => parseYtsheet(raw(extra), url);
const prepare = extra => { const s = make(extra); return prepareCalculationPalette(s, buildPalette(s, {}).text); };
const section = (text, name) => text.split('### ■' + name + '\n')[1]?.split('### ■')[0] ?? '';
const count = (text, token) => text.split(token).length - 1;
const dodge = skill('ドッジムーブ', '回避判定と同時に使用する。その回避判定の達成値に+[SL+2]する。', '効果参照', 2, '自動成功', '2', 'シーンSL回');
const checkNames = ['トラップ探知', 'トラップ解除', '危険感知', 'エネミー識別', 'アイテム鑑定', '魔術', '呪歌', '錬金術'];
for (const name of checkNames) test('named modifier offered only to its check: ' + name, () => {
  const s = make({ skill: [skill('試験_' + name, name + 'の判定に+1Dする。')] });
  const p = prepareCalculationPalette(s, buildPalette(s, {}).text), m = p.modifiers.find(m => m.source === '試験_' + name);
  assert.ok(m); assert.equal(m.judge, name);
  const targets = p.targets.filter(t => compatible(m, t)); assert.ok(targets.length);
  assert.ok(targets.every(t => t.kind === 'check' && t.judge === name + '判定'));
  const state = createDefaultCalculationState(p, label => label);
  assert.ok(!state.choices.some(c => c.checked && c.modifier === modifierKey(m, p.modifiers)));
});
test('sense and danger detection do not leak into each other', () => {
  assert.equal(matchesCheckNames('感知', '危険感知判定'), false);
  assert.equal(matchesCheckNames('危険感知', '【感知】判定'), false);
  assert.equal(matchesCheckNames('精神', '【精神】判定（リアクション）'), true);
});
test('multi-check clause and earlier contextual check are distinguished', () => {
  assert.deepEqual(checkModifierNames('エネミー識別とアイテム鑑定の判定'), ['エネミー識別', 'アイテム鑑定']);
  assert.deepEqual(checkModifierNames('魔術判定と錬金術判定の達成値'), ['魔術', '錬金術']);
  assert.deepEqual(checkModifierNames('命中判定の後に行なう回避判定'), ['回避']);
  assert.deepEqual(checkModifierNames('その判定の達成値', '回避判定と同時に使用する。'), ['回避']);
  assert.deepEqual(checkModifierNames('その判定', '魔術判定と錬金術判定を行なう。'), []);
});
test('multi-check skill appears on both checks, not every intelligence check', () => {
  const p = prepare({ skill: [skill('複数判定試験', 'エネミー識別とアイテム鑑定の判定に+1Dする。')] });
  const m = p.modifiers.find(m => m.source === '複数判定試験'); assert.ok(m);
  assert.deepEqual(p.targets.filter(t => compatible(m, t)).map(t => t.judge).sort(), ['アイテム鑑定判定', 'エネミー識別判定']);
});
test('equipment and carried items use the same named-check classification', () => {
  const p = prepare({ armamentOtherName: '鑑定用の試験道具', armamentOtherNote: 'パッシブ。アイテム鑑定の判定に+2する。', items: '|探知用の試験道具|1|所持者に有効。パッシブ。トラップ探知の判定に+1Dする。|説明|@[1]|' });
  for (const [source, name] of [['鑑定用の試験道具', 'アイテム鑑定'], ['探知用の試験道具', 'トラップ探知']]) {
    const m = p.modifiers.find(m => m.source === source); assert.ok(m);
    assert.ok(p.targets.filter(t => compatible(m, t)).every(t => t.judge === name + '判定'));
  }
});
test('ambiguous names remain review items instead of being applied to all checks', () => {
  const a = analyzeModifiers(make({ skill: [skill('未特定の試験', '特殊な判定に+1Dする。')] }));
  assert.ok(!a.modifiers.length); assert.ok(a.reviews.length);
});
test('evasion companion appears directly below both common evasion checks', () => {
  const s = make({ skill: [dodge] }), p = prepareCalculationPalette(s, buildPalette(s, {}).text);
  for (const name of ['リアクション', '判定']) assert.match(section(p.text, name), />=0 回避判定\n回避判定と同時に《ドッジムーブ》2を使用。/);
  assert.equal(count(p.text, '《ドッジムーブ》2を使用。'), 2);
  assert.ok(!section(p.text, '効果参照').includes('ドッジムーブ'));
  assert.equal(count(section(p.text, 'シーン終了時リセット'), ':ドッジムーブ=2'), 1);
  assert.equal(buildStatus(s, {}).filter(s => s.label === 'ドッジムーブ').length, 1);
  const resources = section(p.text, 'リアクション');
  assert.ok(resources.indexOf('ドッジムーブ') < resources.indexOf('【精神】判定（リアクション）'));
  assert.ok(p.modifiers.find(m => m.source === 'ドッジムーブ' && m.judge === '回避'));
});
test('paired child follows evasion companion without losing resets', () => {
  const child = skill('同時使用試験', '《ドッジムーブ》と同時に使用する。', '《ドッジムーブ》', 1, '自動成功', '1', 'シナリオ1回');
  const p = prepare({ skill: [child, dodge] }).text;
  for (const name of ['リアクション', '判定']) {
    const s = section(p, name); assert.ok(s.indexOf('《ドッジムーブ》2を使用。') < s.indexOf('《同時使用試験》1を使用。'));
  }
  assert.equal(count(section(p, 'シナリオ終了時リセット'), ':同時使用試験=1'), 1);
});
for (const effect of ['回避判定に+1Dする。', '回避判定と同時に使用できない。', '回避判定と同時に使用することはできない。', '「回避判定と同時に使用する。」と書かれたスキルを取得する。']) test('do not move a mere or negative evasion mention: ' + effect, () => {
  assert.equal(isEvasionCompanion({ ...make({ skill: [skill('試験', effect, 'マイナー')] }).skills[0] }), false);
});
test('passive evasion bonus stays passive', () => {
  const p = prepare({ skill: [skill('回避パッシブ試験', '回避判定に+1Dする。')] });
  assert.ok(section(p.text, 'パッシブ').includes('回避パッシブ試験'));
  assert.ok(!section(p.text, 'リソース操作').includes('回避パッシブ試験'));
});
const modifier = (source = '試験', level = 1) => ({ id: 'm', source, level, effect: '', amount: { dice: '1', fixed: '0' }, kinds: ['check'], flag: source, conditional: true, condition: '' });
function track(text, formula = '2D>=0 判定') {
  const start = text.indexOf(formula);
  return new TrackedPalette(text, start < 0 ? [] : [{ id: 'roll', start, end: start + formula.length, expected: formula, edited: false }]);
}
test('flag commands follow cost and are not duplicated', () => {
  const t = track('メジャーアクションで《試験》1を使用。効果。\n:MP-2\n対象：\n2D>=0 判定\n\n### ■シーン終了時リセット');
  const selected = [{ modifier: modifier(), flag: '短縮' }]; ensureFlagCommands(t, selected);
  assert.match(t.text, /:MP-2\n:短縮=1\n:短縮=0\n対象：/);
  const first = t.text; ensureFlagCommands(t, selected); assert.equal(t.text, first);
  assert.equal(t.text.slice(t.ranges[0].start, t.ranges[0].end), t.ranges[0].expected);
  assert.equal(t.replace('roll', '3D>=0 判定'), true);
});
test('each copy gets controls, while counters and reset commands stay intact', () => {
  const block = '回避判定と同時に《試験》1を使用。\n:MP-2\n:試験-1';
  const t = track(block + '\n\n### ■判定\n' + block + '\n\n### ■シーン終了時リセット\n:試験=3');
  ensureFlagCommands(t, [{ modifier: modifier(), flag: '試験_補正' }]);
  assert.equal(count(t.text, ':試験_補正=1'), 2); assert.equal(count(t.text, ':試験_補正=0'), 2);
  assert.equal(count(t.text, ':試験-1'), 2); assert.ok(t.text.endsWith(':試験=3'));
});
test('same modifier used by multiple formulas inserts only one pair per declaration', () => {
  const t = track('《試験》1 /パッシブ/―/自身/―/―/ 効果。');
  const selected = { modifier: modifier(), flag: 'F' }; ensureFlagCommands(t, [selected, selected, selected]);
  assert.equal(count(t.text, ':F=1'), 1); assert.equal(count(t.text, ':F=0'), 1);
});
test('reset section alone does not substitute for a local off switch', () => {
  const t = track('《試験》1を使用。\n:試験=1\n\n### ■シーン終了時リセット\n:試験=0');
  ensureFlagCommands(t, [{ modifier: modifier(), flag: '試験' }]);
  assert.ok(t.text.startsWith('《試験》1を使用。\n:試験=1\n:試験=0'));
  assert.equal(count(t.text, ':試験=0'), 2);
});
test('simultaneous skill declaration anchors to the used skill, not referenced parent', () => {
  const t = track('《親》と同時に《試験》1を使用。親を補助。\n:MP-1');
  ensureFlagCommands(t, [{ modifier: modifier(), flag: 'F' }]);
  assert.ok(t.text.endsWith(':MP-1\n:F=1\n:F=0')); assert.ok(!t.text.includes('### ■補正フラグ'));
});
test('an effect mentioning another skill does not receive its controls', () => {
  const t = track('《別》1を使用。《試験》1を使用。\n\n《試験》1を使用。');
  ensureFlagCommands(t, [{ modifier: modifier(), flag: 'F' }]);
  assert.equal(count(t.text, ':F=1'), 1); assert.ok(t.text.endsWith('《試験》1を使用。\n:F=1\n:F=0'));
});
test('equipment and consumable source counts stay separate from their flags', () => {
  for (const line of ['装身具：薬。パッシブ。補正。', 'マイナーアクションで薬を使用。補正。\n:薬-1']) {
    const t = track(line); const m = { ...modifier('薬'), level: undefined, origin: 'inventory' };
    ensureFlagCommands(t, [{ modifier: m, flag: '薬_補正' }]);
    assert.ok(t.text.endsWith(':薬_補正=1\n:薬_補正=0'));
    assert.ok(!t.text.includes(':薬=1'));
  }
});
test('missing declaration gets a single supplemental controls section', () => {
  const t = track('2D>=0 判定\n\n### ■シーン終了時リセット\n:別=0');
  const selected = [{ modifier: { ...modifier('道具'), level: undefined }, flag: '道具F' }];
  ensureFlagCommands(t, selected); ensureFlagCommands(t, selected);
  assert.equal(count(t.text, '### ■補正フラグ'), 1); assert.equal(count(t.text, ':道具F=1'), 1);
  assert.ok(t.text.indexOf('### ■補正フラグ') < t.text.indexOf('### ■シーン終了時リセット'));
});
test('constant selections and empty selections do not insert controls', () => {
  const t = track('《試験》1を使用。'); ensureFlagCommands(t, [{ modifier: modifier() }]); ensureFlagCommands(t, []);
  assert.equal(t.text, '《試験》1を使用。');
});
test('manual formula remains protected after inserting controls', () => {
  const t = track('《試験》1を使用。\n2D>=0 判定'); t.observe(t.text.replace('2D>=0 判定', '7D>=9 手編集'));
  ensureFlagCommands(t, [{ modifier: modifier(), flag: 'F' }]);
  assert.ok(t.text.includes('7D>=9 手編集')); assert.equal(t.replace('roll', '9D>=0 判定'), false);
});
test('selected evasion flag regenerates consistently through base/save data', () => {
  const r = raw({ skill: [dodge] }), first = generateSessionBase(r, url, true), p = first.prepared;
  const m = p.modifiers.find(m => m.source === 'ドッジムーブ');
  const targets = p.targets.filter(t => !t.skillName && t.judge === '回避判定'); assert.equal(targets.length, 2);
  const state = emptyCalculationState(); state.flags.push({ key: m.flag, name: 'DM', actual: 'DM' });
  for (const t of targets) state.choices.push({ target: targetKey(t), modifier: modifierKey(m, p.modifiers), checked: true, toggle: true });
  const b = generateSessionBase(r, url, true, state);
  assert.equal(count(b.fields.palette, ':DM=1'), 2); assert.equal(count(b.fields.palette, ':DM=0'), 2);
  assert.match(b.fields.statusEdit, /DM\t0\t0/); assert.match(b.fields.statusEdit, /ドッジムーブ\t2\t2/);
  assert.ok(b.fields.palette.includes('{DM}*(2+2)'));
  for (const range of b.prepared.ranges) assert.equal(b.prepared.text.slice(range.start, range.end), range.expected);
  const located = locateSavedRanges(b.prepared, b.fields.palette); assert.ok(located.ranges.every(r => !r.edited));
  assert.equal(JSON.parse(characterJson(b.fields)).data.commands, b.fields.palette);
  const again = applyCalculationState(p, state); assert.equal(count(again.text, ':DM=1'), 2);
});
