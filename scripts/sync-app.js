#!/usr/bin/env node
// Copies core/core.js and core/stats.js into the single-file web app (app/index.html), replacing the embedded copies.
const fs = require("fs"), path = require("path"), R = path.join(__dirname, "..");
const file = process.argv[2] || path.join(R, "app", "index.html");
let html = fs.readFileSync(file, "utf8");
for (const [name, src] of [["Core", "core.js"], ["Stats", "stats.js"]]) {
  const body = fs.readFileSync(path.join(R, "core", src), "utf8").replace(/\nif \(typeof module[^\n]*\n?$/, "\n").trim();
  const start = html.indexOf(`const ${name} = (() => {`); if (start < 0) throw new Error(name + " not found");
  const end = html.indexOf("\n})();", start) + "\n})();".length;
  html = html.slice(0, start) + body + html.slice(end);
}
fs.writeFileSync(file, html); console.log("synced", file);
