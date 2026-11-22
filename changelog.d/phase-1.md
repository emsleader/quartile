## Phase 1 — Methods reviewer

- New tool `reporting_checklist`: item-by-item reporting table (found / not_found / needs_human, with the evidence sentence) for PRISMA 2020, STROBE, CHERRIES, conjoint reporting, COREQ and an AAPOR manual stub; checklist chosen by design or by name; labelled as a simulated pre-submission review.
- Reporting checklists as YAML data in `rulebook/checklists/` with their own schema and loader (`core/roles/checklists.js`). Official item numbers where the statement has them; item text paraphrased.
- Methods role (`core/roles/methods.js`): MTH-02 checklist summary, MTH-03 sample-flow arithmetic (single and multi-step flows, "after removing X, Y remained", PRISMA "(n = …)" and "label: N" counts), MTH-04 variables used in the results but not defined in the methods, MTH-05 preregistration claimed without a registry link (negation-aware).
- New rulebook file `rulebook/methods.yaml` with 4 rules: MTH-CAUSAL-01 (causal verbs on non-experimental designs), MTH-CAUSAL-02 ("results prove / confirm"), MTH-CAUSAL-03 ("predicts", note only), MTH-06 (limitations are specific; structural test in `core/rules/tests/phase1.js`).
- 18 synthetic gold cases `tests/gold/cases/phase1-*.json` (built by `tests/gold/phase1-build.js` with `plant.js`) and phase tests `tests/phases/phase1-methods.test.js`.
