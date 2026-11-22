# Quartile Library: manuscript matching (LIB-07) and citation policy (LIB-06)

## Citations in the text

- Parenthetical: every bracket that holds a year is split at `;`. Each part may start with "e.g.,", "see", "see also", "cf." and may end with a page locator ("p. 4"). The rest must be `Authors, Year[, Year]` where Authors is one name, "A & B", "A and B", "A, B, & C" or "A et al.". Parts with digits in the author part, or with words such as "In", "Table", "Wave" or a month, are not citations.
- Narrative: `Name (Year)`, `Name and Name (Year)`, `Name et al. (Year)`, possessive `Name's (Year)`. Leading words such as "The" are dropped ("The World Bank (2021)").
- Numbered: `[1]`, `[2, 4-6]`, only when the reference list itself is numbered.

## Reference list

Each entry gives: list number (if any), first-author surname, year and suffix, DOI and a title guess (APA: the sentence after the year; IEEE: the quoted title). An entry is matched to a library item by DOI, otherwise by first author + title similarity >= 0.92 + year, otherwise by first author + year when the title cannot be read.

## Statuses

Every citation gets exactly one status: matched, not_in_library (LIB-MAT-01), ambiguous (LIB-MAT-03), year_mismatch (LIB-MAT-04) or author_mismatch (LIB-MAT-05; includes "et al." used for a work with one or two authors, APA 7 section 8.17). A citation without a reference-list entry is also flagged LIB-MAT-06; an entry that is never cited is LIB-MAT-02. Severities are minor or note: these are reference-hygiene issues, and some depend on text extraction.

## Policy (specification 20.6)

Non-SLR papers: Q1/Q2 journal articles only (LIB-POL-03 for other types, LIB-POL-05 for Q3/Q4, LIB-POL-04 when the quartile is unknown). SLRs: journal articles (any quartile), books and chapters; other types LIB-POL-02. Items tagged `own-work` or `close-idea` are exempt. A retracted item (from the verification log) is LIB-POL-01, blocker; this check runs before the exceptions, which differs from the code sketch in 20.6 (see the phase report).
