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

// integrity screen (COPE-aligned)
{ const src = "Small firms face binding credit constraints when collateral is scarce and lenders cannot observe quality. This pattern holds across emerging markets and over several decades of evidence from enterprise surveys.";
  const ms = "# Introduction\n\nSmall firms face binding credit constraints when collateral is scarce and lenders cannot observe quality. This pattern holds across emerging markets and over several decades of evidence from enterprise surveys. We add new data.\n";
  const r = L.Integrity.screen(ms, [{ id: "a", title: "Other paper", text: src }]); ok(r.grade === "substantial" && r.longestConsecutiveRun >= 2, "consecutive uncited copying is substantial");
  const r2 = L.Integrity.screen("As Beck (2006) put it, \u201cSmall firms face binding credit constraints when collateral is scarce\u201d in many markets today.", [{ id: "a", title: "Other", text: src }]); ok(r2.grade === "none", "quoted and cited reuse is not flagged as unattributed");
  const r3 = L.Integrity.screen(ms, [{ id: "o", title: "Our 2024 paper", text: src, own: true }]); ok(r3.redundancy !== "none" && r3.grade === "none" && r3.coverLetterDisclosure, "own-work overlap is redundancy with a disclosure");
  ok(L.Integrity.screen("Entirely new words written for this study about firms and banks today.", [{ id: "a", title: "x", text: src }]).grade === "none", "no overlap"); }
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

// AI-style signal, number registry, readiness (offline)
{
  const AI = require("../core/aistyle.js"), REG = require("../core/registry.js"), RD = require("../core/readiness.js");
  const gen = "# Introduction\n\nMoreover, this study delves into the multifaceted landscape of finance — a crucial realm. It is not merely a study, but a testament. Furthermore, we leverage robust data, rich models, and deep insights. This highlights the importance of cash. Notably, firms navigate risk.";
  const hum = "# Introduction\n\nSmall firms hold more cash when banks lend less. We test this with 1,250 Hungarian firms observed from 2012 to 2020, using the 2015 lending shock. Cash rises by about a third of a standard deviation, and the effect is larger where firms have few tangible assets to pledge.";
  const g = AI.check(gen), h2 = AI.check(hum);
  ok(g.score > 45 && g.band === "high" && h2.score < 20, "AI-style score separates stock prose");
  ok(g.replacements.length >= 2 && g.scoreAfterFixes < g.score && g.replacements.every(r => L.verify(r.quote, r.replacement).pass), "AI-style fixes are safe and lower the score");
  ok(/an important realm/.test(g.replacements[0].replacement), "article agreement in fixes");
  ok(AI.fixSentence("These were reconciled against the .dta files (q = .16).") === null, "fixes leave numbers and file names alone");
  const ms = "# Abstract\n\nCash raises survival by 0.034 (p = .002), and 12.5% of firms exit; the effect is 0.051.\n\n# Results\n\nThe coefficient is 0.034 (SE = 0.011, t = 3.09). Leverage is 0.21. The sample has 1,250 firms. Age is 0.077. Size is 0.442.";
  const out = "cash .0341872 .0110543 3.09 0.002\nlev -.2093\nobs 1,250\nexit 0.1251 age 0.0779";
  const r = REG.registry(ms, [{ name: "stata.log", text: out }]), st = t => r.rows.find(x => x.text === t).status;
  ok(st("0.034") === "matched" && st("12.5%") === "matched" && st("1,250") === "matched", "registry matches rounding, percentages, thousands");
  ok(st("0.21") === "check" && st("0.077") === "check" && st("0.442") === "not found in output", "registry flags sign, truncation and untraced numbers");
  ok(r.summaryNotInResults.some(x => x.text === "0.051"), "abstract number missing from results");
  const rd = RD.readiness(ms, { outputs: [{ name: "stata.log", text: out }] });
  ok(rd.score >= 0 && rd.score <= 100 && rd.penalties.length && /does not predict acceptance/.test(rd.note), "readiness score with penalties");
  const PR = require("../core/prose.js"), pl = PR.lint("# Intro\n\nIn order to study the the cash, we use firms due to the fact that data are adequate enough. It is important to note that we test this. Firms are very large.");
  ok(pl.byType.redundancy === 1 && pl.byType["repeated word"] === 1 && pl.byType.intensifier === 1, "prose lint finds redundancy, repeated word, intensifier");
  ok(pl.replacements.some(e => /^To study .* because data are adequate\.$/.test(e.replacement)) && pl.replacements.every(e => L.verify(e.quote, e.replacement).pass), "prose fixes compose and pass the guard");
  ok(PR.readability("The firm holds cash. ".repeat(30)).fleschReadingEase > 60, "readability");
  const gr = L.Stats.grim("Satisfaction (M = 3.47, N = 25) and loyalty (M = 3.48, n = 25).");
  ok(gr.length === 2 && !gr[0].ok && gr[1].ok, "GRIM test");
  const N = require("../core/net.js"); ok(["verifyReferences", "literatureOverlap", "grammar"].every(f => typeof N[f] === "function"), "network checks load");
}

// regressions reported on ORBIT (12 Nov 2026)
{
  ok(L.Core.parseRef("Ocasio, W. (1997). Towards an attention-based view of the firm. Strategic Management Journal, 18(S1), 187–206. https://doi.org/10.1002/(SICI)1097-0266(199707)18:1+<187::AID-SMJ936>3.0.CO;2-K").doi.endsWith("CO;2-K"), "DOI with a semicolon is read whole");
  ok(L.Core.aiTells("We use robust standard errors and robust optimisation, and the results are robust to alternative samples.").count === 0, "technical 'robust' is not an AI tell");
  const orb = "# Abstract\n\nThis paper develops a framework of strategic flexibility.\n\n# Introduction\n\nOur framework integrates real options and attention. We also clarify when flexibility pays.\n\n# 7. Testing the framework\n\nEach proposition can be tested with panel data; we describe the measurement strategy.\n\n# Conclusion\n\nWe extend the attention-based view.";
  const oa = L.analyze(orb);
  ok(/Contribution statements: [3-9]/.test(oa.deskScreen.criteria[0].checks[0].t), "contribution claims counted by sentence and verb");
  ok(!oa.businessResearchIssues.some(x => /could be tested/.test(x.problem)), "a testing section satisfies the testability check");
}

// statistics in R (skipped when R is not installed)
const rDone = (async () => {
  const RS = require("../core/rstats.js"); if (!(await RS.available())) { console.log("R not installed: statistics tests skipped"); return; }
  const csv = "y,x,g\n" + [[1, 2, "a"], [2, 3, "a"], [3, 5, "a"], [4, 4, "b"], [5, 7, "b"], [6, 8, "b"], [7, 9, "b"], [8, 12, "a"]].map(r => r.join(",")).join("\n");
  const r = await RS.run({ data: csv, analyses: [{ procedure: "regression", dependent: "y", independents: ["x"] }, { procedure: "ttest", variable: "y", group: "g" }, { procedure: "correlation", variables: ["x", "y"] }] });
  const b = r.results[0].result.coefficients[1];
  ok(Math.abs(b.b - 0.7044025) < 1e-6 && Math.abs(r.results[2].result.pairs[0].r - 0.9691250) < 1e-6, "R regression and correlation match known values");
  ok(/^[0-9a-f]{64}$/.test(r.record.data_sha256) && /R version/.test(r.record.r_version) && /q_regression/.test(r.script), "reproducibility record and script");
  ok(L.Stats && require("../core/registry.js").registry("# Results\n\nThe slope is 0.70 (r = .97).", [{ name: "R", text: r.output_text }]).matched === 2, "R output feeds the number registry");
  const bad = await RS.run({ data: csv, analyses: [{ procedure: "anova", variable: "zz", group: "g" }] }); ok(bad.error && /no column 'zz'/.test(bad.problems[0]), "unknown columns rejected before R runs");
})();

// MCP over stdio
(async () => {
  await corpusDone; await rDone;
  const { Client } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
  const { StdioClientTransport } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");
  const c = new Client({ name: "test", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "..", "mcp", "server.js")] }));
  const tools = (await c.listTools()).tools.map(t => t.name);
  ok(tools.length === 27 && ["integrity_screen", "ai_style_check", "number_registry", "submission_readiness", "verify_references_live", "literature_overlap", "grammar_check", "corpus_profile_export", "prose_check", "benchmark_corpus", "run_statistics"].every(t => tools.includes(t)), "27 tools");
  const r = await c.callTool({ name: "verify_rewrite", arguments: { original: "Sales rose 5%.", revised: "Sales rose 7%." } });
  ok(r.structuredContent.pass === false, "tool call over stdio");
  const pr = (await c.listPrompts()).prompts.map(p => p.name); ok(pr.length === 3, "3 prompts");
  await c.close();
  console.log(`All ${n} tests passed.`);
})().catch(e => { console.error(e); process.exit(1); });
