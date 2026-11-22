// Quartile Library storage (specification 20.2) on the shared sql.js database (core/store/db.js).
// One record per item: the full CSL-JSON plus the columns used for search, duplicates and policy.
// PDFs live as files under $QUARTILE_HOME/library/files/<item-id>/ (see files.js), never in the database.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ulid } from "ulid";
import { openDb, home } from "../store/db.js";
import { cleanCsl, normDoi, normTitle, yearOf, kindOf, issnOf, venueOf, now, familyOf } from "./normalize.js";

const SCHEMA = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
export const libraryDir = () => path.join(home(), "library");
export const SYSTEM_TAGS = ["Q1", "Q2", "Q3", "Q4", "preprint", "conference", "retracted", "own-work", "close-idea"];
export const isSystemTag = t => SYSTEM_TAGS.includes(t) || /^verified-\d{4}-\d{2}-\d{2}$/.test(t);

/** Open the library of the current $QUARTILE_HOME. */
export async function openLibrary() {
  const h = await openDb([SCHEMA]);
  return new Library(h);
}

export class Library {
  constructor(h) { this.h = h; }

  // ---------- reading ----------
  row(id) { return this.h.get("SELECT * FROM items WHERE id = ?", [id]); }
  get(id) { const r = this.row(id); return r ? this.hydrate(r) : null; }
  byDoi(doi) { const d = normDoi(doi); if (!d) return null; const r = this.h.get("SELECT * FROM items WHERE doi = ?", [d]); return r ? this.hydrate(r) : null; }
  hydrate(r) {
    return { ...r, csl: JSON.parse(r.csl), tags: this.h.all("SELECT tag FROM tags WHERE item_id = ? ORDER BY tag", [r.id]).map(x => x.tag),
      collections: this.h.all("SELECT c.name FROM item_collections ic JOIN collections c ON c.id = ic.collection_id WHERE ic.item_id = ? ORDER BY c.name", [r.id]).map(x => x.name) };
  }
  /** All items (hydrated), oldest first (ULIDs sort by creation time). */
  all() { return this.h.all("SELECT * FROM items ORDER BY id").map(r => this.hydrate(r)); }
  count() { return this.h.get("SELECT COUNT(*) AS n FROM items").n; }
  idsIn(collection) {
    const c = this.h.get("SELECT id FROM collections WHERE name = ?", [collection]);
    return c ? this.h.all("SELECT item_id FROM item_collections WHERE collection_id = ? ORDER BY item_id", [c.id]).map(x => x.item_id) : [];
  }
  idsTagged(tag) { return this.h.all("SELECT item_id FROM tags WHERE tag = ? ORDER BY item_id", [tag]).map(x => x.item_id); }
  collections() {
    return this.h.all("SELECT c.id, c.name, c.parent_id, (SELECT COUNT(*) FROM item_collections ic WHERE ic.collection_id = c.id) AS items FROM collections c ORDER BY c.name");
  }
  tagCounts() { return this.h.all("SELECT tag, COUNT(*) AS items FROM tags GROUP BY tag ORDER BY tag"); }

  // ---------- writing ----------
  /** Columns derived from a CSL record. */
  static columns(csl) {
    return { doi: normDoi(csl.DOI), title_norm: normTitle(csl.title || ""), year: yearOf(csl), type: kindOf(csl), issn: issnOf(csl), venue: venueOf(csl) };
  }
  /**
   * Insert one CSL record. Same DOI as an existing item: not inserted, returns { status: "duplicate" }.
   * opts: { collection, tags, quartile: { quartile, year }, raw } — raw is a transaction handle from tx().
   */
  insert(cslIn, opts = {}) {
    if (!opts.raw) return this.w(null, r => this.insert(cslIn, { ...opts, raw: r }));
    const csl = cleanCsl(cslIn); const col = Library.columns(csl);
    const run = opts.raw;
    if (col.doi) { const d = run.all("SELECT id FROM items WHERE doi = ?", [col.doi])[0]; if (d) return { status: "duplicate", reason: "same_doi", duplicate_of: d.id, doi: col.doi }; }
    const id = opts.id || ulid(), t = now();
    csl.id = id;
    const q = opts.quartile || {};
    run.run("INSERT INTO items (id, csl, doi, title_norm, year, type, issn, venue, quartile, quartile_year, added_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, JSON.stringify(csl), col.doi, col.title_norm, col.year, col.type, col.issn, col.venue, q.quartile || null, q.year || null, opts.added_at || t, t]);
    this.index(id, csl, run);
    const tags = [...new Set([...(opts.tags || []), ...autoTags(col.type, q.quartile)])];
    for (const tg of tags) run.run("INSERT OR IGNORE INTO tags VALUES (?, ?)", [id, tg]);
    for (const c of [].concat(opts.collection || [])) if (c) this.addToCollection(id, c, run);
    return { status: "added", id, type: col.type, doi: col.doi };
  }
  add(csl, opts = {}) { return this.insert(csl, opts); }

  /** Run fn with a transaction handle: the caller's, or a new transaction that is saved at the end. */
  w(raw, fn) { return raw ? fn(raw) : this.h.tx(fn); }

  update(id, cslIn, raw) {
    if (!raw) return this.w(raw, r => this.update(id, cslIn, r));
    const run = raw; const csl = cleanCsl({ ...cslIn, id }); const col = Library.columns(csl);
    run.run("UPDATE items SET csl = ?, doi = ?, title_norm = ?, year = ?, type = ?, issn = ?, venue = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(csl), col.doi, col.title_norm, col.year, col.type, col.issn, col.venue, now(), id]);
    this.index(id, csl, run);
  }
  setQuartile(id, quartile, year, raw) {
    if (!raw) return this.w(raw, r => this.setQuartile(id, quartile, year, r));
    const run = raw;
    run.run("UPDATE items SET quartile = ?, quartile_year = ?, updated_at = ? WHERE id = ?", [quartile || null, year || null, now(), id]);
    run.run("DELETE FROM tags WHERE item_id = ? AND tag IN ('Q1','Q2','Q3','Q4')", [id]);
    if (/^Q[1-4]$/.test(quartile || "")) run.run("INSERT OR IGNORE INTO tags VALUES (?, ?)", [id, quartile]);
  }
  index(id, csl, run) {
    run.run("DELETE FROM items_fts WHERE item_id = ?", [id]);
    const authors = [...(csl.author || []), ...(csl.editor || [])].map(p => [p.given, p["non-dropping-particle"], familyOf(p)].filter(Boolean).join(" ")).join("; ");
    run.run("INSERT INTO items_fts (item_id, title, authors, abstract, venue) VALUES (?,?,?,?,?)", [id, csl.title || "", authors, csl.abstract || "", venueOf(csl) || ""]);
  }
  tag(id, tag, raw) { this.w(raw, r => r.run("INSERT OR IGNORE INTO tags VALUES (?, ?)", [id, tag])); }
  untag(id, tag, raw) { this.w(raw, r => r.run("DELETE FROM tags WHERE item_id = ? AND tag = ?", [id, tag])); }
  collectionId(name, raw, parent = null) {
    if (!raw) return this.w(raw, r => this.collectionId(name, r, parent));
    const run = raw;
    const c = run.all("SELECT id FROM collections WHERE name = ?", [name])[0]; if (c) return c.id;
    const id = ulid(); run.run("INSERT INTO collections VALUES (?, ?, ?)", [id, name, parent]); return id;
  }
  addToCollection(id, name, raw, parent = null) {
    if (!raw) return this.w(raw, r => this.addToCollection(id, name, r, parent));
    const cid = this.collectionId(name, raw, parent);
    raw.run("INSERT OR IGNORE INTO item_collections VALUES (?, ?)", [id, cid]);
    return cid;
  }
  tx(fn) { return this.h.tx(fn); }

  /** Delete an item and everything attached to it (callers must have asked for confirm: true). */
  remove(id, raw) {
    if (!raw) return this.w(raw, r => this.remove(id, r));
    const run = raw;
    for (const t of ["verification", "item_collections", "tags", "notes", "files", "screening", "items_fts"]) run.run(`DELETE FROM ${t} WHERE item_id = ?`, [id]);
    run.run("DELETE FROM items WHERE id = ?", [id]);
  }

  /** CSL-JSON backup of the whole library: $QUARTILE_HOME/library/library.json. Tags and collections go in `custom`. */
  backup(file = path.join(libraryDir(), "library.json")) {
    const items = this.all().map(it => ({ ...it.csl, custom: { ...(it.csl.custom || {}), quartile_library: { id: it.id, tags: it.tags, collections: it.collections, quartile: it.quartile, quartile_year: it.quartile_year, added_at: it.added_at } } }));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(items, null, 2));
    return { file, items: items.length };
  }
  close() { this.h.close(); }
}

export function autoTags(kind, quartile) {
  const t = [];
  if (/^Q[1-4]$/.test(quartile || "")) t.push(quartile);
  if (kind === "preprint") t.push("preprint");
  if (kind === "paper-conference") t.push("conference");
  return t;
}

export default { openLibrary, Library, SYSTEM_TAGS, isSystemTag, autoTags, libraryDir };
