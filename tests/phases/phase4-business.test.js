// Phase 4: business-administration committee (BUS-01 to BUS-07) and hypothesis parsing.
import assert from "node:assert/strict";
import { parseText } from "../../core/text/parse.js";
import business, { reportedValues, APPLIES } from "../../core/roles/business.js";
import { labelsIn, classify, verdicts, declarations } from "../../core/hypotheses.js";

const run = async (text, design, opts) => business.run(parseText(text, { design }), opts);
const rules = fs => fs.map(f => f.rule).sort();
const SHAPE = ["rule", "role", "title", "severity", "confidence", "source", "source_ref", "message", "fix", "span", "detail"];

// finding shape and spans
const noTheory = await run("Introduction\n\nSmall firms grow at different speeds.\n\nResults\n\nGrowth varies.", "regression");
for (const f of noTheory) { for (const k of SHAPE) assert.ok(k in f, `${f.rule} has ${k}`); assert.equal(f.role, "business"); }
assert.ok(rules(noTheory).includes("BUS-01"));
assert.equal(noTheory.find(f => f.rule === "BUS-01").severity, "major");

// design gating: BUS-01 never on slr; BUS-02/03 not on qualitative; BUS-04 not on regression; BUS-07 not on conceptual
assert.ok(!(await run("Introduction\n\nWe review studies.", "slr")).some(f => f.rule === "BUS-01"));
assert.ok(!APPLIES["BUS-01"].includes("slr") && !APPLIES["BUS-02"].includes("qualitative") && !APPLIES["BUS-04"].includes("regression") && !APPLIES["BUS-07"].includes("conceptual"));
const hypNoBasis = "Hypotheses\n\nGrowth is uneven.\n\nH1: Cash is positively associated with growth.\n\nResults\n\nH1 is supported.";
assert.ok((await run(hypNoBasis, "regression")).some(f => f.rule === "BUS-02"));
assert.ok(!(await run(hypNoBasis, "qualitative")).some(f => f.rule === "BUS-02"), "BUS-02 does not run on qualitative");

// BUS-01: named but not cited -> minor; named and cited -> nothing
const named = await run("Introduction\n\nAgency theory explains borrowing.", "regression");
assert.equal(named.find(f => f.rule === "BUS-01").severity, "minor");
assert.ok(!(await run("Introduction\n\nAgency theory explains borrowing (Jensen & Meckling, 1976).", "regression")).some(f => f.rule === "BUS-01"));

// BUS-02: a list of hypotheses shares one cited argument
const list = "Theory and hypotheses\n\nPecking order theory predicts a preference for internal funds (Myers & Majluf, 1984).\n\nH1: Cash is positively associated with growth.\n\nH2: Debt is negatively associated with growth.\n\nResults\n\nH1 is supported and H2 is not supported.";
assert.ok(!(await run(list, "regression")).some(f => f.rule === "BUS-02" || f.rule === "BUS-03"));

// BUS-03: missing and verdict-less hypotheses
const b3 = await run("Theory and hypotheses\n\nAgency theory applies (Jensen & Meckling, 1976).\n\nH1: Cash is positively associated with growth.\n\nH2: Debt is negatively associated with growth.\n\nResults\n\nH1 is examined in Table 1.", "regression");
const b3f = b3.filter(f => f.rule === "BUS-03");
assert.deepEqual(b3f.map(f => [f.detail.label, f.severity]), [["H1", "minor"], ["H2", "major"]]);

// hypothesis parsing helpers
assert.deepEqual(labelsIn("Hypotheses 1-3 are supported.").map(x => x.label), ["H1", "H2", "H3"]);
assert.deepEqual(labelsIn("H1 and H2 hold, but not H4.").map(x => x.label), ["H1", "H2", "H4"]);
assert.equal(classify("H4 is partially supported"), "mixed");
assert.equal(classify("H2 is rejected"), "not supported");
assert.equal(classify("the null hypothesis is rejected, so H1 is supported"), "supported");
const vd = parseText("Results\n\nH1 and H2 are supported, but H3 is not.\n\nWe find support for H4 but not for H5.");
assert.deepEqual(verdicts(vd, ["H1", "H2", "H3", "H4", "H5"]).map(v => v.verdict), ["supported", "supported", "not supported", "supported", "not supported"]);
const dd = declarations(parseText("Introduction\n\nWe test whether cash matters (H1).\n\nTheory\n\nHypothesis 2 (H2): Leverage is negatively related to growth.\n\nResults\n\nH1: as expected."));
assert.deepEqual(dd.map(d => d.label), ["H2"], "inline label without a prediction is not a declaration; results are not declarations");

// BUS-04 construct validity
const scales = "Methods\n\nEach construct had four items on a Likert scale. Cronbach's alpha was above 0.80. The average variance extracted (AVE) for trust was 0.46. HTMT values were below 0.85. Harman's test showed no common method variance.";
const b4 = (await run(scales, "survey")).filter(f => f.rule === "BUS-04");
assert.equal(b4.length, 1); assert.match(b4[0].message, /AVE 0\.46/);
assert.ok(!(await run("Methods\n\nWe asked owners one question about growth in a survey of respondents.", "survey")).some(f => f.rule === "BUS-04"), "survey without multi-item scales: no BUS-04");
const miss = (await run("Methods\n\nEach construct had five items on a Likert scale. Cronbach's alpha exceeded 0.80.", "sem")).find(f => f.rule === "BUS-04");
assert.deepEqual(miss.detail.missing, ["ave", "discriminant", "cmv"]);
const rv = reportedValues("AVE values ranged from 0.45 to 0.80 and all HTMT values were below 0.85; alpha was .68.");
assert.deepEqual(rv.map(v => [v.key, v.value, v.comparator]), [["ave", 0.45, false], ["ave", 0.8, false], ["htmt", 0.85, true], ["alpha", 0.68, false]]);
const htOnly = (await run("Methods\n\nEach construct had four items. Alpha was 0.85, AVE was 0.60, Harman's test was run. The HTMT value for trust and loyalty was 0.87.", "sem")).filter(f => f.rule === "BUS-04");
assert.deepEqual(htOnly.map(f => f.severity), ["note"], "0.85 <= HTMT < 0.90 is a note by default");
assert.deepEqual((await run("Methods\n\nEach construct had four items. Alpha was 0.85, AVE was 0.60, Harman's test was run. The HTMT value for trust and loyalty was 0.87.", "sem", { htmt_threshold: 0.85 })).filter(f => f.rule === "BUS-04").map(f => f.severity), ["major"]);

// BUS-05 heading-aware; action required
assert.ok(!(await run("Managerial implications\n\nOwners should keep a cash buffer.", "regression")).some(f => f.rule === "BUS-05"));
const vague = (await run("Managerial implications\n\nThe results are relevant for practice.", "regression")).find(f => f.rule === "BUS-05");
assert.equal(vague.severity, "minor");
assert.ok(!(await run("Discussion\n\nLenders could offer credit lines tied to cash flow.", "regression")).some(f => f.rule === "BUS-05"), "an action paragraph in the discussion counts");
assert.ok(!(await run("Introduction\n\nNo implications here.", "conceptual")).some(f => f.rule === "BUS-05"), "BUS-05 only on empirical designs");

// BUS-06 boundary conditions, negation-aware wording
assert.ok((await run("Discussion\n\nThe results generalise to all firms.", "regression")).some(f => f.rule === "BUS-06"));
assert.ok(!(await run("Discussion\n\nThe results may not generalise to large firms.", "regression")).some(f => f.rule === "BUS-06"));
assert.ok(!(await run("Limitations\n\nThe findings apply only to service firms in Hungary.", "regression")).some(f => f.rule === "BUS-06"));

// BUS-07 unit of analysis
const mixed = "Methods\n\nThe sample consists of 412 firms.\n\nResults\n\nThe data cover 380 owners.";
assert.ok((await run(mixed, "regression")).some(f => f.rule === "BUS-07"));
assert.ok(!(await run(mixed + "\n\nDiscussion\n\nOwners are nested within firms in a multilevel model.", "regression")).some(f => f.rule === "BUS-07"));
assert.ok(!(await run("Methods\n\nThe sample consists of 412 firms observed in a panel of 412 firms.", "regression")).some(f => f.rule === "BUS-07"));
console.log("phase4 business: ok");
