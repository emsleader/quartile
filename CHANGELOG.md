# Changelog

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
