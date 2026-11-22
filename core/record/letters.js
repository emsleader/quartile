// record_letter (specification 21.5): store the letter as a decision / review event, split it into numbered
// requests, propose a category for each and a lesson in rulebook format (scope: this journal).
import { db, newId } from "./store.js";
import { addEvent, listEvents } from "./events.js";
import { splitLetter } from "./split.js";
import { proposeCategory } from "./learn.js";
import { insertProposal, proposeRepeated, getLesson } from "./lessons.js";

export const LETTER_TYPES = ["decision", "review_received", "desk_decision"];

export async function recordLetter({ paper_id, type = "decision", occurred_at, journal, actor, summary, body, path: file, data, files = [] }) {
  const h = await db();
  if (!LETTER_TYPES.includes(type)) throw new Error(`a letter is stored as one of: ${LETTER_TYPES.join(", ")}`);
  let text = body;
  const attach = [...files];
  if (file) {
    const { parseFile } = await import("../text/parse.js");
    if (!text) text = (await parseFile(file)).text;
    attach.unshift({ path: file, kind: "letter" });
  }
  if (!String(text || "").trim()) throw new Error("give the letter text (body) or a path to the letter file");
  if (!journal) {                                            // fall back to the journal of the latest journal event
    const ev = (await listEvents(paper_id, { include_corrections: false, include_voided: false }).catch(() => [])).filter(e => e.journal);
    journal = ev.length ? ev[ev.length - 1].journal : null;
  }
  const split = splitLetter(text, { actor: actor || "editor" });
  const reqs = split.map(s => ({ id: newId(), ...s, category: proposeCategory(s.text)[0], candidates: proposeCategory(s.text) }));
  const lessonIds = [];
  const event = await addEvent({
    paper_id, type, occurred_at, journal, actor: actor || "editor", body: String(text), data, files: attach,
    summary: summary || `${type === "review_received" ? "Reviews" : "Editor letter"} received (${reqs.length} requests)`,
    _also: (r, eventId) => {
      for (const q of reqs) {
        r.run("INSERT INTO requests (id, event_id, paper_id, journal, actor, number, text, category, status) VALUES (?,?,?,?,?,?,?,?, 'open')",
          [q.id, eventId, paper_id, journal || null, q.actor, q.number, q.text, q.category]);
        if (journal) lessonIds.push(insertProposal(h, r, { ...q, event_id: eventId }, journal));
      }
    },
  });
  const repeated = await proposeRepeated();
  const lessons = [];
  for (const id of lessonIds) lessons.push(await getLesson(id));
  return {
    event,
    requests: reqs.map(q => ({ id: q.id, number: q.number, actor: q.actor, category: q.category, candidates: q.candidates, text: q.text })),
    lessons: lessons.map(l => ({ id: l.id, rule_id: l.rule_id, scope: l.scope, status: l.status, from_request: l.from_request })),
    repeated_lessons: repeated.map(l => ({ id: l.id, rule_id: l.rule_id, scope: l.scope, status: l.status, note: l.note })),
    notes: [
      "Categories and lessons are proposals. Confirm categories with record_requests and approve or reject lessons with record_lessons.",
      ...(journal ? [] : ["No journal given or found in earlier events: no journal lessons were proposed."]),
    ],
  };
}

export default { recordLetter, LETTER_TYPES };
