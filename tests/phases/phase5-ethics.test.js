// Phase 5: ethics and data office (specification Section 10). Acceptance: the dual-role flag fires when the
// author profile lists a company in the studied sector, not otherwise, and becomes a note when the role is disclosed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "qeth-"));
process.env.QUARTILE_HOME = HOME; delete process.env.QUARTILE_AUTHOR_PROFILE;
const { parseText } = await import("../../core/text/parse.js");
const { loadRules } = await import("../../core/rules/loader.js");
const { runRules } = await import("../../core/rules/engine.js");
const ethics = (await import("../../core/roles/ethics.js")).default;
const E = (await import("../../core/roles/ethics_lib.js")).default;
const tool = (await import("../../tools/ethics_check.js")).default;
const { runAll } = await import("../../core/roles/index.js");

const EXAMPLE = path.join(ROOT, "tests/fixtures/author.example.yaml");
const UNRELATED = path.join(HOME, "unrelated.yaml");
fs.writeFileSync(UNRELATED, "name: Dr. Sam Placeholder\naffiliations:\n  - organisation: Greenacre Farms Ltd\n    role: Owner\n    sectors: [agriculture]\n");
const FITNESS_ONLY = path.join(HOME, "fitness.yaml");
fs.writeFileSync(FITNESS_ONLY, "name: Dr. Pat Sample\nbusiness_interests:\n  - organisation: Northgate Gym Ltd\n    sectors: [gyms]\n");

const paper = (decl = "") => `Whole-body EMS studios and financial flexibility

Abstract

We study how whole-body EMS studios in Hungary fund equipment. WB-EMS training needs costly devices.

1. Introduction

Electromyostimulation (EMS) studios rent or buy EMS devices. EMS operators face high fixed costs.

2. Methods

We use the published annual accounts of 60 EMS studios and estimate an OLS regression with fixed effects.

3. Results

Studios that lease EMS equipment keep more cash.

4. Conclusion

Leasing gives EMS studios flexibility.
${decl}`;
const dual = (doc, profile) => ethics.checkEthics(doc, { authorProfile: profile }).findings.filter(f => f.rule === "ETH-04-DUAL");
const reg = t => parseText(t, { design: "regression" });

// --- studied sector detection ---
assert.deepEqual(E.studiedSectors(reg(paper())).sectors.map(s => s.key), ["wb-ems"], "WB-EMS paper studies wb-ems");
const envEms = reg(`Environmental management systems and firm value

Abstract

We study environmental management systems (EMS) in listed firms. EMS adoption is voluntary.

2. Methods

We estimate an OLS regression of firm value on EMS certification. EMS certification follows ISO 14001.
`);
assert.equal(E.studiedSectors(envEms).sectors.length, 0, "environmental management systems (EMS) is not WB-EMS");
assert.equal(E.sectorOf("EMS").key, "wb-ems"); assert.equal(E.sectorOf("EMS").exact, true);
assert.equal(E.sectorOf("Fitness Studio").key, "fitness");
assert.equal(E.sectorOf("higher education"), null);

// --- acceptance: dual role fires with a profile in the studied sector ---
let f = dual(reg(paper()), EXAMPLE);
assert.equal(f.length, 1, "dual-role flag fires"); assert.equal(f[0].severity, "major"); assert.equal(f[0].confidence, "high", "exact sector match: high");
assert.equal(f[0].detail.coi_statement, false); assert.match(f[0].message, /no conflict-of-interest statement/);
assert.equal(f[0].role, "ethics"); assert.ok("span" in f[0] && "source_ref" in f[0] && f[0].fix);
// ... and not otherwise
assert.equal(dual(reg(paper()), UNRELATED).length, 0, "unrelated profile: no dual-role flag");
assert.equal(dual(reg(paper()), path.join(HOME, "missing.yaml")).length, 0, "no profile: no dual-role flag");
assert.equal(dual(envEms, EXAMPLE).length, 0, "environmental EMS paper: no dual-role flag");
// a paper that discloses the role: note
f = dual(reg(paper("\nDeclaration of competing interests\n\nThe author is Managing Director of Kestrel Motion Systems Ltd, which sells EMS equipment to studios.\n")), EXAMPLE);
assert.equal(f.length, 1); assert.equal(f[0].severity, "note"); assert.match(f[0].message, /disclosure present; check it names the role/i);
assert.equal(f[0].detail.named_by, "organisation"); assert.ok(f[0].span && /Kestrel/.test(f[0].span.text));
// role and sector named without the company name also counts
f = dual(reg(paper("\nConflict of interest\n\nThe author owns a company that distributes EMS devices in Hungary.\n")), EXAMPLE);
assert.equal(f[0].severity, "note"); assert.equal(f[0].detail.named_by, "role and sector");
// "no competing interests" does not name the role: major
f = dual(reg(paper("\nDeclaration of competing interests\n\nThe authors declare no competing interests.\n")), EXAMPLE);
assert.equal(f[0].severity, "major"); assert.match(f[0].message, /does not name this role/);
// a negated mention is not a disclosure
f = dual(reg(paper("\nConflict of interest\n\nThe author has no financial interests in EMS companies.\n")), EXAMPLE);
assert.equal(f[0].severity, "major", "negated role mention is not a disclosure");
// related sector (gym owner, WB-EMS paper): medium confidence
f = dual(reg(paper()), FITNESS_ONLY);
assert.equal(f.length, 1); assert.equal(f[0].confidence, "medium"); assert.equal(f[0].detail.match, "related");
// profile from the environment variable and from $QUARTILE_HOME/author.yaml
process.env.QUARTILE_AUTHOR_PROFILE = EXAMPLE;
assert.equal(dual(reg(paper()), null).length, 1, "QUARTILE_AUTHOR_PROFILE is read");
delete process.env.QUARTILE_AUTHOR_PROFILE;
assert.equal(dual(reg(paper()), null).length, 0, "no default profile in the test home");
fs.copyFileSync(EXAMPLE, path.join(HOME, "author.yaml"));
assert.equal(dual(reg(paper()), null).length, 1, "$QUARTILE_HOME/author.yaml is the default");
fs.unlinkSync(path.join(HOME, "author.yaml"));
// invalid profile is reported, not thrown
fs.writeFileSync(path.join(HOME, "bad.yaml"), "affiliations: not-a-list\n");
assert.equal(E.loadProfile(path.join(HOME, "bad.yaml")).status, "invalid");

// --- ETH-04 conflict-of-interest statement, heading-aware ---
const coiOf = t => ethics.checkEthics(reg(t), { authorProfile: UNRELATED }).findings.filter(x => x.rule === "ETH-04");
assert.equal(coiOf(paper()).length, 1, "no COI statement: ETH-04");
for (const h of ["Conflict of interest", "Declaration of competing interests", "Related parties"])
  assert.equal(coiOf(paper(`\n${h}\n\nNone.\n`)).length, 0, `heading '${h}' counts as a statement`);
assert.equal(coiOf(paper("\nThe authors declare that they have no conflicts of interest.\n")).length, 0, "COI sentence without heading counts");
assert.equal(coiOf(paper("\nAcknowledgements\n\nWe thank the studios.\n")).length, 1, "acknowledgements is not a COI statement");

// --- ETH-07 small cells ---
const survey = table => parseText(`Digital tools in small firms

Abstract

We survey firm owners with a questionnaire.

2. Methods

We sent a questionnaire to 120 firms; respondents answered Likert items.

Table 2. Firms by region

${table}

3. Results

Adoption differs by region.
`, { design: "survey" });
let cells = ethics.smallCells(survey("| Region | Firms (n) | Share (%) |\n| North | 3 | 2.5 |\n| South | 40 | 33.3 |\n| Total | 120 | 100 |"));
assert.equal(cells.length, 1, "count 3 in a firms column flags"); assert.equal(cells[0].severity, "minor"); assert.deepEqual(cells[0].detail.cells.map(c => c.value), [3]);
assert.ok(cells[0].span && cells[0].span.text.includes("North"));
assert.equal(ethics.smallCells(survey("| Region | Firms (n) | Share (%) |\n| North | 30 | 25.0 |\n| South | 90 | 75.0 |")).length, 0, "no small counts");
assert.equal(ethics.smallCells(survey("| Region | Mean score | Share (%) |\n| North | 3 | 2.5 |\n| South | 4 | 33.3 |")).length, 0, "means and shares are not counts");
assert.equal(ethics.checkEthics(parseText(survey("| Region | Firms (n) |\n| North | 3 |").text, { design: "regression" }), {}).findings.filter(x => x.rule === "ETH-07").length, 0, "ETH-07 runs on surveys only");

// --- design gating and negation of the YAML rules ---
const rules = loadRules().filter(r => r.role === "ethics");
const ids = d => runRules(d, rules).map(x => x.rule);
assert.ok(!ids(reg(paper())).includes("ETH-01"), "ETH-01 does not run on a regression paper");
assert.ok(!ids(reg(paper())).includes("ETH-02"));
assert.ok(ids(reg(paper())).includes("ETH-05") && ids(reg(paper())).includes("ETH-06"));
const concept = parseText("A conceptual model of flexibility\n\nAbstract\n\nWe develop propositions.\n\n1. Introduction\n\nThis conceptual paper builds a model.", { design: "conceptual" });
assert.ok(!ids(concept).includes("ETH-05"), "ETH-05 does not run on a conceptual paper");
const sv = m => parseText(`Owner survey\n\nAbstract\n\nWe survey owners.\n\n2. Methods\n\nWe sent a questionnaire to 200 owners. ${m}\n`, { design: "survey" });
assert.ok(!ids(sv("No ethics approval was required because no human participants were involved.")).includes("ETH-01"), "negated approval with no human participants is not a missing approval");
assert.ok(ids(sv("The study was approved by the university ethics committee.")).includes("ETH-01"), "approval without body name and number");
assert.ok(!ids(sv("The study was approved by the Ethics Committee of Example University (approval no. 2024/15). Respondents gave informed consent.")).includes("ETH-01"));
assert.ok(ids(sv("The study was approved by the Ethics Committee of Example University in 2019-2021.")).includes("ETH-01"), "a year range is not a reference number");
assert.ok(!ids(sv("Respondents gave informed consent online.")).includes("ETH-02"));
assert.ok(ids(sv("Respondents did not give informed consent forms.")).includes("ETH-02"), "negated consent is not a consent statement");
// planted error from tests/gold/plant.js: anchored on the approval sentence
const planted = sv("The study was approved by the university ethics committee.");
const p1 = runRules(planted, rules).find(x => x.rule === "ETH-01");
assert.equal(p1.span.text, "The study was approved by the university ethics committee."); assert.equal(planted.text.slice(p1.span.start, p1.span.end), p1.span.text);

// --- tool ---
const out = await tool.handler({ text: paper(), author_profile: EXAMPLE, design: "regression" });
assert.equal(out.label, "Simulated pre-submission review — not a journal decision");
assert.equal(out.author_profile.status, "loaded"); assert.ok(out.findings.some(x => x.rule === "ETH-04-DUAL" && x.severity === "major"));
assert.ok(out.findings.every(x => x.role === "ethics" && x.rule && x.severity && x.confidence && x.source_ref && "span" in x));
assert.equal(out.design.declared, true);
const txt = path.join(HOME, "paper.txt"); fs.writeFileSync(txt, paper());
const out2 = await tool.handler({ path: txt });
assert.equal(out2.author_profile.status, "not_found"); assert.ok(!out2.findings.some(x => x.rule === "ETH-04-DUAL"));
await assert.rejects(() => tool.handler({}), /text or as a path/);
assert.ok(!JSON.stringify(out).match(/\b(accept|reject)(ed|ance|ion)?\b/i), "no acceptance or rejection wording");
// role registry runs the module
assert.ok((await runAll(reg(paper()), { only: ["ethics"], authorProfile: EXAMPLE })).some(x => x.rule === "ETH-04-DUAL"));
console.log("phase5-ethics: ok");
