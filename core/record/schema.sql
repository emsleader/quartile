-- Quartile Record (specification Section 21.2). Lives in the same local database as the Library.
-- Events and event files are append-only: triggers refuse UPDATE and DELETE. A mistake is fixed by a new
-- 'correction' event that points to the old event (column corrects).
CREATE TABLE IF NOT EXISTS papers (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  short_name  TEXT,
  type        TEXT,
  design      TEXT,
  collection  TEXT,
  status      TEXT,
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  paper_id    TEXT NOT NULL REFERENCES papers(id),
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  type        TEXT NOT NULL,
  journal     TEXT,
  actor       TEXT,
  summary     TEXT NOT NULL,
  body        TEXT,
  corrects    TEXT REFERENCES events(id),
  data        TEXT
);
CREATE TABLE IF NOT EXISTS event_files (event_id TEXT REFERENCES events(id), path TEXT, sha256 TEXT, kind TEXT, PRIMARY KEY (event_id, path));
CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id),
  paper_id    TEXT NOT NULL,
  journal     TEXT,
  actor       TEXT,
  number      TEXT,
  text        TEXT NOT NULL,
  category    TEXT,
  status      TEXT DEFAULT 'open',
  response    TEXT,
  location    TEXT
);
CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  from_request TEXT REFERENCES requests(id),
  scope       TEXT NOT NULL,
  rule_yaml   TEXT NOT NULL,
  status      TEXT DEFAULT 'proposed',
  decided_at  TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS events_paper ON events(paper_id, occurred_at);
CREATE INDEX IF NOT EXISTS requests_paper ON requests(paper_id, status);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS event_files_no_update BEFORE UPDATE ON event_files BEGIN SELECT RAISE(ABORT, 'event files are append-only'); END;
CREATE TRIGGER IF NOT EXISTS event_files_no_delete BEFORE DELETE ON event_files BEGIN SELECT RAISE(ABORT, 'event files are append-only'); END;
