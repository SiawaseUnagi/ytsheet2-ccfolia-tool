const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const out = require("./compile.cjs")();
const load = p => require(path.join(out, p + ".js"));
const { parseAmount } = load("calculation/expression");
const { renderRoll } = load("calculation/palette");
const { targetKey } = load("calculation/sessionState");
const { setAllCheckModes, setAllCheckChoices } = load("calculation/bulkChecks");
const { generateSessionBase } = load("session/generation");
const raw = require("./handoff-fixture.cjs");

test("fixed SL display keeps arithmetic while default parser stays folded", () => {
  assert.deepEqual(parseAmount("SL×2", 1, true), { dice: "0", fixed: "2", fixedExpression: "2*1" });
  assert.deepEqual(parseAmount("SL+2", 1, true), { dice: "0", fixed: "3", fixedExpression: "1+2" });
  assert.deepEqual(parseAmount("SL×2", 1), { dice: "0", fixed: "2" });
  assert.deepEqual(parseAmount("(SL+2)D", 1, true), { dice: "3", fixed: "0" });
});
test("rendered constant and flag formulas use the preserved SL display", () => {
  const target = { id:"t", title:"回避", kind:"check", base:{dice:"0",fixed:"10"}, suffix:"回避判定" };
  const modifier = { id:"m", source:"試験", effect:"", amount:{dice:"0",fixed:"2",fixedExpression:"2*1"}, kinds:["check"], flag:"試験", conditional:true, condition:"" };
  assert.equal(renderRoll(target, [{ modifier }]), "C(10+(2*1))>=0 回避判定");
  assert.equal(renderRoll(target, [{ modifier, flag:"F" }]), "C(10+{F}*(2*1))>=0 回避判定");
});
test("reaction section is directly below resources and contains reaction calculations", () => {
  const text = generateSessionBase(raw, raw.sheetURL, true).fields.palette;
  const resource = text.indexOf("### ■リソース操作");
  const reaction = text.indexOf("### ■リアクション");
  const precombat = text.indexOf("### ■戦闘前");
  assert.ok(resource >= 0 && resource < reaction && reaction < precombat);
  const block = text.slice(reaction, precombat);
  assert.match(block, />=0 回避判定/);
  assert.match(block, /【精神】判定（リアクション）/);
  assert.match(block, /物理ダメージ計算/);
  assert.match(block, /魔法ダメージ計算/);
  assert.match(block, /《ドッジムーブ》1/);
  assert.match(block, /《反応テスト》1/);
});
test("moved reaction checks keep the v1 saved target identity", () => {
  const common = { kind:"check", base:{dice:"0",fixed:"0"}, suffix:"回避判定" };
  assert.equal(
    targetKey({ ...common, id:"new", title:"リアクション：回避判定" }),
    targetKey({ ...common, id:"old", title:"リソース操作：回避判定" }),
  );
  const spirit = { kind:"check", base:{dice:"0",fixed:"0"}, suffix:"【精神】判定（リアクション）" };
  assert.equal(
    targetKey({ ...spirit, id:"new-spirit", title:"リアクション：【精神】判定（リアクション）" }),
    targetKey({ ...spirit, id:"old-spirit", title:"リソース操作：【精神】判定（リアクション）" }),
  );
});
function controls(checked = false) {
  let rebuilt = 0, changes = 0;
  const rebuild = () => rebuilt++, changed = () => changes++;
  return {
    counters: () => ({ rebuilt, changes }),
    controls: [false, true].map(toggle => {
      const states = [{ checked, toggle }];
      return {
        states, rebuild, changed,
        setToggle: value => states.forEach(s => s.toggle = value),
        setChecked: value => states.forEach(s => s.checked = value),
      };
    }),
  };
}
test("bulk mode editing does not select an unchecked modifier", () => {
  const g = controls(false);
  setAllCheckModes(g.controls, true);
  assert.ok(g.controls.every(c => c.states.every(s => !s.checked && s.toggle)));
  assert.deepEqual(g.counters(), { rebuilt:0, changes:1 });
});
test("bulk selection preserves the chosen mode and partial state can be normalized", () => {
  const g = controls(true);
  g.controls[1].states[0].checked = false;
  setAllCheckModes(g.controls, false);
  assert.deepEqual(g.controls.flatMap(c => c.states), [
    { checked:true, toggle:false }, { checked:false, toggle:false },
  ]);
  assert.deepEqual(g.counters(), { rebuilt:1, changes:0 });
  setAllCheckChoices(g.controls, true);
  assert.ok(g.controls.every(c => c.states.every(s => s.checked && !s.toggle)));
  assert.deepEqual(g.counters(), { rebuilt:2, changes:0 });
});
