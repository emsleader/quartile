// Phase 7: committee report, rendering and the feedback loop (specification Sections 13 and 14.4).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
process.env.QUARTILE_HOME = fs.mkdtempSync(os.tmpdir() + "/q7c-");
const { committeeReport, light, LABEL, ROLES, quartileVersion } = await import("../../core/report/committee.js");
const { renderJSON, renderMarkdown, renderHTML, renderDocx } = await import("../../core/report/render.js");
const FB = await import("../../core/report/feedback.js");
const { zipText } = await import("./phase7-zip.js");

const F = (role, severity, o = {}) => ({ rule: o.rule || `${role.toUpperCase()}-T-${severity}`, role, title: `Test ${severity}`, severity, confidence: o.confidence || "high",
  source: "TEST", source_ref: "test", message: "msg", fix: "fix it", span: o.span ?? { section: "results", start: 10, end: 20, text: "sample span" }, detail: null, ...(o.status ? { status: o.status } : {}) });

// lights
assert.equal(light([]), "green");
assert.equal(light([F("eic", "minor"), F("eic", "note")]), "green");
assert.equal(light([F("eic", "major")]), "amber");
assert.equal(light([F("eic", "major"), F("eic", "major")]), "amber");
assert.equal(light([F("eic", "major"), F("eic", "major"), F("eic", "major")]), "red", "3 majors -> red");
assert.equal(light([F("eic", "blocker")]), "red");

// empty findings: every role green, ready to submit, label, header
const empty = committeeReport([], { primary: "regression", declared: false }, { feedback: false, title: "T", journal: "J", date: "2026-11-22" });
assert.equal(empty.label, LABEL);
assert.equal(empty.label, "Simulated pre-submission review — not a journal decision");
assert.equal(empty.overall, "ready to submit"); assert.equal(empty.readiness, 100);
assert.deepEqual(empty.roles.map(r => r.role), ROLES);
assert.ok(empty.roles.every(r => r.light === "green" && r.icon && r.word));
assert.deepEqual(empty.header, { title: "T", design: "regression", design_source: "detected", journal: "J", date: "2026-11-22", quartile_version: quartileVersion() });
assert.equal(quartileVersion(), JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url))).version);

// mixed findings
const fs1 = [F("methods", "blocker"), F("finance", "major"), F("finance", "minor"), F("eic", "major", { confidence: "low" }),
  F("production", "note", { rule: "PRD-M", status: "needs_human", span: null }), F("writing", "major", { rule: "WR-1" }), { rule: "X", severity: "weird", message: "m" }];
const r1 = committeeReport(fs1, { primary: "bounds", declared: true }, { feedback: false });
assert.equal(r1.header.design_source, "declared");
assert.equal(r1.overall, "not ready");
const role = k => r1.roles.find(r => r.role === k);
assert.equal(role("methods").light, "red"); assert.equal(role("methods").blockers, 1);
assert.equal(role("finance").light, "amber"); assert.equal(role("finance").majors, 1); assert.equal(role("finance").top3.length, 2);
assert.equal(role("eic").light, "amber", "low confidence still colours the light");
assert.equal(role("production").light, "green"); assert.equal(r1.needsHuman.length, 1);
assert.equal(r1.readiness, 100 - 25 - 8 - 2 - 8, "low-confidence major not penalised; writing major counted");
assert.deepEqual(r1.other_roles.map(r => r.role), ["other", "writing"]);
assert.equal(r1.findings.find(f => f.rule === "X").severity, "note", "unknown severity normalised");
assert.ok(r1.findings.every(f => ["rule", "role", "title", "severity", "confidence", "source", "source_ref", "message", "fix", "span", "detail"].every(k => k in f)));
assert.equal(r1.findings[0].severity, "blocker", "details sorted by severity");
const r2 = committeeReport([F("ethics", "major"), F("writing", "blocker", { rule: "WR-B" })], "survey", { feedback: false });
assert.equal(r2.overall, "revise first", "other roles do not set the overall state"); assert.equal(r2.header.design, "survey");
assert.equal(committeeReport(Array.from({ length: 6 }, () => F("eic", "blocker")), "x", { feedback: false }).readiness, 0, "readiness floor 0");

// feedback loop: > 3 confirmed false positives -> note, until reset
const rule = "METHODS-T-major";
for (let i = 0; i < 3; i++) FB.recordFeedback({ rule, verdict: "false_positive", span: { start: i, end: i + 5 } });
FB.recordFeedback({ rule, verdict: "false_positive", span: { start: 0, end: 5 } }); // same flag twice counts once
assert.equal(FB.ruleStats()[rule].false_positives, 3); assert.equal(FB.downgradedRules().size, 0);
const before = committeeReport([F("methods", "major")], "regression");
assert.equal(before.roles.find(r => r.role === "methods").light, "amber");
FB.recordFeedback({ rule, verdict: "false_positive", span: { start: 50, end: 60 }, note: "not causal wording" });
FB.recordFeedback({ rule, verdict: "true_positive", span: { start: 70, end: 80 } });
const st = FB.ruleStats()[rule];
assert.equal(st.false_positives, 4); assert.equal(st.true_positives, 1); assert.equal(st.precision, 0.2); assert.ok(st.downgraded);
const after = committeeReport([F("methods", "major")], "regression");
assert.equal(after.roles.find(r => r.role === "methods").light, "green");
assert.equal(after.findings[0].severity, "note"); assert.equal(after.findings[0].downgraded.from, "major");
assert.deepEqual(after.downgraded.map(d => d.rule), [rule]); assert.equal(after.overall, "ready to submit");
fs.appendFileSync(FB.feedbackPath(), "not json\n");
assert.equal(FB.readFeedback().skipped, 1, "broken lines are skipped");
FB.recordFeedback({ rule, verdict: "reset", note: "pattern fixed" });
assert.equal(FB.ruleStats()[rule].false_positives, 0); assert.equal(FB.ruleStats()[rule].total.false_positive, 5);
assert.equal(committeeReport([F("methods", "major")], "regression").findings[0].severity, "major", "reset restores severity");
assert.throws(() => FB.recordFeedback({ rule, verdict: "maybe" }), /verdict/);
assert.throws(() => FB.recordFeedback({ verdict: "reset" }), /rule/);
const line = JSON.parse(fs.readFileSync(FB.feedbackPath(), "utf8").trim().split("\n")[0]);
assert.deepEqual(Object.keys(line).sort(), ["at", "note", "rule", "span", "verdict"]);

// rendering
const rep = committeeReport(fs1, { primary: "regression", declared: false }, { feedback: false, title: "Cash & growth <test>", journal: "Small Business Economics" });
assert.deepEqual(JSON.parse(renderJSON(rep)).overall, "not ready");
const md = renderMarkdown(rep);
assert.match(md, /Simulated pre-submission review — not a journal decision/);
assert.match(md, /✖ Red/); assert.match(md, /▲ Amber/); assert.match(md, /✔ Green/);
assert.ok(md.indexOf("## Roles") < md.indexOf("## Human checklist") && md.indexOf("## Human checklist") < md.indexOf("## Details"), "one page, then details");
assert.match(md, /Quartile version: \d+\.\d+\.\d+/); assert.match(md, /Target journal: Small Business Economics/);
const html = renderHTML(rep);
assert.match(html, /h1,h2,h3\{color:#000\}/, "black headings");
assert.match(html, /Cash &amp; growth &lt;test&gt;/, "escaped");
for (const w of ["Red", "Amber", "Green"]) assert.ok(new RegExp(`aria-hidden="true">[✖▲✔]</span> ${w}`).test(html), `icon and word for ${w}`);
assert.ok(!/#(ff0000|00ff00|008000)/i.test(html), "no red/green pair outside the colour-blind-safe palette");
for (const out of [md, html]) assert.ok(!/\b(accept(ed|ance)?|reject(ed|ion)?)\b/i.test(out), "no acceptance or rejection wording");
const docx = await renderDocx(rep);
assert.equal(docx.subarray(0, 2).toString(), "PK");
const xml = zipText(docx, "word/document.xml");
for (const n of ["Editor-in-chief", "Methods reviewer", "Finance and statistics reviewer", "Business-administration committee", "Production editor", "Ethics and data office"]) assert.ok(xml.includes(n), `role row ${n} in document.xml`);
assert.ok(xml.includes("✖ Red") && xml.includes("✔ Green"), "lights with icon and word in DOCX");
assert.ok(xml.includes("Simulated pre-submission review — not a journal decision"));
assert.ok(xml.includes('w:type="page"'), "page break after page one");
const styles = zipText(docx, "word/styles.xml");
assert.ok(/w:styleId="Heading1"[\s\S]*?w:color w:val="000000"/.test(styles), "black heading style");
console.log("phase7-committee: ok");
