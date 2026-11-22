## Phase 9 — Quartile Record (paper history and learning, specification Section 21)

- New local paper record in the shared Library database (`$QUARTILE_HOME/library/library.sqlite`): papers, events, event files, requests and lessons (`core/record/schema.sql`). Events and event files are append-only; database triggers refuse UPDATE and DELETE. Mistakes are fixed with a `correction` event that points to the old event.
- Event files are copied to `$QUARTILE_HOME/record/files/<event-id>/` with their SHA-256.
- Paper status is derived from the latest status event (date order, corrections applied).
- Letter splitter (`core/record/split.js`) for editor and reviewer letters: "Editor:", "Reviewer 1", "R1.3", "Comment 2:", numbered, bulleted and lettered lists, and prose letters.
- Category proposals (specification 21.5 hints plus our hints for the other 21.4 categories) and lesson proposals in rulebook format (`check: manual`).
- Owner-only lesson decisions (approve, edit, reject, retire). Approved lessons go to `$QUARTILE_HOME/record/lessons.yaml`, never into the repository rulebook. A category asked by two or more journals is proposed with scope `all`.
- Exports for other modules: `getApprovedLessons({ journal })` (committee review) and `openRequests({ paper_id, revision })` (submission readiness, response tracker).
- New tools: `record_paper`, `record_event`, `record_letter`, `record_requests`, `record_lessons`, `record_timeline` (Markdown and DOCX), `record_stats` (descriptive counts and dates only).
- New guide: `docs/RECORD_FIRST_DATA.md` (how to enter the FER paper).
