## Phase 4 — Business-administration committee and production editor

- New tool `hypothesis_map`: each hypothesis or proposition (H1, Hypothesis 1, P1 ...) is listed with the theory or cited finding before it and the verdict in the results (supported, not supported, mixed, not found). Local only; output carries the simulation label.
- `core/roles/business.js`: BUS-01 named theory, BUS-02 theory before each hypothesis, BUS-03 each hypothesis tested, BUS-04 construct validity (reliability, AVE, HTMT, common-method variance), BUS-05 managerial implications with a concrete action, BUS-06 boundary conditions, BUS-07 unit of analysis. Each check runs only on the designs it applies to.
- `core/roles/production.js`: PRD-01 number consistency (abstract and conclusion against body and tables), PRD-02 tables and figures, PRD-03 abbreviations (body and abstract separately), PRD-04 reference integrity both ways (BibTeX/RIS read locally with citation-js), PRD-05 citation policy (Q1/Q2 share from the journal bank), PRD-06 terminology drift from the author's glossary, PRD-07 reference recency and self-citation share.
- `data/theories.yaml`: 216 theories and mechanisms with aliases and one reference each, all marked `verified: false` until the owner checks them. The older theory list in `core/core.js` is unchanged.
- Rulebook: `rulebook/business.yaml` (4 rules) and `rulebook/production.yaml` (5 rules), each with tests.
- Gold set: 14 synthetic Phase 4 cases (`tests/gold/cases/phase4-*.json`, built by `tests/gold/phase4-build.js`), 7 of them clean controls.
