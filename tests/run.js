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

// MCP over stdio
(async () => {
  const { Client } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
  const { StdioClientTransport } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");
  const c = new Client({ name: "test", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "..", "mcp", "server.js")] }));
  const tools = (await c.listTools()).tools.map(t => t.name);
  ok(tools.length === 9 && tools.includes("verify_rewrite"), "9 tools");
  const r = await c.callTool({ name: "verify_rewrite", arguments: { original: "Sales rose 5%.", revised: "Sales rose 7%." } });
  ok(r.structuredContent.pass === false, "tool call over stdio");
  const pr = (await c.listPrompts()).prompts.map(p => p.name); ok(pr.length === 3, "3 prompts");
  await c.close();
  console.log(`All ${n} tests passed.`);
})().catch(e => { console.error(e); process.exit(1); });
