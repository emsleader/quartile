// Runs every phase test file (tests/phases/*.test.js). Each phase branch adds its own files here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter(f => f.endsWith(".test.js")).sort();
for (const f of files) { await import(pathToFileURL(path.join(dir, f)).href); }
console.log(`Phase tests: ${files.length} files passed.`);
