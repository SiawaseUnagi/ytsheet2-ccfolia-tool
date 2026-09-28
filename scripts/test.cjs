const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const out = require("../tests/compile.cjs")();
const tests = fs
  .readdirSync(path.join(root, "tests"))
  .filter((name) => name.endsWith(".test.cjs"))
  .sort();
const result = spawnSync(
  process.execPath,
  ["--test", ...tests.map((name) => path.join(root, "tests", name))],
  {
    cwd: root,
    env: { ...process.env, YTSHEET_TEST_BUILD: out },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
