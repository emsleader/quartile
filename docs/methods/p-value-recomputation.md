# Recomputing p-values from reported test statistics (STA-02)

Code: `core/stats/recompute.js`, distributions in `core/stats/dist.js`. Used by rule STA-02 in `core/roles/finance.js`.

Clean-room implementation from the method described in Nuijten, M. B., Hartgerink, C. H. J., van Assen, M. A. L. M.,
Epskamp, S., & Wicherts, J. M. (2016). The prevalence of statistical reporting errors in psychology (1985–2013).
*Behavior Research Methods*, 48(4), 1205–1226. https://doi.org/10.3758/s13428-015-0664-2.
No statcheck source code (GPL-3) was consulted or copied. The text below is our own description.

## Idea

A result such as `t(28) = 2.20, p = .036` carries enough information to compute p again: the test, its degrees of
freedom and the statistic. If the p we compute does not agree with the printed p, something was mistyped, copied
from the wrong line, or computed in a different way. The check shows a mismatch; it does not say why.

## What is read

Results written in APA style inside one sentence:

| Test | Form | p computed as |
|---|---|---|
| t | `t(df) = x, p ...` | two-tailed: 2 × P(T > abs(x)) |
| F | `F(df1, df2) = x, p ...` | upper tail P(F > x) |
| chi-square | `χ2(df) = x, p ...` (also `chi-square`, `chi2`, with an optional `N = ...`) | upper tail |
| z | `z = x, p ...` | two-tailed normal |
| r | `r(df) = x, p ...` | converted to t = r √(df / (1 − r²)), then as t |

The comparison sign may be `=`, `<`, `>`, `≤` or `≥`.

## Rounding

Both numbers are rounded in print, so we compare intervals, not points.

1. The statistic printed with d decimals stands for any value within half a unit of the last digit. For `2.20` that
   is [2.195, 2.205]. We compute p at both ends, which gives an interval [pLo, pHi].
2. A p printed as `= .036` stands for [.0355, .0365]. The result is consistent when the two intervals touch.
3. `p < c` is consistent when pLo is below c; `p > c` when pHi is above c (`≤`, `≥` include the bound).
4. `p = .000` is read as "p < .0005", since that is what rounding to three decimals means.

## Decision inconsistency

With α = .05, we call the reported result significant when it says `p < c` or `p ≤ c` with c ≤ .05, or `p = x`
with x < .05; not significant when it says `p > c` with c ≥ .05, or `p = x` with x > .05. `p = .05` is left
undecided. A decision inconsistency is an inconsistent result where every p in [pLo, pHi] is on the other side of
.05 from the reported decision. It is reported as `major`; other inconsistencies as `minor`. Both have confidence
`medium`, because reading a sentence can go wrong.

## One-tailed tests

For t, z and r we also compute the one-tailed p (half of the two-tailed one). When the same or a neighbouring
sentence says "one-tailed", "one-sided" or "directional test" (and the phrase is not negated), a result that fits
the one-tailed p is consistent. When the text says nothing but the one-tailed p fits, the finding stays and its
message suggests stating the test direction.

## Validation

`tests/validation/distributions.R` recomputes every distribution value with base R (`pt`, `pf`, `pchisq`, `pnorm`,
`pbinom`, `pbeta`, `lgamma`) and writes the stored JSON files; the consistency and decision rules are written again
in R in the same script. `node tests/validation/run.js` compares the JavaScript results with R; the largest absolute
difference is reported in `docs/reports/phase-2.md`.

## Limits

- Only results written inside one sentence in the forms above are read. Tables are not read.
- Results from software that uses other corrections (for example Welch df printed rounded, or Greenhouse–Geisser) can
  show small mismatches; the rounding allowance covers most of them.
- The existing `check_statistics` tool keeps its own recomputation (`core/stats.js`); its output is unchanged.
