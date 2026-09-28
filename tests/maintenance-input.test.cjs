const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = require("./compile.cjs")();
const load = (p) => require(path.join(out, p + ".js"));
const { safeNumber, numericValue } = load("utils/safeNumber"),
  { normalizeText } = load("utils/normalizeText");
const { parseYtsheet } = load("ytsheet/parseYtsheet"),
  { SheetGenerator } = load("output/generator");
const { splitRow, parseParamsText } = load("editor/rows"),
  { validateEditor } = load("editor/validation");
const { skillToLines } = load("palette/buildSkillCommands"),
  { detectUsageLimit } = load("palette/detectUsageLimit");
const { buildStatusPlan } = load("resources/statusPlan"),
  { resourceCommands } = load("palette/skillResources");
const { buildPalette } = load("palette/buildPalette"),
  { prepareCalculationPalette } = load("calculation/palette");
const { targetKey, modifierKey, emptyCalculationState } = load("calculation/sessionState");
const { planSessionUpdate } = load("session/generation"),
  { fileFor, parseSaveFile } = load("session/model");
const { characterJson } = load("ccfolia/serialization");
const url = "https://yutorize.work/ytsheet/ar2e/?id=maintenance-input";
const skill = (name, effect, extra = {}) => ({
  name,
  effect,
  timing: "メジャー",
  lv: 1,
  judge: "自動成功",
  target: "自身",
  range: "―",
  cost: "0",
  usage: "―",
  ...extra,
});
const raw = (extra = {}) => ({
  id: "maintenance-input",
  sheetURL: url,
  characterName: "検証用",
  level: "5",
  hpTotal: "40",
  mpTotal: "30",
  fateTotal: "5",
  skill: [],
  ...extra,
});
const output = (extra) => new SheetGenerator(raw(extra), url).newOutput(true);
for (const [input, value] of [
  ["1,500", 1500],
  ["１，５００", 1500],
  ["－３", -3],
  ["0", 0],
  ["-0.5", -0.5],
])
  test("complete numeric " + input, () => assert.equal(numericValue(input), value));
for (const input of ["3D", "12foo", "1,23", "1+2", "", "Infinity"])
  test("ambiguous numeric " + input, () => assert.equal(safeNumber(input, 99), 99));
test("division is not an editor field separator", () => {
  assert.deepEqual(splitRow("半分 {武器攻撃力}/2"), ["半分", "{武器攻撃力}/2"]);
  assert.deepEqual(splitRow("半分={武器攻撃力}/2"), ["半分", "{武器攻撃力}/2"]);
  assert.deepEqual(splitRow("HPP / 2 / 0"), ["HPP", "2", "0"]);
  const fields = {
    statusEdit: "HP 10 10",
    paramsEdit: "武器攻撃力 12\n半分 {武器攻撃力}/2",
    palette: "C({半分})",
  };
  assert.equal(validateEditor(fields).length, 0);
  const cc = JSON.parse(characterJson({ ...fields, metadata: '{"kind":"character","data":{}}' }));
  assert.equal(cc.data.params[1].value, "{武器攻撃力}/2");
});
test("HTML entities decode once as text, never interpreted as markup", () => {
  assert.equal(normalizeText("A&amp;B &lt;x&gt; &#x26;"), "A&B <x> &");
  assert.equal(normalizeText("&amp;amp;"), "&amp;");
  const result = output({
    characterName: "A&amp;B",
    skill: [skill("技&amp;術", '&lt;img onerror="boom"&gt;')],
    armamentOtherName: "札&amp;紙",
    armamentOtherNote: "パッシブ。&lt;説明&gt;",
  });
  assert.equal(JSON.parse(result.fields.metadata).data.name, "A&B");
  assert.match(result.fields.palette, /《技&術》/);
  assert.match(result.fields.palette, /<img onerror="boom">/);
  assert.match(result.fields.palette, /札&紙。パッシブ。<説明>/);
});
for (const [input, count] of [
  ["EXHPポーション*2", 2],
  ["EXHPP*2", 2],
  ["┗EXHPポーション*2@[0]\nEXHPポーション*3@[3]", 5],
])
  test("one count per consumable occurrence " + input, () =>
    assert.match(
      output({ items: input }).fields.statusEdit,
      new RegExp("EXHPP\\t" + count + "\\t0"),
    ),
  );
for (const [usage, max] of [
  ["シーン１回", 1],
  ["シナリオ［ＳＬ］回", 3],
  ["シーン［ＳＬ＋２］回", 5],
])
  test("fullwidth limits " + usage, () => {
    const s = parseYtsheet(raw({ skill: [skill("回数", "", { lv: 3, usage })] }), url).skills[0];
    assert.equal(detectUsageLimit(s).max, max);
  });
test("usage count and boolean flag never share a status", () => {
  const data = raw({
    skill: [
      skill("持続技", "あらゆる判定に+1Dする。この効果はシーン終了まで持続する。", {
        usage: "シナリオ２回",
      }),
    ],
  });
  const generator = new SheetGenerator(data, url),
    result = generator.newOutput(true);
  assert.match(result.fields.statusEdit, /持続技\t2\t2/);
  assert.match(result.fields.statusEdit, /持続技_補正\t0\t0/);
  assert.match(result.fields.palette, /:持続技_補正=1/);
  assert.match(result.fields.palette, /:持続技-1/);
  assert.ok(!result.fields.palette.includes(":持続技=1"));
  const old = {
    key: generator.key,
    name: generator.sheet.name,
    url,
    useFormula: true,
    raw: data,
    calculation: result.calculation,
    base: result.fields,
    working: {
      ...result.fields,
      statusEdit: result.fields.statusEdit.replace("持続技\t2\t2", "持続技\t0\t2"),
    },
    savedAt: new Date().toISOString(),
  };
  const next = planSessionUpdate(old, data);
  assert.match(next.next.working.statusEdit, /持続技\t2\t2/);
  assert.match(next.next.working.statusEdit, /持続技_補正\t0\t0/);
});
for (const effect of [
  "フェイトを消費せずに使用できる。",
  "フェイトを1点消費しない。",
  "フェイトを1点消費する必要はない。",
])
  test("negative consumption " + effect, () => {
    const s = parseYtsheet(raw({ skill: [skill("節約", effect)] }), url).skills[0];
    assert.ok(!resourceCommands(s).some((c) => c.startsWith(":フェイト")));
  });
test("explicit consumption and grouped gold numbers", () => {
  const s = parseYtsheet(
    raw({
      skill: [skill("使用", "【HP】を３点消費。所持金を1,500G消費する。フェイトを2点消費する。")],
    }),
    url,
  ).skills[0];
  assert.deepEqual(resourceCommands(s), [":フェイト-2", ":HP-3", ":所持金-1500"]);
  assert.match(
    output({ money: "1,500", skill: [skill("使用", "所持金を1,000G消費する。")] }).fields
      .statusEdit,
    /所持金\t1500\t0/,
  );
});
test("native structure and legacy text serialize the same output", () => {
  const data = raw({
    skill: [
      skill("治療", "対象の【HP】を[3D+CL*3]点回復する。", {
        judge: "魔術判定",
        cost: "6",
        target: "単体",
      }),
      skill(
        "援護",
        "《治療》を同時に使用する。この効果により、《治療》がイニシアチブプロセスで使用可能となる。",
        { timing: "イニシアチブ" },
      ),
      skill("判定技", "判定する。", { judge: "器用" }),
    ],
  });
  const sheet = parseYtsheet(data, url),
    built = buildPalette(sheet, {}),
    native = prepareCalculationPalette(sheet, built),
    legacy = prepareCalculationPalette(sheet, built.text);
  assert.equal(native.text, legacy.text);
  assert.deepEqual(native.targets.map(targetKey), legacy.targets.map(targetKey));
});
test("native effect insertion does not depend on rendered declaration wording", () => {
  const sheet = parseYtsheet(
      raw({ skill: [skill("治療", "対象の【HP】を[3D+CL*3]点回復する。", { judge: "魔術判定" })] }),
      url,
    ),
    built = buildPalette(sheet, {});
  const row = built.document.rows.find((row) => row.declaration);
  row.text = "宣言の表示を変更しました。";
  const result = prepareCalculationPalette(sheet, built);
  assert.match(result.text, /宣言の表示を変更しました。\n.*魔術判定\n\(3\)D\+\{CL\}\*3 HP回復量/);
});
test("context owns source copy and repeated render is deterministic", () => {
  const data = raw(),
    generator = new SheetGenerator(data, url),
    first = generator.newOutput(true);
  data.hpTotal = "999";
  assert.equal(generator.newOutput(true).fields.statusEdit, first.fields.statusEdit);
  assert.deepEqual(generator.render(true, first.calculation).fields, first.fields);
});
test("new output and update use identical validated input policy", () => {
  assert.throws(() => output({ hpTotal: "oops" }), /HP/);
  assert.throws(() => output({ hpTotal: "3D" }), /HP/);
});
