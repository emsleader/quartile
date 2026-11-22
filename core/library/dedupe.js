// LIB-03: duplicate detection. Same DOI = duplicate. Without a shared DOI, a pair is a SUGGESTED merge when
// (1) normalised title similarity >= 0.92, (2) years differ by at most 1, (3) same first-author surname, and
// (4) the titles do not differ in a number or Roman numeral (part 1 / part 2, volume I / II), and (5) every word found
// in only one title is close to a word of the other (a typo), not a different word.
// fuse.js finds candidate titles in large surname blocks (> 200 items; smaller blocks compare every pair); the 0.92 threshold is applied to a defined similarity (1 - Levenshtein distance /
// longer length) so the decision is reproducible. Merges are never automatic (see merge()).
import Fuse from "fuse.js";
import { similarity, normTitle } from "./normalize.js";
import { firstSurname, yearOf, normDoi } from "./normalize.js";

export const TITLE_THRESHOLD = 0.92;
const NUMERIC = /^(\d+|[ivxlcdm]+)$/;
const tokenSet = s => new Set(s.split(" ").filter(Boolean));
function numericClash(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  const diff = [...A].filter(x => !B.has(x)).concat([...B].filter(x => !A.has(x)));
  return diff.some(x => NUMERIC.test(x) && (x.length < 5 || /^\d+$/.test(x)));
}

// (5) every word that is in only one title must look like a typo of a word in the other (similarity >= 0.75):
// "evidence from Hungary" vs "evidence from Poland" is a different paper even when the long titles are close.
function wordClash(a, b) {
  const ta = a.split(" ").filter(Boolean), tb = b.split(" ").filter(Boolean);
  const A = new Set(ta), B = new Set(tb);
  const grams = t => [...t, ...t.slice(1).map((w, i) => t[i] + w)]; // words and joined neighbours (a lost space)
  const ga = grams(ta), gb = grams(tb);
  const near = (w, list) => list.some(v => similarity(w, v) >= 0.75);
  const bigramOf = (w, t) => t.slice(1).map((x, i) => [t[i], x]).filter(([p, q]) => p === w || q === w).map(([p, q]) => p + q);
  const ok = (w, mine, other, otherGrams) => w.length <= 3 || near(w, otherGrams) || bigramOf(w, mine).some(g => near(g, other));
  return [...A].some(w => !B.has(w) && !ok(w, ta, tb, gb)) || [...B].some(w => !A.has(w) && !ok(w, tb, ta, ga));
}

/** Decide one pair of records { csl } (or plain CSL). Returns null or { reason, similarity }. */
export function comparePair(a, b) {
  const ca = a.csl || a, cb = b.csl || b;
  const da = normDoi(ca.DOI), db = normDoi(cb.DOI);
  if (da && db) return da === db ? { reason: "same_doi", similarity: 1 } : null; // two different DOIs: different works
  const sa = firstSurname(ca), sb = firstSurname(cb);
  if (!sa || sa !== sb) return null;
  const ya = yearOf(ca), yb = yearOf(cb);
  if (ya == null || yb == null || Math.abs(ya - yb) > 1) return null;
  const ta = normTitle(ca.title), tb = normTitle(cb.title);
  if (!ta || !tb) return null;
  if (numericClash(ta, tb) || wordClash(ta, tb)) return null;
  const sim = similarity(ta, tb);
  return sim >= TITLE_THRESHOLD ? { reason: "similar_title", similarity: Math.round(sim * 1000) / 1000 } : null;
}

/** All suggested pairs in a list of items [{ id, csl }]. Blocking by first-author surname keeps it fast. */
export function findDuplicates(items) {
  const blocks = new Map(), pairs = [], seen = new Set();
  const push = (a, b, r) => { const k = [a.id, b.id].sort().join("|"); if (seen.has(k)) return; seen.add(k); pairs.push({ keep: a.id, other: b.id, ...r, titles: [a.csl.title, b.csl.title], years: [yearOf(a.csl), yearOf(b.csl)] }); };
  const byDoi = new Map();
  for (const it of items) { const d = normDoi(it.csl.DOI); if (d) { if (byDoi.has(d)) push(byDoi.get(d), it, { reason: "same_doi", similarity: 1 }); else byDoi.set(d, it); } }
  for (const it of items) { const s = firstSurname(it.csl); if (!s) continue; if (!blocks.has(s)) blocks.set(s, []); blocks.get(s).push(it); }
  for (const list of blocks.values()) {
    if (list.length < 2) continue;
    if (list.length <= 200) { // small block: compare every pair
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const r = comparePair(list[i], list[j]); if (r) { const [a, b] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]]; push(a, b, r); } }
      continue;
    }
    const fuse = new Fuse(list.map(it => ({ id: it.id, t: normTitle(it.csl.title) })), { keys: ["t"], includeScore: true, threshold: 0.4, ignoreLocation: true });
    const byId = new Map(list.map(it => [it.id, it]));
    for (const it of list) {
      const q = normTitle(it.csl.title); if (!q) continue;
      const cands = fuse.search(q.slice(0, 64)).map(r => byId.get(r.item.id)).filter(x => x && x.id !== it.id);
      for (const c of cands) { const r = comparePair(it, c); if (r) { const [a, b] = it.id < c.id ? [it, c] : [c, it]; push(a, b, r); } }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/** Candidates in the library for one new record (used on import to report suggested merges). */
export function suggestFor(csl, items) {
  return items.map(it => ({ it, r: comparePair({ csl }, it) })).filter(x => x.r).map(x => ({ id: x.it.id, ...x.r, title: x.it.csl.title }));
}

/**
 * Merge `other` into `keep`: fill empty CSL fields of keep from other, move tags, collections, files, notes,
 * verification and screening rows, then delete other. Only with confirm: true; otherwise a preview.
 */
export function merge(lib, keepId, otherId, { confirm = false } = {}) {
  const keep = lib.get(keepId), other = lib.get(otherId);
  if (!keep || !other) return { error: "Item not found: " + (!keep ? keepId : otherId) };
  if (keepId === otherId) return { error: "keep and remove are the same item." };
  const filled = Object.keys(other.csl).filter(k => k !== "id" && (keep.csl[k] == null || keep.csl[k] === ""));
  const plan = { keep: keepId, remove: otherId, fields_filled_from_removed: filled, tags_moved: other.tags.filter(t => !keep.tags.includes(t)), collections_moved: other.collections.filter(c => !keep.collections.includes(c)) };
  if (!confirm) return { status: "preview", would_do: plan, note: "Nothing changed. Call again with confirm: true to merge." };
  lib.tx(raw => {
    const csl = { ...keep.csl }; for (const k of filled) csl[k] = other.csl[k];
    if (csl.DOI && keep.doi == null && other.doi) raw.run("UPDATE items SET doi = NULL WHERE id = ?", [otherId]);
    for (const t of ["tags", "item_collections"]) raw.run(`UPDATE OR IGNORE ${t} SET item_id = ? WHERE item_id = ?`, [keepId, otherId]);
    for (const t of ["files", "notes", "verification", "screening"]) raw.run(`UPDATE OR IGNORE ${t} SET item_id = ? WHERE item_id = ?`, [keepId, otherId]);
    lib.remove(otherId, raw);
    lib.update(keepId, csl, raw);
  });
  return { status: "merged", done: plan };
}

export default { comparePair, findDuplicates, suggestFor, merge, TITLE_THRESHOLD };
