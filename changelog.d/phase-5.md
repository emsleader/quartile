## Phase 5 — Ethics and data office

- New tool `ethics_check`: simulated ethics and data office review (labelled "Simulated pre-submission review — not a journal decision") of text or a local .docx/.pdf/.txt file, with an optional local author profile and declared design.
- New rulebook `rulebook/ethics.yaml` (8 rules): ETH-01 ethics approval with named body and reference number, ETH-01-WAIVER, ETH-02 informed consent, ETH-03 GDPR data protection for EU/EEA participants, ETH-03-PSEUDO, ETH-05 data and code availability, ETH-05-REQUEST, ETH-06 funding. Negation-aware: a stated "no human participants" ends ETH-01 to ETH-03.
- Ethics role (`core/roles/ethics.js`): ETH-04 conflict-of-interest statement (heading-aware), ETH-04-DUAL dual-role flag from the local `author.yaml` (affiliations and business interests compared with the studied sector through a documented synonym table), ETH-07 small cells (counts below 5) in firm-level survey tables.
- Author profile read from the tool input, `QUARTILE_AUTHOR_PROFILE` or `$QUARTILE_HOME/author.yaml`; fictional template in `tests/fixtures/author.example.yaml`.
- Methods written up in `docs/methods/ethics.md` and `docs/methods/dual-role.md`.
