#!/usr/bin/env node
// Quartile MCP server. Exposes the deterministic manuscript checks to any MCP client:
// Claude Desktop / Claude Code (stdio), claude.ai custom connectors and ChatGPT developer mode (Streamable HTTP at /mcp).
// Usage: node server.js            -> stdio
//        node server.js --http     -> HTTP on PORT (default 8787), endpoint /mcp
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const L = require("../core/lib.js");
const VERSION = require("./package.json").version;

const MAX = 400000; // characters per manuscript
const txt = z.string().min(1).max(MAX);
const terms = z.array(z.string()).optional().describe("Protected constructs that must stay verbatim, e.g. [\"financial flexibility\", \"investment reversibility\"]");
const json = (o, kind) => { const sc = kind ? { kind, ...o } : o; return { content: [{ type: "text", text: JSON.stringify(sc, null, 2) }], structuredContent: sc }; };

// Interactive result card for MCP Apps hosts (Claude, ChatGPT). Self-contained: no external requests.
const WIDGET_URI = "ui://quartile/report-v1.html";
let WIDGET = null;
function widgetHtml() {
  if (WIDGET) return WIDGET;
  const fs = require("fs"), path = require("path");
  let lib = fs.readFileSync(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
  const m = lib.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (m) lib = lib.slice(0, m.index) + "window.__MCPApps={" + m[1].split(",").map(x => { const [a, b] = x.trim().split(/\s+as\s+/); return (b || a) + ":" + a; }).join(",") + "};";
  WIDGET = fs.readFileSync(path.join(__dirname, "widget.html"), "utf8").replace("/*__EXT_APPS__*/", () => lib.replace(/<\/script/gi, "<\\/script"));
  return WIDGET;
}
const ui = (invoking, invoked) => ({ ui: { resourceUri: WIDGET_URI }, "ui/resourceUri": WIDGET_URI, "openai/outputTemplate": WIDGET_URI, "openai/toolInvocation/invoking": invoking, "openai/toolInvocation/invoked": invoked });
const RO = { readOnlyHint: true, openWorldHint: false, destructiveHint: false };

function build() {
  const s = new McpServer({ name: "quartile", version: VERSION }, { instructions: "Quartile checks academic business and economics manuscripts without changing their science. Call q1_style_guide before rewriting. After rewriting any paragraph, call verify_rewrite with the original and the revision and keep the original whenever pass is false. Never present simulated reviewer output as a real journal decision. Statistics checks show consistency, not who produced a number. The full-text corpus is for patterns only (structure, section lengths, moves, voice): never copy wording from it, and run corpus_originality on any text written with its help." });

  s.registerTool("q1_style_guide", { title: "Q1 style guide", description: "Writing, argument and framing standard for a target tier (Q1-Q4), writing type (A empirical finance, B theory model, C small business, D service and management theory) and section role. Use before rewriting or framing a paper.", inputSchema: { tier: z.enum(["Q1", "Q2", "Q3", "Q4"]).default("Q1"), writing_type: z.enum(["A", "B", "C", "D"]).default("A"), role: z.enum(L.Style.ROLES).optional() }, annotations: RO },
    async ({ tier, writing_type, role }) => json(L.styleGuide(tier, writing_type, role)));

  s.registerTool("analyze_manuscript", { title: "Analyze manuscript", description: "Full deterministic audit of a manuscript in plain text or markdown (headings as '# Heading'): sections and roles, word count, AI-style density, research design, Q1 rule flags, business-research gaps, terminology consistency, APA citation style, desk-rejection screen, reference cross-check and a statistics summary.", inputSchema: { text: txt, protected_terms: terms, journal: z.string().optional(), guidelines: z.string().max(20000).optional() }, annotations: RO, _meta: ui("Auditing the manuscript", "Audit ready") },
    async ({ text, protected_terms, journal, guidelines }) => json(L.analyze(text, { terms: protected_terms, journal, guidelines }), "analysis"));

  s.registerTool("desk_screen", { title: "Desk-rejection screen", description: "Rule-based screen of the five usual desk-rejection reasons (contribution, structure, writing, literature grounding, fit), with a risk level and a fix for each failed check.", inputSchema: { text: txt, journal: z.string().optional(), guidelines: z.string().max(20000).optional() }, annotations: RO, _meta: ui("Screening", "Screen ready") },
    async ({ text, journal, guidelines }) => json(L.desk(L.parse(text), { journal, guidelines }), "desk"));

  s.registerTool("check_statistics", { title: "Check statistics", description: "statcheck-style recomputation of p from t, F, r, chi-square and z; coefficient/SE vs reported t, p and significance stars; impossible values (R2, adjusted R2, alpha, AVE, r, p = .000); p-value clustering below .05; last-digit uniformity; software output fingerprints (Stata, R, SPSS, EViews, statsmodels, SmartPLS, AMOS/Mplus). Cannot prove whether a number came from software, a person or an AI.", inputSchema: { text: txt }, annotations: RO, _meta: ui("Recomputing statistics", "Statistics checked") },
    async ({ text }) => json(L.Stats.checkAll(text), "statistics"));

  s.registerTool("check_references", { title: "Check references", description: "Cross-checks in-text citations against the reference list: cited but missing, listed but never cited, numeric or author-year style, references from the last five years. Offline; verify DOIs separately.", inputSchema: { text: txt }, annotations: RO, _meta: ui("Checking references", "References checked") },
    async ({ text }) => json(L.references(L.parse(text)), "references"));

  s.registerTool("verify_rewrite", { title: "Verify rewrite (hallucination guard)", description: "Compares an original passage with a revision. pass = false when the revision adds, removes or changes numbers, citations, protected terms, new names or causal claims. Call it on every rewritten paragraph; if pass is false, keep the original.", inputSchema: { original: z.string().min(1).max(60000), revised: z.string().min(1).max(60000), protected_terms: terms }, annotations: RO, _meta: ui("Verifying", "Verified") },
    async ({ original, revised, protected_terms }) => json(L.verify(original, revised, protected_terms), "verify"));

  s.registerTool("apply_replacements", { title: "Apply replacements safely", description: "Applies exact quote-to-replacement edits to a text and returns the new text. Each edit is applied only if the quote is found exactly and the replacement passes verify_rewrite and is not much longer than the quote. The input text is not stored or changed anywhere else.", inputSchema: { text: txt, replacements: z.array(z.object({ quote: z.string().min(1), replacement: z.string(), occurrence: z.number().int().positive().optional() })).max(500), protected_terms: terms }, annotations: { readOnlyHint: true, openWorldHint: false } },
    async ({ text, replacements, protected_terms }) => json(L.applyReplacements(text, replacements, protected_terms)));

  s.registerTool("compare_style", { title: "Compare with the Q1 style profile", description: "Measures the manuscript's abstract (length, sentence length and variety, active 'we' voice, passive voice, hedging, causal verbs, stock words, numbers, sample-size clause, rhetorical moves) and compares it with Quartile's measured profile of about 500 recent Q1 abstracts (fields: finance, small_business, management; or a named journal). Returns a distance score and the three largest gaps with fixes. Style only: it cannot judge the contribution.", inputSchema: { text: txt, field: z.enum(["finance", "small_business", "management"]).optional(), journal: z.string().optional(), is_abstract: z.boolean().optional() }, annotations: RO, _meta: ui("Comparing with the Q1 profile", "Style compared") },
    async ({ text, field, journal, is_abstract }) => json(L.compareStyle(text, { field, journal, isAbstract: is_abstract }), "style"));

  // ---- private full-text corpus (local installs only: Claude Desktop extension or a local server) ----
  const CP = require("./corpus.js");
  s.registerTool("corpus_status", { title: "Corpus status", description: "Shows the private full-text corpus in the user's folder (for example a Google Drive folder synced to the computer): papers per field, how many are measured, and the progress of any running download or analysis.", inputSchema: {}, annotations: RO },
    async () => json(CP.status(), "corpus_status"));
  s.registerTool("corpus_build", { title: "Build the full-text corpus", description: "Starts a background job on the user's computer: downloads open-access, Creative-Commons-licensed Q1 articles (finance, small business, management; 2019 or later) as PDFs from the publishers' open-access copies into the corpus folder, then extracts and measures every section. Takes a while; check corpus_status. Texts stay in the folder; only measurements are written to corpus-profile.json.", inputSchema: { target: z.number().int().min(10).max(1000).default(500), fields: z.array(z.enum(["finance", "small_business", "management"])).optional(), per_journal: z.number().int().min(1).max(20).default(6) }, annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false } },
    async ({ target, fields, per_journal }) => { try { return json(await CP.build({ target, fields, perJournal: per_journal }), "corpus_status"); } catch (e) { return json({ error: e.message }, "corpus_status"); } });
  s.registerTool("corpus_analyse", { title: "Re-measure the corpus", description: "Re-reads every PDF, DOCX, Markdown and text file in the corpus folder (including papers the user added) and rebuilds corpus-profile.json: section-by-section medians for length, paragraph size, citation density, sentence length, voice, hedging and introduction moves.", inputSchema: {}, annotations: { readOnlyHint: false, openWorldHint: false } },
    async () => { try { const p = await CP.analyse(); return json({ measured: p.n, fields: Object.keys(p.fields), built: p.built }, "corpus_status"); } catch (e) { return json({ error: e.message }, "corpus_status"); } });
  s.registerTool("corpus_compare", { title: "Compare a manuscript with the full-text corpus", description: "Measures the manuscript section by section (introduction, literature, methods, results, discussion, conclusion) and compares each with the corpus papers of the same field: share of the paper, words per paragraph, citations per 1,000 words, sentence length, voice, hedging, causal verbs, and the opening move of the introduction. Patterns only; no text is reused.", inputSchema: { text: txt, field: z.enum(["finance", "small_business", "management"]).optional() }, annotations: RO },
    async ({ text, field }) => json(CP.compare(text, field), "corpus"));
  s.registerTool("corpus_search", { title: "Find the closest corpus papers", description: "Finds the corpus papers and passages closest to a topic or paragraph (TF-IDF), for positioning and for checking which close studies to read and cite. Returns titles, DOIs and short snippets (at most 40 words).", inputSchema: { query: z.string().min(3).max(5000), k: z.number().int().min(1).max(20).default(8) }, annotations: RO },
    async ({ query, k }) => json(await CP.search(query, k), "corpus_search"));
  s.registerTool("corpus_originality", { title: "Originality check against the corpus", description: "Flags any sentence that shares 8 or more consecutive words with a paper in the corpus. Call it on every rewrite inspired by the corpus; rewrite flagged sentences in the author's own words.", inputSchema: { text: txt }, annotations: RO },
    async ({ text }) => json(await CP.originality(text), "originality"));

  s.registerTool("journal_lookup", { title: "Journal lookup", description: "Looks up a journal by title or ISSN in the local journal bank built from the user's own SCImago export: quartile, SJR, H-index, citations per document, output, and a difficulty score (0-100) within its main category.", inputSchema: { query: z.string().min(2) }, annotations: RO, _meta: ui("Looking up", "Found") },
    async ({ query }) => { const r = L.journalLookup(query); return json(r.length ? { results: r } : { results: [], note: "No match, or no journal bank loaded. Build one with scripts/build-bank.js and set QUARTILE_BANK." }, "journals"); });

  s.registerTool("journal_suggest", { title: "Suggest journals", description: "Lists journals from the local bank by keyword in title or category, quartile and maximum difficulty, hardest first.", inputSchema: { keywords: z.array(z.string()).default([]), quartile: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(), max_difficulty: z.number().min(0).max(100).default(100), limit: z.number().int().min(1).max(50).default(15) }, annotations: RO, _meta: ui("Searching the bank", "Journals listed") },
    async ({ keywords, quartile, max_difficulty, limit }) => json({ results: L.journalSuggest({ keywords, quartile, maxDifficulty: max_difficulty, limit }) }, "journals"));

  s.registerResource("quartile-report", WIDGET_URI, { title: "Quartile result card", description: "Interactive card that shows Quartile results", mimeType: "text/html;profile=mcp-app" },
    async () => ({ contents: [{ uri: WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: widgetHtml(), _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } }, "openai/widgetDescription": "Shows Quartile manuscript checks: audit, desk screen, statistics, guard result, references or journals.", "openai/widgetPrefersBorder": false } }] }));

  // Prompts: workflows the host model runs, with the guard built in.
  s.registerPrompt("q1_edit", { title: "Edit to the Q1 standard", description: "Rewrite paragraphs to a target tier without changing the science.", argsSchema: { tier: z.string().optional(), level: z.string().optional() } },
    ({ tier = "Q1", level = "standard" }) => ({ messages: [{ role: "user", content: { type: "text", text: `Edit my manuscript to the ${tier} standard at the "${level}" level. First call q1_style_guide with tier ${tier}. Work paragraph by paragraph. After each revision call verify_rewrite(original, revised); if pass is false, keep my original and tell me why. Never add facts, numbers, names or citations. At the end, list every paragraph you kept unchanged and why. I will paste the text next.` } }] }));
  s.registerPrompt("journal_editor", { title: "Act as the journal's editor", description: "Desk decision plus three reviewer reports for a named journal.", argsSchema: { journal: z.string() } },
    ({ journal }) => ({ messages: [{ role: "user", content: { type: "text", text: `Act as the handling editor of ${journal}, then as three reviewers (R1 theory and contribution, R2 methods and identification, R3 field and context). First call journal_lookup for ${journal}, analyze_manuscript and check_statistics on my manuscript. Quote my text exactly for every point, give a fix, and for language or framing points give replacement text that passes verify_rewrite. Mark points that need new analysis as author tasks. This is a simulation for revision, not a decision. I will paste the manuscript next.` } }] }));
  s.registerPrompt("idea_to_paper", { title: "Frame an idea as a Q1 paper", description: "Turn a research idea into a tier-level paper frame without inventing literature or results.", argsSchema: { tier: z.string().optional() } },
    ({ tier = "Q1" }) => ({ messages: [{ role: "user", content: { type: "text", text: `Frame my research idea as a ${tier} paper. Call q1_style_guide first. Give: puzzle, research question, central claim, theory lens and what the paper changes in it, positioning against prior work, hypotheses with mechanisms, design and identification, rival explanations and how to rule them out, robustness, boundary conditions, contributions, a draft abstract with predictions only, an introduction skeleton and likely reviewer objections. Cite only papers you can verify with a search tool; otherwise write [citation needed]. Never invent results. My idea follows.` } }] }));
  return s;
}

async function main() {
  if (process.argv.includes("--http")) {
    const express = require("express");
    const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const app = express(); app.use(express.json({ limit: "6mb" }));
    const token = process.env.QUARTILE_TOKEN;
    app.get("/", (_, res) => res.send("Quartile MCP server " + VERSION + "."));
    // QUARTILE_SECRET: serve only at /mcp/<secret>. Works with clients that cannot send headers (ChatGPT, claude.ai "no auth" connectors).
    const secret = process.env.QUARTILE_SECRET, route = secret ? "/mcp/" + secret : "/mcp";
    if (secret && secret.length < 24) { console.error("QUARTILE_SECRET must be at least 24 characters."); process.exit(1); }
    app.post(route, async (req, res) => {
      if (token && req.headers.authorization !== "Bearer " + token) return res.status(401).json({ error: "unauthorized" });
      const server = build(), transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport); await transport.handleRequest(req, res, req.body);
    });
    const deny = (_, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)" }, id: null });
    app.get(route, deny); app.delete(route, deny);
    // Journal bank: a local file (QUARTILE_BANK) if present, otherwise the public SCImago list downloaded at start-up.
    if (!L.loadBank() && process.env.QUARTILE_FETCH_BANK !== "0") L.fetchBank().then(n => console.error(`Journal bank: ${n} journals loaded from SCImago`)).catch(e => console.error("Journal bank not loaded: " + e.message));
    const port = +process.env.PORT || 8787; app.listen(port, () => console.error(`Quartile MCP on http://localhost:${port}${secret ? "/mcp/<secret>" : "/mcp"}${token ? " (bearer token required)" : ""}`));
  } else {
    const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
    await build().connect(new StdioServerTransport());
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { build };
