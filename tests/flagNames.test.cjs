// node tests/flagNames.test.cjs (no extra test dependencies)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const out = mkdtempSync(path.join(tmpdir(), 'ytsheet-flag-names-'));
const args = ['src/calculation/ui.ts', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2022,DOM', '--strict', '--outDir', out];
const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
try { existsSync(tsc) ? execFileSync(process.execPath, [tsc, ...args], { cwd: root }) : execFileSync('tsc', args, { cwd: root }); }
catch (error) { rmSync(out, { recursive: true, force: true }); throw error; }
after(() => rmSync(out, { recursive: true, force: true }));
const { validateFlagName, replaceFlagReferences, replaceStatusLabel, checkFlagRename } = require(path.join(out, 'calculation/flagNames.js'));
const { renderRoll, TrackedPalette } = require(path.join(out, 'calculation/palette.js'));
const { mountCalculationEditor } = require(path.join(out, 'calculation/ui.js'));
const original = 'ウェポンバースト_補正';
const status = [{ label: 'ウェポンバースト', value: '1', max: '1' }, { label: original, value: '1', max: '0' }];
const reserved = label => ['HP', 'MP', 'CL', 'initiative', 'HPP'].includes(label);

test('short and Japanese flag names, with trimmed outer whitespace', () => {
  assert.equal(validateFlagName(' WB '), 'WB');
  assert.equal(validateFlagName('精霊の衣：火'), '精霊の衣：火');
});
for (const name of ['W B', '{WB}', 'WB=1', 'WB/1', 'WB\nHP', ':WB', '<b>WB</b>']) {
  test(`reject unsafe name: ${JSON.stringify(name)}`, () => assert.throws(() => validateFlagName(name)));
}
test('rename only the flag, retaining its value and the usage counter', () => {
  assert.equal(checkFlagRename(original, 'WB', status, [], '', reserved), 'WB');
  const text = `ウェポンバースト 1 1\n${original}\t1\t0\nHPP,2,0`;
  assert.equal(replaceStatusLabel(text, original, 'WB'), 'ウェポンバースト 1 1\nWB\t1\t0\nHPP,2,0');
  assert.equal(status[1].label, original);
});
test('exact-token substitution leaves descriptions and counters alone', () => {
  const text = `《ウェポンバースト》を使用。\n:ウェポンバースト-1\n:${original}=1\n2D+{${original}}*9+{${original}2}\n:${original}=0`;
  assert.equal(replaceFlagReferences(text, original, 'WB'), `《ウェポンバースト》を使用。\n:ウェポンバースト-1\n:WB=1\n2D+{WB}*9+{${original}2}\n:WB=0`);
});
test('reject name collisions and attempts to rename resource or counter', () => {
  for (const next of ['HP', 'initiative', 'ウェポンバースト']) assert.throws(() => checkFlagRename(original, next, status, [], '', reserved));
  assert.throws(() => checkFlagRename(original, 'WB', status, [{ label: 'WB', value: '3' }], '', reserved));
  assert.throws(() => checkFlagRename('ウェポンバースト', 'WB', status, [], '', reserved));
  assert.throws(() => checkFlagRename(original, 'WB', status, [], '//WB=2', reserved));
  assert.throws(() => checkFlagRename(original, 'WB', status, [], '2D+{WB}', reserved));
});
test('names can be chosen before a flag is created', () => {
  assert.equal(checkFlagRename(original, 'WB', [], [], ':ウェポンバースト-1', reserved), 'WB');
});
function tracked() {
  const lines = [`:${original}=1`, `2D+{${original}}*9`, '説明は残す', `3D+{${original}}*2`, `:${original}=0`];
  const text = lines.join('\n');
  return new TrackedPalette(text, [1, 3].map((i, n) => ({ id: String(n), start: text.indexOf(lines[i]), end: text.indexOf(lines[i]) + lines[i].length, expected: lines[i], edited: false })));
}
test('checkbox ownership survives renaming several formulas', () => {
  const tracker = tracked(); tracker.renameFlag(original, 'WB');
  assert.equal(tracker.replace('0', '2D+{WB}*12'), true);
  assert.equal(tracker.replace('1', '3D'), true);
  assert.match(tracker.text, /:WB=1/); assert.match(tracker.text, /説明は残す/);
  tracker.renameFlag('WB', 'WB2');
  assert.equal(tracker.replace('0', '2D'), true);
  assert.match(tracker.text, /:WB2=0/);
});
test('manual formula arithmetic is preserved during a deliberate rename', () => {
  const tracker = tracked();
  tracker.observe(tracker.text.replace(`2D+{${original}}*9`, `2D+{${original}}*9+777`));
  tracker.renameFlag(original, 'WB');
  assert.match(tracker.text, /2D\+\{WB\}\*9\+777/);
  assert.equal(tracker.replace('0', '2D'), false);
  assert.equal(tracker.replace('1', '3D+{WB}'), true);
});

// Minimal DOM adapter: exercises the real UI event handlers without a browser dependency.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this.open = false; this.value = ''; this.textContent = ''; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  removeEventListener(name) { delete this.listeners[name]; }
}
const walk = (element, test) => [element, ...element.children.flatMap(child => walk(child, test))].filter(test);
function mount() {
  const prior = global.document; global.document = { createElement: tag => new Element(tag) };
  const targets = ['a', 'b'].map(id => ({ id, title: id, kind: 'damage', attack: 'weapon', base: { dice: '2', fixed: '4' }, suffix: '物理ダメージ' }));
  const text = targets.map(t => renderRoll(t)).join('\n');
  const ranges = targets.map((t, i) => ({ id: t.id, start: i * (renderRoll(t).length + 1), end: i * (renderRoll(t).length + 1) + renderRoll(t).length, expected: renderRoll(t), edited: false }));
  const modifier = { id: 'm', source: 'ウェポンバースト', level: 3, effect: 'テスト用の補正', amount: { dice: '0', fixed: '9' }, kinds: ['damage'], flag: original, conditional: true, condition: '' };
  const prepared = { text, targets, ranges, modifiers: [modifier], reviews: [] };
  const host = new Element('section'), palette = new Element('textarea'); palette.value = text;
  let statuses = [{ label: 'ウェポンバースト', value: '1', max: '1' }];
  const dispose = mountCalculationEditor(host, prepared, palette, {
    ensureFlag: name => { if (!statuses.some(s => s.label === name)) statuses.push({ label: name, value: '0', max: '0' }); return name; },
    renameFlag: (from, next) => {
      const name = checkFlagRename(from, next, statuses, [], palette.value, reserved);
      statuses = statuses.map(s => s.label === from ? { ...s, label: name } : s);
      palette.value = replaceFlagReferences(palette.value, from, name);
      return name;
    }, changed: () => {},
  });
  const boxes = walk(host, e => e.type === 'checkbox');
  const inputs = walk(host, e => e.type === 'text');
  const buttons = walk(host, e => e.textContent === '名前を適用');
  return { host, palette, boxes, inputs, buttons, statuses: () => statuses, dispose: () => { dispose(); global.document = prior; } };
}
test('UI is collapsed by default; a shared alias updates both formulas and inputs', () => {
  const ui = mount();
  try {
    assert.ok(walk(ui.host, e => e.dataset.flagEditor).every(e => !e.open));
    for (const checkbox of ui.boxes) { checkbox.checked = true; checkbox.onchange(); }
    ui.inputs[0].value = 'WB'; ui.buttons[0].onclick();
    assert.equal((ui.palette.value.match(/\{WB\}/g) || []).length, 2);
    assert.ok(ui.inputs.every(i => i.value === 'WB'));
    assert.deepEqual(ui.statuses().map(s => s.label), ['ウェポンバースト', 'WB']);
    ui.boxes[0].checked = false; ui.boxes[0].onchange();
    assert.equal((ui.palette.value.match(/\{WB\}/g) || []).length, 1);
    assert.equal(ui.statuses()[0].value, '1');
    ui.inputs[1].value = ''; ui.buttons[1].onclick();
    assert.ok(ui.palette.value.includes(`{${original}}`));
  } finally { ui.dispose(); }
});
test('invalid UI rename does not change either formula or status', () => {
  const ui = mount();
  try {
    ui.boxes[0].checked = true; ui.boxes[0].onchange();
    const before = ui.palette.value, statuses = JSON.stringify(ui.statuses());
    ui.inputs[0].value = 'HP'; ui.buttons[0].onclick();
    assert.equal(ui.palette.value, before); assert.equal(JSON.stringify(ui.statuses()), statuses);
    assert.ok(walk(ui.host, e => e.textContent.includes('別の項目で使われています')).length);
  } finally { ui.dispose(); }
});
test('choosing an alias before selecting creates only the short-name status', () => {
  const ui = mount();
  try {
    ui.inputs[0].value = 'WB'; ui.buttons[0].onclick();
    assert.equal(ui.statuses().length, 1);
    ui.boxes[0].checked = true; ui.boxes[0].onchange();
    assert.deepEqual(ui.statuses().map(s => s.label), ['ウェポンバースト', 'WB']);
  } finally { ui.dispose(); }
});
