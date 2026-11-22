# Quartile Library: duplicate detection (LIB-03)

Our own method. Nothing is merged automatically; the tool lists suggested pairs and the user decides.

A pair of records is a suggested merge when one of these holds:

1. Both have a DOI and the DOIs are the same after normalisation (lower case, no `https://doi.org/` prefix, no trailing punctuation). Two different DOIs always mean two different works (an erratum has its own DOI).
2. At least one has no DOI, and all of the following are true:
   - the first-author surnames are the same after removing accents and punctuation;
   - the years differ by at most one (online-first and print years);
   - the normalised titles (lower case, no accents, no punctuation, single spaces) have a similarity of at least 0.92, where similarity = 1 - Levenshtein distance / length of the longer title;
   - the titles do not differ in a number or a Roman numeral (part 1 and part 2 are different papers);
   - every word found in only one title is close to a word of the other title (similarity >= 0.75, or the word is two neighbouring words joined because a space was lost). Words of three letters or fewer are not checked. This stops "evidence from Hungary" being joined with "evidence from Poland".

fuse.js (Apache 2.0) is used to find candidate titles inside large surname groups (more than 200 records). Smaller groups compare every pair. The decision itself always uses the similarity defined above, so it is reproducible.

## Test sets (synthetic)

`tests/fixtures/make-library-fixtures.js` writes two labelled sets of record pairs. `library-dedupe.json` (170 pairs, 40 true duplicates) was used while the rules were built: the word check above was added after it showed false positives. `library-dedupe-check.json` (350 pairs, 100 true duplicates, other titles, other seed and two more kinds of false pair) was made after the rules were fixed. Both sets were written by the same developer who wrote the rules, so the results are an upper bound; the owner's real library will be harder.
