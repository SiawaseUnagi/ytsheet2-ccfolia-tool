// One verified TypeScript build per suite. Running a test file directly also works.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
let cached;
module.exports = function compileTests() {
  if (process.env.YTSHEET_TEST_BUILD) return process.env.YTSHEET_TEST_BUILD;
  if (cached) return cached;
  const root = path.resolve(__dirname, "..");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ytsheet-tests-"));
  try {
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules/typescript/bin/tsc"),
        "--project",
        path.join(root, "tsconfig.json"),
        "--noEmit",
        "false",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--outDir",
        out,
      ],
      { cwd: root, stdio: "inherit" },
    );
  } catch (error) {
    fs.rmSync(out, { recursive: true, force: true });
    throw error;
  }
  process.once("exit", () => fs.rmSync(out, { recursive: true, force: true }));
  cached = out;
  return out;
};
