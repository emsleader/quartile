Phase 7 — Committee report, response tracker, feedback loop
Status: done (built and tested with synthetic findings and the existing YAML rules; the role modules eic, methods, finance, business, production and ethics return [] on this base and are merged from other branches)

What changed:
- New files: core/report/committee.js, core/report/render.js, core/report/feedback.js; core/roles/response.js filled in (run() still returns [] because the committee works on one manuscript only).
- New tools (4): `committee_review`, `response_tracker`, `rulebook_status`, `rule_feedback`.
- New rules: 0 (this phase adds no text rules).
- Tests: tests/phases/phase7-committee.test.js, phase7-response.test.js, phase7-tools.test.js, the helper phase7-zip.js (a small ZIP reader built on node:zlib), and five synthetic papers in tests/phases/fixtures/phase7/ (regression, survey, bounds, qualitative, SLR), written in the gold case format.
- changelog.d/phase-7.md.

Tests: all suites pass. node tests/run.js 101/101; tests/rules 8 rules, 29 checks; tests/phases 4 files (3 new, 128 new assertions); validation 0 functions; gold 0 cases; lint 71 files; changelog lists 39 tools; licences all allowed.
- Acceptance: committee_review runs end to end on all 5 synthetic papers without GROBID. Each takes well under 60 seconds; the whole tools test takes about 0.7 s. The time is checked in the test.
- The report renders as JSON and as DOCX. The test unzips the DOCX and finds all six role rows, the lights (icon and word) and the label in word/document.xml.
- response_tracker refuses export while any comment is open. This is tested for DOCX and Markdown, and for "declined" given without a reason.

Metrics: there are no gold cases in tests/gold/cases on this base. On the 5 synthetic papers with the QUARTILE_CORE rules (methods role): 5 planted, 5 found, 0 false positives. Precision is 1.00 and recall is 1.00 (n = 5). This is too small to count against the targets. Precision per role on real papers: not measurable yet. It needs the merged role modules and annotated papers.

Validation: no statistics code in this phase (not applicable).

Known limits and open questions for the owner
1. "Confirmed false positive": each `false_positive` verdict counts once per flag (rule + span). The same flag reported twice counts once. A later true_positive on the same flag replaces it. A rule is downgraded when the count since its last reset is more than 3. A reset is the verdict "reset" through `rule_feedback`. Is "confirmed" meant to need a second step by the owner?
2. Response statuses: Quartile only suggests matches (2 or more shared key terms, at least 1 in the changed words). Every row stays "open" until the author sets its status. So export always needs the author's statuses. "declined" without a reason stays open.
3. Location is section and paragraph number in the new version, not page. Plain text has no pages.
4. Findings with roles outside the six (for example writing, core) are shown as extra rows and count toward readiness. They do not set the overall state. Please confirm.
5. The five synthetic papers are kept in tests/phases/fixtures/phase7/ and not in tests/gold/cases. Role modules from other phases may flag issues in these papers that are not annotated, and the gold run would count those as false positives. The timing test also runs on any tests/gold/cases present after the merge.
6. Lights use the Okabe-Ito colours (#009E73, #E69F00, #D55E00), each with an icon (✔ ▲ ✖) and a word.
7. Readiness follows the specification weights (25/8/2/0). Low-confidence findings and the human checklist do not count.

Dependencies added: none (uses diff BSD-3-Clause, docx MIT, zod MIT, already installed).
