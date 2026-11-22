# Ethics and data office (specification Section 10)

Quartile's own rules, built on COPE Core Practices, the ICMJE Recommendations (Section II.B), the WMA Declaration
of Helsinki (2013, paras. 23 and 25-26), Regulation (EU) 2016/679 (GDPR) and, for small cells, the threshold rule
of statistical disclosure control (Hundepool et al., 2012). No text from these sources is reproduced.

| ID | What is checked | Designs | Where |
|---|---|---|---|
| ETH-01 | Approval sentence naming a body and giving a reference number (a token with a digit; year ranges do not count) | survey, experiment, qualitative | rulebook/ethics.yaml |
| ETH-01-WAIVER | "Ethics approval was not required" with no reason | all | rulebook |
| ETH-02 | Informed consent described (negated consent does not count) | survey, experiment, qualitative | rulebook |
| ETH-03 | Participants in an EU/EEA country: GDPR legal basis, pseudonymisation or anonymisation, storage period | survey, experiment, qualitative | rulebook |
| ETH-03-PSEUDO | Pseudonymised data called anonymous or outside the GDPR | all | rulebook |
| ETH-04 | Conflict-of-interest statement; a heading counts | all | core/roles/ethics.js |
| ETH-04-DUAL | Author's affiliations or business interests in the studied sector (see dual-role.md) | all | core/roles/ethics.js |
| ETH-05 | Data and code availability statement; heading counts | all empirical (not conceptual) | rulebook |
| ETH-05-REQUEST | "Available on request" only (note) | all empirical | rulebook |
| ETH-06 | Funding statement; heading counts | all | rulebook |
| ETH-07 | Firm-level table with a count column (n, number, firms, frequency) holding values 1 to 4 | survey | core/roles/ethics.js |

**Negation and exits.** A sentence saying no human participants were involved (for example "No ethics approval was
required because no human participants were involved") ends ETH-01, ETH-02 and ETH-03 for that paper. Any stated
waiver ends ETH-01; ETH-01-WAIVER then asks for its reason. "No personal data were collected" ends ETH-03.

**Severity.** No ethics check is a blocker. Missing approval or consent in a human-participant design is major
(confidence medium); missing GDPR details are minor with low confidence, because many business journals do not ask
for them.
