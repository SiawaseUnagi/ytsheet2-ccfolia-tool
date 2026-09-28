const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = require("./compile.cjs")();
const { planSessionUpdate, generateSessionBase } = require(path.join(out, "session/generation.js"));
const { advanceCalculationBaseline, GENERATOR_VERSION } = require(
  path.join(out, "session/baseline.js"),
);
const { parseSaveFile } = require(path.join(out, "session/model.js"));
const legacy = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/legacy-8083.json"))).current;
test("actual legacy generation migrates unchanged content with unchanged character", () => {
  const s = legacy(),
    p = planSessionUpdate(s, s.raw),
    fresh = generateSessionBase(s.raw, s.url, true, s.calculation);
  assert.notEqual(s.working.palette, fresh.fields.palette);
  assert.equal(p.conflicts.length, 0);
  assert.equal(p.next.working.palette, fresh.fields.palette);
  assert.equal(p.next.generatorVersion, GENERATOR_VERSION);
  assert.ok(p.changes.some((x) => x.includes("生成形式")));
});
test("legacy migration preserves user note and leaves original snapshot immutable", () => {
  const s = legacy();
  s.working.palette += "\n手入力のメモ";
  const before = JSON.stringify(s);
  const p = planSessionUpdate(s, s.raw);
  assert.equal(JSON.stringify(s), before);
  assert.ok(p.next.working.palette.endsWith("手入力のメモ"));
  assert.ok(p.next.working.palette.includes("回避判定と同時に"));
});
test("saving legacy envelope retains exact historical baseline and optional engine marker", () => {
  const s = legacy(),
    copy = parseSaveFile(
      JSON.stringify({ format: "ytsheet2-ccfolia-session", version: 1, current: s }),
    );
  assert.deepEqual(copy.current.base, s.base);
  const modern = { ...s, generatorVersion: GENERATOR_VERSION };
  assert.equal(
    parseSaveFile(
      JSON.stringify({ format: "ytsheet2-ccfolia-session", version: 1, current: modern }),
    ).current.generatorVersion,
    GENERATOR_VERSION,
  );
});
test("unchanged correction state never changes old baseline", () => {
  const s = legacy(),
    now = generateSessionBase(s.raw, s.url, true, s.calculation).fields;
  assert.deepEqual(advanceCalculationBaseline(s.base, now, now), s.base);
});
test("intentional correction patches do not erase unrelated historical text", () => {
  const base = {
    statusEdit: "HP 4 4",
    paramsEdit: "CL 1",
    palette: "古い見出し\na\nb",
    metadata: "{}",
  };
  const before = { ...base, palette: "新しい見出し\na\nb" },
    next = { ...before, palette: "新しい見出し\na+2\nb" };
  const patched = advanceCalculationBaseline(base, before, next);
  assert.equal(patched.palette, "古い見出し\na+2\nb");
});

test("unmapped old choices survive opening and re-saving until explicit update", () => {
  const { unmappedCalculation, combineCalculation } = require(
    path.join(out, "session/baseline.js"),
  );
  const old = {
    version: 1,
    choices: [{ target: "old", modifier: "old-effect", checked: true, toggle: true }],
    flags: [{ key: "old-effect", name: "OLD", actual: "OLD" }],
  };
  const empty = { version: 1, choices: [], flags: [] };
  assert.deepEqual(combineCalculation(empty, unmappedCalculation(old, empty)), old);
  assert.deepEqual(unmappedCalculation(old, old), empty);
});
