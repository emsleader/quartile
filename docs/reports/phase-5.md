Phase 5 — Ethics and data office

Status: done (the acceptance test on the owner's own papers is not measurable yet; see below)

What changed:
- Files: core/roles/ethics.js (role module: ETH-04, ETH-04-DUAL, ETH-07), core/roles/ethics_lib.js (shared detectors, sector synonym table, author-profile loader), core/rules/tests/phase5.js (structural tests eth_approval, eth_consent, eth_data_protection, eth_availability, eth_funding), rulebook/ethics.yaml, tools/ethics_check.js, tests/fixtures/author.example.yaml (fictional), tests/phases/phase5-ethics.test.js, tests/rules/ETH-*/ (8 folders, 20 test texts), tests/gold/cases/phase5-ethics-00{1,2}.json, docs/methods/ethics.md, docs/methods/dual-role.md, changelog.d/phase-5.md.
- New tools: `ethics_check` { text?, path?, author_profile?, design? } → ethics findings, author-profile status, studied sectors, label "Simulated pre-submission review — not a journal decision".
- New rules: 8 YAML rules (ETH-01, ETH-01-WAIVER, ETH-02, ETH-03, ETH-03-PSEUDO, ETH-05, ETH-05-REQUEST, ETH-06) and 3 code checks in the role module (ETH-04, ETH-04-DUAL, ETH-07). 11 in total. No blockers.

Tests:
- node tests/run.js 101/101; tests/rules/run.js 16 rules, 56 checks passed (8 new rules, 20 new test texts; each rule has a positive, a negative and a negated or waiver negative); tests/phases/run.js 2 files passed (new: phase5-ethics.test.js, 66 assertions); bugs, validation, gold, lint, changelog and licence checks pass.
- Acceptance: the dual-role flag fires (major, confidence high) on a WB-EMS test paper when the fictional profile lists an EMS company; it does not fire with an unrelated profile (agriculture), with no profile, or on a paper about environmental management systems (EMS); it becomes a note "Disclosure present; check it names the role" when the paper names the company or the role; "The authors declare no competing interests" and a negated mention stay major.

Metrics: gold set, ethics role: precision 1.00, recall 1.00 (n = 5 expected issues in 2 synthetic cases). These cases were written for this phase and checked by hand; n is below the gating minimum of 5 flags per role only for some severities, so the numbers are not evidence of field precision. Owner's manuscripts: not measurable yet (need the owner's papers in QUARTILE_GOLD_PRIVATE and the owner's author.yaml).

Validation: no statistics code in this phase (not applicable; max absolute difference 0).

Known limits and open questions for the owner:
1. Severities chosen as safe defaults: missing approval or consent in a human-participant design = major (confidence medium); missing GDPR details = minor, confidence low; missing COI, data availability or funding statement = minor; "available on request" = note. Please confirm.
2. ETH-01 asks for a reference number. Some business journals accept an approval without a number; if so, ETH-01 should drop to minor when only the number is missing (needs a separate rule ID, because the engine gives one severity per rule).
3. "EU participants" is detected by an EU/EEA country name in the methods (or abstract/title). A study of non-EU firms that mentions an EU country could raise ETH-03 (low confidence).
4. Sector table is small (WB-EMS, fitness, hospitality, agriculture, printing). WB-EMS and fitness are treated as related (medium confidence). Which other sectors should be added?
5. The profile is assumed to describe an author of the paper. On the owner's machine, tests/gold/run.js and committee_review will read $QUARTILE_HOME/author.yaml, so synthetic gold cases about EMS from other phases may get ETH-04-DUAL there. Suggest that tests/gold/run.js sets QUARTILE_AUTHOR_PROFILE to a non-existent path (Phase 0 file; not edited).
6. Other phases' gold cases of survey or regression papers without ethics, funding or COI statements will now receive ETH findings; if those are not annotated they count as ethics false positives at merge time. The coordinator may need to annotate them.
7. ETH-07 runs on survey designs only and reads count columns from the header (n, number, firms, frequency); tables without such a header are not checked. Zero cells are not flagged.
8. author.yaml is not added to .gitignore (its default place is outside the repository); add it if the owner keeps a copy in the repo folder.

Dependencies added: none (uses yaml, zod already installed).
