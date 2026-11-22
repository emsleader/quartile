Phase 1 — Methods reviewer
Status: done (AAPOR is a manual stub only; JARS-Quant / JARS-Qual not encoded, see open questions)

What changed:
- core/roles/methods.js: MTH-02 checklist summary (note, needs_human), MTH-03 sample-flow arithmetic, MTH-04 measurement defined before use, MTH-05 preregistration claimed without a registry link (negation-aware).
- core/roles/checklists.js: checklist schema (ajv), loader, design-based selection, item evaluation.
- rulebook/checklists/: prisma_2020.yaml (27 items, 42 entries with sub-items), strobe.yaml (22 items, 33 entries), cherries.yaml (30 items), conjoint.yaml (12 items), coreq.yaml (32 items), aapor_stub.yaml (12 manual items).
- rulebook/methods.yaml: 4 new rules: MTH-CAUSAL-01, MTH-CAUSAL-02, MTH-CAUSAL-03, MTH-06.
- core/rules/tests/phase1.js: structural test limitations_specific.
- New tool: `reporting_checklist` (tools/reporting_checklist.js).
- docs/methods/sample-flow.md; changelog.d/phase-1.md.
- tests/gold/phase1-build.js and 18 gold cases tests/gold/cases/phase1-*.json.

Tests: all suites pass. tests/run.js 101/101; tests/rules/run.js 12 rules, 46 checks; tests/phases/run.js 2 files; tests/gold/run.js 18 cases, targets met; tests/validation/run.js, tests/bugs/run.js, lint, changelog and licence checks pass.
New tests: 17 rule test files (tests/rules/MTH-*), tests/phases/phase1-methods.test.js (checklist schema and item numbers, checklist selection, 15 sample-flow cases, design gates, MTH-04, MTH-05, tool output and label), 18 gold cases.

Metrics (synthetic gold set, 18 cases written for this phase, so the numbers are optimistic):
- methods role: precision 1.00 (14 TP, 0 FP), recall 1.00 (14 of 14); n = 14 annotated issues.
- planted errors: 14 of 14 caught; all 8 planted sample-flow errors caught (single step, multi-step, "after removing X, Y remained", PRISMA "(n = …)" and "label: N" forms).
- correct flows (11 paragraphs), negated causal sentences (5), identified and experimental designs: 0 flags.
- Real manuscripts: not measurable yet. Needs the owner's annotated manuscripts in QUARTILE_GOLD_PRIVATE and the open-access CC BY set (specification 14.1).

Validation: no statistics code in this phase (no R comparison needed).

Known limits and open questions for the owner
1. MTH-CAUSAL-01 runs on regression, survey, bounds, qualitative, sem and slr designs. It does not run on conceptual, simulation or unknown designs (in those, causal wording describes the theory or the model). Please confirm.
2. MTH-03 runs on survey, slr and regression designs only (as in the specification), not on sem, experiment or unknown. Sample-flow arithmetic does not depend on the design; widening it is a one-line change.
3. CHERRIES does not number its items; the numbers (1.1 to 8.3) are Quartile's. The conjoint list is drawn by Quartile from Hainmueller et al. (2014) and Bansak et al. (2021); there is no official checklist. AAPOR is a manual stub with Quartile's numbering (A1 to A12); please check it against the current AAPOR Code. JARS-Quant / JARS-Qual are not encoded (too many tables to paraphrase reliably): open.
4. STROBE is also used for sem designs; no checklist is chosen for bounds, conceptual, simulation or non-conjoint experiments (CONSORT is not encoded).
5. MTH-05 accepts a Zenodo DOI as a registry link (a time-stamped public record). Strictly, Zenodo is not a preregistration registry. Please decide.
6. The second half of MTH-05 (a plan written after the data called a preregistration) is already covered by Phase 0 rule QC-CLAIM-PREREG; it is not duplicated.
7. Phase 0 issue found: the negated sentence in tests/gold/plant.js ("The survey does not show that owner experience causes higher survival.") is flagged by QC-CLAIM-CAUSAL (rulebook/quartile_core.yaml, negation: none). It is a false positive for the methods role whenever that plant is used. Suggested fix (not made; Phase 0 file): give QC-CLAIM-CAUSAL negation "scope" or add "does not show" to its except pattern.
8. MTH-02 gives one summary finding per checklist with severity note and status needs_human, because keyword evidence cannot prove an item is fully reported. It does not count in precision.
9. MTH-04 and MTH-06 are heuristics: MTH-04 is minor/low confidence; MTH-06 judges only full papers (methods, results and a discussion, conclusion or limitations section). Other phases' gold cases may trigger MTH rules after merge; methods precision should be rechecked on the merged branch.
10. "predicts" (MTH-CAUSAL-03) is a note only, and "confirm" is minor: both are common in business papers and often not a causal claim.

Dependencies added: none.
