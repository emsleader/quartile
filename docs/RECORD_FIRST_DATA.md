# Quartile Record: entering the FER paper first

The specification (Section 21.8) asks for the FER paper to be the first paper in the record. The developer did
not have the editor's letter or the real history, so nothing about the FER paper is stored yet. Nothing was
invented. This page tells you, the owner, how to enter it yourself.

Everything stays on your computer, in `$QUARTILE_HOME` (default `~/.quartile`):

- the database: `library/library.sqlite` (shared with the Quartile Library);
- copies of attached files: `record/files/<event-id>/`, with SHA-256;
- approved lessons: `record/lessons.yaml`.

Events can never be edited or deleted. If you make a mistake, add a `correction` event (step 6).

## Before you start

Have these ready:

1. The paper id you want to use (for example `FER-HU-WBES`) and the exact title.
2. The journal's ISSN as you want it stored (for example `XXXX-XXXX`). Use the same form every time.
3. The submitted manuscript file (DOCX or PDF) and the submission confirmation e-mail, saved as text or PDF.
4. The editor's decision letter of 18 November 2026, as a file (DOCX, PDF or TXT) or as pasted text.

## Step 1. Create the paper

Call `record_paper`:

```json
{ "action": "create", "id": "FER-HU-WBES", "title": "<exact title>", "short_name": "FER paper",
  "type": "empirical", "design": "<design, e.g. bounds>", "collection": "<Library collection name, if you have one>" }
```

If the Library collection does not exist yet, the link is stored as given and can be set later with
`{ "action": "link", "id": "FER-HU-WBES", "collection": "..." }`.

## Step 2. Add the earlier history (optional, but recommended)

One `record_event` call per event, with the date it happened. The order of entry does not matter: the record
is always shown in date order. Examples: `idea`, `draft_version`, `co_author_comment`, `supervisor_comment`,
`analysis_run`, `validation_record`, `quartile_check`.

```json
{ "paper_id": "FER-HU-WBES", "type": "draft_version", "occurred_at": "2026-10-20", "actor": "self",
  "summary": "Final draft before submission", "files": [{ "path": "/path/to/draft.docx", "kind": "manuscript" }] }
```

## Step 3. The submission (6 November 2026)

```json
{ "paper_id": "FER-HU-WBES", "type": "submitted", "occurred_at": "2026-11-06", "journal": "<ISSN>", "actor": "self",
  "summary": "Submitted to FER",
  "files": [{ "path": "/path/to/submitted-manuscript.docx", "kind": "manuscript" },
            { "path": "/path/to/confirmation-email.pdf", "kind": "email" }] }
```

## Step 4. The editor's decision (18 November 2026)

Call `record_letter` with the letter. Use `decision` and the decision the editor gave
(`accept`, `minor`, `major`, `reject` or `transfer`). Give either `path` (the file is also attached) or `body`
(pasted text).

```json
{ "paper_id": "FER-HU-WBES", "type": "decision", "occurred_at": "2026-11-18", "journal": "<ISSN>",
  "actor": "editor", "data": { "decision": "<major or minor>", "deadline": "<if the letter gives one>" },
  "path": "/path/to/editor-letter.pdf" }
```

The result lists every request found (E1, E2 ... for the editor; R1.1, R1.2 ... for reviewers), a proposed
category for each, and one proposed lesson per request. Please check the list against the letter:

- If a request is missing or two requests were joined, tell the developer (the letter is kept verbatim in the
  event, so nothing is lost). The splitter was tested on fictional letters only.
- Administrative lines (deadline, "please send a point-by-point response", tracked changes) are not counted as
  requests on purpose.

## Step 5. Confirm categories and decide on lessons

- Confirm or change each category with `record_requests`:
  `{ "action": "update", "request_id": "<id>", "category": "formal_model_equations" }`.
- List the proposed lessons: `record_lessons` with `{ "action": "list", "status": "proposed" }`.
- Approve, edit or reject each one. Only you decide; the call needs `owner_confirm: true`:
  `{ "action": "approve", "lesson_id": "<id>", "owner_confirm": true, "note": "<why>" }`.

Approved lessons are written to `record/lessons.yaml` and shown as checklist items ("check by hand") in the next
committee review of any paper for the same journal. They never enter the repository rulebook.

## Step 6. The revision in progress

While you revise, mark each request when it is done:

```json
{ "action": "update", "request_id": "<id>", "status": "addressed", "location": "Section 3, paragraph 2",
  "response": "Added equations (1) to (4)." }
```

`partly` also needs a location; `declined` needs the reason in `response`. To see what is still open:
`{ "action": "open", "paper_id": "FER-HU-WBES", "revision": "1" }`. When you send the revision, add a
`revision_submitted` event with the revised manuscript and the response letter as files.

To fix a wrong entry, add a correction (the old event stays, marked as corrected):

```json
{ "paper_id": "FER-HU-WBES", "type": "correction", "corrects": "<event id>", "summary": "Wrong date",
  "data": { "set": { "occurred_at": "2026-11-07" } } }
```

Use `"data": { "void": true }` to withdraw an event entered by mistake.

## Step 7. Check the history

- `record_timeline` with `{ "paper_id": "FER-HU-WBES", "format": "docx" }` writes a dated timeline to
  `record/exports/`. It lists your own events, decisions and documents (file names with SHA-256); letters from
  others are summarised, not copied.
- `record_stats` gives counts and dates only (for example, 12 days from submission to first decision). It never
  predicts anything.
