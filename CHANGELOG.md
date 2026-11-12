# Changelog

## 0.10.4 (2026-11-12)
Fixes from the author's test on ORBIT:
- DOIs containing a semicolon (SICI DOIs such as 10.1002/(SICI)...3.0.CO;2-K) are read whole, so the reference is found.
- Contribution claims are counted per sentence with a wider set of verbs and subjects (develops, advances, integrates, clarifies, makes three contributions, our framework ...), not by keyword.
- Technical uses of "robust" (robust standard errors, robust optimisation, robust to, robustness) no longer count as AI-style words.
- A conceptual paper's testing section ("Testing the framework", measurement strategy, empirical implications, how each proposition could be tested) satisfies the testability check.
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
