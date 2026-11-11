// Run: node tests/run.js   (from the repo root, after npm install in mcp/)
const assert = require("assert");
const path = require("path");
const L = require("../core/lib.js");
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// statistics
const st = L.Stats.checkAll("t(28) = 2.20, p = .04. t(28) = 2.20, p = .20. F(2, 57) = 3.45, p = .039. b = 0.10, SE = 0.08, t = 3.10, p = .002. Size 0.030** (0.020). R2 = 0.31, adjusted R2 = 0.35. alpha = 1.2. p = .000.");
ok(Math.abs(L.Stats.pT(2.2, 28) - 0.0362) < 0.001, "pT");
ok(Math.abs(L.Stats.pF(3.45, 2, 57) - 0.0385) < 0.001, "pF");
ok(Math.abs(L.Stats.pChi(3.84, 1) - 0.05) < 0.001, "pChi");
ok(st.apa.filter(a => a.ok).length === 2, "consistent results pass");
ok(st.problems.some(p => /Decision error/.test(p.problem)), "decision error");
ok(st.problems.some(p => /coefficient \/ SE/.test(p.problem)), "coef/SE");
ok(st.problems.some(p => /star/.test(p.problem)), "stars");
ok(st.problems.some(p => /Adjusted R/.test(p.problem)), "adj R2");
ok(st.problems.some(p => /alpha/.test(p.problem)), "alpha");
ok(st.problems.some(p => /\.000/.test(p.problem)), "p=.000");
ok(L.Stats.software("Residual standard error: 1.2\nMultiple R-squared: 0.3").includes("R"), "R fingerprint");

// guard
ok(!L.verify("Firms with more cash survive longer (Smith, 2019).", "Firms with more cash survive 30% longer (Smith, 2019).").pass, "number added blocked");
ok(!L.verify("Cash is associated with survival (Smith, 2019).", "Cash causes survival (Smith, 2019; Jones, 2020).").pass, "citation/causal blocked");
ok(L.verify("The results is robust to alternative measures.", "The results are robust to alternative measures.").pass, "grammar fix passes");
const ap = L.applyReplacements("The results is robust. Cash rose 10%.", [{ quote: "results is", replacement: "results are" }, { quote: "rose 10%", replacement: "rose 15%" }]);
ok(ap.applied === 1 && ap.text === "The results are robust. Cash rose 10%.", "apply only safe edits");

// document
const ms = "# Abstract\n\nWe study cash holdings in 2,000 firms (Smith, 2019).\n\n# Introduction\n\nPrior work (Jones, 2020) shows X.\n\n# References\n\nSmith, J. (2019). Cash. Journal of Finance, 1, 1-2.\n";
const a = L.analyze(ms);
ok(a.sections.length === 3 && a.sections[0].role === "abstract", "sections");
ok(a.references.missingFromList.some(c => /Jones/.test(c)), "missing citation");
ok(L.styleGuide("Q2").tierStandard.startsWith("Q2"), "style guide");


// ---- regression tests from the manuscript test of 11 Nov 2026 (each locks in one fixed false alarm) ----
const C = L.Core;
ok(C.detectRole("Robust decision methods") === "other" && C.detectRole("3. Data and sample") === "methods", "methods only from leading words");
ok(C.detectRole("**References**") === "references", "bold References heading");
{ const d = L.parse("# 4. RESULTS\n\n## 4.1 Sample\n\nText one here.\n\n## 4.2 Models\n\nText two here.\n"); ok(d.sections.every(x => x.role === "results"), "sub-headings inherit the parent role"); }
{ const d = L.parse("# Results\n\nText.\n\n## Table 1. Flow\n\n| A | B |\n| :-: | :-: |\n| 1 | 2 |\n\nNote.\n"); ok(d.sections.length === 1 && d.paras.some(p => p.isTable), "captions and markdown tables do not start sections"); }
ok(!C.citations("Latin American SMEs, and Alduraywish (2023) linked").some(k => /^Es /.test(k)), "acronyms are not authors");
ok(C.citations("Kovács – Szabó (2019) and (Rejc Buhovac, 2010) and European Commission (n.d.-a)").length >= 2, "Hungarian and n.d.-a citations");
{ const r = L.references(L.parse("# Intro\n\nWe use R (R Core Team, 2024) and data (World Bank, n.d.) from (India 2022) collected in (April 2024).\n\n# References\n\nR Core Team. (2024). R: A language.\n\nWorld Bank. (n.d.). Enterprise Surveys.\n")); ok(r.missingFromList.length === 0 && r.neverCited.length === 0, "corporate authors, n.d., countries and dates"); }
{ const r = L.references(L.parse("# Intro\n\nAs Rejc Buhovac (2010) shows.\n\n# References\n\nRejc Buhovac, A. (2010). Title of the work.\n")); ok(r.missingFromList.length === 0 && r.neverCited.length === 0, "compound surnames"); }
{ const a = L.analyze("# Introduction\n\nWe use World Bank Enterprise Surveys (WBES) microdata. Respondents answered. The survey covers firms. Regression estimates with design-based standard errors, controls for sector, sensitivity specifications. We report survey-weighted estimates. Our estimates are associational and do not identify causal effects. The average marginal effect was 2.8 pp.\n\n# Results\n\nThe coefficient was positive in the regression. Estimates differ. The logit estimation and the fixed estimation agree. Policy implications follow.\n"); ok(a.design === "quantitative" && !a.businessResearchIssues.some(x => /alpha|AVE|common method|Endogeneity|Standard errors/.test(x.problem)), "secondary data and design-based errors"); ok(!a.q1RuleFlags.some(f => /Causal wording/.test(f.detail)), "marginal effect is not causal"); }
{ const a = L.analyze("# Abstract\n\nThis conceptual paper develops propositions.\n\n# Propositions\n\nP1. A regression of outcomes would show more. P2. Estimates may differ.\n"); ok(a.design === "conceptual" && !a.businessResearchIssues.some(x => /Endogeneity|Standard errors|Multicollinearity|fixed effects|Descriptive/.test(x.problem)), "conceptual papers skip empirical checks"); }
ok(C.aiTells("As Foster et al. (2019) note, firms ranging 5–99 workers (Benjamini–Hochberg).").count === 0, "names, ranges and paired names are not AI tells");
{ const a = L.analyze("# Methods\n\nWe report a 95% confidence interval [CI] and use the CI in every table. GDP and OECD data. The CI is shown.\n"); ok(!a.consistency.some(x => /"(CI|GDP|OECD)"/.test(x.problem)), "bracket definitions and standard abbreviations"); }
{ const a = L.analyze("# Results\n\nTable 1 records the flow.\n\n**Table 1**\n\n| A | B |\n| 1 | 2 |\n"); ok(!a.consistency.some(x => /Table 1 is never/.test(x.problem)), "'Table 1 records' is a reference"); }
ok(L.Stats.checkAll("x 1.234 1.567 ".repeat(40)).lastDigits === null, "last-digit test off for reported results");
ok(L.Stats.shares("318 of 1,247 eligible cases (28.5%)")[0].ok === false && L.Stats.shares("318 of 1,247 eligible cases (25.5%)")[0].ok, "x of y (z%) check");
ok(L.Stats.ciP("the difference was 11.14 pp [2.84, 19.44] (p = 0.009; Figure 2)")[0].ok, "CI and p agree");

// style profile
{ const P = L.loadProfile(); ok(P && P.n >= 450 && Object.keys(P.fields).length === 3, "style profile has about 500 abstracts in 3 fields");
  ok(!JSON.stringify(P).includes("abstract_inverted_index") && P.sources.every(x => !("text" in x)), "profile stores measurements, not text");
  const r = L.compareStyle("# Abstract\n\nWe find that small firms with audited accounts invest more. Using a panel of 9,037 firms, we show that the effect is larger where banks dominate. These results inform lenders and policymakers.\n", { field: "finance" });
  ok(typeof r.distance === "number" && r.measured.dataClause === 1 && r.measured.moves.includes("finding"), "compare_style measures an abstract"); }

let corpusDone = Promise.resolve();
// private corpus (local folder; synthetic Markdown papers)
{ const os = require("os"), fs = require("fs"), dir = fs.mkdtempSync(os.tmpdir() + "/qc-"); process.env.QUARTILE_CORPUS = dir; fs.mkdirSync(dir + "/finance");
  const sec = (h, n, t) => "# " + h + "\n\n" + Array.from({ length: n }, (_, i) => `We find that ${t} is associated with investment among small firms in paragraph ${i} (Smith, 2019). Using a panel of 900 firms, we estimate the role of ${t} for lenders. These results inform policymakers who monitor ${t} in markets. However, little is known about how ${t} shapes service firms over time.`).join("\n\n") + "\n\n";
  ["leverage", "audit", "cash", "credit", "tax", "trade", "collateral", "growth", "banks", "equity", "debt", "risk"].forEach(t => fs.writeFileSync(`${dir}/finance/${t}.md`, sec("Abstract", 1, t) + sec("1. Introduction", 6, t) + sec("2. Literature review", 8, t) + sec("3. Data and methods", 6, t) + sec("4. Results", 9, t) + sec("5. Discussion", 5, t) + sec("6. Conclusion", 3, t) + "# References\n\nSmith, J. (2019). Credit. Journal of Finance, 1, 1-2.\n"));
  const CP = require("../mcp/corpus.js");
  corpusDone = (async () => { const p = await CP.analyse(); ok(p.n === 12 && p.fields.finance && p.fields.finance.roles.results, "corpus analysed by field and section");
    const c = CP.compare(fs.readFileSync(dir + "/finance/audit.md", "utf8"), "finance"); ok(c.recognisedSections.length >= 6 && typeof c.distance === "number", "corpus_compare section by section");
    const sr = await CP.search("audit and investment", 3); ok(sr.results.length && sr.results.every(r => r.snippet.split(" ").length <= 41), "corpus_search short snippets");
    const o = await CP.originality("However, little is known about how audit shapes service firms over time. This sentence is entirely my own writing here."); ok(!o.pass && o.overlapping.length === 1, "originality flags copied wording"); })(); }

// MCP over stdio
(async () => {
  await corpusDone;
  const { Client } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
  const { StdioClientTransport } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");
  const c = new Client({ name: "test", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "..", "mcp", "server.js")] }));
  const tools = (await c.listTools()).tools.map(t => t.name);
  ok(tools.length === 16 && tools.includes("corpus_originality"), "16 tools");
  const r = await c.callTool({ name: "verify_rewrite", arguments: { original: "Sales rose 5%.", revised: "Sales rose 7%." } });
  ok(r.structuredContent.pass === false, "tool call over stdio");
  const pr = (await c.listPrompts()).prompts.map(p => p.name); ok(pr.length === 3, "3 prompts");
  await c.close();
  console.log(`All ${n} tests passed.`);
})().catch(e => { console.error(e); process.exit(1); });
