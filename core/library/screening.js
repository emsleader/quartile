// LIB-10: SLR screening. Decisions per item, review, stage (title_abstract | full_text) and reviewer.
// PRISMA 2020 counts are read from the table. Agreement statistics (Cohen's kappa) are NOT computed here:
// exportCsv() writes the table and scripts/screening-agreement.R computes them in base R (owner's rule).
import { now } from "./normalize.js";

export const STAGES = ["title_abstract", "full_text"];
export const DECISIONS = ["include", "exclude", "maybe"];
/** Reviewer name used for the final, agreed decision when reviewers disagree. */
export const CONSENSUS = "consensus";

export function recordDecision(lib, { item_id, review, stage, decision, reason = null, reviewer, decided_at }) {
  if (!review) throw new Error("review is required (for example SLR2)");
  if (!STAGES.includes(stage)) throw new Error("stage must be title_abstract or full_text");
  if (!DECISIONS.includes(decision)) throw new Error("decision must be include, exclude or maybe");
  if (!reviewer) throw new Error("reviewer is required");
  if (!lib.row(item_id)) throw new Error("Item not found: " + item_id);
  if (decision === "exclude" && !reason) throw new Error("An exclusion needs a primary reason.");
  const prev = lib.h.get("SELECT decision, reason FROM screening WHERE item_id = ? AND review = ? AND stage = ? AND reviewer = ?", [item_id, review, stage, reviewer]);
  lib.h.run("INSERT OR REPLACE INTO screening (item_id, review, stage, decision, reason, reviewer, decided_at) VALUES (?,?,?,?,?,?,?)", [item_id, review, stage, decision, reason, reviewer, decided_at || now()]);
  return { item_id, review, stage, decision, reason, reviewer, replaced: prev || null };
}

export function deleteDecision(lib, { item_id, review, stage, reviewer, confirm = false }) {
  const row = lib.h.get("SELECT * FROM screening WHERE item_id = ? AND review = ? AND stage = ? AND reviewer = ?", [item_id, review, stage, reviewer]);
  if (!row) return { status: "not_found" };
  if (!confirm) return { status: "preview", would_delete: row, note: "Nothing changed. Call again with confirm: true to delete." };
  lib.h.run("DELETE FROM screening WHERE item_id = ? AND review = ? AND stage = ? AND reviewer = ?", [item_id, review, stage, reviewer]);
  return { status: "deleted", deleted: row };
}

const rows = (lib, review) => lib.h.all("SELECT * FROM screening WHERE review = ? ORDER BY item_id, stage, reviewer", [review]);

/** Final decision per item and stage: consensus row if present; otherwise the shared decision; otherwise "conflict". */
export function finalDecisions(lib, review) {
  const by = new Map();
  for (const r of rows(lib, review)) { const k = r.item_id + "|" + r.stage; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const out = [];
  for (const [k, list] of by) {
    const [item_id, stage] = k.split("|");
    const cons = list.find(r => r.reviewer === CONSENSUS);
    const ds = [...new Set(list.map(r => r.decision))];
    const pick = cons || (ds.length === 1 ? list[0] : null);
    out.push({ item_id, stage, decision: pick ? pick.decision : "conflict", reason: pick ? (pick.reason || list.find(r => r.reason)?.reason || null) : null, reviewers: list.length });
  }
  return out;
}

/**
 * PRISMA 2020 flow counts from the screening table. identified: items in the collection named like the review
 * (if it exists) or items with any decision; duplicates_removed must be supplied (from library_dedupe).
 */
export function prismaCounts(lib, review, { identified, duplicates_removed = 0 } = {}) {
  const fin = finalDecisions(lib, review);
  const ta = fin.filter(f => f.stage === "title_abstract"), ft = fin.filter(f => f.stage === "full_text");
  const inColl = lib.idsIn(review).length;
  const ident = identified ?? (inColl || new Set(rows(lib, review).map(r => r.item_id)).size);
  const reasons = {};
  for (const f of ft.filter(f => f.decision === "exclude")) reasons[f.reason || "no reason given"] = (reasons[f.reason || "no reason given"] || 0) + 1;
  const count = (l, d) => l.filter(f => f.decision === d).length;
  return {
    review, records_identified: ident, duplicates_removed, records_screened: ta.length,
    records_excluded_title_abstract: count(ta, "exclude"), title_abstract_unresolved: count(ta, "conflict") + count(ta, "maybe"),
    reports_assessed_full_text: ft.length, reports_excluded_full_text: count(ft, "exclude"), full_text_exclusion_reasons: reasons,
    full_text_unresolved: count(ft, "conflict") + count(ft, "maybe"), studies_included: count(ft, "include"),
    check: ident - duplicates_removed >= ta.length ? "ok" : "more records screened than identified minus duplicates: check the counts",
    note: "Counts come from the screening table. Agreement statistics: export the CSV and run scripts/screening-agreement.R.",
  };
}

const csvCell = v => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** Long-format CSV: item_id, review, stage, reviewer, decision, reason, decided_at. */
export function exportCsv(lib, review, { stage } = {}) {
  const list = rows(lib, review).filter(r => !stage || r.stage === stage);
  const head = ["item_id", "review", "stage", "reviewer", "decision", "reason", "decided_at"];
  return [head.join(","), ...list.map(r => head.map(h => csvCell(r[h])).join(","))].join("\n") + "\n";
}

export default { recordDecision, deleteDecision, finalDecisions, prismaCounts, exportCsv, STAGES, DECISIONS, CONSENSUS };
