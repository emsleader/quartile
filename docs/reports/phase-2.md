Phase 2 — Finance and statistics reviewer

Status: done. (Real-manuscript acceptance is not measurable yet; see the open questions.)

What changed: files, new tools, new rules (count)
- New statistics modules: `core/stats/dist.js` (pt, pf, pchisq, pnorm, pbinom, ibeta, lgamma), `core/stats/grim.js` (grim, grimTestable, grimVerdict), `core/stats/grimmer.js` (grimmer: quick necessary conditions; grimmerExact: exact search on a bounded scale), `core/stats/debit.js`, `core/stats/pcurve.js` (caliper), `core/stats/recompute.js` (pValue, pRange, checkResult, extractResults, recompute).
- Role module `core/roles/finance.js`: code checks STA-01 (GRIM, GRIMMER, DEBIT), STA-02 (p recomputation, decision inconsistency at .05, one-tailed when the text says so), STA-03 (caliper, note only, ≥ 15 p-values), STA-04 (percentage columns with a Total row of 100 add to 100 within rounding), STA-05 (one total sample size). `run(doc)` returns the STA checks; `review(doc)` or `run(doc, { includeRulebook: true })` adds FIN-01…08.
- Rulebook `rulebook/finance.yaml`: 8 rules, FIN-01 to FIN-08, with design gates (FIN-01/02/03/07 regression; FIN-04 regression; FIN-05 regression, survey; FIN-06 regression, sem, experiment, survey; FIN-08 survey). Structural tests in `core/rules/tests/phase2.js` (fin_evidence, fin_evidence_if, fin_mention_if, fin_tests_without); all regexes live in the YAML. Negation-aware (specification 3.2).
- New tool: `grim_check` (tools/grim_check.js): `{ means: [{ mean, n, items?, dp?, sd?, min?, max? }] }` or `{ text }` → possible / not possible / not testable per mean, with GRIMMER when an SD is given.
- Method notes (own words): `docs/methods/p-value-recomputation.md`, `docs/methods/grim-grimmer-debit.md`.
- Clean-room implementation from Nuijten et al. (2016), Behavior Research Methods 48(4), 1205–1226; Brown & Heathers (2017); Anaya (2016); Heathers & Brown (2019). No source code consulted or copied.
- `core/stats.js` and `check_statistics` are unchanged.

Tests: total, passed; new tests added
- tests/run.js 101/101; tests/rules/run.js 16 rules, 55/55 checks (8 new rules, 26 new checks, files in tests/rules/FIN-0*/); tests/phases/run.js 2/2 files (new: tests/phases/phase2-finance.test.js, 69 assertions); tests/validation/run.js 15 functions, 2,201 cases (all new); tests/gold/run.js 4 cases (all new); lint, changelog and licence checks pass.
- Gold cases added: tests/gold/cases/phase2-planted-survey.json (5 planted errors: impossible GRIM mean, inconsistent n, p decision inconsistency, percentage column adding to 94, WBES without weights), phase2-regression-clean.json, phase2-bounds-clean.json, phase2-wbes-weighted.json (clean controls, no expected findings).
- Acceptance: zero regression-type flags on the synthetic bounds paper, detected and declared (tests/phases/fixtures/phase2-bounds-paper.txt; the same text declared as regression gets FIN-01/02/03/05/07, so the gate is what keeps it quiet). FIN-08 flags two positive texts and passes three negative texts (weights used; WBES negated; no WBES).

Metrics: precision / recall per role on gold set (with n)
- finance: precision 1.00 (5 / 5 flags), recall 1.00 (5 / 5 expected), n = 4 synthetic cases; planted recall 5 / 5. Too few items for a meaningful estimate; below the gate size of the runner for roles other than finance.

Validation: stats vs R (max absolute difference)
- Max absolute difference 3.5e-11 over 2,201 cases (R 4.3.3, base R only). Distributions: pt 288, pf 450, pchisq 208, pnorm 34, pbinom 336, ibeta 175, lgamma 11; recompute: pValue 28, pRange 8, checkResult 20; grim 123, grimmer 150, grimmerExact 180, debit 150, caliper 40. Scripts: tests/validation/distributions.R, tests/validation/consistency.R (+ _json.R, a small JSON writer because jsonlite is not installed).
- The scrutiny package is not installed and CRAN is blocked, so GRIM, GRIMMER and DEBIT expected values come from brute-force enumeration in R (every total, every sum of squares, every data set on small bounded scales, every count of ones with R's sd()).

Known limits and open questions for the owner
1. FIN-08 is gated to survey designs, as the specification says. A WBES paper that runs regressions is classified as regression and FIN-08 does not run. Should FIN-08 also run on regression designs when WBES is detected?
2. "Panel" is not a design in the classifier; FIN-04 runs on regression only. FIN-04 checks survivorship wording only; look-ahead bias (variables measured after the outcome) is not detected.
3. "All quantitative" for FIN-06 was read as regression, sem, experiment, survey. Bounds and simulation papers are excluded (safe default). FIN-06 counts p-values in the text only, not significance stars in tables.
4. Severities not given in the specification were set as: FIN-01, FIN-02 major; FIN-03, FIN-04, FIN-05, FIN-07 minor; FIN-06 note. GRIM failure major (medium); GRIMMER minor (low); DEBIT minor; p inconsistency minor, decision inconsistency major; STA-04 and STA-05 minor. Please confirm.
5. Duplication: the committee (specification 15) runs the whole rulebook and then the role modules. To avoid double counting, finance.run() does not re-run finance.yaml by default. Phase 7 should either keep that or dedupe on rule + span.
6. STA-01 reads means only from sentences (not tables), and only when integer data, the item count and n are clear. STA-04 checks only columns whose Total row says 100. STA-05 compares total-sample statements (abstract, "final/total sample", "(n = … in Table k)") and skips sentences with sample-flow or subgroup words. All three choose misses over false flags.
7. Real-manuscript acceptance (precision ≥ 0.85, 0 false positives on the WB-EMS paper) is not measurable yet: it needs the owner's manuscripts in QUARTILE_GOLD_PRIVATE.
8. Rule-test texts and gold cases are synthetic; they were not taken from published papers.

Dependencies added (name, licence)
- None. (simple-statistics and @stdlib were not needed; distributions are written in core/stats/dist.js.)
