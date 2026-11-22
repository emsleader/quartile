// Phase 2: finance and statistics reviewer (specification Section 7).
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { grim, grimTestable, grimVerdict } from "../../core/stats/grim.js";
import { grimmer, grimmerExact } from "../../core/stats/grimmer.js";
import { debit, binarySd } from "../../core/stats/debit.js";
import { caliper } from "../../core/stats/pcurve.js";
import { checkResult, recompute, pValue } from "../../core/stats/recompute.js";
import { parseText } from "../../core/text/parse.js";
import { loadRules } from "../../core/rules/loader.js";
import { runRules } from "../../core/rules/engine.js";
import finance from "../../core/roles/finance.js";
import grimTool from "../../tools/grim_check.js";
import Stats from "../../core/stats.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ids = fs => fs.map(f => f.rule);

// GRIM: specification 7.2 examples
assert.equal(grim(3.48, 25).possible, true, "87/25 = 3.48");
assert.equal(grim(3.47, 25).possible, false);
assert.equal(grim(5.19, 28).possible, false, "145/28 = 5.18, 146/28 = 5.21");
assert.equal(grim("3.40", 10).possible, true);
assert.equal(grim("3.45", 10, { items: 2 }).possible, true, "69/20 = 3.45");
assert.equal(grimTestable(25), true); assert.equal(grimTestable(100), false); assert.equal(grimTestable(40, 2, 3), false);
assert.equal(grimVerdict("3.4", 200).verdict, "not testable");
assert.equal(grim("3.125", 8, { dp: 2 }).possible, true, "either rounding at a tie passes");

// GRIMMER: the quick test must never rule out a pair that the exact R enumeration found possible
const ex = JSON.parse(fs.readFileSync(path.join(here, "..", "validation", "grimmer_exact.json"), "utf8"));
let sound = 0;
for (const c of ex.cases) if (c.expected === true) { const [m, s, n] = c.args; assert.notEqual(grimmer(m, s, n).possible, false, `grimmer must not reject ${m}, ${s}, n=${n}`); sound++; }
assert.ok(sound > 50);
assert.equal(grimmer("3.40", "1.20", 10).possible, false);
assert.equal(grimmerExact("3.40", "1.26", 10, { min: 1, max: 5 }).possible, true);
assert.equal(grimmerExact("1.00", "0.50", 10, { min: 1, max: 5 }).possible, false, "all ones give SD 0");
assert.equal(grimmerExact("3", "1", 500, { min: 1, max: 7 }).possible, null, "too large for the exact search");

// DEBIT
assert.ok(Math.abs(binarySd(4, 10) - 0.5163977794943222) < 1e-12);
assert.equal(debit(".40", ".52", 10).possible, true);
assert.equal(debit(".40", ".30", 10).possible, false);
assert.equal(debit(".40", ".49", 10, { sdType: "population" }).possible, true);
assert.equal(debit(".40", ".49", 10, { sdType: "sample" }).possible, false);

// caliper (STA-03 is a note only)
assert.equal(caliper([0.045, 0.035]).testable, false);
const cal = caliper([...Array(12).fill(0.045), 0.035, 0.032]);
assert.equal(cal.testable, true); assert.equal(cal.severity, "note"); assert.ok(cal.pOneSided < 0.01);

// p recomputation (STA-02)
assert.equal(checkResult({ test: "t", stat: "2.20", df1: 28, op: "=", p: ".036" }).consistent, true);
assert.equal(checkResult({ test: "t", stat: "2.20", df1: 28, op: "=", p: ".018" }).consistent, false);
assert.equal(checkResult({ test: "t", stat: "2.20", df1: 28, op: "=", p: ".018", oneTailed: true }).consistent, true, "one-tailed when the text says so");
assert.equal(checkResult({ test: "t", stat: "2.20", df1: 28, op: "=", p: ".018" }).oneTailedFits, true);
assert.equal(checkResult({ test: "t", stat: "1.50", df1: 30, op: "<", p: ".05" }).decisionError, true);
assert.equal(checkResult({ test: "z", stat: "3.90", op: "=", p: ".000" }).consistent, true, "p = .000 read as p < .0005");
assert.equal(checkResult({ test: "F", stat: "3.21", df1: 2, df2: 45, op: "=", p: ".05" }).decisionError, false, "p = .05 has no clear decision");
assert.equal(checkResult({ test: "t", stat: "1.96", df1: 1000, op: "=", p: ".05" }).consistent, true, "rounding of the statistic allowed");
assert.ok(Math.abs(pValue("r", 0.3, 48) - 0.034286) < 1e-5);
assert.equal(recompute("chi2(1) = 4.50, p = .034; F(1, 98) = 12.70, p < .001; z = -2.81, p = .005").every(r => r.consistent), true);
assert.equal(recompute("A one-tailed test gave t(28) = 2.20, p = .018.")[0].consistent, true);

// Role: bounds paper gives no regression-type flag, detected and declared
const bounds = fs.readFileSync(path.join(here, "fixtures", "phase2-bounds-paper.txt"), "utf8");
const REG = ["FIN-01", "FIN-02", "FIN-03", "FIN-04", "FIN-05", "FIN-07"];
for (const design of [null, "bounds"]) {
  const doc = parseText(bounds, { design });
  assert.equal(doc.design.primary, "bounds", "bounds design detected / declared");
  const fs_ = [...runRules(doc, loadRules()), ...(await finance.run(doc))];
  assert.equal(fs_.filter(f => REG.includes(f.rule)).length, 0, "no regression-type flag on a bounds paper");
  assert.equal(fs_.filter(f => f.role === "finance").length, 0);
}
// the same text read as a regression paper is flagged, so the gate is what keeps it quiet
assert.ok(ids(await finance.review(parseText(bounds, { design: "regression" }))).includes("FIN-02"));
// declared design overrides detection
const regText = fs.readFileSync(path.join(here, "..", "rules", "FIN-02", "pos_1.txt"), "utf8");
assert.equal(ids(await finance.review(parseText(regText, { design: "bounds" }))).filter(r => REG.includes(r)).length, 0);

// FIN-08 WBES weights on positive and negative texts
const wb = f => fs.readFileSync(path.join(here, "..", "rules", "FIN-08", f), "utf8");
for (const f of ["pos_1.txt", "pos_2.txt"]) assert.ok(ids(await finance.review(parseText(wb(f), { design: "survey" }))).includes("FIN-08"), f);
for (const f of ["neg_1.txt", "neg_2.txt", "neg_3.txt"]) assert.ok(!ids(await finance.review(parseText(wb(f), { design: "survey" }))).includes("FIN-08"), f);
assert.ok(!ids(await finance.review(parseText(wb("pos_1.txt"), { design: "regression" }))).includes("FIN-08"), "FIN-08 runs on survey designs only");
const f8 = (await finance.review(parseText(wb("pos_1.txt"), { design: "survey" }))).find(f => f.rule === "FIN-08");
assert.equal(f8.severity, "major"); assert.ok(f8.span && f8.span.text.includes("World Bank"));

// STA-01 gates: integer cue, item count, scale range
const st1 = t => finance.sta01(parseText(t));
assert.equal(st1("Respondents used a five-point Likert scale. Mean trust was 3.47 (n = 25).").length, 1);
assert.equal(st1("Mean firm age was 3.47 years (n = 25).").length, 0, "no integer cue: not tested");
assert.equal(st1("The scale has several items rated on a five-point Likert scale. Mean trust was 3.47 (n = 25).").length, 0, "unknown item count");
assert.equal(st1("The three-item scale used a five-point Likert format. The scale mean was 3.47 (n = 25).").length, 0, "75 total responses: 3.47 = 260/75 is possible");
assert.equal(st1("The two-item scale used a five-point Likert format. The scale mean was 3.47 (n = 25).").length, 1, "3.47 * 50 = 173.5");
assert.equal(st1("Respondents used a five-point Likert scale. Mean revenue was 34.70 (n = 25).").length, 0, "outside the scale");
assert.equal(st1("Respondents used a five-point Likert scale (single item). Mean trust was 3.40 (SD = 1.20, n = 10).")[0]?.detail.test, "GRIMMER (exact search)");
assert.equal(st1("The export dummy (binary) had M = .40, SD = .30 (n = 10).")[0]?.detail.test, "DEBIT");
const scan = finance.scanMeans(parseText("Respondents used a five-point Likert scale. Mean trust was 3.48 (n = 25)."));
assert.equal(scan[0].verdict, "possible");

// STA-02 in the role, with a one-tailed statement nearby
const st2 = t => finance.sta02(parseText(t));
assert.equal(st2("We test a directional hypothesis with a one-tailed test. Results: t(28) = 2.20, p = .018.").length, 0);
assert.equal(st2("Results: t(28) = 2.20, p = .018.")[0].severity, "minor");
assert.equal(st2("We did not use one-tailed tests. Results: t(28) = 2.20, p = .018.").length, 1, "negated one-tailed statement does not excuse");
assert.equal(st2("Results: t(30) = 1.50, p < .05.")[0].severity, "major");

// STA-03 only with at least 15 p-values, and as a note
const many = Array.from({ length: 14 }, (_, i) => `Test ${i + 1}: t(100) = 2.0${i % 10}, p = .04${(i % 9) + 1}.`).join(" ") + " Test 15: t(100) = 2.20, p = .035. Test 16: z = 0.50, p = .62.";
const st3 = finance.sta03(parseText(many));
assert.equal(st3.length, 1); assert.equal(st3[0].severity, "note");
assert.equal(finance.sta03(parseText("t(100) = 2.01, p = .047.")).length, 0);

// STA-04: within rounding passes; no total row, no check
const table = rows => `Table 1. Sample\n\n| Group | % |\n${rows}`;
assert.equal(finance.sta04(parseText(table("| A | 33.3 |\n| B | 33.3 |\n| C | 33.3 |\n| Total | 100.0 |"))).length, 0, "99.9 is within rounding");
assert.equal(finance.sta04(parseText(table("| A | 33.3 |\n| B | 30.3 |\n| C | 33.3 |\n| Total | 100.0 |"))).length, 1);
assert.equal(finance.sta04(parseText(table("| A | 33.3 |\n| B | 30.3 |\n| C | 33.3 |"))).length, 0, "no total row: not checked");

// STA-05: a sample flow is not an inconsistency
const st5 = t => finance.sta05(parseText(t));
assert.equal(st5("Abstract\n\nWe survey 412 firms.\n\nData and Methods\n\nThe final sample has 421 firms.").length, 1);
assert.equal(st5("Abstract\n\nWe survey 412 firms.\n\nData and Methods\n\nOf 500 firms contacted, 88 were removed, leaving a final sample of 412 firms.").length, 0);
assert.equal(st5("Abstract\n\nWe survey 412 firms and 2,060 firm-year observations.\n\nData and Methods\n\nThe final sample has 412 firms.").length, 0);
assert.equal(st5("Data and Methods\n\nIn 2019 firms reported sales. The final sample has 412 firms.").length, 0, "a year is not a count");

// every finding has the engine's shape
const all = await finance.review(parseText(JSON.parse(fs.readFileSync(path.join(here, "..", "gold", "cases", "phase2-planted-survey.json"), "utf8")).text));
assert.ok(all.length >= 5);
for (const f of all) for (const k of ["rule", "role", "title", "severity", "confidence", "source", "source_ref", "message", "fix", "span", "detail"]) assert.ok(k in f, `${f.rule} has ${k}`);

// tool
const out = grimTool.handler({ means: [{ mean: "3.48", n: 25 }, { mean: "3.47", n: 25 }, { mean: "5.19", n: 28 }, { mean: "3.4", n: 200 }] });
assert.deepEqual(out.results.map(r => r.verdict), ["possible", "not possible", "not possible", "not testable"]);
const outT = grimTool.handler({ text: "Respondents used a five-point Likert scale. Mean trust was 3.47 (n = 25). Mean age was 41.3 (n = 25)." });
assert.deepEqual(outT.text_results.map(r => r.verdict), ["not possible", "not testable"]);
assert.ok(grimTool.handler({}).error);

// the existing check_statistics GRIM is unchanged (its own regex and output)
assert.equal(Stats.grim("Mean was 3.47 (N = 25).")[0].ok, false);
console.log("phase2-finance: ok");
