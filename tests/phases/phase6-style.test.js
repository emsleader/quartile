// Phase 6: STY code checks (core/style/checks.js). Each check has a positive and a negative case; the tool
// style_check returns the same findings plus the writing-role YAML rules.
import assert from "node:assert/strict";
import { parseText } from "../../core/text/parse.js";
import { run, checkText, meta } from "../../core/style/checks.js";
import tool from "../../tools/style_check.js";

const doc = t => parseText(t);
const has = async (t, id) => (await checkText(t)).filter(f => f.rule === id);
const sec = (h, body) => `# ${h}\n\n${body}`;

// every code check documented in rulebook/style.yaml has a test in this file
const M = meta();
const tested = ["STY-PASSIVE-01", "STY-READ-01", "STY-SIMPLE-01", "STY-WORDY-01", "STY-CLICHE-01", "STY-WEASEL-01", "STY-ILLUSION-01", "STY-SO-01"];
assert.deepEqual(Object.keys(M).sort(), [...tested].sort(), "style.yaml code_checks and this test list agree");
for (const [id, m] of Object.entries(M)) {
  assert.match(id, /^STY-/);
  assert.ok(["minor", "note"].includes(m.severity), `${id}: severity minor at most`);
  assert.ok(["medium", "low"].includes(m.confidence), `${id}: confidence medium or low`);
  assert.ok(m.source_ref && m.message && m.fix, `${id}: source_ref, message and fix`);
  assert.ok((m.tests || []).includes("tests/phases/phase6-style.test.js"), `${id}: test file named`);
}
assert.equal(M["STY-PASSIVE-01"].severity, "note"); assert.equal(M["STY-READ-01"].severity, "note");

// STY-PASSIVE-01
const PAS = "The sample was drawn from a national register. Firms were contacted by telephone. Answers were recorded by trained staff. Missing values were imputed by the survey office. Weights were provided by the statistical office. Loan rejections were reported by the owners. Delays were observed for young firms. Leasing was chosen by some firms. A smaller effect was found for older firms. The register was updated in 2021.";
const ACT = "We drew the sample from a national register. Staff phoned each firm. Trained staff recorded the answers. The survey office imputed missing values. The statistical office provided weights. Owners reported loan rejections. Young firms showed longer delays. Some firms chose leasing. Older firms show a smaller effect. The office updated the register in 2021.";
{ const f = await has(sec("Discussion", PAS), "STY-PASSIVE-01");
  assert.equal(f.length, 1, "passive section flagged once"); assert.equal(f[0].severity, "note"); assert.equal(f[0].detail.passive, 10); }
assert.equal((await has(sec("Discussion", ACT), "STY-PASSIVE-01")).length, 0, "active section not flagged");
assert.equal((await has(sec("Methods", PAS), "STY-PASSIVE-01")).length, 0, "passive methods section not flagged");
assert.equal((await has(sec("Discussion", PAS.split(". ").slice(0, 6).join(". ")), "STY-PASSIVE-01")).length, 0, "fewer than 8 sentences: not measured");

// STY-READ-01
const HARD = "The heterogeneity of institutional quality across jurisdictions, documented extensively in comparative political economy, interacts with the maturity structure of outstanding liabilities in ways that existing theoretical frameworks of corporate financial intermediation have not fully incorporated.";
const EASY = "Firms with a rejected loan wait longer to buy new machines. Young firms wait the longest.";
{ const f = await has(sec("Discussion", HARD + " " + EASY), "STY-READ-01");
  assert.equal(f.length, 1); assert.equal(f[0].detail.count, 1); assert.equal(f[0].span.text, HARD); }
assert.equal((await has(sec("Discussion", EASY), "STY-READ-01")).length, 0);

// STY-SIMPLE-01 (allow list only) and STY-WORDY-01 (word lists); one phrase is never flagged twice
{ const f = await checkText(sec("Introduction", "We utilize survey data. Firms grow."));
  const s = f.filter(x => x.rule === "STY-SIMPLE-01"); assert.equal(s.length, 1); assert.equal(s[0].span.text, "utilize"); assert.match(s[0].fix, /'use'/); }
assert.equal((await has(sec("Introduction", "We use survey data and estimate the effect of credit on investment. However, the parameters differ."), "STY-SIMPLE-01")).length, 0, "research words outside the allow list are not flagged");
{ const t = sec("Introduction", "In order to test this, we use a number of firms.");
  const f = await checkText(t), w = f.filter(x => x.rule === "STY-WORDY-01");
  assert.deepEqual(w.map(x => x.span.text), ["In order to", "a number of"]);
  assert.equal(f.filter(x => x.rule === "STY-SIMPLE-01").length, 0, "retext-simplify hit on the same phrase dropped");
  const d = doc(t); for (const x of w) assert.equal(d.text.slice(x.span.start, x.span.end), x.span.text, "span offsets point into doc.text"); }
assert.equal((await has(sec("Introduction", "To test this, we use several firms."), "STY-WORDY-01")).length, 0);

// STY-CLICHE-01
assert.equal((await has(sec("Discussion", "The survey is the acid test of the model."), "STY-CLICHE-01")).length, 1);
assert.equal((await has(sec("Discussion", "The survey is a strict test of the model."), "STY-CLICHE-01")).length, 0);

// STY-WEASEL-01: skipped next to a test statistic
assert.equal((await has(sec("Results", "The effect is very large."), "STY-WEASEL-01")).length, 1);
assert.equal((await has(sec("Results", "The effect is large."), "STY-WEASEL-01")).length, 0);
assert.equal((await has(sec("Results", "The effect is clearly positive (t = 4.1, p < .01)."), "STY-WEASEL-01")).length, 0);

// STY-ILLUSION-01
{ const f = await has(sec("Results", "We find the the effect in all countries."), "STY-ILLUSION-01"); assert.equal(f.length, 1); assert.equal(f[0].span.text, "the the"); }
assert.equal((await has(sec("Results", "We find the effect in all countries."), "STY-ILLUSION-01")).length, 0);
assert.equal((await has(sec("Results", "We argue that that result is robust."), "STY-ILLUSION-01")).length, 0, "'that that' is allowed");

// STY-SO-01
assert.equal((await has(sec("Discussion", "So we test the model again."), "STY-SO-01")).length, 1);
assert.equal((await has(sec("Discussion", "So far, few studies test the model."), "STY-SO-01")).length, 0, "'So far' is allowed");
assert.equal((await has(sec("Discussion", "We therefore test the model again."), "STY-SO-01")).length, 0);

// references, declarations and headings are never checked
assert.equal((await checkText("# References\n\nSmith, J. (2020). A very, very clearly utilize the the study. Journal 1, 1-2.")).length, 0);

// every finding: full shape, role writing, severity at most minor
const all = await run(doc(sec("Discussion", PAS) + "\n\n" + sec("Conclusion", "So we utilize the the data in order to test a very bold idea at the acid test. " + HARD)));
assert.ok(all.length >= 6);
for (const f of all) {
  for (const k of ["rule", "role", "title", "severity", "confidence", "source", "source_ref", "message", "fix", "span", "detail"]) assert.ok(k in f, `${f.rule}: has ${k}`);
  assert.equal(f.role, "writing"); assert.ok(["minor", "note"].includes(f.severity)); assert.ok(["medium", "low"].includes(f.confidence));
  assert.equal(f.source, "STYLE"); assert.ok(!/\{\w+\}/.test(f.message), `${f.rule}: message placeholders filled`);
}

// tool style_check: code checks plus writing-role YAML rules
assert.equal(tool.name, "style_check");
{ const r = await tool.handler({ text: "# Abstract\n\nWe study firms. There are many service firms that replace equipment late. So we test it." });
  assert.equal(r.kind, "style"); assert.ok(r.byRule["STY-THEREIS-01"] === 1 && r.byRule["STY-SO-01"] === 1);
  assert.ok(r.findings.some(f => f.rule === "Q1C-MOVE-01" && f.status === "needs_human"), "manual corpus item listed as checklist");
  assert.ok(r.findings.every(f => f.role === "writing")); }
console.log("phase6-style: ok");
