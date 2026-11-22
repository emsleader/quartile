// Paper records (specification 21.2). Status is derived from the latest status event, never typed in.
import { db, nowIso } from "./store.js";
import { deriveStatus } from "./events.js";

export const PAPER_TYPES = ["empirical", "slr", "conceptual", "conference"];

/** Find a Library collection by id or name, if the Library tables exist (built in their own phase). */
async function findCollection(h, ref) {
  if (!h.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collections'")) return { linked: false, reason: "the Library has no collections table yet; the link is stored and can be checked later" };
  const c = h.get("SELECT id, name FROM collections WHERE id = ? OR name = ?", [ref, ref]);
  return c ? { linked: true, id: c.id, name: c.name } : { linked: false, reason: `no Library collection with id or name '${ref}'; the link is stored as given` };
}

export async function createPaper({ id, title, short_name, type, design, collection }) {
  const h = await db();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(id || ""))) throw new Error("id: letters, digits, '.', '_' or '-' (for example FER-HU-WBES)");
  if (!String(title || "").trim()) throw new Error("title is required");
  if (type && !PAPER_TYPES.includes(type)) throw new Error(`type must be one of ${PAPER_TYPES.join(", ")}`);
  if (h.get("SELECT id FROM papers WHERE id = ?", [id])) throw new Error(`a paper with id ${id} already exists`);
  let link = null, coll = collection || null;
  if (coll) { link = await findCollection(h, coll); if (link.linked) coll = link.id; }
  h.run("INSERT INTO papers (id, title, short_name, type, design, collection, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [id, String(title).trim(), short_name || null, type || null, design || null, coll, null, nowIso()]);
  return { paper: await getPaper(id), collection_link: link };
}

/** Link (or re-link) a paper to a Library collection. Paper rows are not events, so this may change. */
export async function linkCollection(id, collection) {
  const h = await db();
  if (!h.get("SELECT id FROM papers WHERE id = ?", [id])) throw new Error(`no paper with id ${id}`);
  const link = await findCollection(h, collection);
  h.run("UPDATE papers SET collection = ? WHERE id = ?", [link.linked ? link.id : collection, id]);
  return { paper: await getPaper(id), collection_link: link };
}

export async function getPaper(id) {
  const h = await db();
  const p = h.get("SELECT * FROM papers WHERE id = ?", [id]);
  if (!p) return null;
  p.status = await deriveStatus(id);
  const c = h.get("SELECT COUNT(*) AS n FROM events WHERE paper_id = ?", [id]);
  const r = h.get("SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM requests WHERE paper_id = ?", [id]);
  return { ...p, events: c.n, requests: r.n, open_requests: r.open || 0 };
}

export async function listPapers() {
  const h = await db();
  const out = [];
  for (const p of h.all("SELECT id FROM papers ORDER BY created_at, id")) out.push(await getPaper(p.id));
  return out;
}

export default { createPaper, linkCollection, getPaper, listPapers, PAPER_TYPES };
