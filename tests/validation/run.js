// Compares every statistics function in core/stats/ with stored R results (specification 7.3 and Part A rule 9).
// Each validation is tests/validation/<name>.json: { function, r_version, packages, cases: [{ args, expected }] },
// produced by tests/validation/<name>.R. JS must match to 6 decimal places.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
let n = 0, maxDiff = 0;
for (const f of files) {
  const v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const mod = await import(pathToFileURL(path.join(dir, "..", "..", v.module)).href);
  const fn = mod[v.function] || mod.default?.[v.function];
  if (typeof fn !== "function") throw new Error(`${f}: ${v.module} has no function ${v.function}`);
  for (const c of v.cases) {
    const got = await fn(...c.args), pick = v.pick ? got[v.pick] : got;
    const cmp = (a, b, where) => {
      if (typeof b === "number") { const d = Math.abs(a - b); maxDiff = Math.max(maxDiff, d); if (!(d < 5e-7)) throw new Error(`${f} ${where}: JS ${a} vs R ${b}`); }
      else if (typeof b === "boolean" || typeof b === "string") { if (a !== b) throw new Error(`${f} ${where}: JS ${a} vs R ${b}`); }
      else if (b && typeof b === "object") for (const k of Object.keys(b)) cmp(a?.[k], b[k], where + "." + k);
    };
    cmp(pick, c.expected, JSON.stringify(c.args)); n++;
  }
}
console.log(`Statistics vs R: ${files.length} functions, ${n} cases, max absolute difference ${maxDiff.toExponential(2)}.`);
