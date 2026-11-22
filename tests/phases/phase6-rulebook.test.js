// Phase 6: writing rulebook files. The seven priority-source files are documented and empty (no book was
// supplied); the loader accepts every file; no rule is attributed to a book; Q1 corpus limits match the profile.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadRules, checkFile, rulebookSummary, RULEBOOK, ROOT } from "../../core/rules/loader.js";
import { evaluate } from "../../core/rules/structural.js";
import { limitOf } from "../../core/rules/tests/phase6.js";
import { parseText } from "../../core/text/parse.js";

const BOOKS = {
  "belcher_2019.yaml": ["BELCHER2019", 30, "library"], "huff_1999.yaml": ["HUFF1999", 25, "library"],
  "thomson_2013.yaml": ["THOMSON2013", 25, "library"], "booth_2016.yaml": ["BOOTH2016", 30, "library"],
  "mccloskey_2019.yaml": ["MCCLOSKEY2019", 20, "library"], "cochrane.yaml": ["COCHRANE", 20, "free"],
  "williams.yaml": ["WILLIAMS", 20, "library"],
};
for (const [f, [id, n, access]] of Object.entries(BOOKS)) {
  const obj = YAML.parse(fs.readFileSync(path.join(RULEBOOK, f), "utf8"));
  assert.deepEqual(checkFile(obj, f), [], `${f} is valid`);
  assert.equal(obj.source.id, id); assert.ok(obj.source.citation.length > 10);
  assert.equal(obj.source.licence_note, "Rules paraphrased; no text reproduced");
  assert.equal(obj.source.access, access); assert.equal(obj.source.target_rules, n);
  assert.equal(obj.source.extraction_status, "awaiting owner");
  assert.deepEqual(obj.rules, [], `${f}: no rule until a person has read the source`);
}
const target = Object.values(BOOKS).reduce((a, [, n]) => a + n, 0);
assert.equal(target, 170, "book targets add up to 170 (specification Section 12)");

// the loader accepts every file, including the new ones
const rules = loadRules(RULEBOOK, { useCache: false });
const summary = rulebookSummary();
for (const f of [...Object.keys(BOOKS), "style.yaml", "q1corpus.yaml"]) assert.ok(summary.some(s => s.file === f), `${f} listed by rulebookSummary`);
// no rule is attributed to a book that was not supplied
const bookIds = new Set(Object.values(BOOKS).map(([id]) => id));
assert.equal(rules.filter(r => bookIds.has(r.source_id)).length, 0);
for (const r of rules.filter(r => ["style.yaml", "q1corpus.yaml"].includes(r.file))) {
  assert.ok(!/belcher|huff|thomson|kamler|booth|colomb|mccloskey|cochrane|bizup|williams/i.test(r.source_ref + " " + r.message + " " + (r.fix || "")), `${r.id}: no book named`);
  assert.equal(r.role, "writing"); assert.ok(["minor", "note"].includes(r.severity)); assert.ok(r.check === "manual" || ["medium", "low"].includes(r.confidence));
}
// every writing-role YAML rule has its test folder with a positive and two negatives
for (const r of rules.filter(r => r.role === "writing" && r.check !== "manual")) {
  assert.ok(r.tests.positive.length >= 1 && r.tests.negative.length >= 2, `${r.id}: pos and two negatives`);
  for (const t of [...r.tests.positive, ...r.tests.negative]) assert.ok(fs.existsSync(t), `${t} exists`);
}

// Q1 corpus limits are the Tukey fences of data/style-profile.json
const prof = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "style-profile.json"), "utf8")).overall.metrics;
const fence = m => +(prof[m].p75 + 1.5 * (prof[m].p75 - prof[m].p25)).toFixed(3);
for (const m of ["words", "meanSentence", "longSentenceShare", "passiveShare"]) assert.equal(limitOf(m), fence(m));
assert.equal(limitOf("words"), 315); assert.equal(limitOf("meanSentence"), 39.7); assert.equal(limitOf("passiveShare"), 0.625);
assert.equal(limitOf("meanSentence", "p75"), 28.6);
assert.throws(() => limitOf("nonsense"));
// structural test: not applicable without the section, or with too few sentences
assert.equal(evaluate("profile_metric_at_most(abstract, words, fence)", parseText("# Introduction\n\nWe study firms.")).ok, true);
{ const r = evaluate("profile_metric_at_most(abstract, meanSentence, fence)", parseText("# Abstract\n\nWe study firms. They grow."));
  assert.equal(r.ok, true); assert.equal(r.detail.applicable, false); }
{ const r = evaluate("profile_metric_at_most(abstract, meanSentence, fence)", parseText(fs.readFileSync(path.join(ROOT, "tests/rules/Q1C-SENT-01/pos_1.txt"), "utf8")));
  assert.equal(r.ok, false); assert.ok(r.detail.value > r.detail.limit); assert.equal(r.detail.profile_n, 501); assert.ok(r.anchor && r.anchor.section === "abstract"); }

// the contributing guide exists and its worked example uses a clearly fictional source
const guide = fs.readFileSync(path.join(ROOT, "docs", "CONTRIBUTING_RULES.md"), "utf8");
assert.match(guide, /fictional/i); assert.match(guide, /node tests\/rules\/run\.js/);
console.log("phase6-rulebook: ok");
