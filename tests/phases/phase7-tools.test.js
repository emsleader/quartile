// Phase 7: the four tools end to end (committee_review, response_tracker, rulebook_status, rule_feedback).
// Acceptance: committee_review on 5 synthetic gold papers, each in under 60 seconds, without GROBID; JSON and DOCX.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.env.QUARTILE_HOME = fs.mkdtempSync(os.tmpdir() + "/q7t-");
delete process.env.QUARTILE_GROBID_URL;
const here = path.dirname(fileURLToPath(import.meta.url));
const { TOOLS } = await import("../../tools/index.js");
const tool = n => TOOLS.find(t => t.name === n);
const { zipText } = await import("./phase7-zip.js");
const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
for (const n of ["committee_review", "response_tracker", "rulebook_status", "rule_feedback"]) {
  const t = tool(n); assert.ok(t && t.description && t.inputSchema && typeof t.handler === "function", n);
}
const cr = tool("committee_review");

// five synthetic papers (plus any open gold cases present after the phase branches are merged)
const fx = path.join(here, "fixtures", "phase7");
const goldDir = path.join(here, "..", "gold", "cases");
const cases = [...fs.readdirSync(fx).map(f => path.join(fx, f)), ...(fs.existsSync(goldDir) ? fs.readdirSync(goldDir).filter(f => f.endsWith(".json")).map(f => path.join(goldDir, f)) : [])]
  .filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(f, "utf8"))).filter(c => c.text);
assert.ok(cases.filter(c => c.id.startsWith("phase7-")).length === 5, "five synthetic papers");
for (const c of cases) {
  const t0 = Date.now();
  const out = await cr.handler({ text: c.text, design: c.design, journal: "Small Business Economics", docx: true });
  const ms = Date.now() - t0;
  assert.ok(ms < 60000, `${c.id}: ${ms} ms`);
  assert.equal(out.label, "Simulated pre-submission review — not a journal decision");
  if (c.design) { assert.equal(out.header.design, c.design); assert.equal(out.header.design_source, "declared"); } else assert.notEqual(out.header.design_source, "declared"); // gold cases from other phases may not declare a design
  assert.equal(out.roles.length, 6); assert.ok(["ready to submit", "revise first", "not ready"].includes(out.overall));
  const json = JSON.parse(JSON.stringify(out)); assert.equal(json.readiness, out.readiness);
  assert.match(out.markdown, /## Roles/);
  const xml = zipText(Buffer.from(out.docx_base64, "base64"), "word/document.xml");
  for (const r of out.roles) assert.ok(xml.includes(r.name), `${c.id}: role row ${r.name}`);
  if (c.id.startsWith("phase7-")) for (const e of c.expected) assert.ok(out.findings.some(f => (f.rule === e.rule || (e.rule === "QC-CLAIM-CAUSAL" && /^MTH-CAUSAL-/.test(f.rule))) && f.span && f.span.start < e.end && e.start < f.span.end), `${c.id}: ${e.rule} found`);
}
// detection when no design is declared; title in the header
const reg = cases.find(c => c.id === "phase7-regression");
const det = await cr.handler({ text: reg.text });
// after the merge the methods role flags causal wording itself (MTH-CAUSAL-*), which supersedes QC-CLAIM-CAUSAL
const CAUSAL_ID = det.findings.find(f => /CAUSAL/.test(f.rule)).rule;
assert.equal(det.header.design_source, "detected"); assert.equal(det.header.design, "regression");
assert.equal(det.header.title, "Cash holdings and growth in European service SMEs");
assert.equal(det.docx_base64, undefined, "no DOCX unless asked");
assert.equal(det.roles.find(r => r.role === "methods").light, "amber", "causal wording is a major methods finding");
// roles filter
const onlyEic = await cr.handler({ text: reg.text, roles: ["eic"] });
assert.ok(onlyEic.findings.every(f => f.role === "eic")); assert.deepEqual(onlyEic.roles_run, ["eic"]);
// path input: .txt and .docx (mammoth), no GROBID
const tmp = fs.mkdtempSync(os.tmpdir() + "/q7p-");
fs.writeFileSync(path.join(tmp, "paper.txt"), reg.text);
assert.equal((await cr.handler({ path: path.join(tmp, "paper.txt") })).header.design, "regression");
const paras = reg.text.split(/\n+/).map(t => /^(\d\.\s|Abstract$|References$)/.test(t) ? new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 }) : new Paragraph({ text: t }));
fs.writeFileSync(path.join(tmp, "paper.docx"), await Packer.toBuffer(new Document({ sections: [{ children: paras }] })));
const fromDocx = await cr.handler({ path: path.join(tmp, "paper.docx"), design: "regression" });
assert.ok(fromDocx.findings.some(f => /CAUSAL/.test(f.rule)), "DOCX path works");
await assert.rejects(cr.handler({}), /text.*path/);

// rule_feedback -> downgrade in committee_review -> reset
const fb = tool("rule_feedback");
const causal = det.findings.find(f => f.rule === CAUSAL_ID);
let res;
for (let i = 0; i < 4; i++) res = await fb.handler({ rule: CAUSAL_ID, verdict: "false_positive", span: { ...causal.span, start: causal.span.start + i } });
assert.equal(res.rule.false_positives, 4); assert.ok(res.rule.downgraded); assert.ok(fs.existsSync(res.file));
const down = await cr.handler({ text: reg.text });
assert.equal(down.findings.find(f => f.rule === CAUSAL_ID).severity, "note");
// after the merge the methods role has its own findings, so only check that the downgraded rule no longer counts as major
assert.ok(!down.findings.some(f => f.rule === CAUSAL_ID && f.severity !== "note"));
const rs = await tool("rulebook_status").handler({ run_tests: true });
assert.ok(rs.rules >= 8 && rs.sources.some(s => s.source === "QUARTILE_CORE"));
assert.equal(rs.coverage.share, 1); assert.deepEqual(rs.coverage.tests_fail, []);
assert.deepEqual(rs.downgraded.map(d => d.rule), [CAUSAL_ID]);
assert.equal(rs.feedback.precision.find(p => p.rule === CAUSAL_ID).precision, 0);
await fb.handler({ rule: CAUSAL_ID, verdict: "reset", note: "owner reset" });
assert.equal((await cr.handler({ text: reg.text })).findings.find(f => f.rule === CAUSAL_ID).severity, "major");
assert.deepEqual((await tool("rulebook_status").handler({})).downgraded, []);

// response_tracker: refuses export with open comments, exports when all are set
const rt = tool("response_tracker");
const OLD = reg.text, NEW = reg.text.replace("Cash holdings cause higher sales growth in this cross-sectional sample.", "Cash holdings are associated with higher sales growth in this cross-sectional sample.");
const letter = "Reviewer 1\n1. The results use causal wording (cause) for a cross-sectional sample.\n2. Please add a robustness check with alternative growth measures.";
const refused = await rt.handler({ letter, old_text: OLD, new_text: NEW, export: "docx" });
assert.equal(refused.refused, true); assert.equal(refused.docx_base64, undefined); assert.deepEqual(refused.open, ["R1.1", "R1.2"]);
assert.equal(refused.rows[0].location.section, "results");
const ok = await rt.handler({ letter, old_text: OLD, new_text: NEW, statuses: { "R1.1": "addressed", "R1.2": "declined: no alternative growth measure exists in the data" }, export: "docx" });
assert.equal(ok.exported, "docx");
assert.ok(zipText(Buffer.from(ok.docx_base64, "base64"), "word/document.xml").includes("R1.1: The results use causal wording"));
const okMd = await rt.handler({ letter, old_text: OLD, new_text: NEW, statuses: { "R1.1": "addressed", "R1.2": "partly" }, export: "markdown" });
assert.match(okMd.markdown, /results, paragraph 1/);
console.log("phase7-tools: ok");
