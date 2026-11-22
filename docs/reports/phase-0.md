Phase 0 — Foundation and bug fixes
Status: partly done. Done: architecture map, ES modules, document model, rule engine with YAML rulebook, the 13 bug items with regression tests, CI, licence file. Not done: the acceptance test on the WB-EMS manuscript (the manuscript is not in the repository; it must be run on the owner's machine with `QUARTILE_GOLD_PRIVATE`), and moving the remaining code checks of `core/core.js` (desk screen, business checks) into YAML (only the claim audit's eight pattern rules were moved; see open questions).

What changed: files, new tools, new rules (count)
- `docs/Quartile_Upgrade_Specification.md` (Part B, verbatim), `docs/ARCHITECTURE_CURRENT.md` (map of the code before the upgrade).
- ES modules everywhere (owner decision of 22 November 2026). `package.json` and `package-lock.json` moved from `mcp/` to the repository root; Dockerfile, `scripts/build-mcpb.sh`, the corpus and FER workflows and the README updated. The `.mcpb` bundle was built and its server listed all 35 tools.
- `core/text/`: `parse.js` (document model: paragraphs, sections, sentences with offsets, tables, numbers, citations; DOCX through mammoth with real heading styles; PDF through GROBID when `QUARTILE_GROBID_URL` is set, otherwise pdfjs-dist), `sections.js` (the specification's section names on top of the 0.14.3 heading rule, kept by owner decision), `negation.js`, `sentences.js`, `design.js`.
- `core/rules/`: `schema.js` (ajv), `loader.js` (refuses missing `source_ref`, missing positive or negative tests, duplicate IDs, invalid regular expressions), `engine.js`, `structural.js` (extension folder `core/rules/tests/`).
- `rulebook/quartile_core.yaml`: 8 rules (the claim audit's pattern rules), each with 1 positive and 2 negative tests; `core/evidence.js` now reads them from the rulebook. Output of `claim_audit` is unchanged except for a new `rulebook_id` field in its `rules` list.
- `tools/index.js` (one file per new tool), `core/roles/*.js` (stubs for the parallel phases), `core/store/db.js` (shared local database for Library and Record), `changelog.d/`.
- Bug fixes: item 9 (`number_registry` reports `untraced.outputNotSupplied` separately; readiness gives no penalty for tables whose output was not supplied), items 11–12 (EGBA figures recycle shades and line types; warning above 8 cells), item 13 (APA sentence adds "(sign not identified at any rung)"), item 10 (CHANGELOG entries for 0.16.1 and 0.16.2; every tool named; CI check). A one-value `q_grid` no longer crashes the EGBA APA sentences (found while writing the item 13 test).
- Privacy: `grammar_check` and `literature_overlap` now say in their description and in a new `privacy` output field what they send and where (owner decision: keep the tools, add a clear warning).
- Version numbers in `bundle/manifest.json`, `CITATION.cff` and `.zenodo.json` brought to 0.16.2, the version already in `package.json`.
- README: Limits section (specification Section 17).
- New tools: none in Phase 0.

Tests: total, passed; new tests added
- `node tests/run.js`: 101 of 101 passed (unchanged suite; one assertion adjusted, see open questions).
- `node tests/rules/run.js`: 8 rules, 29 checks passed (new).
- `node tests/bugs/run.js`: 12 files covering items 1–13 passed (new; items 11 and 12 share one file).
- `node tests/phases/run.js`: 1 file (local database) passed (new).
- FER tests and the MCP smoke test pass.

Metrics: precision / recall per role on gold set (with n)
- Not measurable yet: the gold set has 0 cases in this phase. The harness (`tests/gold/run.js`, `plant.js`, README) is in place.

Validation: stats vs R (max absolute difference)
- No new statistics functions in Phase 0. `tests/validation/run.js` is in place for Phase 2.

Known limits and open questions for the owner
1. Bug report text. The 13-item report of 13 November is not in the package. The regression tests use the example sentences from that report that `tests/run.js` has held since 0.14.1, mapped to the item numbers in specification Sections 3.1–3.4. Please check the mapping, or send the report so the tests use its exact sentences.
2. WB-EMS acceptance test (zero false positives on items 1–9) needs the manuscript on your machine: put it in the folder named by `QUARTILE_GOLD_PRIVATE` as a gold case and run `npm run test:gold`.
3. Old test adjusted. The MCP tool-count assertions in `tests/run.js` and `tests/fermodels.mcp-smoke.js` said "35 tools"; they now say "35 plus the tools in `tools/`". This was needed because new tools are added in parallel. The other 100 assertions are unchanged.
4. Moving the remaining checks to YAML. The desk screen and business checks in `core/core.js` mix patterns with document logic. Moving them without changing behaviour is a larger, risky change; I propose to move them rule by rule in later phases, each with its old test kept. Please confirm.
5. Deviations from the specification's code, each made to keep a test green and listed here for approval: (a) heading rule of 0.14.3 kept (owner decision); (b) the design classifier also matches "partial-identification" with a hyphen, and uses the whole text when the methods section carries no design signal (the bounds test paper was otherwise classed "unknown"); (c) `yaml` (ISC) instead of `js-yaml`, because js-yaml 5 brings `argparse` 2, which is PSF-2.0, not on the allowed list; (d) `sql.js` instead of `better-sqlite3` (no native build, so the Claude Desktop bundle keeps working), with FTS4 instead of FTS5 (this sql.js build has no FTS5); (e) CI runs on Node 20 and 22 (the specification says 20; the server image uses 22).
6. Part A vs Part B differences (Part B followed, as instructed): Phase 6 target of 150 book rules vs "do not invent rules from books you have not been given"; Part B Section 16 says each phase ends with a tag and a Zenodo release, while you publish; Part B lists phases 0–7 only (Library and Record have no phase number in Part B); Section 19 is missing in Part B.
7. Reference lookups. `verify_references_live` sends reference strings (authors, title, journal) to Crossref, which is more than DOI, title and ISSN. It is a live-lookup tool, so it is allowed by rule 7, but please confirm.
8. Transitive packages without a clear licence field were checked by hand and listed in `THIRD_PARTY_LICENSES.md` (buffers, chainsaw, mkdirp, rimraf, duck: MIT/ISC/BSD); all come through exceljs and mammoth, which were already in use.
9. Data in the public repository from 0.16.1 (`data/fer-hungary-independent-replication-2026-11-17.json`, aggregates only) — for your information.

Dependencies added (name, licence)
- ajv 8.20.0 (MIT), yaml 2.9.1 (ISC) — Phase 0.
- Installed in Phase 0 for the parallel phases, so they do not edit the lock file: @citation-js/core, plugin-bibtex, plugin-ris, plugin-doi 0.9.0 (MIT), diff 9.0.0 (BSD-3-Clause), franc 6.2.0 (MIT), retext 9.0.0, retext-english 5.0.0, retext-passive 5.0.0, retext-simplify 8.0.0, retext-readability 8.0.0 (MIT), write-good 1.0.8 (MIT), fuse.js 7.5.0 (Apache-2.0), fast-xml-parser 5.12.1 (MIT), sql.js 1.17.0 (MIT), ulid 3.0.2 (MIT), docx 9.16.0 (MIT).
- Not bundled: citeproc / @citation-js/plugin-csl (CPAL/AGPL), statcheck (GPL-3), metacheck (AGPL-3).
