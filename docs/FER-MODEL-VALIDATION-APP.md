# FER econometric validation in Quartile 0.16.x

## Scope
Read-only calculation/audit module for the paper *Who Is Surveyed Matters: Hungarian SME Investment* and the editor's explicit E1–E4 major revision requests. Based on 17 November 2026 independent replication from owner-provided World Bank WBES Hungary four-wave Stata panel.

### Newly integrated MCP tools
- `fer_equation_catalog`: 12 numbered mathematical model/estimand definitions, required data, assumptions and falsification/diagnostic checks.
- `fer_replication_audit`: deterministic aggregate consistency validator; defaults to provenance-labelled independent Python aggregate snapshot; optionally takes a JSON aggregate report string to check later R results.

### What the tool checks
Weighted wave change; matched change against paired discordances; exact McNemar two-sided p; gap between estimands; symmetric three-component decomposition; logit baseline-purchasing OR, 95% Wald CI and p; IPW positivity, ESS and balance reported; LPM robust p coherence; percentile CI interval bounds; recorded IPW refit counts; source/sampling dimensions.

### What it CANNOT claim
This tool is not an econometric estimator from raw WBES microdata. The referenced aggregate snapshot was **computed independently using Python**, not by executing the **six original R scripts**. Exact R-bootstrap/seed replication, data hash readback, missing-not-at-random sensitivity, source attribution, policy causality and manuscript approval are outside the scope of this arithmetic module.

### Source hierarchy and data handling
Full private original WBES Stata microdata, R originals, logs and Python reconstruction live in:
https://drive.google.com/drive/folders/1ReUvtFfRAGXs66JEeE2v8_aeGUys6vO-
**Never commit .dta, .sav, firm rows, panelid, or personal data**. GitHub contains only code, synthetic fixture, saved aggregate outputs and provenance.
- Authorised source SHA-256 recorded in snapshot: `973e1fb3cbf09e78be671aef28be70f4bfe2815e7a74c57406bbcb450142ecdc`; this is NOT rechecked by the deployed app without raw source.
- Python independent 1,000/5,000 bootstrap uses NumPy RNG and does NOT reproduce R random streams.
- Survey-only entrants/leavers are not actual births/closures.
- Binary K.4 is not an amount or capital stock.
- 2023 WBES K.4 refers to FY2022 purchases; do not impute 2023 credit programmes as determinants of these observations.
- Two-wave survey does not identify causal effect of MNB interest rates or energy crisis.

### Reproducing tests
```bash
node tests/fermodels.test.js
node --check mcp/server.js
# Full Quartile test suite requires npm ci in mcp, plus configured Rscript dependencies.
```

### Formal R acceptance gate
Run the preserved R scripts in owner-controlled R environment, record exact original script SHA-256, installed R/package versions, output rows, bootstrap seeds, warnings and all regression coefficients/standard errors. Compare the generated aggregate JSON (not raw data) with `fer_replication_audit`. Only after human econometric verification may the FER scientific gate be marked PASSED.

### FER revision letter map
E1: explicit formulas and executed R model output; E2: MNB/OECD/WB chronology and conditional monitoring implications; E3: connected paragraphs and direct RQ answers; E4: journal-compliant tables, appendices, accurate references and blinded copy. Module alone completes NONE of the editor gates.
