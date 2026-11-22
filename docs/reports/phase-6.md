Phase 6 — Writing rulebook

Status: partly done. The style checks, the Q1 corpus rules, the documented source files and the contributing guide are done. The specification's target of at least 150 rules from books is not met: no book was supplied, and the brief forbids rules from books we have not been given. No book text is in the repository; no rule is attributed to a book that was not supplied.

What changed:
- Files added: `rulebook/belcher_2019.yaml`, `huff_1999.yaml`, `thomson_2013.yaml`, `booth_2016.yaml`, `mccloskey_2019.yaml`, `cochrane.yaml`, `williams.yaml` (each has a full `source:` block: id, citation as in Section 12, licence_note, access, target_rules, target_areas, extraction_status "awaiting owner"; `rules: []`); `rulebook/style.yaml`; `rulebook/q1corpus.yaml`; `core/style/checks.js`; `core/rules/tests/phase6.js` (structural test `profile_metric_at_most`); `tools/style_check.js`; `docs/CONTRIBUTING_RULES.md`; `changelog.d/phase-6.md`; tests in `tests/phases/phase6-style.test.js`, `tests/phases/phase6-rulebook.test.js` and `tests/rules/{STY-LONG-01,STY-THEREIS-01,Q1C-LEN-01,Q1C-SENT-01,Q1C-SENT-02,Q1C-VOICE-01}/`.
- New tool: `style_check` { text } returns STY findings plus the writing-role YAML rules.
- New rules (15 in all):
  - 8 STY code checks, documented in `rulebook/style.yaml` under `source.code_checks`: STY-PASSIVE-01, STY-READ-01, STY-SIMPLE-01, STY-WORDY-01, STY-CLICHE-01, STY-WEASEL-01, STY-ILLUSION-01, STY-SO-01.
  - 2 STY pattern rules in YAML: STY-LONG-01 and STY-THEREIS-01.
  - 5 Q1C rules: 4 structural notes and 1 manual item (Q1C-MOVE-01).
  - 0 book rules.
- Every STY and Q1C rule has role writing. Severity is minor at most; passive, readability and all Q1C rules are note. Confidence is medium or low.
- Where each threshold comes from:
  - Q1C limits: the Tukey upper fence (p75 + 1.5 IQR) of `data/style-profile.json`. That is 315 words, a mean of 39.7 words per sentence, a long-sentence share of 0.625 and a passive share of 0.625. The profile has n = 501 abstracts and was built on 2026-11-12.
  - STY-LONG-01: 50 words, from median mean sentence length 24.6 + 3 × median SD 8.3.
  - STY-PASSIVE-01: limit 0.625, the same profile fence.
  - The other limits are Quartile defaults and are marked as such in `style.yaml`.

Tests:
- All required commands pass: tests/run.js (101 passed), tests/rules/run.js (15 rules, 47 checks), tests/bugs, tests/phases (3 files), tests/validation, tests/gold, lint, check-changelog, third-party --check.
- New tests: 18 rule-file checks (6 rules × positive, negative and second negative) and 2 phase test files (62 assertions). Each STY code check has positive and negative cases.

Metrics: there are no gold cases on this branch (0 cases), so precision and recall for the writing role are not measurable yet. Measuring them needs annotated manuscripts with style issues marked.

Validation: no statistics code in this phase (not applicable).

Known limits and open questions for the owner:
1. **Decision needed: books.** Either supply the seven priority books (a person reads them and paraphrases rules, following `docs/CONTRIBUTING_RULES.md`), or drop or lower the "≥ 150 rules from books" target. The Section 12 targets add up to 170.
2. The spec describes Q1CORPUS as "15 Q1 SME-finance papers". That full-text profile (`data/corpus-profile.json`) is not in the repository. The Q1C rules use `data/style-profile.json` instead: 501 Q1 abstracts, abstracts only. So they run on the abstract only.
3. Quartile defaults that need the owner's approval:
   - STY-READ-01: reader age 22 and 5 of 7 formulas.
   - STY-PASSIVE-01: at least 8 sentences.
   - STY-SIMPLE-01: the allow list. The full retext-simplify list flags normal research words, so only some of its phrases are used.
   - STY-SO-01: the list of skipped openings.
4. retext-passive only knows irregular participles. STY-PASSIVE-01 therefore also uses the be-verb + participle test that built the profile.
5. Schema proposal for the coordinator (I did not edit `core/rules/schema.js`): add a top-level `code_checks` key, or `check: code`, so that code checks can be listed as rules. They are kept in `source.code_checks` for now. As a result, `rulebook_status` does not count them.
6. STY code checks are not part of `runAll`, because `core/roles/index.js` is a protected file. To include them in the committee report, add a `writing` role that calls `core/style/checks.js` `run(doc)`. `scripts/lint.js` does not list `core/style`. The file was checked by hand with `node --check`, and the phase tests import it.
7. Q1C-MOVE-01 is a manual checklist item. It appears on every document that runs the full rulebook, as status needs_human.

Dependencies added: none (retext, retext-english, retext-passive, retext-simplify, retext-readability, write-good were already installed; all MIT).
