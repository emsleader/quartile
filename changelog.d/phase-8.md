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
