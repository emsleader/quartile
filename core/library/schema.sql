-- Quartile Library schema (specification 20.2), adapted for sql.js.
-- Changes from the specification text: every CREATE has IF NOT EXISTS (run on every open), a few indexes were
-- added, and the search table uses FTS4 instead of FTS5 because this sql.js build has no FTS5. The FTS4 table
-- keeps its own copy of the text (not contentless), so rows can be updated and deleted.
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  csl           TEXT NOT NULL,
  doi           TEXT UNIQUE,
  title_norm    TEXT NOT NULL,
  year          INTEGER,
  type          TEXT,
  issn          TEXT,
  venue         TEXT,
  quartile      TEXT,
  quartile_year INTEGER,
  added_at      TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verification (
  item_id    TEXT REFERENCES items(id),
  source     TEXT NOT NULL,
  status     TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  note       TEXT
);
CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, parent_id TEXT);
CREATE TABLE IF NOT EXISTS item_collections (item_id TEXT, collection_id TEXT, PRIMARY KEY (item_id, collection_id));
CREATE TABLE IF NOT EXISTS tags (item_id TEXT, tag TEXT, PRIMARY KEY (item_id, tag));
CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, item_id TEXT, body TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, item_id TEXT, path TEXT, sha256 TEXT, kind TEXT);
CREATE TABLE IF NOT EXISTS screening (
  item_id TEXT, review TEXT, stage TEXT,
  decision TEXT, reason TEXT, reviewer TEXT, decided_at TEXT,
  PRIMARY KEY (item_id, review, stage, reviewer)
);
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts4(item_id, title, authors, abstract, venue, notindexed=item_id, tokenize=unicode61 "remove_diacritics=1");
CREATE INDEX IF NOT EXISTS items_year ON items(year);
CREATE INDEX IF NOT EXISTS items_title ON items(title_norm);
CREATE INDEX IF NOT EXISTS verification_item ON verification(item_id);
CREATE INDEX IF NOT EXISTS tags_tag ON tags(tag);
