## Phase 6 — Writing rulebook

- New tool `style_check`: style findings (role writing) for a manuscript text. It runs the STY code checks and the writing-role rules in the rulebook. Severity is minor at most and confidence is medium or low.
- New `core/style/checks.js`: STY code checks built on retext (retext-english, retext-passive, retext-simplify, retext-readability), write-good, and the word lists in `data/prose-rules.json` (the lists `core/prose.js` uses; `core/prose.js` is unchanged).
- New `rulebook/style.yaml`: documents 8 STY code checks (`source.code_checks`) and 2 STY pattern rules (STY-LONG-01, STY-THEREIS-01).
- New `rulebook/q1corpus.yaml`: 4 note-level structural rules and 1 manual checklist item, with limits taken from `data/style-profile.json` (numbers only). New structural test `profile_metric_at_most` in `core/rules/tests/phase6.js`.
- Seven documented, empty source files for the priority books (BELCHER2019, HUFF1999, THOMSON2013, BOOTH2016, MCCLOSKEY2019, COCHRANE, WILLIAMS), with extraction status "awaiting owner". No book was supplied, so no rule is attributed to a book.
- New guide `docs/CONTRIBUTING_RULES.md`: how a person adds a paraphrased rule from a book, with a worked example from a fictional source.
