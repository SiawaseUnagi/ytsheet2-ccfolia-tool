const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const out = require("./compile.cjs")();
const load = (p) => require(path.join(out, p + ".js"));
const { parseAmount } = load("calculation/expression");
const { parseYtsheet } = load("ytsheet/parseYtsheet");
const { buildPalette } = load("palette/buildPalette");
const { prepareCalculationPalette, renderRoll } = load("calculation/palette");
const { analyzeModifiers } = load("calculation/analysis");
const { targetKey, modifierKey, emptyCalculationState } = load("calculation/sessionState");
const { setAllCheckModes } = load("calculation/bulkChecks");
const { generateSessionBase, planSessionUpdate } = load("session/generation");
const url = "https://yutorize.work/ytsheet/ar2e/?id=reaction-test";
const skill = (name, effect, timing = "パッシブ", lv = 1, judge = "自動成功") => ({
  name,
  effect,
  timing,
  lv,
  judge,
  cost: "0",
  usage: "―",
  target: "自身",
  range: "―",
});
const raw = (extra = {}) => ({
  id: "reaction-test",
  sheetURL: url,
  characterName: "配置テスト",
  level: "3",
  hpTotal: "30",
  mpTotal: "40",
  fateTotal: "5",
  skill: [],
  ...extra,
});
const section = (text, name) => text.split(`### ■${name}\n`)[1]?.split("### ■")[0] ?? "";
const make = (extra) => parseYtsheet(raw(extra), url);
const sample = [
  skill(
    "ドッジムーブ",
    "回避判定と同時に使用する。その回避判定の達成値に+[SL+2]する。",
    "効果参照",
    2,
  ),
  skill("反応の技", "その攻撃を回避する。", "リアクション"),
];
test("one reaction heading directly follows resources and owns checks/calculations/skills", () => {
  const p = buildPalette(make({ skill: sample }), {});
  assert.deepEqual(p.text.match(/^### ■.+$/gm).slice(0, 3), [
    "### ■リソース操作",
    "### ■リアクション",
    "### ■戦闘前",
  ]);
  assert.equal(p.text.match(/^### ■リアクション$/gm).length, 1);
  const r = section(p.text, "リソース操作"),
    rx = section(p.text, "リアクション");
  assert.ok(r.includes(":initiative=\n//ダメージ属性=物理"));
  assert.ok(r.includes("2D　ドロップ品"));
  assert.ok(!r.includes("回避判定"));
  assert.ok(!r.includes("ダメージ計算"));
  assert.match(rx, />=0 回避判定\n回避判定と同時に《ドッジムーブ》2を使用。/);
  assert.ok(rx.includes("【精神】判定（リアクション）"));
  assert.ok(rx.includes("c(-{物理防御力})"));
  assert.ok(rx.includes("c(-{魔法防御力})"));
  assert.ok(rx.indexOf("《反応の技》") > rx.indexOf("魔法ダメージ計算"));
  assert.ok(section(p.text, "判定").includes("ドッジムーブ"));
  for (const row of p.document.rows.filter((r) => r.check && r.section === "リアクション"))
    assert.ok(row.check);
});
test("reaction consumable remains present after common roll block", () => {
  const p = buildPalette(make({ items: "|反応薬|2|リアクション。消耗品。|説明|@[2]|" }), {}).text;
  assert.match(
    section(p, "リアクション"),
    /魔法ダメージ計算\n\nリアクションで反応薬を使用。消耗品。/,
  );
});
for (const [input, level, expanded, fixed] of [
  ["[SL×2]", 1, "1*2", "2"],
  ["[SL+2]", 1, "1+2", "3"],
  ["[SL×3]", 4, "4*3", "12"],
  ["[(SL+2)*3]", 1, "(1+2)*3", "9"],
  ["[3*(SL+2)]", 1, "3*(1+2)", "9"],
  ["[SL-2]", 3, "3-2", "1"],
  ["[10-(SL+2)]", 1, "10-(1+2)", "7"],
  ["[SL*2+SL]", 2, "2*2+2", "6"],
  ["[SL*1]", 3, "3*1", "3"],
  ["[SL+0]", 3, "3", "3"],
])
  test("SL arithmetic retains numeric provenance: " + input, () => {
    assert.equal(parseAmount(input, level).fixed, fixed);
    const p = parseAmount(input, level, true);
    assert.equal(p.fixed, expanded);
    assert.equal(parseAmount(p.fixed, level).fixed, fixed);
  });
test("dice rolls stay compact and unsupported expressions stay rejected", () => {
  assert.deepEqual(parseAmount("[(SL*2)D]", 3, true), { dice: "6", fixed: "0" });
  assert.deepEqual(parseAmount("3D+SL*2", 3, true), { dice: "3", fixed: "3*2" });
  for (const value of ["alert(1)", "SL/2", "1000001*SL", "(SL+1)D*2"])
    assert.equal(parseAmount(value, 2, true), null);
});
for (const scope of ["回避判定の達成値", "武器攻撃のダメージ"])
  test("fixed bonus renders formula, not folded total: " + scope, () => {
    const s = make({ skill: [skill("内訳", scope + "に+[SL×2]する。", "パッシブ", 1)] });
    const m = analyzeModifiers(s).modifiers[0];
    assert.equal(m.amount.fixed, "2");
    assert.equal(m.fixedExpression, "1*2");
    const t = {
      id: "t",
      title: "t",
      kind: scope.includes("判定") ? "check" : "damage",
      base: { dice: "2", fixed: "{器用}" },
      suffix: "テスト",
    };
    assert.ok(renderRoll(t, [{ modifier: m, flag: "F" }]).includes("+{F}*(1*2)"));
    assert.ok(renderRoll(t, [{ modifier: m }]).includes("+(1*2)"));
    const old = { ...m };
    delete old.fixedExpression;
    assert.equal(modifierKey(old, [old]), modifierKey(m, [m]));
  });
test("non-SL ability and healing/dice bonus formats remain unchanged", () => {
  const s = make({
    skill: [
      skill("スマッシュ", "白兵攻撃のダメージに+【筋力】する。", "マイナー"),
      skill("治療補助", "HP回復の効果に+[SL*3]する。", "パッシブ", 3),
    ],
  });
  const a = analyzeModifiers(s);
  assert.equal(a.modifiers.find((m) => m.source === "治療補助").fixedExpression, undefined);
  const m = a.modifiers.find((m) => m.source === "スマッシュ");
  assert.ok(
    renderRoll(
      { id: "w", title: "w", kind: "damage", base: { dice: "2", fixed: "1" }, suffix: "ダメージ" },
      [{ modifier: m, flag: "S" }],
    ).includes("+{S}*{筋力}"),
  );
});
test("old resource-check keys still select the moved reaction checks", () => {
  const r = raw({ skill: [skill("全判定補助", "あらゆる判定に+1Dする。", "メジャー")] }),
    g = generateSessionBase(r, url, true);
  const m = g.prepared.modifiers[0],
    state = emptyCalculationState();
  const targets = g.prepared.targets.filter((t) => t.title.startsWith("リアクション："));
  assert.equal(targets.length, 2);
  for (const t of targets) {
    const old = { ...t, title: t.title.replace("リアクション：", "リソース操作：") };
    assert.equal(targetKey(t), targetKey(old));
    state.choices.push({
      target: targetKey(old),
      modifier: modifierKey(m, g.prepared.modifiers),
      checked: true,
      toggle: true,
    });
  }
  state.flags.push({ key: m.flag, name: "ALL", actual: "ALL" });
  const next = generateSessionBase(r, url, true, state);
  assert.equal(next.calculation.choices.length, 2);
  assert.ok(section(next.fields.palette, "リアクション").includes("{ALL}"));
  assert.ok(!section(next.fields.palette, "判定").includes("{ALL}"));
});
test("bulk mode changes do not alter individual selections or affect unrelated controls", () => {
  const states = [
    { checked: true, toggle: false },
    { checked: false, toggle: false },
  ];
  let calls = 0;
  const rebuild = () => calls++;
  const controls = states.map((state) => ({
    states: [state],
    setMode: (toggle) => (state.toggle = toggle),
    rebuild,
  }));
  setAllCheckModes(controls, true);
  assert.deepEqual(
    states.map((s) => s.checked),
    [true, false],
  );
  assert.ok(states.every((s) => s.toggle));
  assert.equal(calls, 1);
  setAllCheckModes(controls, false);
  assert.ok(states.every((s) => !s.toggle));
});
test("level change updates expanded SL arithmetic and preserves handmade text", () => {
  const r = raw({ skill: [skill("内訳", "武器攻撃のダメージに+[SL+2]する。", "パッシブ", 1)] });
  const base = generateSessionBase(r, url, true),
    m = base.prepared.modifiers[0],
    t = base.prepared.targets.find((t) => t.id === "weapon-damage");
  const state = {
    version: 1,
    flags: [{ key: m.flag, name: "F", actual: "F" }],
    choices: [
      {
        target: targetKey(t),
        modifier: modifierKey(m, base.prepared.modifiers),
        checked: true,
        toggle: true,
      },
    ],
  };
  const initial = generateSessionBase(r, url, true, state);
  const old = {
    key: initial.key,
    name: "配置テスト",
    url,
    savedAt: new Date().toISOString(),
    raw: r,
    useFormula: true,
    calculation: state,
    base: initial.fields,
    working: { ...initial.fields, palette: initial.fields.palette + "\n手入力の宣言" },
  };
  const nr = structuredClone(r);
  nr.skill[0].lv = 2;
  const plan = planSessionUpdate(old, nr);
  assert.equal(plan.conflicts.length, 0);
  assert.ok(plan.next.working.palette.includes("{F}*(2+2)"));
  assert.ok(plan.next.working.palette.endsWith("手入力の宣言"));
});
