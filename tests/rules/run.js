// One generic test for every YAML rule (specification Section 14.3): each positive file must flag the rule and
// each negative file must not. Also checks the loader's own refusals.
import fs from "node:fs";
import assert from "node:assert/strict";
import { loadRules, checkFile } from "../../core/rules/loader.js";
import { runRules } from "../../core/rules/engine.js";
import { parseText } from "../../core/text/parse.js";

const rules = loadRules();
let n = 0;
for (const r of rules) {
  const design = r.designs[0] === "all" ? null : r.designs[0];
  for (const f of r.tests.positive) {
    const doc = parseText(fs.readFileSync(f, "utf8"), { design });
    assert.ok(runRules(doc, [r]).some(x => x.rule === r.id), `${r.id} should flag ${f}`); n++;
  }
  for (const f of r.tests.negative) {
    const doc = parseText(fs.readFileSync(f, "utf8"), { design });
    assert.ok(!runRules(doc, [r]).some(x => x.rule === r.id), `${r.id} must NOT flag ${f}`); n++;
  }
}
// loader refusals (specification 4.3)
const good = { id: "X-1", title: "Example", role: "methods", severity: "note", designs: ["all"], check: "pattern", pattern: "x", source_ref: "s", message: "m", tests: { positive: ["a"], negative: ["b"] } };
assert.equal(checkFile({ source: { id: "S", citation: "c" }, rules: [good] }).length, 0);
assert.ok(checkFile({ source: { id: "S", citation: "c" }, rules: [{ ...good, source_ref: undefined }] }).length > 0, "rule without source_ref refused");
assert.ok(checkFile({ source: { id: "S", citation: "c" }, rules: [{ ...good, tests: { positive: ["a"] } }] }).length > 0, "rule without a negative test refused");
assert.ok(checkFile({ source: { id: "S", citation: "c" }, rules: [{ ...good, pattern: "(" }] }).length > 0, "invalid regex refused");
const dir = fs.mkdtempSync("/tmp/qrb-"); fs.writeFileSync(dir + "/a.yaml", "source: {id: A, citation: c}\nrules:\n  - " + JSON.stringify(good) + "\n  - " + JSON.stringify(good) + "\n");
assert.throws(() => loadRules(dir, { useCache: false }), /duplicate rule ID/, "duplicate IDs refused");
n += 5;
console.log(`Rule tests: ${rules.length} rules, ${n} checks passed.`);
