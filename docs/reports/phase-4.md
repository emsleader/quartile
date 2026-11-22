Phase 4 — Business-administration committee and production editor

Status: done. Real-manuscript precision is not measurable yet (see below).

What changed:
- New files: `core/theories.js` (dictionary loader and matcher), `core/hypotheses.js` (hypothesis declarations, basis, verdicts), `core/roles/business.js` (BUS-01 to BUS-07), `core/roles/production.js` (PRD-01 to PRD-07), `tools/hypothesis_map.js`, `data/theories.yaml`, `rulebook/business.yaml`, `rulebook/production.yaml`, `tests/gold/phase4-build.js`, `tests/gold/cases/phase4-*.json` (14), `tests/phases/phase4-{theories,business,production,hypothesis-map}.test.js`, `tests/rules/{BUS-T-01..04,PRD-T-01..05}/`, `changelog.d/phase-4.md`.
- New tool: `hypothesis_map` ({ text?, path?, design? } → hypotheses with basis, theories, citations, verdict and evidence; label "Simulated pre-submission review — not a journal decision").
- New rules: 9 YAML text rules (business 4: BUS-T-01 "proved", BUS-T-02 null "accepted", BUS-T-03 "must" from observational data (note), BUS-T-04 test claimed in a conceptual paper; production 5: PRD-T-01 table "below/above", PRD-T-02 placeholder or broken cross-reference, PRD-T-03 thesis wording, PRD-T-04 lower-case "table 2", PRD-T-05 "et al" without a stop) and 14 code checks (BUS-01 to BUS-07, PRD-01 to PRD-07).
- Theory dictionary: 216 theories and mechanisms, aliases, acronyms (case-sensitive), one reference each. All references are `verified: false`; the owner checks them in Scite. For the 147 references with a DOI, the DOI's registered title was compared with ours (Crossref, two by OpenAlex) on 22 November 2026: all 147 matched. Only the DOI was sent. The 57-term list in `core/core.js` is unchanged; a test checks that every one of its terms is also found by the new dictionary.

Tests: all suites pass. tests/run.js 101/101; rules 17 rules, 56 checks (27 new); phase tests 5 files (4 new); bugs 0 files; validation 0 functions; gold 14 cases (14 new); lint 68 files; changelog 36 tools; licences 348 packages allowed.

Metrics (synthetic Phase 4 gold set, 14 cases, 7 clean controls, 53 annotated issues):
- business: precision 1.00 (n = 24 flags), recall 1.00 (n = 24 issues).
- production: precision 1.00 (n = 29 flags), recall 1.00 (n = 29 issues).
- These cases were written together with the checks, so the numbers are optimistic. Four held-out cases were written after the checks were frozen and run once: business 5 of 6 flags true (precision 0.83, n = 6; the false flag was BUS-05 missing "Software vendors could ..." because "vendors" was not in the actor list, now added), production 5 of 5 (n = 5), recall 10 of 10. After the fix, all 14 cases give the numbers above.
- Real manuscripts: not measurable yet. Needed: the owner's 10 papers and 20 open-access papers annotated for BUS and PRD rule IDs (specification 14.1), placed in QUARTILE_GOLD_PRIVATE.
- Note: `tests/gold/run.js` counts every role's findings. After merge, findings of other phases on these synthetic texts will count as false positives unless they are annotated.

Validation: no statistics code in this phase (no comparison with R needed).

Known limits and open questions for the owner:
1. Theory references: all 216 need your Scite check before use; 69 classic books and journal articles without a DOI were not checked by machine at all.
2. Thresholds (not set by the specification; safe defaults used): HTMT ≥ 0.90 is major and 0.85 to 0.90 is a note (set `htmt_threshold: 0.85` for the strict rule); alpha below 0.70 is minor; recency note when fewer than 20% of at least 10 dated references are from the last five years; self-citation note above 25%. All PRD-07 findings are notes with low confidence. Please confirm or give your own values.
3. PRD-05 runs without a policy only as one note listing conference and working papers. The Q1/Q2 share is flagged only when you set `citation_policy.min_q1q2_share` or `q1q2_only`. Journal names are read from APA-style references and matched exactly to the bank; other styles give "other".
4. PRD-06 runs only with a glossary (`glossary` object or `glossary_path` to glossary.yaml/json). Without one it reports nothing. Format: `groups: [ { preferred: term, variants: [...] } ]` or a list of term lists.
5. PRD-07 self-citation needs the author name as input (`author` or `authors`); gold cases cannot pass it, so it is tested only in phase tests.
6. Designs: BUS-02 follows the specification (regression, survey, conceptual), so it does not run on sem papers; BUS-05 runs on regression, bounds, sem, experiment, survey and qualitative (not simulation); BUS-07 runs on regression, bounds, sem, survey and experiment. Should sem be added to BUS-02 and BUS-03?
7. BUS-02 lets a list of consecutive hypotheses share one argument paragraph; an earlier hypothesis ends the search. The specification's sample code would flag every hypothesis in such a list.
8. PRD-03 is lenient: any "(ABC)" after words counts as a definition, a table-note definition counts, and a whitelist skips common forms (US, EU, GDP, CEO, PRISMA, OECD ...). Technical documents with code names give many PRD-03 flags.
9. PRD-04 reads author-year and numbered styles. It does not resolve DOIs or check retractions (that stays in `verify_references_live`). "et al" without a stop is not read as a citation (PRD-T-05 flags it instead).
10. Phase 0 items seen, not changed (outside this phase): `isHeadingLine` in `core/text/sections.js` calls `Core.isHeading`, which `core/core.js` does not export, so it throws when called; and table or figure captions are detected as section headings, so a caption opens a new "section" with an inherited key. Phase 4 code does not depend on either.
11. Committee integration: `run(doc, opts)` reads `glossary`, `glossary_path`, `citation_policy`, `reference_year`, `author(s)`, `bibliography`, `htmt_threshold`; the Phase 7 committee report should pass them through.

Dependencies added: none (uses the installed @citation-js/core, plugin-bibtex and plugin-ris, MIT; yaml, ISC; zod, MIT).
