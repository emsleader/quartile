// Requests found in letters (specification 21.2). The request status may change; the letter event never does.
import { db } from "./store.js";
import { listEvents } from "./events.js";
import { CATEGORIES, proposeLesson } from "./learn.js";
import { parseRule } from "./lessons.js";

export const REQUEST_STATUSES = ["open", "addressed", "partly", "declined"];
const LETTER_TYPES = ["decision", "review_received", "desk_decision"];

export async function listRequests({ paper_id, status, event_id, journal, category } = {}) {
  const h = await db();
  const w = [], p = [];
  if (paper_id) { w.push("paper_id = ?"); p.push(paper_id); }
  if (status) { w.push("status = ?"); p.push(status); }
  if (event_id) { w.push("event_id = ?"); p.push(event_id); }
  if (journal) { w.push("journal = ?"); p.push(journal); }
  if (category) { w.push("category = ?"); p.push(category); }
  return h.all(`SELECT * FROM requests ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY event_id, rowid`, p);
}

/**
 * Update one request. addressed and partly need a location in the revised version; declined needs the reason
 * (response). A changed category also refreshes the request's lesson while that lesson is still proposed.
 */
export async function updateRequest(id, { status, response, location, category } = {}) {
  const h = await db();
  const q = h.get("SELECT * FROM requests WHERE id = ?", [id]);
  if (!q) throw new Error(`no request with id ${id}`);
  const next = { status: status ?? q.status, response: response ?? q.response, location: location ?? q.location, category: category ?? q.category };
  if (!REQUEST_STATUSES.includes(next.status)) throw new Error(`status must be one of ${REQUEST_STATUSES.join(", ")}`);
  if (!CATEGORIES.includes(next.category)) throw new Error(`category must be one of ${CATEGORIES.join(", ")}`);
  if (["addressed", "partly"].includes(next.status) && !String(next.location || "").trim()) throw new Error(`status ${next.status} needs the location of the change (section and paragraph in the revised version)`);
  if (next.status === "declined" && !String(next.response || "").trim()) throw new Error("status declined needs the reason, in response");
  h.tx(r => {
    r.run("UPDATE requests SET status = ?, response = ?, location = ?, category = ? WHERE id = ?", [next.status, next.response, next.location, next.category, id]);
    if (next.category !== q.category && q.journal) {
      for (const l of h.all("SELECT id, rule_yaml FROM lessons WHERE from_request = ? AND status = 'proposed' AND scope LIKE 'journal:%'", [id])) {
        const p = proposeLesson({ ...q, category: next.category }, q.journal);
        let ruleId = parseRule(p.rule_yaml).id;
        const others = new Set(h.all("SELECT id, rule_yaml FROM lessons WHERE id != ?", [l.id]).map(x => { try { return parseRule(x.rule_yaml).id; } catch { return null; } }));
        const want = ruleId; for (let k = 2; others.has(ruleId); k++) ruleId = `${want}-${k}`;
        r.run("UPDATE lessons SET rule_yaml = ? WHERE id = ?", [proposeLesson({ ...q, category: next.category, rule_id: ruleId }, q.journal).rule_yaml, l.id]);
      }
    }
  });
  return h.get("SELECT * FROM requests WHERE id = ?", [id]);
}

/** Revision round of each letter: 1 + the number of revision_submitted events before it (date order). */
export async function rounds(paper_id) {
  const ev = await listEvents(paper_id, { include_corrections: false, include_voided: false });
  const out = new Map(); let sub = 0;
  for (const e of ev) { if (e.type === "revision_submitted") sub++; else if (LETTER_TYPES.includes(e.type)) out.set(e.id, sub + 1); }
  return out;
}

/**
 * For submission_readiness and response_tracker. revision: a round number (1 = requests to answer in the first
 * revision), 'latest', or a letter event id; omitted = every round. ready is false while any request is open.
 */
export async function openRequests({ paper_id, revision = null } = {}) {
  if (!paper_id) throw new Error("paper_id is required");
  const all = await listRequests({ paper_id });
  const rnd = await rounds(paper_id);
  let pick = all.filter(q => rnd.has(q.event_id));          // letters voided by a correction drop out
  let round = null;
  if (revision != null && revision !== "") {
    if (revision === "latest") { round = Math.max(0, ...pick.map(q => rnd.get(q.event_id))); pick = pick.filter(q => rnd.get(q.event_id) === round); }
    else if (/^\d+$/.test(String(revision))) { round = Number(revision); pick = pick.filter(q => rnd.get(q.event_id) === round); }
    else { pick = pick.filter(q => q.event_id === revision); round = rnd.get(revision) ?? null; }
  }
  const withRound = q => ({ ...q, revision: rnd.get(q.event_id) });
  const open = pick.filter(q => q.status === "open").map(withRound);
  const counts = Object.fromEntries(REQUEST_STATUSES.map(s => [s, pick.filter(q => q.status === s).length]));
  return { paper_id, revision: round ?? (revision || "all"), total: pick.length, counts, open, partly: pick.filter(q => q.status === "partly").map(withRound), ready: open.length === 0,
    message: open.length ? `${open.length} request(s) still open: ${open.map(q => q.number).join(", ")}.` : "No request is open." };
}

export default { listRequests, updateRequest, openRequests, rounds, REQUEST_STATUSES };
