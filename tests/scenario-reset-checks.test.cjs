const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const out = require('./compile.cjs')();
const load = name => require(path.join(out, name + '.js'));
const { parseYtsheet } = load('ytsheet/parseYtsheet');
const { buildPalette } = load('palette/buildPalette');
const { GENERAL_CHECKS } = load('palette/checks');
const { prepareCalculationPalette } = load('calculation/palette');
const { targetKey, modifierKey } = load('calculation/sessionState');
const { generateSessionBase, planSessionUpdate } = load('session/generation');
const { parseSaveFile, fileFor } = load('session/model');
const fixture = require('./handoff-fixture.cjs');
const raw = { ...fixture, skill: fixture.skill.filter(s => s.name !== 'ヒール') };
const url = raw.sheetURL;
const section = (text, name) => (text.split('### ■' + name + '\n')[1] ?? '').split(/\n### ■/)[0];

test('scenario reset restores max HP/MP/Fate and existing usage counters', () => {
  const text = generateSessionBase(raw, url, true).fields.palette;
  const reset = section(text, 'シナリオ終了時リセット');
  assert.deepEqual(reset.trim().split('\n').slice(0, 3), [':HP=40', ':MP=50', ':フェイト=5']);
  assert.match(reset, /^:全判定テスト=1$/m);
  assert.doesNotMatch(reset, /^:(?:試験ポーション|判定BD|所持金)=/m);
  const next = structuredClone(raw);
  next.hpTotal = '60'; next.mpTotal = '70'; next.fateTotal = '6';
  next.skill.find(s => s.name === '全判定テスト').lv = '2';
  assert.match(section(generateSessionBase(next, url, false).fields.palette,
    'シナリオ終了時リセット'), /^:HP=60\n:MP=70\n:フェイト=6\n:全判定テスト=2$/m);
});

test('only the general 判定 block changes to >=? in both raw and prepared output', () => {
  const sheet = parseYtsheet(raw, url);
  for (const text of [buildPalette(sheet, {}).text, generateSessionBase(raw, url, true).fields.palette]) {
    const general = section(text, '判定');
    assert.equal((general.match(/>=\? /g) ?? []).length, GENERAL_CHECKS.length);
    assert.doesNotMatch(general, />=0 /);
    assert.match(section(text, 'リアクション'), />=0 回避判定/);
    assert.match(section(text, 'リアクション'), />=0 【精神】判定（リアクション）/);
    assert.match(section(text, 'メジャー'), />=0 命中判定/);
  }
});

test('check modifier settings and legacy text parser preserve target identity and optional goal', () => {
  const base = generateSessionBase(raw, url, true);
  const mod = base.prepared.modifiers.find(m => m.source === '全判定テスト');
  const react = base.prepared.targets.find(t => t.title === 'リアクション：回避判定');
  const general = base.prepared.targets.find(t => t.title === '判定：回避判定');
  assert.ok(mod && react && general);
  const choices = [react, general].map(t => ({
    target: targetKey(t), modifier: modifierKey(mod, base.prepared.modifiers),
    checked: true, toggle: true,
  }));
  const state = { version: 1, choices, flags: [{key: mod.flag, name: 'WB', actual: 'WB'}] };
  const fresh = generateSessionBase(raw, url, true, state);
  assert.match(section(fresh.fields.palette, 'リアクション'), /\{WB\}\*\(1\+2\)>=0 回避判定/);
  assert.match(section(fresh.fields.palette, '判定'), /\{WB\}\*\(1\+2\)>=\? 回避判定/);
  assert.equal(fresh.calculation.choices.filter(c => c.checked).length, 2);
  const parsed = prepareCalculationPalette(parseYtsheet(raw, url), buildPalette(parseYtsheet(raw, url), {}).text);
  const oldCompatible = parsed.targets.find(t => t.title === '判定：回避判定');
  assert.equal(oldCompatible.checkThreshold, '?');
  assert.equal(targetKey(oldCompatible), targetKey(general));
});

function oldSnapshot(edit) {
  const generated = generateSessionBase(raw, url, true);
  const old = generated.fields.palette.replaceAll('>=? ', '>=0 ')
    .replace(':HP=40\n:MP=50\n:フェイト=5\n', '');
  const base = { ...generated.fields, palette: old };
  return {
    key: generated.key, name: raw.characterName, url,
    savedAt: '2026-09-28T12:00:00.000Z', useFormula: true,
    generatorVersion: '2026-09-reactions-sl-bulk-1', raw: structuredClone(raw),
    calculation: generated.calculation, base, working: { ...base, palette: edit(old) },
  };
}

test('v1 resume keeps exact manual text, and explicit update merges new generated commands', () => {
  const saved = oldSnapshot(text => text + '\n独自の末尾コマンド');
  const opened = parseSaveFile(JSON.stringify(fileFor(saved))).current;
  assert.equal(opened.working.palette, saved.working.palette);
  const update = planSessionUpdate(opened, structuredClone(raw));
  assert.deepEqual(update.conflicts, []);
  assert.match(section(update.next.working.palette, '判定'), />=\? 【筋力】判定/);
  assert.match(section(update.next.working.palette, 'シナリオ終了時リセット'), /^:HP=40\n:MP=50\n:フェイト=5/m);
  assert.ok(update.next.working.palette.endsWith('独自の末尾コマンド'));
  assert.equal(update.next.calculation.version, 1);
});

test('manually edited checks are preserved and raise a conflict instead of being overwritten', () => {
  const saved = oldSnapshot(text => text.replace('D+{筋力判定}>=0 【筋力】判定',
    'D+{筋力判定}>=12 【筋力】判定'));
  const update = planSessionUpdate(saved, structuredClone(raw));
  assert.ok(update.conflicts.some(c => c.field.includes('チャットパレット')));
  assert.match(update.next.working.palette, /D\+\{筋力判定\}>=12 【筋力】判定/);
  assert.match(section(update.next.working.palette, 'シナリオ終了時リセット'), /^:HP=40$/m);
});
