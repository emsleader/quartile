# Quartile Library: APA 7 formatter (LIB-08)

`core/library/apa7.js` is written from the rules of the Publication Manual of the American Psychological Association (7th ed., 2020), Chapters 9 and 10. No CSL processor is used: citeproc-js is CPAL-1.0 / AGPL and is not bundled (specification 20.7).

Rules implemented: author lists up to 20 names, 21 or more as first 19, ellipsis, last (9.8); initials with spaces and hyphens (6.20); group authors (9.11); editors as authors with (Ed.)/(Eds.) (9.10); no author: title moves to the author position (9.12); no date (n.d.); year suffixes a, b for the same authors and year, ordered by title (9.47); journal name and volume in italics, issue in brackets, page range with an en dash, article numbers (9.29); DOI as https://doi.org/ link, otherwise URL (9.34-9.35); edition and page range inside the parentheses after a book or chapter title (9.39); publisher left out when it is the group author (9.24); bracket descriptions [Preprint], [Data set], [Computer software], [Paper presentation] (9.21); reference list order (9.44-9.46).

Titles are printed as stored. The formatter does not change capitalisation, because automatic sentence case breaks proper nouns; the user keeps titles in sentence case in the library.

The test file `tests/fixtures/apa7-50.json` holds 50 synthetic records and the expected reference strings, written by hand from the manual's rules. They have not been checked by a second person: the owner should spot-check them against the manual.
