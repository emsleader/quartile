# FER Hungary — empirical replication status (17 November 2026)

**Mode: independent reconstruction from original authorised WBES Stata microdata. R execution has NOT yet happened; do not mark G0/G1 as fully passed.**

## Source and samples
- Original four-wave panel: 2,237 records × 811 variables, SHA-256 `973e1fb3cbf09e78be671aef28be70f4bfe2815e7a74c57406bbcb450142ecdc`; no private rows in GitHub.
- 2019/2023 eligible: 656/664. 2019-baseline matched: 244. Own-wave continuers: 240. Wave-only leavers: 416; wave-only entrants: 424.

## Independently reconstructed numbers
- Wave fixed-asset purchase share: 54.273% to 63.624%; +9.3508 pp.
- Baseline-eligible matched change −6.1475 pp; exact McNemar p=0.171565.
- Gap of different estimands +15.4983 pp; symmetric decomposition: continuing rate −3.4141 pp, share −1.8577 pp, sample turnover +14.6226 pp. Algebraic residual ~0.
- Weighted entrant–leaver adjusted LPM +20.4751 pp, HC1 SE 5.920 pp, HC1 p=0.000570; sector × size standardized gap +19.7629 pp.
- Reinterview Logit baseline purchasing OR 1.559 (Wald 95% CI [1.107,2.196]); matched re-interview IPW change −0.7723 pp; effective N 227.94; propensity range [0.167,0.588], worst abs SMD after weighting 0.0191.

## Confidence intervals from independent Python resampling (not R)
- B=1000 joint stratified bootstrap: gap [5.80,24.12], turnover [7.67,21.96], IPW change [−7.96,7.15], adjusted LPM [9.12,32.21] pp.
- B=5000: gap [6.35,24.51], turnover [7.40,21.65], IPW change [−8.14,6.91], adjusted LPM [8.99,32.05] pp.
- IPW-minus-unweighted change contrast CI **crosses zero** at B=5000 [−0.09,11.23] pp, although B=1000 was [0.11,11.50]; do not call this contrast robustly significant.

## Actual QA and pending gates
- Quartile **local 0.8.0** deterministic check: 13 logit coefficient/SE/p-value statements, **zero arithmetic mismatches**. Local manuscript analysis flagged 9 heuristic citation keys for manual review. Neither this nor a green GitHub CI validates scientific identification.
- Rscript is absent in the current execution environment. Original user R scripts were preserved untouched. A one-command private R execution harness and independent stats/Quartile outputs are archived with a detailed report in the research Drive folder.
- **Do not copy .dta, panelid, or firm-level data into GitHub.** Do not promote draft branch to production without verified R run and human economic-methodology signoff.
- The 2019 K.4 binary indicator is not capital stock or monetary-policy response. Survey 2023 generally refers to FY2022, not the 2023 loan-programme period; avoid causal assertions.

Main source archive: https://drive.google.com/drive/folders/1ReUvtFfRAGXs66JEeE2v8_aeGUys6vO-
