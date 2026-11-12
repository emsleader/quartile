# AI-style signal: formula and limits

Quartile's `ai_style_check` measures surface patterns that are common in unedited text from large language models. It measures style. It does not tell who wrote a text: people trigger it, and AI text that has been edited passes it. Published detectors have not been reliable enough to support authorship claims, and they misclassify non-native English writers more often. Use the score to find passages that read as generic, then fix them.

## Features

All rates are per 1,000 words of body text (headings, tables, references and declarations excluded; citations removed).

| Feature | Typical rate (μ) | SD (σ) | Weight (w) |
|---|---|---|---|
| Stock AI words and phrases (delve, crucial, pivotal, landscape, underscore, leverage, foster, shed light, plays a crucial role …) | 1.0 | 1.5 | 2 |
| Em dashes and spaced dashes | 0.5 | 1.0 | 1 |
| "Not X but Y" and "not only … but also" contrasts | 0.3 | 0.5 | 2 |
| Three-item lists ("X, Y, and Z") | 4.0 | 2.5 | 1 |
| Staged sentence openers (Moreover, Furthermore, Additionally, Notably …) | 1.5 | 1.5 | 1.5 |
| Summary closers ("This highlights the importance of …") | 0.3 | 0.6 | 1 |
| Sentence-length coefficient of variation (low = uniform) | 0.42 | 0.12 | 1.5 |

## Formula

For each feature *f* with observed value *x*:

- z = (x − μ) / σ, except for sentence-length variation, where z = (μ − x) / σ because uniform length is the signal
- s = min(max(z, 0), 3) / 3, so a feature at or below the typical rate adds nothing and one three SDs above adds its full weight

score = 100 × Σ w·s ÷ Σ w

Bands: below 20 low, 20 to 45 moderate, above 45 high.

Long papers dilute a generic passage, so every paragraph of 60 or more words is also scored on its own; paragraphs above 45 are listed as hotspots.

## Fixes

The tool suggests sentence-level replacements from a fixed list (delve into → examine, crucial → important, leverage → use, Moreover/Furthermore → Also, em dash → comma, and so on). Each replacement has already passed `verify_rewrite`, so it changes no number, citation, protected term or causal claim. Apply the ones you accept with `apply_replacements`. The tool also reports the score the text would have after all fixes.

## Calibration

The reference values (μ, σ) are version 1, set by hand from Quartile's measured Q1 abstracts and the full-text corpus. `scripts/benchmark.js` reports the score distribution on your own clean papers; if your field's prose sits higher, raise μ for the features that drive it.
