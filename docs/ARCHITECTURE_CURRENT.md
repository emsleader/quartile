# Quartile — current architecture (before the committee upgrade)

Mapped on 22 November 2026 from `main` at commit `94bcb20` (package version 0.16.2). No code was changed to write this map.
Baseline tests at this commit: `node tests/run.js` → 101 of 101 passed (102 `ok()` calls, one inside a loop guard); `tests/fermodels.test.js` → 20/20 aggregate checks and 6 negative cases passed; `tests/ferliterature.test.js` passed.

## 1. Layout

| Path | What it is |
|---|---|
| `core/` | All checking logic. CommonJS modules, no build step. Shared by the MCP server, the tests and (through `scripts/sync-app.js`) the browser app. |
| `mcp/server.js` | The MCP server. Registers **all 35 tools, 1 resource and 3 prompts in one file** (there is no `tools/` folder). stdio by default, Streamable HTTP with `--http`. |
| `mcp/corpus.js` | Private full-text corpus (build, analyse, search, originality, benchmark). Stores measurements only. |
| `mcp/widget.html` | MCP Apps result card (one self-contained page, kinds rendered per tool). |
| `app/index.html` | Offline browser version; `scripts/sync-app.js` inlines `core/*.js` into it. |
| `data/` | Journal bank, style and corpus profiles, prose word lists, FER aggregate fixture and FER literature index, `THIRD-PARTY.md`. |
| `scripts/` | `build-mcpb.sh` (Claude Desktop bundle), `build-bank.js`, `build-prose-rules.js`, `build-style-brain.js`, `benchmark.js`, `corpus-ci.js`, `sync-app.js`. |
| `tests/` | `run.js` (main suite), `fermodels.test.js`, `ferliterature.test.js`, `fermodels.mcp-smoke.js`, `fer-r-aggregate-gate.R`, fixtures. |
| `bundle/` | `manifest.json` and icon for the `.mcpb` bundle. |
| `docs/` | `AI-STYLE.md`, FER documents, and now this map and the upgrade specification. |
| `Dockerfile`, `render.yaml` | Hosted server: `node:22-bookworm-slim` + `r-base-core`, `r-cran-foreign`, `r-cran-survival`; Render free plan, secret path `/mcp/<QUARTILE_SECRET>`. |
| `.github/workflows/` | `corpus-build.yml`, `fer-model-audit.yml`, `fer-r-aggregate-audit.yml`, `style-brain.yml`. **There is no general CI that runs `tests/run.js` on push or pull request.** |

Module system: CommonJS (`"type": "commonjs"` in `mcp/package.json`). `package.json` lives in `mcp/`, not at the repository root. Node ≥ 18 declared; Docker and workflows use Node 22.

## 2. Core modules

| Module | Exports | Role |
|---|---|---|
| `core/core.js` | `Core` (IIFE): `splitParagraphs`, `isHeading`, `headingLevel`, `sectionRoles`, `detectRole`, `ruleChecks`, `deskScreen`, `bizChecks` (theory list `THEORIES`), `consistency`, `citeStyle`, `parseRef`, `citeKey`, `aiTells`, `numbers`, `citations`, `sentences`, `compare`, `wordDiff`, `HEDGES`, `CAUSAL`, `NEGATIONS` … | Text model and most pattern checks. Section detection is heading-heuristic (`isHeading` accepts title-case or numbered short lines, with or without a trailing colon or period; unnumbered sub-headings inherit the role of the section above). |
| `core/lib.js` | `parse`, `analyze`, `desk`, `references`, `verify`, `applyReplacements`, journal bank functions, `compareStyle`, `styleGuide` | Document-level API; DOCX via mammoth, PDF via pdfjs-dist. |
| `core/stats.js` | `checkAll` and helpers, including `grim()` | statcheck-style p-value recomputation (t, F, r, χ², z) written from the published method, regression-table consistency, impossible values, software fingerprints. |
| `core/evidence.js` | `checkLedger`, `claimAudit`, `template`, … | Evidence ledger (grades A–E, statuses OBSERVED/DERIVED/CONDITIONAL/NOT_IDENTIFIED) and claim audit (rules with negation handling `NEG_BEFORE`/`NEG_NEAR`). |
| `core/registry.js` | `registry`, `match`, … | Number registry: traces each manuscript number to supplied software output. |
| `core/readiness.js` | `readiness`, `PEN` | Transparent 0–100 pre-submission score (explicitly not an acceptance prediction). |
| `core/aistyle.js` | `check`, `measure`, `score`, `fixSentence` | AI-style surface signal with fixes. |
| `core/prose.js` | `lint`, `readability` | Prose lint; word lists from proselint (BSD-3) and MIT lists, pinned in `data/prose-rules.json`. |
| `core/integrity.js` | `screen` | COPE-aligned integrity screen. |
| `core/net.js` | `verifyReferences`, `literatureOverlap`, `grammar` | Live lookups: Crossref, OpenAlex, LanguageTool. |
| `core/rstats.js` + `core/rstats.R` | `run`, `PROCS`, `apa` | SPSS-style procedures in R with figures, Excel output and reproducibility record; includes procedure `egba`. |
| `core/surveyplan.js` + `surveyplan.R`, `egba.R`, `egba_time.R` | `plan`, `egba`, `egbaTime` | Survey sample-size planner, evidence-graded bounds, EGBA-Time. |
| `core/excel.js` | `xlsxToCsv`, `workbook` | exceljs in/out. |
| `core/style.js`, `core/stylemetrics.js` | style levels, metrics | Q1 style guide and abstract measurements. |
| `core/bank.js` | `parseCsv`, `buildBank` | Journal bank from the user's SCImago export. |
| `core/benchmark.js` | `run` | Error-injection benchmark. |
| `core/fermodels.js`, `core/ferliterature.js` | `FORMULAE`, `audit`, `search`, `index` | FER paper equation catalogue, aggregate audit, literature index (added in 0.16.1–0.16.2). |

## 3. MCP tools (35) and the module behind each

| Tool | Handler | Network |
|---|---|---|
| `analyze_manuscript` | `L.analyze` | no |
| `desk_screen` | `L.desk` | no |
| `check_statistics` | `Stats.checkAll` | no |
| `check_references` | `L.references` | no |
| `verify_rewrite` | `L.verify` | no |
| `apply_replacements` | `L.applyReplacements` | no |
| `compare_style` | `L.compareStyle` | no |
| `q1_style_guide` | `L.styleGuide` | no |
| `corpus_status`, `corpus_build`, `corpus_analyse`, `corpus_compare`, `corpus_search`, `corpus_originality`, `corpus_profile_export`, `benchmark_corpus` | `mcp/corpus.js` | `corpus_build` and `benchmark_corpus` call OpenAlex |
| `integrity_screen` | `Integrity.screen` | no |
| `ai_style_check` | `aistyle.check` | no |
| `number_registry` | `registry.registry` | no |
| `submission_readiness` | `readiness.readiness` | no |
| `prose_check` | `prose.lint` | no |
| `run_statistics` | `rstats.run` | no (local R) |
| `survey_plan`, `egba_bounds`, `egba_time` | `surveyplan.js` | no (local R) |
| `evidence_ledger`, `claim_audit` | `evidence.js` | no |
| `verify_references_live` | `net.verifyReferences` | Crossref (DOIs and reference strings) |
| `literature_overlap` | `net.literatureOverlap` | **OpenAlex: sends sentences from the manuscript as search queries** |
| `grammar_check` | `net.grammar` | **LanguageTool public API: sends the manuscript text** |
| `journal_lookup`, `journal_suggest` | `L.journalLookup/Suggest` | no |
| `fer_literature_index`, `fer_equation_catalog`, `fer_replication_audit` | `ferliterature.js`, `fermodels.js` | no |

Resource: `ui://quartile/report-v1.html` (result card). Prompts: `q1_edit`, `journal_editor` ("desk decision plus three reviewer reports"), `idea_to_paper`.

## 4. Tests and build

- Tests are plain Node scripts with a local `ok()` assertion, not a test framework. `tests/run.js` covers statistics, the guard, document parsing, regression tests from the reports of 11, 12 and 13 November 2026, style profile, integrity, corpus (synthetic), AI style, registry, readiness, ledger and claim audit, R procedures (skipped without R), EGBA, survey plan, and an MCP round trip over stdio that checks the tool count.
- No `npm run lint`, `test:rules`, `test:stats`, `test:gold` or `check:changelog` scripts exist yet; `mcp/package.json` has only `start`, `http`, `test`.
- Build: `scripts/build-mcpb.sh` packs `core/`, `mcp/`, `data/*.json` and `bundle/` into `Quartile.mcpb`. Render builds the Dockerfile on every push to `main`.
- Release: version in `mcp/package.json`, `bundle/manifest.json`, `CITATION.cff`, `.zenodo.json`; CHANGELOG entry; tag and GitHub Release made by the owner (Zenodo archives the Release).

## 5. Dependencies (mcp/package.json)

| Package | Version | Licence |
|---|---|---|
| @modelcontextprotocol/sdk | 1.32.2 | MIT |
| @modelcontextprotocol/ext-apps | 2.0.4 | MIT |
| zod | 4.6.7 | MIT |
| express | 5.3.0 | MIT |
| mammoth | 1.13.0 | BSD-2-Clause |
| pdfjs-dist | 3.11.174 | Apache-2.0 |
| exceljs | 4.4.0 | MIT |

There is no `THIRD_PARTY_LICENSES.md` yet; credits are in `data/THIRD-PARTY.md`.

## 6. Findings that matter for the upgrade

1. **Versions are out of step.** `mcp/package.json` says 0.16.2; `bundle/manifest.json`, `CITATION.cff`, `.zenodo.json` and the top of the CHANGELOG say 0.16.0. The CHANGELOG has no 0.16.1 or 0.16.2 entry and does not list the three `fer_*` tools (this is bug item 10 in the specification).
2. **No `tools/` folder.** The specification assumes one file per tool in `tools/`; today every registration is inline in `mcp/server.js`.
3. **CommonJS, not ESM.** The specification's code samples use `import`/`export`.
4. **Two existing tools send manuscript text out** (`grammar_check`, `literature_overlap`). Part A rule 7 allows only DOI, title and ISSN to leave the machine.
5. **Heading rule differs.** Specification 3.1 rejects heading lines ending in `.`, `;` or `:`; the current code accepts them on purpose (0.14.3, with a regression test).
6. Several specification items already exist in some form: GRIM (`core/stats.js`), p-value recomputation (`check_statistics`), empty grade for NOT_IDENTIFIED (bug item 5, fixed in 0.14.1), theory dictionary (`THEORIES` in `core/core.js`, about 57 names; the specification asks for ≥ 150), negation handling (`core/evidence.js`), design gate for regression checks on bounds papers (0.14.2).
7. No general CI workflow; tests run only by hand and in the FER workflows.
8. Data in the public repository: `data/fer-hungary-independent-replication-2026-11-17.json` and `tests/fixture-fer-aggregates.json` (aggregates, added in 0.16.1). Listed here for the owner's information only.
