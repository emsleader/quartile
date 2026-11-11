<p align="center"><img src="assets/logo.svg" width="96" alt="Quartile logo"></p>

<h1 align="center">Quartile</h1>
<p align="center"><a href="https://doi.org/10.5281/zenodo.24143278"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.24143278.svg" alt="DOI 10.5281/zenodo.24143278"></a></p>
<p align="center"><b>Write at Q1. Keep every number.</b><br>Meaning-preserving academic editing, journal-editor simulation and statistics checks for business, management, finance and economics research.</p>

---

Most AI editors make a manuscript sound fluent, and some of them quietly change it along the way: a number drifts, a citation disappears, "is associated with" becomes "causes". Quartile is built around the opposite rule. Every revision is checked against the original by a deterministic guard, and the original is kept whenever a number, citation, protected construct, name or causal claim would change.

## What it does

| Module | What you get | Needs AI? |
|---|---|---|
| Hallucination guard | Blocks revisions that add or change numbers, citations, protected terms, new names or causal wording, or add sentences | No |
| Desk-rejection screen | The five usual desk-rejection reasons (contribution, structure, writing, literature, fit), each with a fix | No |
| Statistics check | statcheck-style recomputation of p from t, F, r, χ² and z; coefficient ÷ SE vs reported t, p and stars; impossible R², adjusted R², alpha, AVE, r and p; p-values clustered below .05; last-digit test; output fingerprints of Stata, R, SPSS, EViews, statsmodels, SmartPLS, AMOS/Mplus | No |
| References | Cited-but-missing, listed-but-uncited, recency, APA 7 style | No |
| Journal bank | Quartile, SJR, H-index and a 0-100 difficulty score within the subject category, from your own SCImago export | No |
| Issues list | Every problem listed first, each with a ready replacement; apply, ignore or comment per item | For language issues |
| Q1-Q4 style tiers | Argument, framing and rigor moves of papers at each tier, applied to edits without inventing content | Yes |
| Journal editor | Desk decision plus three reviewer reports (theory, methods, field) for a named journal; or a desk screen by the editor of each suggested journal | Yes |
| Idea → paper | Puzzle, claim, theory lens, hypotheses, identification, rival explanations, contribution and an introduction skeleton, citing only retrieved papers | Yes |

**What it cannot do.** It does not predict editorial decisions. No test can prove that a number came from R, Stata, a person or an AI: the statistics check shows whether numbers fit together and look like genuine software output. To prove origin, share your script and log file. There is no plagiarism database.

## Three ways to use it

### 1. The web app (`app/index.html`)
The full interface. It runs as a claude.ai artifact, where it can ask Claude and search Q1 papers through the Elicit connector. Opened as a plain file in a browser, the deterministic checks work and the AI steps are disabled.

### 2. The MCP server (`mcp/`) for Claude, ChatGPT and other clients

```bash
cd mcp && npm install
node server.js            # stdio (Claude Desktop, Claude Code)
node server.js --http     # Streamable HTTP on http://localhost:8787/mcp
```

**Tools:** `q1_style_guide`, `compare_style`, `analyze_manuscript`, `desk_screen`, `check_statistics`, `check_references`, `verify_rewrite`, `apply_replacements`, `journal_lookup`, `journal_suggest`. **Prompts:** `q1_edit`, `journal_editor`, `idea_to_paper`. All tools are read-only and stateless; nothing is stored.

**Claude Desktop** (`claude_desktop_config.json`):
```json
{ "mcpServers": { "quartile": { "command": "node", "args": ["/path/to/quartile/mcp/server.js"], "env": { "QUARTILE_BANK": "/path/to/quartile/data/bank.json" } } } }
```

**Claude Desktop, one click:** download `Quartile.mcpb` from the latest release and double-click it (or Settings → Extensions → Install extension). Claude Desktop runs it with its own Node.js, and everything stays on your computer. Build it yourself with `scripts/build-mcpb.sh`.

**Claude Code:** `claude mcp add quartile -- node /path/to/quartile/mcp/server.js`

**claude.ai (custom connector) and ChatGPT (developer mode):** both need a public HTTPS URL. Run `node server.js --http` on a server, or expose your local port with a tunnel (for example `cloudflared tunnel --url http://localhost:8787`), then add `https://<your-host>/mcp` as the connector URL. In ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode, then create a connector with that URL. Set `QUARTILE_TOKEN` to require `Authorization: Bearer <token>` for clients that can send headers. ChatGPT connectors support no authentication or OAuth, so for ChatGPT keep the URL private and stop the tunnel when you are done. Manuscripts you send pass through that server.

### Interactive result card
In clients that support MCP Apps (Claude and ChatGPT), the audit, desk screen, statistics, guard, reference and journal tools show a Quartile result card inside the chat instead of raw JSON. The card is self-contained and makes no network requests.

### Permanent hosting (one URL for Claude and ChatGPT)
Deploy the included `Dockerfile` to any container host. On Render: New → Blueprint → pick this repository (`render.yaml` is included). Render generates a random `QUARTILE_SECRET`, and the server then answers only at `https://quartile-mcp-xxxx.onrender.com/mcp/<QUARTILE_SECRET>` (copy the value from the service's Environment tab). Anyone without the full URL gets 404. Add that URL once:
- **ChatGPT:** Settings → Apps & Connectors → Advanced → Developer mode → Create, paste the URL, Authentication: No authentication.
- **Claude (claude.ai, desktop and mobile):** Settings → Connectors → Add custom connector, paste the URL.

The server is stateless and stores nothing, but manuscripts pass through the host you deploy to. A free Render instance sleeps when idle, so the first call can take about a minute.

### 3. As a library
```js
const Q = require("./core/lib.js");
Q.verify(original, revised, ["financial flexibility"]);  // { pass, blocking, warnings }
Q.Stats.checkAll(text);                                   // statistics report
Q.analyze(text);                                          // full audit
```

## Q1 style profile
`data/style-profile.json` holds measurements of 501 abstracts from 76 Q1 journals (finance, small business and entrepreneurship, management; 2020 or later; the most-cited articles of each journal, at most 6-8 per journal), collected from OpenAlex by `scripts/build-style-brain.js` and the "Build Q1 style profile" GitHub Action. For each field and for 73 journals it stores the median and middle half of abstract length, sentence length and variety, active "we" voice, passive voice, hedges, causal verbs, stock words, numbers reported, how often the sample size is stated, and how often each rhetorical move (background, gap, aim, method, finding, implication) appears and opens or closes the abstract. No abstract text is stored, only these numbers and the DOIs of the measured papers. `compare_style` and the app's "Style compared with 500 Q1 papers" card compare a manuscript with this profile, and the AI edit, issue and idea prompts receive it as targets for the abstract.

## Private full-text corpus (local install)
With the Claude Desktop extension (or a local server), choose a **corpus folder**, for example a folder inside your Google Drive (Google Drive for desktop syncs it to your Mac). Then ask Claude to run `corpus_build`:
- Quartile downloads up to 500 open-access, Creative-Commons-licensed Q1 articles (finance, small business, management; 2019 or later; at most 6 per journal) as PDFs into that folder, in the background. You can also drop your own PDF, Word or Markdown papers into it.
- It extracts every section and writes `corpus-profile.json`: section shares, words per paragraph, citations per 1,000 words, sentence length, voice, hedging, causal verbs and how introductions open, by field.
- `corpus_compare` compares a manuscript with it section by section; `corpus_search` finds the closest papers and passages (40-word snippets with DOIs); `corpus_originality` flags any sentence that repeats 8 or more consecutive words from a corpus paper.

The corpus is for **patterns only** (structure, proportions, moves, voice), never for wording. Full texts stay in your folder and are never uploaded; hosted connections (Render, ChatGPT) cannot read it. Text and data mining of lawfully accessible works for research is permitted in the EU (Directive 2019/790, Articles 3 and 4); respect each paper's licence for anything beyond private analysis.

## Journal bank
SCImago data are not stored in this repository. In HTTP mode the server downloads the public journal list from [scimagojr.com](https://www.scimagojr.com) at start-up and keeps the Business, Economics and Decision Sciences journals in memory (`QUARTILE_BANK_AREAS` changes the areas, `QUARTILE_FETCH_BANK=0` turns this off). Data: SCImago, SJR — SCImago Journal & Country Rank, https://www.scimagojr.com. To use your own export instead, build a file and set `QUARTILE_BANK`:
```bash
node scripts/build-bank.js scimagojr_2024.csv --areas "Business,Economics,Decision" --out data/bank.json
```
Difficulty = 0.45 × SJR percentile + 0.20 × H-index percentile + 0.20 × citations-per-document percentile + 0.15 × (100 − output percentile), within the journal's main category (×0.6 for conference proceedings). Very hard ≥ 80, Hard ≥ 60, Moderate ≥ 40, otherwise Accessible.

## Tests
```bash
cd mcp && npm install && cd .. && node tests/run.js
```
Covers the p-value functions against known values, each statistics check, the guard, safe replacement, document parsing and an MCP round trip over stdio.

## Method sources
The statistics recomputation follows the logic of statcheck (Nuijten et al., 2016, *Behavior Research Methods*; Epskamp & Nuijten, R package statcheck). The writing rules come from a profile of 80 Q1 abstracts in finance, small business, service and management research and from papers by faculty of 20 DBA-awarding schools.

## Citation
Alavi, S. M. (2026). *Quartile: a meaning-preserving Q1 academic writing engine with journal-editor simulation and statistics checks* (Version 0.8.0) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.24143278

See also `CITATION.cff`. Each GitHub release is archived on Zenodo.

## Licence
MIT © 2026 Seyed Mehdi Alavi, EMS International Kft.
