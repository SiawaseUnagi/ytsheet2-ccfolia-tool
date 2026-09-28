const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
for (const name of fs
  .readdirSync(path.join(root, "tests"))
  .filter((name) => name.endsWith(".browser.cjs"))
  .sort()) {
  console.log("Browser regression:", name);
  const result = spawnSync(process.execPath, [path.join(root, "tests", name)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
