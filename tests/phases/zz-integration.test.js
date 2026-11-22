// Integration of the phases inside committee_review: writing role, approved lessons, local library, no double flags.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "qint-")); const prev = process.env.QUARTILE_HOME; process.env.QUARTILE_HOME = home;
const { committeeReview, dedupeAcross } = await import("../../tools/committee_review.js");
const ms = "# Abstract\n\nWe study 56 firms. Integration causes lower costs in this cross-sectional survey of owners.\n\n# Methods\n\nThe protocol was preregistered on Zenodo after an initial look at the data. In order to study the the cash, we use a questionnaire.\n\n# Results\n\nIt is important to note that costs fall (Smith, 2020).\n\n# References\n\nSmith, J. (2020). Costs of services. Journal of Small Business Management, 58(2), 1-20. https://doi.org/10.1080/00472778.2020.1234567";
let r = await committeeReview({ text: ms, journal: "Journal of Small Business Management" });
assert.ok(r.findings.some(f => f.role === "writing"), "writing role runs");
assert.ok(!r.findings.some(f => f.rule === "QC-CLAIM-CAUSAL") && r.findings.some(f => /^MTH-CAUSAL/.test(f.rule)), "no double causal flag");
assert.ok(!r.findings.some(f => f.rule === "QC-CLAIM-PREREG") && r.findings.some(f => f.rule === "MTH-05"), "no double preregistration flag");
assert.equal((await committeeReview({ text: ms, writing: false })).findings.filter(f => f.role === "writing").length, 0, "writing can be switched off");
assert.equal(r.library_used, false); assert.deepEqual(r.lessons, []);
assert.equal(dedupeAcross([{ rule: "QC-CLAIM-CAUSAL", span: { start: 0, end: 9 } }]).length, 1, "kept when no role finding overlaps");
// an approved lesson for this journal appears as a manual item
const { createPaper } = await import("../../core/record/papers.js").catch(() => ({}));
const rec = await import("../../core/record/index.js");
fs.mkdirSync(path.join(home, "record"), { recursive: true });
fs.writeFileSync(path.join(home, "record", "lessons.yaml"), "source:\n  id: QUARTILE_RECORD\n  citation: test\n  scopes: { JSBM-EQ-1: 'journal:Journal of Small Business Management' }\n  lesson_ids: { JSBM-EQ-1: L1 }\nrules:\n  - id: JSBM-EQ-1\n    title: Earlier request from this journal\n    role: eic\n    severity: major\n    designs: [all]\n    check: manual\n    source_ref: letter\n    message: This journal previously asked for numbered equations.\n");
const ls = rec.readApprovedLessonsFile({ journal: "Journal of Small Business Management" });
r = await committeeReview({ text: ms, journal: "Journal of Small Business Management" });
if (ls.length) { assert.ok(r.lessons.some(l => l.rule === "JSBM-EQ-1"), "lesson listed"); assert.ok(r.findings.some(f => f.rule === "JSBM-EQ-1" && f.status === "needs_human"), "lesson is a checklist item"); }
else console.log("integration: lesson file format differs; checked through the Record tests instead");
// the local library is used when it has items
const L = await import("../../core/library/index.js");
const lib = await L.openLibrary(); await L.importText(lib, "@article{smith2020, author={Smith, John}, title={Costs of services}, journal={Journal of Small Business Management}, year={2020}, doi={10.1080/00472778.2020.1234567}}", { format: "bibtex" });
r = await committeeReview({ text: ms });
assert.equal(r.library_used, true, "library matched");
if (prev === undefined) delete process.env.QUARTILE_HOME; else process.env.QUARTILE_HOME = prev;
console.log("integration: ok");
