# GRIM, GRIMMER and DEBIT: are reported means and SDs possible? (STA-01, `grim_check`)

Code: `core/stats/grim.js`, `core/stats/grimmer.js`, `core/stats/debit.js`. Used by STA-01 in
`core/roles/finance.js` and by the `grim_check` tool. Our own description of the published methods:

- Brown, N. J. L., & Heathers, J. A. J. (2017). The GRIM test. *Social Psychological and Personality Science*, 8(4),
  363–369. https://doi.org/10.1177/1948550616673876
- Anaya, J. (2016). The GRIMMER test. *PeerJ Preprints*, 4, e2400v1. https://doi.org/10.7287/peerj.preprints.2400
  (preprint; used as a method source only)
- Heathers, J. A., & Brown, N. J. L. (2019). DEBIT: A simple consistency test for binary data. *OSF Preprints*.
  https://doi.org/10.17605/osf.io/pm825 (preprint; used as a method source only)

No code from other implementations was used. The R package scrutiny (MIT) named in the specification was not
available (CRAN is blocked here), so every validation answer is found by brute-force enumeration in base R.

## GRIM: the mean

If n people each give a whole-number answer, their total is a whole number, so the mean is total / n. A mean printed
to d decimals is possible only if some whole-number total, divided by n, lies within half a unit of the last printed
digit. With a scale of k items averaged per person, the total of all item answers is a whole number, so the
denominator is n × k.

- We accept a total when its exact mean is within half a unit, ends included. So at an exact tie (for example 3.125
  printed as 3.12 or 3.13) both rounding rules pass. This avoids false flags.
- The test has power only when n × k is below 10^d. Above that every printed mean is possible, and we say
  "not testable".
- Examples (specification 7.2): 3.48 with n = 25 is possible (87 / 25); 3.47 with n = 25 is not; 5.19 with n = 28 is
  not (145 / 28 = 5.18, 146 / 28 = 5.21).

## GRIMMER: the SD

For whole-number data with total S and sum of squares Q, the sample variance is (Q − S² / n) / (n − 1). So, for a
printed SD, Q must lie in a known interval. Q is a whole number, and because x² and x are both even or both odd for
any whole number x, Q and S must be both even or both odd. `grimmer()` checks these necessary conditions for every
total S allowed by GRIM. If none passes, the SD is impossible. If one passes, the SD is "not ruled out" (the
conditions are necessary, not sufficient).

`grimmerExact()` is the exact version for a known bounded scale (for example a 1–5 Likert item): it lists every
possible data set of n values on the scale (by dynamic programming over totals and sums of squares) and asks whether
any of them gives a mean and an SD within half a unit of the printed ones. It refuses (returns `null`) when the
search would be too large.

STA-01 uses the exact search when the scale range is stated near the mean ("five-point", "from 1 to 7"), and the
quick test otherwise. An SD failure is `minor` with confidence `low`, because authors sometimes print the population
SD (n instead of n − 1).

## DEBIT: binary data

For 0/1 data with k ones out of n, the mean is k / n and the SD follows from it:
sample SD = √(n / (n − 1) × p(1 − p)), population SD = √(p(1 − p)). `debit()` tries every k and asks whether one gives
both the printed mean and the printed SD. STA-01 accepts either SD formula.

## When STA-01 runs on a manuscript

Only when all of these hold, so that continuous data are not tested by mistake:

1. a mean and an `n = ...` appear in the same sentence;
2. the sentence or the one before it says the data are integers (Likert, k-point scale, single item, counts), or,
   for DEBIT, binary (dummy, 0/1, yes/no);
3. the item count is known (stated "k-item", or a single item); a multi-item scale without a count is skipped;
4. the mean lies inside a stated scale range;
5. GRIM is testable (n × k < 10^d).

A GRIM failure is `major` with confidence `medium`, never a blocker: the reading of n and of the scale can be wrong.

## Validation

`tests/validation/consistency.R` (base R only) enumerates: every whole-number total (GRIM); every total and every
whole-number sum of squares (the GRIMMER conditions); every data set on 1–5, 1–7 and 0–10 scales for small n
(GRIMMER exact); every count of ones with R's own `sd()` (DEBIT); and the caliper counts with `pbinom`. The phase
tests also check that the quick GRIMMER test never rejects a pair that the exact enumeration found possible.
