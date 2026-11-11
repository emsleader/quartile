# Journal bank

`bank.json` lists 2,039 journals from the Business, Management and Accounting; Economics, Econometrics and Finance; and Decision Sciences areas of the SCImago Journal Rank 2024 list, with a Quartile difficulty score (0-100) for each.

Fields: `t` title, `i` ISSNs, `ty` type, `q` best quartile, `s` SJR 2024, `h` H-index, `d` documents 2024, `cpd` citations per document (2 years), `c` categories with quartiles, `m` main category, `x` difficulty, `ps` SJR percentile, `pd` output percentile, `ng` size of the comparison group.

Source: SCImago (2024). SJR — SCImago Journal & Country Rank [Portal]. https://www.scimagojr.com. SJR indicators are computed by SCImago Lab from Scopus® data. The difficulty score is Quartile's own calculation. Rebuild the file from a newer SCImago export with `scripts/build-bank.js`.
