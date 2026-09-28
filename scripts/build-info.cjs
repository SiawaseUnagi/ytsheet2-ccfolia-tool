// Public build identity only; no character or editor data is sent to the server.
const fs = require("node:fs");
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync(
  "public/build-info.json",
  JSON.stringify({ commit: process.env.GITHUB_SHA || "development" }) + "\n",
);
