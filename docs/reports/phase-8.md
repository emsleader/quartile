Phase 8 — Built-in reference library (Quartile Library, specification Section 20)
Status: done (all of LIB-01 to LIB-12 and the nine tools; integration into the production role and committee report is left to the coordinator, see open questions)

What changed: files, new tools, new rules (count)
- core/library/: schema.sql (20.2, FTS4), store.js (items, tags, collections, backup library.json), normalize.js, importers.js (BibTeX, RIS, CSL-JSON, Zotero RDF), remote.js (Crossref then OpenAlex; retraction status from updated-by, relation and update-to), ops.js (add by DOI, import, verification log, search, PDF attach), dedupe.js, policy.js, match.js, apa7.js (own APA 7 formatter), export.js (BibTeX with AuthorYearWord keys, pandoc .bib, RIS, CSL-JSON), screening.js, index.js.
- scripts/screening-agreement.R (Cohen's kappa in base R from the exported screening CSV).
- New tools (9): `library_add`, `library_import`, `library_export`, `library_search`, `library_verify`, `library_match_manuscript`, `library_bibliography`, `library_dedupe`, `library_screening` (shared helpers in tools/_library.js). Merge and delete only with confirm: true; otherwise a preview.
- New rules: 0 YAML rules. 11 code finding IDs: LIB-POL-01 to 05 (citation policy) and LIB-MAT-01 to 06 (matching).
- Docs: docs/methods/library-dedupe.md, library-matching.md, library-apa7.md. Changelog: changelog.d/phase-8.md.
- Fixtures (all synthetic): tests/fixtures/library-500.bib and .expected.json, library-dedupe.json, library-dedupe-check.json (all from make-library-fixtures.js), apa7-50.json (50 hand-written APA 7 strings).

Tests: total, passed; new tests added
- node tests/run.js 101/101; tests/rules/run.js 8 rules, 29 checks; tests/bugs/run.js passed; tests/phases/run.js 6 files passed; tests/validation/run.js passed; tests/gold/run.js passed; lint, changelog and licence checks passed.
- New: 5 phase test files (tests/phases/phase8-library-*.test.js) with 173 assert calls plus loops (5,754 field checks in the 500-item import test). Every test uses a temporary QUARTILE_HOME; no network (fetcher injected).

Metrics: precision / recall per role on gold set (with n)
- Gold set: no gold cases added; library findings are produced by the library tools, not by a role module, so tests/gold/run.js does not see them (not measurable yet).
- 500-item BibTeX import: 500/500 added; every generated field read back as expected; import, export, import again: 0 differences in the CSL records (n = 500).
- Duplicates (synthetic, labelled pairs): build set n = 170 pairs (40 true): precision 1.000, recall 1.000. Check set made after the rules were fixed, n = 350 pairs (100 true): precision 1.000, recall 1.000. Both sets were written by the developer of the rules, so these are upper bounds.
- Manuscript matching (synthetic manuscript): 14/14 in-text citations found, each matched or flagged with the expected status; 0 false citations ("In 2020", "(N = 2020)", "Table 3 (2019)"); numbered style 4/4.
- APA 7: 50/50 outputs identical to the hand-written strings. The strings were written from the APA rules by the same developer and are not independently checked: the owner should spot-check them.

Validation: stats vs R (max absolute difference)
- No JavaScript statistics in this phase. Cohen's kappa is computed only in R (scripts/screening-agreement.R); the test checks R's result on the table [[4,1],[2,3]] against the hand value 0.4 (difference 0), R 4.3.3.

Known limits and open questions for the owner
1. Storage uses sql.js (MIT, WebAssembly) instead of better-sqlite3: no native build, works in the Claude Desktop bundle. The whole file is rewritten on each change (fast enough: 500 items import in about 1.3 s).
2. Search uses SQLite FTS4, not FTS5 (this sql.js build has no FTS5). The FTS4 table is not contentless so rows can be updated and deleted.
3. Retraction is flagged (LIB-POL-01, blocker) even for items tagged own-work or close-idea. The code sketch in 20.6 checks the exceptions first. Safe default chosen; please confirm.
4. quartile_year: the SCImago bank built by core/bank.js has no year. The library stores the year only when QUARTILE_BANK_YEAR is set; otherwise it is empty. Should the bank record its SCImago year?
5. Duplicate rule: the 0.92 threshold is applied to a defined similarity (1 - Levenshtein / longer length); fuse.js only finds candidates in large surname groups. Two extra guards were added to keep precision: titles differing in a number or Roman numeral, or in a whole different word, are not suggested. Please confirm.
6. Titles are printed as stored in APA output (no automatic sentence case). Journal styles other than APA are not built.
7. Not wired into committee_review: core/roles/production.js belongs to another phase. Suggested: production.run calls matchManuscript(lib, { doc }) when the library has items, and adds its findings.
8. The Zotero RDF reader was written from the published export format and tested on a synthetic file only; please test one real Zotero RDF export.
9. Scite results are recorded by hand (source scite); there is no Scite API call. DOAJ is not used.
10. RIS import keeps only the tags plugin-ris maps; unknown RIS tags are dropped (BibTeX keeps unknown fields verbatim).
11. The library shares library.sqlite with Phase 9 (Quartile Record). Table names used here: items, verification, collections, item_collections, tags, notes, files, screening, items_fts. Please check for clashes when merging.
12. The CSL-JSON backup (library.json) is written after every import and merge and on demand (library_export backup: true); there is no nightly scheduler.
13. Policy for conceptual papers is the same as for empirical papers (Q1/Q2 only).

Dependencies added (name, licence)
- None. Used the installed sql.js (MIT), ulid (MIT), @citation-js/core, plugin-bibtex and plugin-ris (MIT), fuse.js (Apache-2.0), fast-xml-parser (MIT). citeproc and @citation-js/plugin-csl are not installed or bundled (checked in a test).
