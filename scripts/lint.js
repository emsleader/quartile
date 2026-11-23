// Syntax check of every JavaScript file (node --check). No style rules: the code base has none yet.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const dirs = ["core", "core/text", "core/rules", "core/rules/tests", "core/roles", "core/report", "core/stats", "core/store", "core/style", "core/library", "core/record", "tests/phases", "tests/file_check", "core/library", "core/record", "mcp", "tools", "scripts", "tests", "tests/rules", "tests/bugs", "tests/gold", "tests/validation"];
let n = 0;
for (const d of dirs) { if (!fs.existsSync(d)) continue; for (const f of fs.readdirSync(d)) if (f.endsWith(".js")) { execFileSync(process.execPath, ["--check", path.join(d, f)]); n++; } }
console.log(`lint: ${n} files parse.`);
