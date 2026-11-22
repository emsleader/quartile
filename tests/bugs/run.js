// Runs every regression test for the reported bug items (tests/bugs/bug-NN-*.test.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter(f => /^bug-\d\d-.*\.test\.js$/.test(f)).sort();
for (const f of files) await import(pathToFileURL(path.join(dir, f)).href);
console.log(`Bug regression tests: ${files.length} files passed.`);
