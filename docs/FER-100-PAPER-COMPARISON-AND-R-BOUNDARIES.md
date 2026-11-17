# FER: 100-DOI Q1 candidate bank, verified source access, and R gate

**Target manuscript:** *Who Is Surveyed Matters: Hungarian SME Investment*. **Current code:** Quartile 0.16.2 candidate, built from official production 0.16.1. **As-of:** 17 November 2026.

## What is actually done
- **100 of 100 unique candidate DOIs individually verified by Scite** in five batches of twenty. This validates identifier resolution and detects listed editorial notices. It **does not validate full text, claim support, author interpretation, quartile status, or academic quality**.
- 100 searchable metadata records stored in `data/fer-q1-100-validated-metadata.json`, available through `fer_q1_reference_bank`. Records include DOI, title, journal, year, thematic group, relative relevance heuristic, prior deep-reading notes when available, and explicit review status. The app does **not** redistribute copyrighted full text or download raw PDFs.
- The prior deep-reading register records **six relevant Q1 full texts / full author manuscripts**. A further four sources were previously available only as abstracts or previews. The complete 100-item source list originally has no per-item full-text verification entries. **Do not count 100 as 100 full-text comparisons.**
- One *Economia Politica* article (10.1007/s40888-018-0108-4) has a previously identified **2025-Q2** journal designation and must not be called a confirmed Q1 article. All other 99 are still marked **individual 2025 quartile recheck required**.
- **Actual R 4.3.3 aggregate-only code execution** via GitHub Actions `FER R aggregate audit and Q1 reference bank`: independent, sanitised aggregate fixture checks exact McNemar using `binom.test`, weighted change identity, matched and decomposition identity, logit OR/Wald CI/p, robust LPM p approximation, IPW overlap/ESS, and B=5000 IPW confidence interval crossing zero.
- **No private WBES firm-level data committed, transmitted to GitHub or put in the build image.**
- **Six original R scripts on the private `.dta` remain UNEXECUTED**, despite independent Python reproduction; separate R aggregate fixture execution does not resolve this gate or replicate R bootstrap streams.

## Most directly applicable published empirical and methodological comparators

| Paper (verified DOI) | Actual available source | Specific comparison | Must not copy or conclude |
|---|---|---|---|
| Muzi et al. (2023), *Small Business Economics*, 10.1007/s11187-022-00675-w | Full published HTML inspected in prior FER research | WBES reinterview/logit, records vs true firm closure | Non-interview is not business exit |
| Nicolas (2022), *Small Business Economics*, 10.1007/s11187-021-00488-3 | Full published HTML previously inspected | Explicit SME investment equation, diagnostics and selection rules | Do not substitute system GMM into two-wave binary WBES |
| Finnegan & Kapoor (2023), *Small Business Economics*, 10.1007/s11187-023-00730-0 | Full publisher HTML inspected | Institutional context, model, inference, heterogeneity, guarded policy interpretation | Do not present Hungary wave contrast as ECB causal policy |
| Canofari et al. (2025), *Journal of Corporate Finance*, 10.1016/j.jcorpfin.2025.102853 | Open-access author PDF previously inspected | Investment and monetary tightening reporting, fixed effects, identification limits | No event-study/local projections without usable annual firm panel |
| Melitz & Polanec (2015), *RAND Journal of Economics*, 10.1111/1756-2171.12088 | Author-hosted PDF previously inspected | Exact additive decomposition and survivor/entrant language | Their real firm entry/exit ≠ WBES sample turnover |
| Schifeling et al. (2015), *Journal of Survey Statistics and Methodology*, 10.1093/jssam/smv007 | Full author manuscript previously inspected | Attrition, refreshment samples, nonignorability assumptions | IPW adjusted observable selection ≠ correction for MNAR |
| Horváth & Lang (2021), *Journal of Banking & Finance*, 10.1016/j.jbankfin.2020.105988 | Publisher abstract/preview **only** | Hungary credit programme evaluation comparison | Do not reproduce unpublished coefficients or infer same causal effect |
| Aga & Francis (2017), *Small Business Economics*, 10.1007/s11187-016-9817-7 | Published abstract **only** | Context for WBES record exit and censoring | Do not claim full-text method review |

The selected papers are **structural and analytical comparators**, not directly comparable treated/control designs. Journal quartiles refer to journals/years, not articles, and must be checked against the latest SCImago for the targeted journal year.

## Transfer into FER editor's four mandatory revisions
1. **Formal models:** Report distinct weighted cross sections, paired-panel estimand, 240-firm symmetric composition decomposition, reinterview Logit, weighted entrant/leaver LPM, IPW, and exact bootstrap recipe; retain model diagnostics, weights, N, reference categories and confidence intervals.
2. **Economic-policy relevance:** Document MNB 2022 tightening, 2022 energy-price burden, Hungarian SME financing and loan programmes using official MNB/OECD/World Bank sources. The 2023 survey chiefly measures FY2022 capital purchases; a February 2023 programme cannot cause 2022 transactions.
3. **Traditional structure:** Begin with outcome and economic-monitoring paradox, pose three separately answerable RQs, give methods for each, then results and direct conditional policy recommendations. Avoid single-paragraph Introduction and Conclusion.
4. **Formal FER appendices:** Integrate as appendix sections with continuous table numbers, editable equations and Word tables; consolidate into 6 tables+2 figures for maximum eight main exhibits; ensure 60,000-character ceiling with spaces and 800–1000-character abstract.

## Hard gates and scientific warnings
- **Do not say all 100 were read**. Scite verified 100 identifiers; 6 particularly relevant papers have documented full-text access.
- **Do not say six original R scripts ran**. Only a new R **aggregate-level** check actually ran in GitHub Actions, not private raw data analysis.
- For IPW versus matched unadjusted, independent Python percentile 95% B=5000 [−0.088,11.226] pp and B=10000 [−0.140,11.188] pp include zero. Do not claim robust 5% significance.
- The weighted wave percentage change is not investment spending, the panel-only change is not the entire SME universe, and neither gives an identified monetary-policy effect.
- All new Quartile quality checks require version **>=0.16.0** and version/commit logging. v0.8.0 is historical only.
- Final scientific signoff requires original raw-data R execution, agreement of model specifications and seeds, consistency of formatted tables, separate reviewer-ready manuscript, references, and human quantitative review.

## Primary public sources
- World Bank 2009–2013–2019–2023 panel: https://microdata.worldbank.org/catalog/8141
- Official FER Authors Guide: https://hitelintezetiszemle.mnb.hu/en/authors-guide
- MNB 2022 monetary base-rate decision: https://www.mnb.hu/en/monetary-policy/the-monetary-council/press-releases/2022/press-release-on-the-monetary-council-meeting-of-27-september-2022
- MNB 2022 Q4 lending survey: https://www.mnb.hu/en/pressroom/press-releases/press-releases-2023/the-demand-for-short-term-and-foreign-currency-loans-increased
- OECD SME financing Hungary 2024: https://www.oecd.org/en/publications/financing-smes-and-entrepreneurs-2024_fa521246-en/full-report/component-28.html

**GitHub CI R aggregate run:** https://github.com/emsleader/quartile/actions/runs/44175396126
