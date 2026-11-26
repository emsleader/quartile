# Changelog

## 0.20.0 (2026-11-26)
- New tool `proofread_submission`: a full proofreading pass over every submission file of a paper, in the order given, in two steps.
  - `plan`: builds the author's voice profile from their own approved papers (sentence-length distribution, person and voice, preferred verbs, paragraph openings, frequent terms; counts only) and lists every paragraph with issues (stock words, forced triads, uniform rhythm against the author's own variation, empty transitions, causal claims beyond the design, dash chains, generic openings and closings, term drift against `locked_terms`, wordiness), with the hard constraints of each (numbers, citations, locked terms, claim strength). Disclosure statements are locked.
  - `apply`: keeps a revision only when `verify_rewrite` passes and no eight-word phrase is copied from the voice samples or the Q1 corpus, otherwise keeps the original; then safe grammar fixes (only with `live: true`, which sends the text to LanguageTool), `claim_audit`, references (Crossref only with `live: true`), up to 3 candidate references per unsupported claim from the local library (DOI and SCImago quartile required; Q1-Q2, or Q1-Q4 and books for systematic reviews; never inserted), number consistency across files, `file_check` and readiness. Returns the revised text per file (or writes `.revised.md` files to `out_dir`, never over existing files), the log, number mismatches, the reference report, readiness, the journal policy notes and what was not processed within `time_budget_minutes`.
  - Quartile writes no prose itself: the revisions come from the author, or from the assistant at the author's request, and Quartile checks them. It never writes file properties and never changes a disclosure statement.

## 0.19.0 (2026-11-24)
- New tool `file_check`: reads a .docx and reports, as OK / WARN / FAIL with the measured values and a plain explanation, the technical traces editors and publisher systems can see: edit time against the real word count (`edit_time`), a stale stored word count (`stale_word_count`), created and modified at the same moment (`same_timestamps`), impossible dates — before 2015, in the future, or older than the newest reference (`impossible_dates`), empty or default author fields (`author_fields`; a real name is a FAIL when the file must be anonymised), defaults left by generators such as pandoc, python-docx and docx-js (`generator_fingerprint`), blinding leaks in body, headers, footers, comments, tracked changes, properties and image metadata (`blinding_leak`), hidden content — comments, tracked changes, hidden or white text, zero-width characters, custom XML (`hidden_content`) — and, with `compare`, files that are identical in properties or text (`cross_file_identity`).
- `file_check` is read only: it never writes to the file and never changes timestamps, edit time, word counts, author fields or text. Its summary always ends: "Save the final version yourself in Word after your own revision. Quartile does not change file metadata. Add the journal's required statement on generative-AI use."
- `submission_readiness`: new optional inputs `docx_path`, `docx_base64` and `anonymised` run `file_check` on the file to be submitted (no change to the score); a new `checklist` field includes "generative-AI use statement present (per journal policy)".
- The tool list in the Claude Desktop bundle manifest now covers all 65 tools.

## 0.18.0 (2026-11-23)
- New tool `paper_card`: reads a published paper (local PDF, DOCX or text; or PDF/DOCX bytes as base64, for example a file downloaded from Google Drive) and builds an extractive card: research question, contribution claims, theory, hypotheses with verdicts, data (sample, countries, period, unit of analysis), methods, search and screening for reviews, findings with an evidence label (FACT/OBSERVED, DERIVED, CONDITIONAL MODEL RESULT, NOT IDENTIFIED; heuristic, low confidence), limitations, funding and conflicts. Every entry is a sentence copied from the paper with its section and offsets; nothing is paraphrased or generated. Emphasis `slr`, `citing` or `both`.
- Cards are saved in the local Quartile Library (new `cards` table with an FTS4 index), linked to the library item with the same DOI. On the hosted server they are saved only when asked.
- New tool `library_card_search`: full-text search over the cards, by field or design.
- New tool `library_cards_export`: one row per paper as Excel or CSV, for an SLR extraction table or a literature matrix.

## 0.17.1 (2026-11-22)
- Tests no longer hard-code the Q1 style-profile limits: `tests/phases/phase6-rulebook.test.js` reads them from `data/style-profile.json`, so a rebuild of the profile by the style-brain workflow cannot break CI again (0.17.0 failed after the rebuild of 22 November moved the abstract-length fence from 315 to 323.5 words). The positive example of `Q1C-LEN-01` is longer (about 450 words) so it stays well above the fence. `rulebook/q1corpus.yaml` documents the 2026-11-22 profile.
- The style-brain workflow now opens a pull request with the rebuilt profile instead of committing to main, so the tests run before it is merged.
- Citation metadata: ORCID 0009-0003-8430-211X; affiliation and copyright "Seyed Mehdi Alavi, EMS Leader"; CITATION.cff points to the 0.17.0 record (10.5281/zenodo.24443341); `.zenodo.json` describes the review committee, reference library and paper-history record.
- No changes to any tool.

## 0.17.0 (2026-11-22) — simulated review committee

Phases 0 to 9 of `docs/Quartile_Upgrade_Specification.md`. Phase reports are in `docs/reports/`.

### Phase 0 — Foundation
- Code base converted to ES modules; `package.json` and the lock file moved to the repository root (owner decision of 22 November 2026). Tool names, inputs and outputs are unchanged.
- Document model `core/text/parse.js` (paragraphs, sections, sentences with offsets, tables, numbers, citations), section names `core/text/sections.js`, negation scope `core/text/negation.js`, design classifier `core/text/design.js`.
- Rule engine, schema and loader (`core/rules/`) with a YAML rulebook; the claim audit's eight pattern rules moved to `rulebook/quartile_core.yaml` without changing their behaviour.
- New tools are registered from `tools/` (one file per tool).
- CI workflow for every push and pull request; `npm run lint`, `test:rules`, `test:stats`, `test:gold`, `check:changelog`.

### Phase 1 — Methods reviewer

- New tool `reporting_checklist`: item-by-item reporting table (found / not_found / needs_human, with the evidence sentence) for PRISMA 2020, STROBE, CHERRIES, conjoint reporting, COREQ and an AAPOR manual stub; checklist chosen by design or by name; labelled as a simulated pre-submission review.
- Reporting checklists as YAML data in `rulebook/checklists/` with their own schema and loader (`core/roles/checklists.js`). Official item numbers where the statement has them; item text paraphrased.
- Methods role (`core/roles/methods.js`): MTH-02 checklist summary, MTH-03 sample-flow arithmetic (single and multi-step flows, "after removing X, Y remained", PRISMA "(n = …)" and "label: N" counts), MTH-04 variables used in the results but not defined in the methods, MTH-05 preregistration claimed without a registry link (negation-aware).
- New rulebook file `rulebook/methods.yaml` with 4 rules: MTH-CAUSAL-01 (causal verbs on non-experimental designs), MTH-CAUSAL-02 ("results prove / confirm"), MTH-CAUSAL-03 ("predicts", note only), MTH-06 (limitations are specific; structural test in `core/rules/tests/phase1.js`).
- 18 synthetic gold cases `tests/gold/cases/phase1-*.json` (built by `tests/gold/phase1-build.js` with `plant.js`) and phase tests `tests/phases/phase1-methods.test.js`.

- Phase 2 — finance and statistics reviewer (specification Section 7).
- New tool `grim_check`: GRIM per reported mean (possible / not possible / not testable), with GRIMMER when an SD is given; accepts a list of means or a text.
- New statistics modules in `core/stats/`: `dist.js` (t, F, chi-square, normal, binomial), `grim.js`, `grimmer.js` (quick and exact), `debit.js`, `pcurve.js` (caliper test), `recompute.js` (p from t, F, chi-square, z, r with rounding and one-tailed handling). All validated against base R (`tests/validation/distributions.R`, `tests/validation/consistency.R`).
- `core/roles/finance.js`: code checks STA-01 (GRIM, GRIMMER, DEBIT), STA-02 (p recomputation, decision inconsistency at .05), STA-03 (caliper, note only), STA-04 (percentage columns add to 100), STA-05 (one sample size).
- `rulebook/finance.yaml`: FIN-01 to FIN-08 with design gates (regression checks never run on bounds, descriptive, qualitative, conceptual or SLR papers); FIN-08 flags Enterprise Survey data used without sampling weights.
- Method notes: `docs/methods/p-value-recomputation.md`, `docs/methods/grim-grimmer-debit.md`. `check_statistics` is unchanged.

- Phase 3, editor-in-chief role (`core/roles/eic.js`, specification Section 5). New tool `contribution_test`: contribution claims (EIC-01) and "first / novel / no study has" claims (EIC-02) with the 3 closest prior papers and a similarity score. Default source is the private corpus on this machine; `live: true` also searches OpenAlex and the output lists the exact phrases sent. Blocker only when the closest paper is not cited, its score is at or above 0.55 (specification value, not yet calibrated) and the score comes from a real text comparison.
- EIC-03 scope fit: TF-IDF cosine of the abstract against the journal's aims text and recent titles (supplied list, or Crossref by ISSN when `fetch_titles: true`; only the ISSN is sent), with the 5 most similar titles.
- EIC-04 format limits against limits given in the input or the journal bank; the bank has no limits yet, so the check says "limits not available" and lists the measured values.
- New rulebook `rulebook/eic.yaml` (6 rules: EIC-05 title length, form and abbreviations; EIC-06 problem, gap and aim in the introduction) with structural tests in `core/rules/tests/phase3.js`.

### Phase 4 — Business-administration committee and production editor

- New tool `hypothesis_map`: each hypothesis or proposition (H1, Hypothesis 1, P1 ...) is listed with the theory or cited finding before it and the verdict in the results (supported, not supported, mixed, not found). Local only; output carries the simulation label.
- `core/roles/business.js`: BUS-01 named theory, BUS-02 theory before each hypothesis, BUS-03 each hypothesis tested, BUS-04 construct validity (reliability, AVE, HTMT, common-method variance), BUS-05 managerial implications with a concrete action, BUS-06 boundary conditions, BUS-07 unit of analysis. Each check runs only on the designs it applies to.
- `core/roles/production.js`: PRD-01 number consistency (abstract and conclusion against body and tables), PRD-02 tables and figures, PRD-03 abbreviations (body and abstract separately), PRD-04 reference integrity both ways (BibTeX/RIS read locally with citation-js), PRD-05 citation policy (Q1/Q2 share from the journal bank), PRD-06 terminology drift from the author's glossary, PRD-07 reference recency and self-citation share.
- `data/theories.yaml`: 216 theories and mechanisms with aliases and one reference each, all marked `verified: false` until the owner checks them. The older theory list in `core/core.js` is unchanged.
- Rulebook: `rulebook/business.yaml` (4 rules) and `rulebook/production.yaml` (5 rules), each with tests.
- Gold set: 14 synthetic Phase 4 cases (`tests/gold/cases/phase4-*.json`, built by `tests/gold/phase4-build.js`), 7 of them clean controls.

### Phase 5 — Ethics and data office

- New tool `ethics_check`: simulated ethics and data office review (labelled "Simulated pre-submission review — not a journal decision") of text or a local .docx/.pdf/.txt file, with an optional local author profile and declared design.
- New rulebook `rulebook/ethics.yaml` (8 rules): ETH-01 ethics approval with named body and reference number, ETH-01-WAIVER, ETH-02 informed consent, ETH-03 GDPR data protection for EU/EEA participants, ETH-03-PSEUDO, ETH-05 data and code availability, ETH-05-REQUEST, ETH-06 funding. Negation-aware: a stated "no human participants" ends ETH-01 to ETH-03.
- Ethics role (`core/roles/ethics.js`): ETH-04 conflict-of-interest statement (heading-aware), ETH-04-DUAL dual-role flag from the local `author.yaml` (affiliations and business interests compared with the studied sector through a documented synonym table), ETH-07 small cells (counts below 5) in firm-level survey tables.
- Author profile read from the tool input, `QUARTILE_AUTHOR_PROFILE` or `$QUARTILE_HOME/author.yaml`; fictional template in `tests/fixtures/author.example.yaml`.
- Methods written up in `docs/methods/ethics.md` and `docs/methods/dual-role.md`.

### Phase 6 — Writing rulebook

- New tool `style_check`: style findings (role writing) for a manuscript text. It runs the STY code checks and the writing-role rules in the rulebook. Severity is minor at most and confidence is medium or low.
- New `core/style/checks.js`: STY code checks built on retext (retext-english, retext-passive, retext-simplify, retext-readability), write-good, and the word lists in `data/prose-rules.json` (the lists `core/prose.js` uses; `core/prose.js` is unchanged).
- New `rulebook/style.yaml`: documents 8 STY code checks (`source.code_checks`) and 2 STY pattern rules (STY-LONG-01, STY-THEREIS-01).
- New `rulebook/q1corpus.yaml`: 4 note-level structural rules and 1 manual checklist item, with limits taken from `data/style-profile.json` (numbers only). New structural test `profile_metric_at_most` in `core/rules/tests/phase6.js`.
- Seven documented, empty source files for the priority books (BELCHER2019, HUFF1999, THOMSON2013, BOOTH2016, MCCLOSKEY2019, COCHRANE, WILLIAMS), with extraction status "awaiting owner". No book was supplied, so no rule is attributed to a book.
- New guide `docs/CONTRIBUTING_RULES.md`: how a person adds a paraphrased rule from a book, with a worked example from a fictional source.

### Phase 7 — Committee report, response tracker, feedback loop

- New tool `committee_review`: runs the rulebook and the six role modules for the detected or declared design and returns the committee report (specification Section 13): one light per role with an icon and a word, blockers, majors, top 3 issues, readiness score, overall readiness state (ready to submit / revise first / not ready), human checklist and every finding with rule ID, span, source and fix. Returns Markdown, and DOCX (base64) with `docx: true`. Labelled "Simulated pre-submission review — not a journal decision".
- New tool `response_tracker`: splits a reviewer letter into comments (Reviewer 1, R1.3, Comment 2:, numbered lists), finds changed paragraphs between the old and new manuscript with jsdiff, and builds the response table (comment, change old → new, location, status). Export to Markdown or DOCX is refused while any comment is open.
- New tool `rule_feedback`: saves "this flag is wrong / right" verdicts locally in `$QUARTILE_HOME/feedback.jsonl`. A rule with more than 3 confirmed false positives is shown as a note in the committee report until the owner resets it.
- New tool `rulebook_status`: rules per source, test coverage from `tests/rules`, precision per rule from local feedback, and downgraded rules.
- New modules: `core/report/committee.js`, `core/report/render.js` (JSON, Markdown, HTML, DOCX; black headings; Okabe-Ito colour-blind-safe lights), `core/report/feedback.js`; `core/roles/response.js` filled in.
- Tests: `tests/phases/phase7-*.test.js` and five synthetic papers in `tests/phases/fixtures/phase7/`.

### Phase 8 — Quartile Library (specification Section 20)

- New local reference library in `core/library/` on the shared sql.js database (`$QUARTILE_HOME/library/library.sqlite`); schema of 20.2 in `core/library/schema.sql` with FTS4 search (this sql.js build has no FTS5). PDFs are stored as files under `library/files/<item-id>/` with SHA-256; CSL-JSON backup `library.json`.
- `library_add`: add by DOI (Crossref, then OpenAlex; only the DOI is sent), or from a BibTeX, RIS or CSL-JSON string; tag, file into a collection, or attach a PDF to an existing item. Quartile from the user's SCImago bank by ISSN.
- `library_import`: BibTeX, RIS, CSL-JSON and Zotero exports (CSL JSON, RIS, Zotero RDF with nested collections). Same DOI is skipped as a duplicate; similar records are listed as suggested merges.
- `library_export`: BibTeX with stable cite keys (AuthorYearWord), pandoc-ready .bib, RIS, CSL-JSON; no overwrite without `overwrite: true`.
- `library_search`: full-text search with collection, tag, quartile, type and year filters.
- `library_verify`: verification log (history kept); live Crossref check for retractions, corrections and expressions of concern.
- `library_match_manuscript`: matches author-year and numbered citations and the reference list to the library; flags cited-not-in-library, in-list-not-cited, ambiguous, year and author mismatches (LIB-MAT-01 to 06) and applies the owner's citation policy (LIB-POL-01 to 05).
- `library_bibliography`: APA 7 reference list from our own formatter (`core/library/apa7.js`); citeproc and @citation-js/plugin-csl are not bundled.
- `library_dedupe`: suggested merges (same DOI; or title similarity >= 0.92, year within 1, same first author); merging needs `confirm: true`.
- `library_screening`: SLR screening decisions per reviewer and stage, PRISMA 2020 counts, CSV export; Cohen's kappa in base R with `scripts/screening-agreement.R`.

### Phase 9 — Quartile Record (paper history and learning, specification Section 21)

- New local paper record in the shared Library database (`$QUARTILE_HOME/library/library.sqlite`): papers, events, event files, requests and lessons (`core/record/schema.sql`). Events and event files are append-only; database triggers refuse UPDATE and DELETE. Mistakes are fixed with a `correction` event that points to the old event.
- Event files are copied to `$QUARTILE_HOME/record/files/<event-id>/` with their SHA-256.
- Paper status is derived from the latest status event (date order, corrections applied).
- Letter splitter (`core/record/split.js`) for editor and reviewer letters: "Editor:", "Reviewer 1", "R1.3", "Comment 2:", numbered, bulleted and lettered lists, and prose letters.
- Category proposals (specification 21.5 hints plus our hints for the other 21.4 categories) and lesson proposals in rulebook format (`check: manual`).
- Owner-only lesson decisions (approve, edit, reject, retire). Approved lessons go to `$QUARTILE_HOME/record/lessons.yaml`, never into the repository rulebook. A category asked by two or more journals is proposed with scope `all`.
- Exports for other modules: `getApprovedLessons({ journal })` (committee review) and `openRequests({ paper_id, revision })` (submission readiness, response tracker).
- New tools: `record_paper`, `record_event`, `record_letter`, `record_requests`, `record_lessons`, `record_timeline` (Markdown and DOCX), `record_stats` (descriptive counts and dates only).
- New guide: `docs/RECORD_FIRST_DATA.md` (how to enter the FER paper).

### Integration
- `committee_review` now also runs the writing checks (role `writing`, switch off with `writing: false`), lists approved lessons from earlier letters for the target journal (Quartile Record) as checklist items, matches citations against the local Quartile Library when one exists, and passes `glossary`, `citation_policy`, `author` and `author_profile` to the roles.
- Old claim-audit rules that a role now checks more precisely (`QC-CLAIM-CAUSAL`, `QC-CLAIM-PREREG`) are dropped from the committee report when the role flags the same sentence, so one problem counts once.
- `QC-CLAIM-ASKING-PRICE` no longer flags a sentence that already calls the prices "advertised" (owner approval, 22 November 2026). `claim_audit` output changes only for such sentences.
- Gold set: a case can list `annotated_roles`; the gold run never reads the owner's real author profile.

## 0.16.2 (2026-11-17)
- New tool `fer_literature_index`: read-only search of a 100-paper, DOI-verified candidate bibliography for the FER paper, with explicit flags that full texts and journal quartiles were not all verified.

## 0.16.1 (2026-11-17)
- New tool `fer_equation_catalog`: the FER paper's estimands and tests as a deterministic formula catalogue.
- New tool `fer_replication_audit`: arithmetic audit of saved aggregate results (no microdata), with an R 4.3.3 aggregate cross-check workflow.

## 0.16.0 (2026-11-14)
- New tool `egba_bounds`: Evidence-Graded Bounds Analysis for any arithmetic target expression, with survey (S) and interview (I) evidence grades after the documentary grades A-E. Each rung intersects the admitted intervals; an interval that does not overlap is reported as a conflict and the earlier one is kept, so survey or interview evidence can narrow the bounds but never overrule documentary evidence. Survey answers may be raw values (95% CI of the mean or 10th-90th percentiles). Returns bounds and a label at every rung, conflicts and the breakdown value of a chosen parameter. Only arithmetic operators and min, max, abs, log, exp and sqrt are accepted in the expression.
- New tool `egba_time` (EGBA-Time): bounds on the activation latency of each financing route from stage intervals (with their own units), censoring of pending routes, classification against the action window (surely on time, surely late, undetermined, not usable, not identified), and Manski worst-case bounds on the share of routes usable in time with 95% Wilson intervals. Unnamed stage lists are refused with a clear message.
- New tool `survey_plan`: sample size per planned analysis in R (conjoint, Johnson-Orme; two-group t test; CFA RMSEA close-fit power per group, MacCallum, Browne & Sugawara 1996; incremental regression f2; logistic EPV and outcome-rate precision, Peduzzi et al. 1996 and Riley et al. 2020; correlation), completes per group, finite population correction, invitations by response rate, completion loss and eligibility, survey length, k-anonymity check and anonymity design rules.
- All three return the R script and a reproducibility record (R version, script and procedure SHA-256). Base R only; no new packages.
- `prose_check` word lists are now in the repository: `data/prose-rules.json` was excluded by `.gitignore`, so installs from the repository (including the hosted server) ran `prose_check` with empty lists and found only repeated words. Built with `scripts/build-prose-rules.js` from the pinned sources in `data/THIRD-PARTY.md` (88 redundancies, 359 needless variants, 124 wordy phrases, 698 clichés, 20 intensifiers).

## 0.15.0 (2026-11-13)
- `run_statistics` procedure `egba`: paired E1 bounds, breakdown frontier with the M2 ceiling, evidence ladder and related-party rerun, with figures. Unnumbered sub-headings take the role of the section above them.

## 0.14.x (2026-11-13)
- 0.14.0: `evidence_ledger`, `claim_audit`, data audit and power analysis procedures. 0.14.1-0.14.3: claim audit handles denials and headings; ledger accepts NOT_IDENTIFIED without a grade; heading detection for plain-text exports; more theories and implications; no regression checks on bounds papers; number-registry penalty only with sufficient coverage.

## 0.13.0 (2026-11-12)
- Panel regression (fixed effects, clustered SEs, weights, ANCOVA), survival analysis (Kaplan-Meier, log-rank, Cox), chart builder.

## 0.12.0 (2026-11-12)
- Excel in and out; figures drawn by R for every procedure.

## 0.11.0 (2026-11-12)
- `run_statistics`: SPSS-style procedures run in R (`core/rstats.R`, base R + foreign): descriptives, frequencies, crosstab, t-tests, one-way ANOVA, correlations, OLS (HC1 option), logistic regression, Cronbach's alpha, EFA, Shapiro-Wilk. CSV or SPSS .sav input. Returns APA-style sentences, the exact R script, a reproducibility record (data and script SHA-256, R and package versions, time) and `output_text` for the number registry, so every reported number can be traced to this run. Checked against known results on R's mtcars data. Only fixed procedures run on the hosted server; custom R code needs a local install with `QUARTILE_ALLOW_R_CODE=1`.
- The server image now includes R.

## 0.10.4 (2026-11-12)
Fixes from the author's test on ORBIT:
- DOIs containing a semicolon (SICI DOIs such as 10.1002/(SICI)...3.0.CO;2-K) are read whole, so the reference is found.
- Contribution claims are counted per sentence with a wider set of verbs and subjects (develops, advances, integrates, clarifies, makes three contributions, our framework ...), not by keyword.
- Technical uses of "robust" (robust standard errors, robust optimisation, robust to, robustness) no longer count as AI-style words.
- A conceptual paper's testing section ("Testing the framework", measurement strategy, empirical implications, how each proposition could be tested) satisfies the testability check.
- OpenAlex API key support (`OPENALEX_API_KEY`; OpenAlex requires a free key since February 2026). Without it the corpus build stops with a clear message and the overlap check says that nothing was checked instead of reporting a clean result.
- Corpus analysis runs in the background and resumes after a server restart: each paper's measurements are saved as soon as they exist, and a file that crashed the server is skipped next time.
- `.zenodo.json` carries the release version; CITATION.cff points to the latest DOI. `scripts/sync-app.js` copies the core into the web app.

## 0.10.3 (2026-11-12)
- First benchmark on 10 open-access finance papers published in 2026 (9 usable): statistics 7/7 injected errors found, 0 false alarms; missing reference 3/4, 0 false alarms; abstract number 6/6, 2 of 9 clean papers flagged; AI-style 6/6, 3 of 9 clean papers flagged with the old cut-offs. AI-style cut-offs raised (moderate from 25, hotspots above 60); see docs/AI-STYLE.md.
- Lower memory use when reading PDFs on the free hosted plan (pages released after reading, smaller heap).

## 0.10.2 (2026-11-12)
- Live tests on a real manuscript: reference years now accept the print, online and issue dates in Crossref (online-first papers no longer flagged); grammar edits inside one sentence are combined into one sentence edit; literature overlap also searches titles and abstracts and reports failed queries.
- Benchmark: robust to papers whose sections cannot be parsed; `benchmark_corpus` tool and `corpus_build` options `from_year` and `newest`.

## 0.10.1 (2026-11-12)
- `prose_check`: redundancy, wordy phrases, needless variants, clichés, intensifiers and repeated words, with guard-checked sentence fixes, plus Flesch, Flesch-Kincaid and Gunning fog. Word lists from reviewed, pinned open-source projects (proselint BSD-3-Clause; too-wordy, no-cliches, weasel-words MIT); credits and licences in `data/THIRD-PARTY.md`.
- Statistics: GRIM test of reported means against N for single-item integer measures.

## 0.10.0 (2026-11-12)
- `verify_references_live`: Crossref check of every reference (DOI resolves; title, year and first author match; retraction, withdrawal and correction notices; DOI suggestions).
- `number_registry`: traces each reported number to the supplied R/Stata/SPSS/Python/EViews output, allowing for rounding, dropped leading zeros, percentages of proportions and sign; flags untraced numbers, truncation, sign differences and abstract or conclusion numbers missing from the results.
- `ai_style_check`: documented 0-100 AI-style signal (seven features, z-scores against typical journal prose), paragraph hotspots and sentence-level fixes that pass the guard. A style signal, not an authorship test.
- `grammar_check` (LanguageTool) with whole-phrase, guard-checked edits; `literature_overlap` (OpenAlex full-text index).
- `submission_readiness`: transparent penalty-based score; explicitly not an acceptance prediction.
- `scripts/benchmark.js`: error-injection benchmark (recall and false-alarm rate per module) for 30-50 of the author's own papers.
- Hosted corpus: the server builds a temporary corpus, keeps itself awake while the job runs, and `corpus_profile_export` returns measurements and source metadata only; the published profile in `data/` is used when no folder is set.

## 0.9.1 (2026-11-11)
- Integrity screen aligned with the COPE flowchart "Plagiarism in a submitted manuscript" (doi:10.24318/cope.2019.2.1) and its redundancy companion: 8-word overlap per sentence against your earlier papers, your sources and (locally) the corpus; grades none / minor / substantial; separates redundancy with own work; flags uncited, unquoted and number reuse; states what an editor following COPE would do and what to fix; drafts a cover-letter disclosure. MCP tool `integrity_screen` and an app card. Workflow wording is Quartile's own (the COPE flowcharts are CC BY-NC-ND).

## 0.9.0 (2026-11-11)
- Private full-text corpus for local installs: `corpus_build` (background download of up to 500 open-access, CC-licensed Q1 papers into a folder such as Google Drive), `corpus_analyse`, `corpus_status`, `corpus_compare` (section by section), `corpus_search` (closest papers, 40-word snippets) and `corpus_originality` (8-word overlap guard). PDF (pdf.js) and Word (mammoth) extraction in Node. Patterns only; texts never leave the folder.
- CI smoke test downloads a few real open-access PDFs, measures them and keeps nothing.

## 0.8.2 (2026-11-11)
- Q1 style profile: measurements of 501 abstracts from 76 Q1 journals in three fields (OpenAlex; no text stored), built by a GitHub Action.
- New `compare_style` tool and app card: distance from the Q1 profile, the three largest gaps with fixes, and rhetorical-move notes; per field or per journal (73 journal profiles).
- The AI prompts (edit, issues, idea to paper) receive the measured profile as abstract targets.

## 0.8.1 (2026-11-11)
Accuracy release from a hand-checked test on the author's manuscripts (ORBIT, JEMF; roadmap section 2).
- Design detection: declared conceptual papers and systematic reviews are recognised; secondary data (Enterprise Surveys, Orbis, Compustat, census) never gets questionnaire checks; conceptual papers skip empirical checks.
- Parsing: sub-headings (2.1, 4.3) take their parent section's role; bold or italic headings and captions are recognised; table and figure captions do not start sections; markdown tables are table blocks.
- Citations: acronyms are not authors; Hungarian "Author – Author (Year)"; compound surnames; corporate authors; n.d., n.d.-a and 2025a; months, fiscal years and country names are not citations.
- Writing: names and citations are not AI stock words; en dashes in ranges and paired names are not counted; more synonyms for robustness, standard errors, controls and policy implications.
- Abbreviations defined in brackets [CI] count as defined; standard abbreviations (GDP, OECD, EU, JEL...) need no definition.
- Statistics: new "x of y (z%)" and 95% CI versus p checks; the last-digit test runs only on raw output (rawData option); "several sample sizes" is information, not a problem.
- Verdict: the desk screen returns the 1-3 decisive reasons.
- 17 regression tests lock in each fix (38 tests in total).

## 0.8.0 (2026-11-11)
- Tools in this release: `analyze_manuscript`, `desk_screen`, `check_statistics`, `check_references`, `verify_rewrite`, `apply_replacements`, `journal_lookup`, `journal_suggest`, `q1_style_guide`.
- New name and design: Quartile.
- PDF input (pdf.js), alongside Word (.docx), Markdown and text.
- Journal editor: desk decision and three reviewer reports for a named journal; screen the paper as the editor of each suggested journal; send fixes to Issues.
- Statistics check: recomputed p for t, F, r, χ² and z; coefficient/SE vs t, p and stars; impossible values; p-clustering; last-digit test; software-output fingerprints.
- Idea → paper: frames a research idea to a Q1-Q4 standard, citing only retrieved papers.
- Target tier (Q1-Q4) for edits and issue replacements; replacements required for every language issue.
- MCP server (stdio and Streamable HTTP) with 9 tools, 3 prompts and an interactive result card (MCP Apps) for Claude and ChatGPT; Dockerfile and Render blueprint for permanent hosting.
- Journal bank is no longer distributed; build it from your own SCImago export.

## 0.7.0
- Diagnose-first Issues list with apply, ignore and comment; SCImago journal bank with difficulty; desk-rejection screen; hallucination guard; Q1 writing profile.
