// Phase 4: production editor (PRD-01 to PRD-07).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseText } from "../../core/text/parse.js";
import production, { loadGlossary, parseBibliography, inTextCitations, classifyReference, journalOf } from "../../core/roles/production.js";

const run = async (text, opts = {}, design = "regression") => production.run(parseText(text, { design }), opts);
const only = (fs, r) => fs.filter(f => f.rule === r);
const REFS = "References\n\nMyers, S. C., & Majluf, N. S. (1984). Corporate financing and investment decisions when firms have information that investors do not have. Journal of Financial Economics, 13(2), 187-221.";

// PRD-01: abstract numbers must appear in the body; proportions and percentages are the same number
const p1 = "Abstract\n\nWe find a 21% rise in growth for 412 firms (beta = 0.34).\n\nMethods\n\nThe sample has 412 firms.\n\nResults\n\nThe estimate is 0.21 and beta is 0.341.";
assert.equal(only(await run(p1), "PRD-01").length, 0);
const p1b = only(await run(p1.replace("beta = 0.34", "beta = 0.38").replace("for 412 firms", "for 418 firms")), "PRD-01");
assert.deepEqual(p1b.map(f => String(f.detail.value)).sort(), ["0.38", "418"]);
assert.equal(only(await run("Abstract\n\nSignificant at p < 0.05 for all firms.\n\nResults\n\nNothing else."), "PRD-01").length, 0, "p thresholds are not results");

// PRD-02 tables and figures
const t = "Results\n\nTable 2 shows the main model and Table 1 the controls.\n\nTable 1. Controls\n\n| A | B |\n| x | 1 |\n\nNote: n = 10. Source: survey.\n\nTable 2. Main model\n\n| A | B |\n| y | 2 |\n\nFigure 1\n\nDiscussion\n\nSee Table 4.";
const t2 = only(await run(t), "PRD-02").map(f => f.detail.issue).sort();
assert.deepEqual(t2, ["citation order", "missing", "no note", "no title", "not cited"]);
assert.equal(only(await run("Results\n\nTable 1 reports the estimates.\n\nTable 1. Estimates\n\n| A | B |\n| x | 1 |\n\nNote: n = 12. Source: Orbis."), "PRD-02").length, 0);
assert.equal(only(await run("Results\n\nTable 1 reports the estimates and Table 2 the tests."), "PRD-02").length, 0, "tables in a separate file: no caption check");

// PRD-03 abbreviations
const a = "Abstract\n\nSmall firms (SMEs) use ROA targets.\n\nIntroduction\n\nWe study SMEs. Small and medium-sized enterprises (SMEs) borrow. Return on assets (ROA) is a ratio. The US and EU differ.";
const a3 = only(await run(a), "PRD-03");
assert.deepEqual(a3.map(f => `${f.detail.abbreviation}:${f.detail.where}`).sort(), ["ROA:abstract", "SMEs:body"]);
assert.equal(only(await run("Introduction\n\nThe ratio is high (OECD, 2019)."), "PRD-03").length, 0, "organisations as citation authors are skipped");
assert.equal(only(await run("Results\n\nROA is high.\n\nNote: ROA = return on assets."), "PRD-03").length, 0, "definition in a table note counts");

// PRD-04 references both ways
const r4 = only(await run("Introduction\n\nFirms prefer internal funds (Myers & Majluf, 1984; Barney, 1991). Kraus and Litzenberger (1973) disagree.\n\n" + REFS + "\n\nKraus, A., & Litzenberger, R. H. (1974). A state-preference model. Journal of Finance, 28(4), 911-922.\n\nUnused, B. (2000). Never cited. Journal of Finance, 1(1), 1-2."), "PRD-04");
assert.deepEqual(r4.map(f => f.message).sort(), ["Barney (1991) is cited but not in the reference list.", "Kraus (1973) is cited, but the reference list has Kraus with 1974.", "Unused (2000) is in the reference list but never cited."]);
assert.deepEqual(inTextCitations(parseText("Intro\n\nAs shown before (e.g., Barney, 1991a, 1991b; von Hippel, 1986, p. 12), and by Teece et al. (1997).")).map(c => c.key + c.year), ["barney1991a", "barney1991b", "hippel1986", "teece1997"]);
assert.equal(only(await run("Introduction\n\nThe sample covers 412 firms (N = 412, 2015-2022)."), "PRD-04").length, 0);
const bib = "@article{b, author={Barney, Jay}, year={1991}, title={Firm resources}, journal={Journal of Management}}";
assert.equal(parseBibliography(bib)[0].key, "barney");
assert.equal(parseBibliography("10.1177/014920639101700108").length, 0, "DOIs are not resolved (no network)");
assert.equal(only(await run("Introduction\n\nResources matter (Barney, 1991) and so does finance (Myers & Majluf, 1984).\n\n" + REFS, { bibliography: bib }), "PRD-04").length, 0);
const num = only(await run("Introduction\n\nFirms prefer internal funds [1].\n\nReferences\n\n[1] Myers, S. C. (1984). Capital structure puzzle. Journal of Finance, 39(3), 575-592.\n\n[2] Barney, J. (1991). Firm resources. Journal of Management, 17(1), 99-120."), "PRD-04");
assert.deepEqual(num.map(f => f.message), ["Reference [2] is listed but never cited."]);

// PRD-05 citation policy
assert.equal(journalOf(REFS.split("\n\n")[1]), "Journal of Financial Economics");
assert.deepEqual(classifyReference(REFS.split("\n\n")[1]), { type: "journal", journal: "Journal of Financial Economics", quartile: "Q1" });
assert.equal(classifyReference("Smith, J. (2019). Cash. NBER Working Paper 123.").type, "working paper");
const pol = "Introduction\n\nText (Myers & Majluf, 1984; Smith, 2019).\n\n" + REFS + "\n\nSmith, J. (2019). Cash and growth. SSRN working paper.";
assert.deepEqual(only(await run(pol), "PRD-05").map(f => f.severity), ["note"]);
assert.deepEqual(only(await run(pol, { citation_policy: { min_q1q2_share: 0.8, flag_conference: false } }), "PRD-05").map(f => [f.severity, f.detail.q1q2_share]), [["minor", 0.5]]);

// PRD-06 glossary (object and file)
const g = "Methods\n\nWe measure equipment investment. Fixed-asset purchase is the same idea. Equipment investment rises.";
assert.equal(only(await run(g), "PRD-06").length, 0, "no glossary: no drift check");
const d6 = only(await run(g, { glossary: { groups: [{ preferred: "equipment investment", variants: ["fixed-asset purchase", "capital purchase"] }] } }), "PRD-06");
assert.equal(d6.length, 1); assert.deepEqual(d6[0].detail.counts, { "equipment investment": 2, "fixed-asset purchase": 1 }); assert.match(d6[0].span.text, /Fixed-asset/);
const gf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qg-")), "glossary.yaml");
fs.writeFileSync(gf, "groups:\n  - [equipment investment, fixed asset purchase]\n");
assert.equal(loadGlossary(gf).length, 1);
assert.equal(only(await run(g, { glossary_path: gf }), "PRD-06").length, 1, "hyphen and space match the same term");
assert.equal(only(await run("Methods\n\nInvestment in equipment investment terms.", { glossary: [["equipment investment", "investment"]] }), "PRD-06").length, 1);
assert.equal(only(await run("Methods\n\nWe study equipment investment only.", { glossary: [["equipment investment", "investment"]] }), "PRD-06").length, 0, "a longer term is not counted again as its shorter part");

// PRD-07 recency and self-citation
const many = "Introduction\n\nText.\n\nReferences\n\n" + Array.from({ length: 10 }, (_, i) => `Alavi, S. M. (${2000 + i}). Paper ${i}. Journal of Finance, 1(1), 1-2.`).join("\n\n");
assert.deepEqual(only(await run(many, { reference_year: 2026 }), "PRD-07").map(f => f.detail.share), [0]);
assert.equal(only(await run(many, { reference_year: 2012 }), "PRD-07").length, 0);
const self = only(await run(many, { reference_year: 2012, author: "Alavi, S. M." }), "PRD-07");
assert.equal(self[0].detail.share, 1);
assert.equal(only(await run(many, { reference_year: 2012, author: "Smith" }), "PRD-07").length, 0);
console.log("phase4 production: ok");
