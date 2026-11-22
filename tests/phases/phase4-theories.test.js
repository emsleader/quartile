// Phase 4: theory dictionary (data/theories.yaml) and matcher.
import assert from "node:assert/strict";
import fs from "node:fs";
import L from "../../core/lib.js";
import { loadTheories, findTheories } from "../../core/theories.js";

const T = loadTheories();
assert.ok(T.length >= 150, `at least 150 theories (${T.length})`);
assert.equal(new Set(T.map(t => t.id)).size, T.length, "unique ids");
for (const t of T) {
  const r = t.reference;
  assert.ok(t.name && r && r.authors && r.year && r.title && r.venue, `${t.id}: name and full reference`);
  assert.equal(r.verified, false, `${t.id}: references are unverified until the owner checks them`);
  if (r.doi) assert.match(r.doi, /^10\.\d{4,9}\//, `${t.id}: DOI form`);
}
// every term of the older THEORIES list in core/core.js is covered, and that list still works
const src = fs.readFileSync(new URL("../../core/core.js", import.meta.url), "utf8");
const old = JSON.parse(src.match(/const THEORIES = (\[[^\]]+\])/)[1]);
assert.ok(old.length >= 50);
for (const term of old) assert.ok(findTheories(`We draw on ${term} here.`).length, `core term covered: ${term}`);
const d0 = L.parse("Introduction\n\nWe use agency theory to explain borrowing.");
assert.ok(L.Core.bizChecks(d0.paras, d0.sections).theories.includes("agency theory"), "core THEORIES unchanged");
// matching
assert.deepEqual(findTheories("The resource-based view (RBV) applies.").map(m => m.id), ["resource-based-view", "resource-based-view"]);
assert.equal(findTheories("Real options matter.")[0].id, "real-options");
assert.equal(findTheories("the rbv").length, 0, "acronyms are case-sensitive");
assert.equal(findTheories("Porter's five forces").length >= 1, true);
assert.equal(findTheories("The agenda was set.").length, 0);
console.log("phase4 theories: ok");
