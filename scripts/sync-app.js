#!/usr/bin/env node
// Copies core/core.js and core/stats.js into the single-file web app (app/index.html), replacing the embedded copies.
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(__dirname, "..");
const file = process.argv[2] || path.join(R, "app", "index.html");
let html = fs.readFileSync(file, "utf8");
for (const [name, src] of [["Core", "core.js"], ["Stats", "stats.js"]]) {
  const body = fs.readFileSync(path.join(R, "core", src), "utf8").replace(/\nexport default \w+;\s*$/, "\n").trim();
  const start = html.indexOf(`const ${name} = (() => {`); if (start < 0) throw new Error(name + " not found");
  const end = html.indexOf("\n})();", start) + "\n})();".length;
  html = html.slice(0, start) + body.slice(body.indexOf(`const ${name} = (() => {`)) + html.slice(end);
}
// the version shown in the app is the package version
const version = JSON.parse(fs.readFileSync(path.join(R, "package.json"), "utf8")).version;
html = html.replace(/(<span class="tag">)v[\d.]+(<\/span>)/, `$1v${version}$2`).replace(/Quartile v[\d.]+ ·/, `Quartile v${version} ·`);
fs.writeFileSync(file, html); console.log("synced", file);
