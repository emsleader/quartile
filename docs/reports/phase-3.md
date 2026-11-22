Phase 3 — Editor-in-chief

Status: partly done. All six checks (EIC-01 to EIC-06), the `contribution_test` tool and the synthetic acceptance test are done. Still missing: the real acceptance test on the owner's 10 papers with known closest prior work, and calibration of the 0.55 threshold. Both need owner data.

What changed:
- `core/roles/eic.js` (role module). It holds:
  - EIC-01: contribution test. Claims come from the specification's CONTRIB pattern, and negated claims are skipped.
  - EIC-02: "first", "novel" and "no study has" claims.
  - EIC-03: scope fit.
  - EIC-04: format limits.
  - `run()` for `roles.runAll`, and `review()`, which runs the role on its own (rulebook rules plus code checks).
- `core/rules/tests/phase3.js`: six structural tests for the title and the introduction.
- `rulebook/eic.yaml`: 6 new rules (EIC-05-LENGTH, EIC-05-FORM, EIC-05-ABBR, EIC-06-PROBLEM, EIC-06-GAP, EIC-06-AIM). Their test files are in `tests/rules/EIC-*/` (19 files).
- `tools/contribution_test.js`: new tool `contribution_test`, input `{ text?, path?, cited_dois?, live? }`. Every output carries the simulation label.
- `tests/phases/phase3-eic.test.js` and `tests/phases/phase3_corpus_acceptance.js`: the acceptance test runs in its own process, because the corpus search keeps its index in memory.
- `tests/gold/cases/phase3-eic-001.json`: one synthetic gold case.
- `changelog.d/phase-3.md`.

How EIC-01 and EIC-02 work:
- The literature source is a function that can be swapped in. Tests use their own source, so they run offline.
- By default the source is the private corpus (`mcp/corpus.js` `search`). Corpus search ranks papers with its own score, which is not on a 0–1 scale. So the role computes its own 0–1 cosine score between the claim and the matched passage (title plus the first 40 words of the best paragraph).
- With `live: true`, OpenAlex is also searched through `core/net.js` `literatureOverlap`. The output lists the exact 10-word phrases sent. A test with a stubbed `fetch` checks that these are the same phrases the request carries.
- An OpenAlex exact-phrase match has no score. It can never raise a blocker on its own.
- A blocker is raised only when all three are true: the closest paper is not cited (checked by DOI or by 80% of its title words in one reference), the score is at least 0.55, and the score came from a real comparison. In every other case the finding is a note with status `needs_human`.
- EIC-02: a claim that could not be checked is `major`. Its confidence is `low` when no literature source was searched.

How EIC-03 and EIC-04 work:
- EIC-03: TF-IDF cosine in our own code. It reports the similarity to the aims text, the 5 most similar titles and their mean score.
  - Titles come from a list you supply, or from Crossref by ISSN when you set `fetch_titles: true`. Only the ISSN and a date filter are sent.
- EIC-04: compares the text with limits given in the input, or in the journal bank entry if it has them. The bank has none yet, so the check says "limits not available" and lists the measured values.

Tests:
- `node tests/run.js`: 101/101.
- `node tests/rules/run.js`: 14 rules, 50 checks (6 new rules, 19 new checks).
- `node tests/phases/run.js`: 2 files passed (1 new file with about 60 assertions).
- `node tests/gold/run.js`, `node tests/bugs/run.js`, `node tests/validation/run.js`: pass.
- `node scripts/lint.js`, `node scripts/check-changelog.js` (36 tools), `node scripts/third-party.js --check`: pass.

Metrics:
- Gold set, role eic: precision 1.00, recall 1.00, n = 1 synthetic case with 2 planted issues. This is too few to judge.
- Synthetic acceptance: the known prior paper was in the top 3 for 10 of 10 claims, and ranked first for all 10. The corpus had 30 synthetic papers: 10 targets and 20 distractors on nearby topics. The claims are paraphrases of the targets.
  - This test is easy by design, so it shows only that the steps work from start to end.
- Real acceptance, on the owner's 10 papers: not measurable yet. It needs the 10 papers, each with its known closest prior paper, plus a corpus that holds those prior papers.

Validation: no statistics code in this phase (max absolute difference: not applicable).

Known limits and open questions for the owner:
1. The 0.55 threshold is the specification's value and is not calibrated. In the synthetic run, the top scores of the true prior papers ranged from 0.47 to 0.78, and 6 of 10 were at or above 0.55. Calibrate it on the gold set with known closest prior work.
2. Corpus scores use only the title and the first 40 words of the best paragraph, because corpus search returns no more than that. A score on the full paragraph needs a change in `mcp/corpus.js` (not made: outside this phase).
3. The contribution test finds only papers that the corpus (or OpenAlex, in live mode) contains. A missing closest paper is always possible.
4. The journal bank has no aims text and no format limits. `journalLookup` in `core/lib.js` also drops extra fields, so `eic.js` reads `data/bank.json` (or `QUARTILE_BANK`) directly to pick up `aims` and `limits` once they exist.
5. Crossref titles are fetched only on request (`fetch_titles: true` or `live: true`), so committee runs stay offline by default. Please confirm this default.
6. EIC-05-ABBR treats a fixed list of abbreviations as known, including SME/SMEs, GDP, EU, R&D and ESG. Please confirm the list.
7. EIC-05-FORM (finding or question) is a word-list heuristic: minor severity, low confidence.
8. EIC-06 rules run on every design that has an introduction. Gold cases from other phases may receive EIC-06 findings that their annotations do not list, which would show up as eic false positives.

Dependencies added: none.
