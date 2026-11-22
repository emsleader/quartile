// Outcome statistics (specification 21.5 point 3): descriptive counts and dates from the owner's own history.
// Never a prediction or a probability.
import { db, daysBetween, normJournal } from "./store.js";
import { listEvents } from "./events.js";
import { rounds } from "./requests.js";

export const LABEL = "Descriptive counts and dates from your own record only. Not a prediction of any outcome.";

const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function outcomeStats({ paper_id = null } = {}) {
  const h = await db();
  const papers = h.all("SELECT id, title FROM papers ORDER BY id").filter(p => !paper_id || p.id === paper_id);
  const sub = [], decisions = {}, liveLetters = new Set();
  for (const p of papers) {
    const ev = await listEvents(p.id, { include_corrections: false, include_voided: false });
    for (const id of (await rounds(p.id)).keys()) liveLetters.add(id);
    ev.forEach((e, i) => {
      if (["decision", "desk_decision"].includes(e.type)) {
        const j = e.journal || "(no journal)"; decisions[j] ||= {};
        const k = e.type === "decision" ? e.data?.decision || "decision" : `desk: ${e.data?.decision || "decision"}`;
        decisions[j][k] = (decisions[j][k] || 0) + 1;
      }
      if (e.type !== "submitted") return;
      const nj = normJournal(e.journal);
      let first = null;
      for (const f of ev.slice(i + 1)) {
        if (f.type === "submitted" && normJournal(f.journal) !== nj) break;
        if (["decision", "desk_decision"].includes(f.type) && (!f.journal || !nj || normJournal(f.journal) === nj)) { first = f; break; }
      }
      sub.push({ paper_id: p.id, journal: e.journal || "(no journal)", submitted: e.occurred_at, first_decision: first?.occurred_at || null,
        decision: first ? (first.data?.decision || first.type) : null, days: first ? daysBetween(e.occurred_at, first.occurred_at) : null });
    });
  }
  const per = {};
  for (const s of sub) { const r = (per[s.journal] ||= { journal: s.journal, submissions: 0, with_first_decision: 0, days: [] }); r.submissions++; if (s.days != null) { r.with_first_decision++; r.days.push(s.days); } }
  const time_to_first_decision = Object.values(per).map(r => ({ journal: r.journal, submissions: r.submissions, with_first_decision: r.with_first_decision,
    days_min: r.days.length ? Math.min(...r.days) : null, days_median: median(r.days), days_max: r.days.length ? Math.max(...r.days) : null }));
  const reqs = h.all("SELECT * FROM requests ORDER BY rowid").filter(q => liveLetters.has(q.event_id) && (!paper_id || q.paper_id === paper_id));
  const cat = {};
  for (const q of reqs) { const c = (cat[q.category || "other"] ||= { category: q.category || "other", requests: 0, journals: new Set() }); c.requests++; if (q.journal) c.journals.add(normJournal(q.journal)); }
  const frequent_categories = Object.values(cat).map(c => ({ category: c.category, requests: c.requests, journals: c.journals.size })).sort((a, b) => b.requests - a.requests || a.category.localeCompare(b.category));
  const open = reqs.filter(q => q.status === "open");
  const open_requests = papers.map(p => ({ paper_id: p.id, open: open.filter(q => q.paper_id === p.id).length, numbers: open.filter(q => q.paper_id === p.id).map(q => q.number) })).filter(x => x.open);
  return { label: LABEL, papers: papers.length, submissions: sub, time_to_first_decision, decisions_by_journal: decisions, frequent_categories,
    open_requests, open_requests_total: open.length, requests_total: reqs.length };
}

export default { outcomeStats, LABEL };
