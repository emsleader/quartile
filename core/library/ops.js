// Library operations used by the tools: add by DOI (LIB-01), import (LIB-02), verification log (LIB-05),
// search (LIB-11) and PDF attach (LIB-12).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ulid } from "ulid";
import { libraryDir } from "./store.js";
import { parseAny } from "./importers.js";
import { fetchDoi, quartileFor, crossrefStatus } from "./remote.js";
import { suggestFor } from "./dedupe.js";
import { normDoi, now, today } from "./normalize.js";

// ---------- LIB-01 ----------
export async function addByDoi(lib, doi, { collection, tags = [], fetchJson, bankYear } = {}) {
  const d = normDoi(doi); if (!d) return { status: "error", error: "Not a DOI: " + doi };
  const ex = lib.byDoi(d);
  if (ex) return { status: "duplicate", reason: "same_doi", duplicate_of: ex.id, doi: d };
  const r = await fetchDoi(d, { fetchJson });
  if (r.error) return { status: "error", error: r.error };
  const q = quartileFor(r.csl, { bankYear });
  const res = lib.add(r.csl, { collection, tags, quartile: q });
  if (res.status !== "added") return res;
  const out = { ...res, source: r.source, quartile: q.quartile, quartile_year: q.year, title: r.csl.title };
  if (r.crossref) {
    const st = await crossrefStatus(d, { fetchJson, record: r.crossref });
    out.verification = recordVerification(lib, res.id, { source: "crossref", status: st.status, note: st.note });
  }
  return out;
}

// ---------- LIB-02 ----------
/** Import text in any supported format. Same DOI: skipped as duplicate. Similar records: added and listed as suggested merges. */
export async function importText(lib, text, { format, filename, collection, tags = [], dryRun = false, bankYear } = {}) {
  const parsed = await parseAny(text, { format, filename });
  const existing = lib.all();
  const report = { format: parsed.format, read: parsed.items.length, added: 0, duplicates: [], suggested_merges: [], warnings: parsed.warnings || [], ids: [] };
  const colOf = new Map(); for (const c of parsed.collections || []) for (const i of c.members) { if (!colOf.has(i)) colOf.set(i, []); colOf.get(i).push(c); }
  if (dryRun) {
    parsed.items.forEach((c, i) => { const d = normDoi(c.DOI); const dup = d && existing.find(e => normDoi(e.csl.DOI) === d); if (dup) report.duplicates.push({ index: i, duplicate_of: dup.id, doi: d }); });
    return { ...report, dry_run: true, collections: (parsed.collections || []).map(c => ({ name: c.name, parent: c.parent, items: c.members.length })) };
  }
  lib.tx(raw => {
    for (const c of parsed.collections || []) if (c.parent) lib.collectionId(c.parent, raw);
    parsed.items.forEach((csl, i) => {
      const ql = csl.custom?.quartile_library;
      const q = ql?.quartile ? { quartile: ql.quartile, year: ql.quartile_year } : quartileFor(csl, { bankYear });
      const sugg = suggestFor(csl, existing);
      const r = lib.insert(csl, { raw, collection, tags: [...tags, ...(ql?.tags || [])], quartile: q });
      if (r.status === "duplicate") { report.duplicates.push({ index: i, title: csl.title, duplicate_of: r.duplicate_of, doi: r.doi }); return; }
      report.added++; report.ids.push(r.id);
      for (const c of colOf.get(i) || []) { const pid = c.parent ? lib.collectionId(c.parent, raw) : null; lib.addToCollection(r.id, c.name, raw, pid); }
      for (const s of sugg) report.suggested_merges.push({ new_item: r.id, existing_item: s.id, reason: s.reason, similarity: s.similarity });
      existing.push({ id: r.id, csl: { ...csl, id: r.id } });
    });
  });
  return report;
}

// ---------- LIB-05 ----------
export const STATUSES = ["verified", "could_not_verify", "retracted", "corrected", "expression_of_concern"];
export const SOURCES = ["scite", "crossref", "openalex", "manual"];
/** Add one row to the verification log and update the system tags. History is never overwritten. */
export function recordVerification(lib, itemId, { source, status, note = null, checked_at } = {}) {
  if (!SOURCES.includes(source)) throw new Error("source must be one of " + SOURCES.join(", "));
  if (!STATUSES.includes(status)) throw new Error("status must be one of " + STATUSES.join(", "));
  if (!lib.row(itemId)) throw new Error("Item not found: " + itemId);
  const at = checked_at || now();
  lib.tx(raw => {
    raw.run("INSERT INTO verification (item_id, source, status, checked_at, note) VALUES (?,?,?,?,?)", [itemId, source, status, at, note]);
    if (status === "verified") lib.tag(itemId, "verified-" + at.slice(0, 10), raw);
    if (status === "retracted") lib.tag(itemId, "retracted", raw);
  });
  return { item_id: itemId, source, status, checked_at: at, note };
}
export const verificationLog = (lib, itemId) => lib.h.all("SELECT source, status, checked_at, note FROM verification WHERE item_id = ? ORDER BY checked_at, rowid", [itemId]);
export async function verifyCrossref(lib, itemId, { fetchJson } = {}) {
  const it = lib.get(itemId); if (!it) throw new Error("Item not found: " + itemId);
  if (!it.doi) return recordVerification(lib, itemId, { source: "crossref", status: "could_not_verify", note: "no DOI in the record" });
  const st = await crossrefStatus(it.doi, { fetchJson });
  return { ...recordVerification(lib, itemId, { source: "crossref", status: st.status, note: st.note }), notices: st.notices };
}

// ---------- LIB-11 ----------
/** Full-text search (FTS4) over title, authors, abstract and venue, with filters. */
export function search(lib, { query, collection, tag, quartile, type, year_from, year_to, limit = 50 } = {}) {
  const where = [], params = [];
  if (query && query.trim()) {
    const terms = (query.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || []).map(t => t.toLowerCase() + "*").join(" ");
    if (terms) { where.push("i.id IN (SELECT item_id FROM items_fts WHERE items_fts MATCH ?)"); params.push(terms); }
  }
  if (collection) { where.push("i.id IN (SELECT ic.item_id FROM item_collections ic JOIN collections c ON c.id = ic.collection_id WHERE c.name = ?)"); params.push(collection); }
  if (tag) { where.push("i.id IN (SELECT item_id FROM tags WHERE tag = ?)"); params.push(tag); }
  if (quartile) { where.push("i.quartile = ?"); params.push(quartile); }
  if (type) { where.push("i.type = ?"); params.push(type); }
  if (year_from != null) { where.push("i.year >= ?"); params.push(year_from); }
  if (year_to != null) { where.push("i.year <= ?"); params.push(year_to); }
  const rows = lib.h.all(`SELECT i.* FROM items i ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY i.year DESC, i.title_norm LIMIT ?`, [...params, Math.min(Number(limit) || 50, 1000)]);
  return rows.map(r => lib.hydrate(r)).map(it => ({ id: it.id, title: it.csl.title, authors: (it.csl.author || []).map(p => p.family || p.literal).join("; "), year: it.year, type: it.type, venue: it.venue, doi: it.doi, quartile: it.quartile, tags: it.tags, collections: it.collections }));
}

// ---------- LIB-12 ----------
export const FILE_KINDS = ["vor", "aam", "preprint", "supplement"];
/** Copy a local PDF into $QUARTILE_HOME/library/files/<item-id>/ and store its SHA-256. The source is only read. */
export function attachFile(lib, itemId, file, kind = "vor") {
  if (!FILE_KINDS.includes(kind)) throw new Error("kind must be one of " + FILE_KINDS.join(", ") + " (vor = version of record, aam = accepted manuscript)");
  if (!lib.row(itemId)) throw new Error("Item not found: " + itemId);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("File not found: " + file);
  const buf = fs.readFileSync(file);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const dup = lib.h.get("SELECT id, path FROM files WHERE item_id = ? AND sha256 = ?", [itemId, sha256]);
  if (dup) return { status: "already_attached", id: dup.id, path: dup.path, sha256 };
  const dir = path.join(libraryDir(), "files", itemId); fs.mkdirSync(dir, { recursive: true });
  let name = path.basename(file).replace(/[^\w.\-]+/g, "_"); if (fs.existsSync(path.join(dir, name))) name = sha256.slice(0, 8) + "-" + name;
  const dest = path.join(dir, name);
  fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL);
  const id = ulid();
  lib.h.run("INSERT INTO files (id, item_id, path, sha256, kind) VALUES (?,?,?,?,?)", [id, itemId, dest, sha256, kind]);
  return { status: "attached", id, path: dest, sha256, kind, warning: isPdf ? undefined : "The file does not start with a PDF header." };
}
export const filesOf = (lib, itemId) => lib.h.all("SELECT id, path, sha256, kind FROM files WHERE item_id = ?", [itemId]);
export { today };

export default { addByDoi, importText, recordVerification, verificationLog, verifyCrossref, search, attachFile, filesOf, STATUSES, SOURCES, FILE_KINDS };
