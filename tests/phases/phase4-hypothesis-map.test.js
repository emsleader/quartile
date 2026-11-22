// Phase 4: hypothesis_map tool, and precision/recall of the business and production roles on the Phase 4 gold cases.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import tool, { LABEL } from "../../tools/hypothesis_map.js";
import { CASES, HELDOUT, build } from "../gold/phase4-build.js";
import { parseText } from "../../core/text/parse.js";
import { loadRules } from "../../core/rules/loader.js";
import { runRules } from "../../core/rules/engine.js";
import business from "../../core/roles/business.js";
import production from "../../core/roles/production.js";

assert.equal(tool.name, "hypothesis_map");
z.object(tool.inputSchema).parse({ text: "x" });
const text = CASES.find(c => c.id === "phase4-issues-regression-a").text;
const out = await tool.handler({ text });
assert.equal(out.label, LABEL); assert.match(out.label, /^Simulated pre-submission review/);
assert.deepEqual(out.hypotheses.map(h => [h.label, h.basis, h.verdict]), [["H1", "cited finding", "supported"], ["H2", "none", "supported"], ["H3", "none", "not found"]]);
assert.deepEqual(out.summary, { total: 3, supported: 2, not_supported: 0, mixed: 0, not_found: 1, without_basis: 2 });
for (const h of out.hypotheses) assert.equal(h.span.text.startsWith(h.label), true);
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qh-")), "m.txt");
fs.writeFileSync(f, CASES.find(c => c.id === "phase4-clean-regression").text);
const o2 = await tool.handler({ path: f });
assert.deepEqual(o2.hypotheses.map(h => [h.label, h.verdict, h.theories.length > 0]), [["H1", "supported", true], ["H2", "not supported", true]]);
assert.equal((await tool.handler({ text: "No hypotheses here." })).summary.total, 0);
await assert.rejects(() => tool.handler({}), /text or as a path/);

// gold cases: business and production findings only (other roles are measured by their own phases)
const committed = fs.readdirSync(new URL("../gold/cases/", import.meta.url)).filter(x => x.startsWith("phase4-"));
assert.equal(committed.length, CASES.length + HELDOUT.length, "gold files are rebuilt from phase4-build.js");
const rules = loadRules().filter(r => ["business", "production"].includes(r.role));
const T = {};
for (const c of [...CASES, ...HELDOUT].map(build)) {
  const doc = parseText(c.text, { design: c.design });
  const found = [...runRules(doc, rules), ...(await business.run(doc)), ...(await production.run(doc))];
  const used = new Set();
  for (const e of c.expected) {
    const i = found.findIndex((x, k) => !used.has(k) && x.rule === e.rule && (e.start == null || (x.span && x.span.start < e.end && e.start < x.span.end)));
    const role = e.rule.startsWith("BUS") ? "business" : "production";
    (T[role] ||= { tp: 0, fp: 0, fn: 0 });
    if (i >= 0) { used.add(i); T[role].tp++; } else T[role].fn++;
  }
  found.forEach((x, k) => { if (!used.has(k)) (T[x.role] ||= { tp: 0, fp: 0, fn: 0 }).fp++; });
}
for (const [role, v] of Object.entries(T)) {
  const p = v.tp / (v.tp + v.fp), r = v.tp / (v.tp + v.fn);
  assert.ok(v.tp + v.fp >= 5 && p >= 0.85, `${role}: precision ${p} (n = ${v.tp + v.fp})`);
  console.log(`phase4 gold ${role}: precision ${p.toFixed(2)} (n flags = ${v.tp + v.fp}), recall ${r.toFixed(2)} (n issues = ${v.tp + v.fn})`);
}
console.log("phase4 hypothesis map: ok");
