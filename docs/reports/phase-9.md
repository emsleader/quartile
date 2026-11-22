Phase 9 — Paper history and learning (Quartile Record, specification Section 21)

Status: done. The FER paper itself is not entered (no letter or real history was available); docs/RECORD_FIRST_DATA.md tells the owner how to enter it.

What changed: files, new tools, new rules (count)
- core/record/: schema.sql, store.js, papers.js, events.js, split.js, learn.js, letters.js, requests.js, lessons.js, stats.js, timeline.js, index.js.
- tools/: record_paper, record_event, record_letter, record_requests, record_lessons, record_timeline, record_stats (7 new tools).
- tests/phases/phase9-record.test.js; tests/phases/phase9-letters/ (6 development letters, 3 held-out letters, truth.json in each).
- docs/RECORD_FIRST_DATA.md, docs/methods/record-letter-splitting.md, changelog.d/phase-9.md, this report.
- New YAML rules in the repository: 0. Approved lessons go to $QUARTILE_HOME/record/lessons.yaml only.
- Storage: the shared database through core/store/db.js. Triggers refuse UPDATE and DELETE on events and on event_files. Event IDs are ULIDs. Files are copied to $QUARTILE_HOME/record/files/<event-id>/ (read-only copy) with SHA-256.

Integration for other phases (no files of theirs were edited):
- committee_review: `import { getApprovedLessons } from "core/record/index.js"`; `await getApprovedLessons({ journal: issn, design })` returns approved lessons for that journal (ISSN compared without hyphen or case), for scope `all`, and for `design:<d>` when design is given. Each item is an engine rule (check: manual, role eic, source_id QUARTILE-RECORD) plus lesson_id, scope, from_request, decided_at. Show them as the "Lessons from earlier letters" block, or pass them to runRules (each gives a note with status needs_human). A synchronous file-only reader is `readApprovedLessonsFile({ journal })`.
- submission_readiness and response_tracker: `await openRequests({ paper_id, revision })`. revision = round number (1 = requests to answer in the first revision; a round is counted by revision_submitted events in date order), "latest", or a letter event id; omitted = all rounds. Returns { total, counts, open[], partly[], ready, message }; ready is false while any request is open. Requests of a letter voided by a correction drop out. Request rows carry verbatim text, number, actor, category, status, response and location, so response_tracker can build its table from them.

Tests: total, passed; new tests added
- node tests/run.js 101/101; node tests/rules/run.js 8 rules, 29 checks; node tests/bugs/run.js passed; node tests/phases/run.js 2 files passed; node tests/validation/run.js passed; node tests/gold/run.js passed; lint, check-changelog and third-party --check passed.
- New: tests/phases/phase9-record.test.js with 85 assertions. It covers a synthetic history entered out of order and replayed in date order (status after each step), UPDATE and DELETE raising on events and event_files, corrections and voiding, file hashes, letter splitting, request status rules, revision rounds, owner-only lesson decisions, lessons.yaml as a valid rulebook, getApprovedLessons for the same journal and not for another journal, the repeated-lesson proposal, statistics, the Markdown and DOCX timeline, and all 7 tools. Every run uses a temporary QUARTILE_HOME.

Metrics: precision / recall per role on gold set (with n)
- Not applicable: this phase adds no review role or rule. Gold set unchanged.
- Letter splitter (fictional letters written by the developer; a request counts as captured when exactly one split request contains its annotated key phrase):
  - Development set (6 letters, 6 styles, n = 39 requests; the splitter was tuned on these): 39/39 captured (100%), 39/39 numbered as annotated, 0 extra items.
  - Held-out set (3 letters, n = 18 requests, written after the splitter was frozen): first run 16/18 captured (88.9%). Two reviewer points in a lettered list "(a) (b) (c)" with no open item were joined, and one introductory sentence ("We ask for the following changes") was counted as a request. Both were fixed. After the fix: 18/18 captured, 0 extra. After that fix the set is no longer independent. Numbering on the held-out set: 11/18 as annotated. Prose requests are numbered after the letter's own numbered list, and a sender named only in the sign-off ("Managing Editor") is not found.
  - The test gate is a capture rate of at least 0.90 on both sets. Real letters may score lower. The FER letter will be the first real test.

Validation: stats vs R (max absolute difference)
- Not applicable. record_stats gives counts, dates, minimum, median and maximum days only. No inference, so no R validation is needed.

Known limits and open questions for the owner
1. FER first data: not entered. No letter or history was available, and nothing was invented. See docs/RECORD_FIRST_DATA.md.
2. Timeline export, safe default: full texts of letters from others (editor, reviewers, co-authors, supervisors) are not exported. Only their summary, date, decision, request counts and file names with SHA-256 are. Bodies are exported only for your own events (actor self or empty). Should the letters be included?
3. Administrative lines in letters (deadline, point-by-point response, tracked changes, upload) are not counted as requests. Should they be?
4. "Owner only" is enforced with `owner_confirm: true` plus the tool description. The MCP layer cannot prove who is calling. Every decision is also stored as a user_decision event ("USER DECISION — date — owner: ...") without your name; add the name if you want it.
5. Categories: the spec's 9 hints are kept unchanged. We added keyword hints for the other 12 categories of 21.4 (core/record/learn.js EXTRA_HINTS). The first hit is stored as the proposed category; the other hits are returned as candidates. Whether you confirmed a category is not stored, because the spec schema has no column for it. The repeated-lesson proposal therefore counts proposed categories too.
6. One lesson is proposed for every request, including category "other". Reject the ones you do not want.
7. Changes to a request's status are kept in the requests table (allowed by the spec). They are not added as events, so the timeline shows the counts, not each change.
8. A lesson stays check: manual until a developer writes an automatic test (spec 21.5). Lesson edits that try to change check are refused.
9. Revision round = 1 + the number of revision_submitted events before the letter. If you use a different meaning of "revision", tell the developer.
10. Paper status comes from status events in date order. Any event can set it explicitly with data.status (for example "withdrawn").
11. Schema follows 21.2, with additions: IF NOT EXISTS, two indexes, and triggers on event_files. Table names (papers, events, requests, lessons) are generic. The Library phase must not use the same names in the shared database.

Dependencies added (name, licence)
- None. Uses sql.js, ulid, yaml, ajv, docx and zod, which are already installed.
