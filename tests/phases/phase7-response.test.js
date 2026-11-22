// Phase 7: response-to-reviewers manager (specification Section 11).
import assert from "node:assert/strict";
import R from "../../core/roles/response.js";
import { zipText } from "./phase7-zip.js";

const ids = l => R.splitComments(l).map(c => c.id);
// the specification's own format
assert.deepEqual(ids("Reviewer 1:\n1. The sample section does not explain firm selection.\n2. The response rate is missing from the methods."), ["R1.1", "R1.2"]);
// Reviewer headers, numbered lists, Comment N:, R1.3, a continuation line, salutation and closing
const L1 = `Dear Dr. Author,

Reviewer 1

1. The sample section does not explain how firms were selected from the register.
2) The authors should report the response rate and compare respondents with non-respondents.
   This matters for non-response bias.

Reviewer 2:
Comment 1: The literature review misses recent work on financial flexibility in SMEs.
Comment 2: Table 3 lacks standard errors for the main coefficients.

R3.1 The conclusion overstates causal claims given the cross-sectional design.
R3.2 - Please add a limitations section discussing measurement error in leverage.

Sincerely,
The editor`;
const c1 = R.splitComments(L1);
assert.deepEqual(c1.map(c => c.id), ["R1.1", "R1.2", "R2.1", "R2.2", "R3.1", "R3.2"]);
assert.match(c1[1].text, /non-response bias/, "continuation line kept with its comment");
assert.ok(!c1.some(c => /Sincerely|Dear/.test(c.text)));
assert.equal(c1[4].reviewer, "3");
assert.deepEqual(ids("(1) The theory section needs a clearer statement of hypotheses.\n(2) Results for H2 are not discussed in the discussion section."), ["C1", "C2"]);
assert.deepEqual(ids("Point 1. The abstract does not give the sample period at all.\nPoint 2. Keywords repeat the words of the title exactly."), ["C1", "C2"]);
assert.deepEqual(ids("Reviewer #1: The abstract should state the sample size and the period.\nReferee 2\n1.2. Sub point about the liquidity measure used in the models."), ["R1.1", "R2.1.2"]);
assert.deepEqual(ids("Reviewer 1\n1. A comment long enough to be kept as one.\nReviewer 2\n1. Another comment long enough to be kept here."), ["R1.1", "R2.1"]);
// a number inside text does not start a comment
assert.equal(R.splitComments("1. The sample has\n2.5 million firms, which seems large for this registry.").length, 1);
// no markers: one comment per paragraph, salutation and closing dropped
assert.deepEqual(ids("Dear editor,\n\nThe paper is interesting but the sample description is too thin for readers.\n\nThe estimates are not robust to alternative definitions of growth.\n\nBest regards"), ["C1", "C2"]);
// duplicate numbers get unique IDs
assert.deepEqual(ids("1. First comment that is long enough to keep.\n1. Second comment with the same number here."), ["C1", "C1-2"]);

// matching comments to changed paragraphs
const OLD = `Financial flexibility and SME growth

Abstract
We study how cash holdings relate to growth in 412 small firms.

1. Introduction
Small firms face credit limits. Prior work is mixed.

2. Methods
We draw firms from the national register. We use OLS regressions of growth on cash.

3. Results
Cash is associated with growth (b = 0.21).

4. Conclusion
Cash holdings drive growth in small firms.`;
const NEW = OLD.replace("We draw firms from the national register.", "We draw firms from the national register by stratified random selection on sector and size; 412 of 1,030 invited firms responded (response rate 40%).")
  .replace("Cash holdings drive growth in small firms.", "Cash holdings are associated with growth in small firms; the cross-sectional design does not identify causal effects.")
  + "\n\n5. Limitations\nLeverage is measured with error because book values are used.";
const LETTER = `Reviewer 1
1. The methods section does not explain how firms were selected from the register.
2. Please report the response rate.
3. The conclusion overstates causal claims given the cross-sectional design.
4. Add a limitations section discussing measurement error in leverage.
5. Please cite the work of Smith on trade credit in emerging markets.`;
const ch = R.changedParagraphs(OLD, NEW);
assert.deepEqual(ch.map(c => c.kind), ["modified", "modified", "added"]);
assert.match(ch[0].diff, /\{\+by stratified random selection/);
assert.deepEqual(ch[0].location, { section: "methods", paragraph: 1, paragraph_overall: 3, version: "new" });
assert.equal(ch[2].location.section, "limitations");
const del = R.changedParagraphs(NEW, OLD).find(c => c.kind === "deleted");
assert.ok(del && del.old.startsWith("Leverage"), "deleted paragraph found");
assert.equal(R.changedParagraphs(OLD, OLD).length, 0);

const t = R.buildTracker(LETTER, OLD, NEW);
assert.equal(t.label, "Simulated pre-submission review — not a journal decision");
const row = id => t.rows.find(r => r.id === id);
assert.equal(row("R1.1").location.section, "methods");
assert.equal(row("R1.2").location.section, "methods");
assert.equal(row("R1.3").location.section, "conclusion");
assert.match(row("R1.3").change.new, /does not identify causal effects/);
assert.equal(row("R1.4").location.section, "limitations"); assert.equal(row("R1.4").change.kind, "added");
assert.equal(row("R1.5").change, null, "unrelated comment not matched");
assert.ok(t.rows.every(r => r.status === "open"), "status stays open until the author sets it");
assert.deepEqual(t.open, ["R1.1", "R1.2", "R1.3", "R1.4", "R1.5"]); assert.equal(t.ready_to_export, false);

// export refused while any comment is open
await assert.rejects(R.exportTracker(t, "markdown"), e => /Export refused/.test(e.message) && e.open.length === 5);
await assert.rejects(R.exportTracker(t, "docx"), /Export refused/);
const partial = R.buildTracker(LETTER, OLD, NEW, { "R1.1": "addressed", "R1.2": "addressed", "R1.3": "partly", "R1.4": "addressed" });
await assert.rejects(R.exportTracker(partial, "docx"), e => e.open.length === 1 && e.open[0] === "R1.5");
// declined needs a reason
const noReason = R.buildTracker(LETTER, OLD, NEW, { "R1.1": "addressed", "R1.2": "addressed", "R1.3": "partly", "R1.4": "addressed", "R1.5": "declined" });
assert.equal(noReason.rows[4].status, "open"); assert.match(noReason.rows[4].problem, /reason/);
await assert.rejects(R.exportTracker(noReason, "markdown"), /R1\.5/);
await assert.rejects(R.exportTracker(R.buildTracker("short", OLD, NEW), "markdown"), /no comments/);
assert.equal(R.parseStatus("Partly addressed").status, "partly");
assert.equal(R.parseStatus({ status: "declined with reason", reason: "out of scope" }).status, "declined");
assert.equal(R.parseStatus("done").status, "open");

const done = R.buildTracker(LETTER, OLD, NEW, { "R1.1": "addressed", "R1.2": { status: "addressed", response: "We now report the response rate." }, "R1.3": "addressed", "R1.4": "partly", "R1.5": "declined: the cited work studies large listed firms" });
assert.equal(done.ready_to_export, true);
const md = await R.exportTracker(done, "markdown");
assert.match(md, /\| Comment \| Response \| Change \(old → new\) \| Location \| Status \|/);
assert.match(md, /declined — the cited work studies large listed firms/);
assert.match(md, /We now report the response rate\./); assert.match(md, /methods, paragraph 1/);
const buf = await R.exportTracker(done, "docx");
const xml = zipText(buf, "word/document.xml");
assert.ok(xml.includes("R1.5: Please cite") && xml.includes("declined — the cited work"), "response rows in document.xml");
assert.deepEqual(await R.run({}), [], "committee runs no response checks on a single manuscript");
console.log("phase7-response: ok");
