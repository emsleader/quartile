// Phase 8: our own APA 7 formatter against 50 hand-written reference strings (tests/fixtures/apa7-50.json).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const { formatReference, bibliography } = await import("../../core/library/apa7.js");
const { cases } = JSON.parse(fs.readFileSync(path.join(FIX, "apa7-50.json"), "utf8"));
assert.equal(cases.length, 50);
const bad = cases.filter(c => formatReference(c.csl) !== c.expected);
for (const c of bad) console.error(`APA 7 mismatch (${c.rule}):\n  got      ${formatReference(c.csl)}\n  expected ${c.expected}`);
assert.equal(bad.length, 0, "APA 7 output identical to the hand-written references");
// html and text forms
assert.equal(formatReference(cases[0].csl, { format: "text" }), cases[0].expected.replace(/\*/g, ""));
assert.ok(formatReference(cases[0].csl, { format: "html" }).includes("<i>Small Business Economics</i>"));
// reference list order and year suffixes (APA 7, 9.44-9.47)
const p = (f, g) => ({ family: f, given: g });
const list = bibliography([
  { id: "3", type: "book", author: [p("Lee", "Ann")], title: "Zeta", issued: { "date-parts": [[2020]] }, publisher: "P" },
  { id: "1", type: "book", author: [p("Lee", "Ann"), p("Kim", "Su")], title: "Alpha", issued: { "date-parts": [[2015]] }, publisher: "P" },
  { id: "2", type: "book", author: [p("Lee", "Ann")], title: "Beta", issued: { "date-parts": [[2020]] }, publisher: "P" },
  { id: "4", type: "book", author: [p("Lee", "Ann")], title: "Early", publisher: "P" },
  { id: "5", type: "book", author: [p("Ábel", "Ann")], title: "A", issued: { "date-parts": [[2001]] }, publisher: "P" },
]);
assert.deepEqual(list.map(r => r.id), ["5", "4", "2", "3", "1"], "alphabetical; one-author before multi-author; n.d. first; same year by title");
assert.equal(list[2].reference, "Lee, A. (2020a). *Beta*. P."); assert.equal(list[3].reference, "Lee, A. (2020b). *Zeta*. P.");
console.log(`phase8 APA 7: ${cases.length} of 50 hand-written references identical; ordering and year suffixes passed`);
