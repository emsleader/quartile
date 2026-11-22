// Phase 8: duplicate detection (LIB-03) on the synthetic labelled pair set; merge needs confirm: true.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "q8-dedupe-"));
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const { comparePair, findDuplicates, merge } = await import("../../core/library/dedupe.js");
const L = await import("../../core/library/index.js");

function evaluate(file) {
  const { pairs } = JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8"));
  let tp = 0, fp = 0, fn = 0, tn = 0; const errors = [];
  for (const p of pairs) { const hit = !!comparePair(p.a, p.b); if (hit && p.dup) tp++; else if (hit) { fp++; errors.push("FP " + p.why); } else if (p.dup) { fn++; errors.push("FN " + p.why); } else tn++; }
  const precision = tp / (tp + fp), recall = tp / (tp + fn);
  console.log(`phase8 dedupe ${file}: n = ${pairs.length} pairs (${tp + fn} true duplicates); precision ${precision.toFixed(3)}, recall ${recall.toFixed(3)} (tp ${tp}, fp ${fp}, fn ${fn}, tn ${tn})`);
  if (errors.length) console.log("  errors: " + [...new Set(errors)].join("; "));
  assert.ok(precision >= 0.95, file + ": duplicate precision >= 0.95");
}
evaluate("library-dedupe.json");
evaluate("library-dedupe-check.json");

// whole-list search finds the same pairs as pairwise checks for a small list
const a = { id: "A1", csl: { type: "article-journal", title: "Trade credit as a buffer in recessions", author: [{ family: "Nagy", given: "A." }], issued: { "date-parts": [[2010]] } } };
const b = { id: "A2", csl: { ...a.csl, title: "Trade credit as a bufer in recessions." } };
const c = { id: "A3", csl: { ...a.csl, title: "Trade credit as a buffer in recessions", author: [{ family: "Lee", given: "B." }] } };
const d = { id: "A4", csl: { ...a.csl, DOI: "10.1234/X" } }, e = { id: "A5", csl: { ...c.csl, DOI: "10.1234/x" } };
const found = findDuplicates([a, b, c, d, e]).map(p => [p.keep, p.other, p.reason].join(" "));
assert.ok(found.includes("A1 A2 similar_title")); assert.ok(found.includes("A4 A5 same_doi")); assert.ok(!found.some(x => x.startsWith("A1 A3") || x.startsWith("A2 A3")));

// merge: preview first, then confirm
const lib = await L.openLibrary();
const r1 = lib.add({ ...a.csl, volume: "3" }, { collection: "Paper 1", tags: ["close-idea"] });
const r2 = lib.add({ ...b.csl, page: "1-10", DOI: "10.7777/merge" }, { collection: "SLR2" });
L.recordVerification(lib, r2.id, { source: "manual", status: "verified" });
const listed = findDuplicates(lib.all()); assert.equal(listed.length, 1);
const prev = merge(lib, r1.id, r2.id); assert.equal(prev.status, "preview"); assert.equal(lib.count(), 2, "nothing changed without confirm");
assert.deepEqual(prev.would_do.fields_filled_from_removed.sort(), ["DOI", "page"]);
const done = merge(lib, r1.id, r2.id, { confirm: true }); assert.equal(done.status, "merged");
assert.equal(lib.count(), 1); const kept = lib.get(r1.id);
assert.equal(kept.csl.page, "1-10"); assert.equal(kept.doi, "10.7777/merge"); assert.equal(kept.csl.volume, "3");
assert.deepEqual(kept.collections, ["Paper 1", "SLR2"]); assert.ok(kept.tags.includes("close-idea"));
assert.equal(L.verificationLog(lib, r1.id).length, 1, "verification history moved");
console.log("phase8 dedupe: merge preview and confirm passed");
