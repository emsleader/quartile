// Phase 9: Quartile Record (specification Section 21). Fictional journals and letters only.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "qrec-"));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = await import("../../core/record/index.js");
const { db } = await import("../../core/record/store.js");
const { loadRules } = await import("../../core/rules/loader.js");
const { runRules } = await import("../../core/rules/engine.js");
const { parseText } = await import("../../core/text/parse.js");
const { TOOLS } = await import("../../tools/index.js");
const tool = n => TOOLS.find(t => t.name === n);

const J1 = "9999-0001", J2 = "9999-0002", J3 = "9999-0003";   // invalid ISSN check digits: clearly fictional

// 1. Paper and an out-of-order synthetic history, replayed in date order
await R.createPaper({ id: "TEST-WIDGET", title: "A Fictional Study of Widget Firms", short_name: "Widget paper", type: "empirical", design: "regression" });
await assert.rejects(R.createPaper({ id: "TEST-WIDGET", title: "again" }), /already exists/);
const tmpFile = path.join(process.env.QUARTILE_HOME, "draft-v1.txt");
fs.writeFileSync(tmpFile, "Fictional draft version 1.");
const ev = {};
ev.sub = await R.addEvent({ paper_id: "TEST-WIDGET", type: "submitted", occurred_at: "2026-01-10", journal: J1, actor: "self", summary: "Submitted to the fictional journal", files: [{ path: tmpFile, kind: "manuscript" }] });
ev.idea = await R.addEvent({ paper_id: "TEST-WIDGET", type: "idea", occurred_at: "2025-09-01", actor: "self", summary: "Idea noted", body: "Own note: widget firms and credit." });
ev.draft = await R.addEvent({ paper_id: "TEST-WIDGET", type: "draft_version", occurred_at: "2025-11-15", actor: "self", summary: "First full draft" });
ev.ur = await R.addEvent({ paper_id: "TEST-WIDGET", type: "under_review", occurred_at: "2026-01-20", journal: J1, summary: "Sent to reviewers" });
await assert.rejects(R.addEvent({ paper_id: "TEST-WIDGET", type: "decision", occurred_at: "2026-03-01", summary: "x" }), /data.decision/);
await assert.rejects(R.addEvent({ paper_id: "TEST-WIDGET", type: "nonsense", occurred_at: "2026-03-01", summary: "x" }), /type must be/);
await assert.rejects(R.addEvent({ paper_id: "TEST-WIDGET", type: "note", occurred_at: "2026-02-30", summary: "x" }), /not a valid date/);
await assert.rejects(R.addEvent({ paper_id: "NOPE", type: "note", occurred_at: "2026-02-01", summary: "x" }), /no paper/);

// file stored with SHA-256, read-only copy
const f0 = ev.sub.files[0];
assert.equal(f0.sha256, crypto.createHash("sha256").update("Fictional draft version 1.").digest("hex"));
assert.ok(fs.existsSync(path.join(R.recordDir(), f0.path)) && f0.path.startsWith(`files/${ev.sub.id}/`));

// 2. Letters: split, categories, lessons
const L = n => fs.readFileSync(path.join(HERE, "phase9-letters", n), "utf8");
const res = await R.recordLetter({ paper_id: "TEST-WIDGET", type: "decision", occurred_at: "2026-03-05", journal: J1, data: { decision: "major" }, body: L("L1-numbered.txt") });
assert.equal(res.requests.length, 9);
assert.deepEqual(res.requests.map(q => q.number), ["E1", "E2", "E3", "R1.1", "R1.2", "R1.3", "R2.1", "R2.2", "R2.3"]);
assert.equal(res.requests.find(q => q.number === "R1.1").category, "formal_model_equations");
assert.equal(res.requests.find(q => q.number === "R2.2").category, "policy_implications");
assert.equal(res.lessons.length, 9);
assert.ok(res.lessons.every(l => l.status === "proposed" && l.scope === `journal:${J1}`));
assert.equal(res.event.body, L("L1-numbered.txt"), "the letter is stored verbatim");
assert.equal((await R.getPaper("TEST-WIDGET")).status, "major revision");

// 3. Append-only: UPDATE and DELETE on events and event_files raise
const h = await db();
assert.throws(() => h.run("UPDATE events SET summary = 'changed' WHERE id = ?", [ev.sub.id]), /append-only/);
assert.throws(() => h.run("DELETE FROM events WHERE id = ?", [ev.sub.id]), /append-only/);
assert.throws(() => h.run("UPDATE event_files SET sha256 = 'x' WHERE event_id = ?", [ev.sub.id]), /append-only/);
assert.throws(() => h.run("DELETE FROM event_files WHERE event_id = ?", [ev.sub.id]), /append-only/);
assert.equal(h.get("SELECT summary FROM events WHERE id = ?", [ev.sub.id]).summary, "Submitted to the fictional journal");

// 4. Corrections are new events; the stored row never changes
await assert.rejects(R.addEvent({ paper_id: "TEST-WIDGET", type: "correction", summary: "fix", data: { set: { summary: "x" } } }), /corrects/);
await assert.rejects(R.addEvent({ paper_id: "TEST-WIDGET", type: "note", occurred_at: "2026-01-01", summary: "x", corrects: ev.ur.id }), /only a correction/);
const corr = await R.addEvent({ paper_id: "TEST-WIDGET", type: "correction", occurred_at: "2026-03-06", corrects: ev.ur.id, summary: "Date of review start was wrong", data: { set: { occurred_at: "2026-01-25" } } });
const listed = await R.listEvents("TEST-WIDGET");
const urNow = listed.find(e => e.id === ev.ur.id);
assert.equal(urNow.occurred_at, "2026-01-25"); assert.equal(urNow.original.occurred_at, "2026-01-20"); assert.deepEqual(urNow.corrected_by, [corr.id]);
assert.equal(h.get("SELECT occurred_at FROM events WHERE id = ?", [ev.ur.id]).occurred_at, "2026-01-20");

// 5. Revision, second decision, replay in date order
await R.addEvent({ paper_id: "TEST-WIDGET", type: "revision_submitted", occurred_at: "2026-05-01", journal: J1, actor: "self", summary: "Revision 1 submitted" });
const res2 = await R.recordLetter({ paper_id: "TEST-WIDGET", type: "decision", occurred_at: "2026-06-01", data: { decision: "minor" }, body: L("L6-mixed.txt") });
assert.equal(res2.event.journal, J1, "journal taken from the latest journal event");
const steps = await R.replay("TEST-WIDGET");
const dates = steps.map(s => s.occurred_at);
assert.deepEqual(dates, [...dates].sort());
assert.deepEqual(steps.map(s => s.type), ["idea", "draft_version", "submitted", "under_review", "decision", "revision_submitted", "decision"]);
assert.deepEqual(steps.map(s => s.status), ["idea", "drafting", "submitted", "under review", "major revision", "revision submitted", "minor revision"]);
const fresh = (await R.listEvents("TEST-WIDGET")).filter(e => e.type !== "correction");
assert.deepEqual(fresh.map(e => e.id), steps.map(s => s.id), "list and replay agree");

// 6. Requests: status changes with location / reason; openRequests per revision round
const r1 = await R.openRequests({ paper_id: "TEST-WIDGET", revision: 1 });
assert.equal(r1.total, 9); assert.equal(r1.ready, false);
const q1 = r1.open[0];
await assert.rejects(R.updateRequest(q1.id, { status: "addressed" }), /location/);
await assert.rejects(R.updateRequest(q1.id, { status: "declined" }), /reason/);
for (const q of r1.open) await R.updateRequest(q.id, { status: "addressed", location: "Section 2, paragraph 3", response: "Done." });
assert.equal((await R.openRequests({ paper_id: "TEST-WIDGET", revision: 1 })).ready, true);
const r2 = await R.openRequests({ paper_id: "TEST-WIDGET", revision: "latest" });
assert.equal(r2.revision, 2); assert.equal(r2.total, 7); assert.equal(r2.ready, false);
const all = await R.openRequests({ paper_id: "TEST-WIDGET" });
assert.equal(all.open.length, 7);

// 7. Lessons: owner only; approved lessons become rules for the next committee review for the same journal
const formal = (await R.listLessons({ paper_id: "TEST-WIDGET" })).find(l => l.rule_id === `${J1}-formal_model_equations-R1.1`);
assert.ok(formal);
await assert.rejects(R.decideLesson(formal.id, "approve", {}), /owner_confirm/);
await assert.rejects(R.decideLesson(formal.id, "retire", { owner_confirm: true }), /cannot retire/);
await assert.rejects(R.decideLesson(formal.id, "edit", { owner_confirm: true, rule_yaml: formal.rule_yaml.replace("check: manual", "check: pattern\n  pattern: 'x'") }), /manual/);
await R.decideLesson(formal.id, "approve", { owner_confirm: true, note: "Yes, keep this." });
const robust = (await R.listLessons({ paper_id: "TEST-WIDGET" })).find(l => l.rule_id === `${J1}-robustness-R1.2`);
await R.decideLesson(robust.id, "reject", { owner_confirm: true });
assert.ok(fs.existsSync(R.lessonsFile()));
let got = await R.getApprovedLessons({ journal: "99990001" });
assert.deepEqual(got.map(r => r.id), [`${J1}-formal_model_equations-R1.1`]);
assert.equal(got[0].check, "manual"); assert.equal(got[0].scope, `journal:${J1}`);
assert.equal((await R.getApprovedLessons({ journal: J2 })).length, 0, "not for another journal");
assert.deepEqual(R.readApprovedLessonsFile({ journal: J1 }).map(r => r.id), got.map(r => r.id), "file and database agree");
// the file is a valid rulebook; the engine turns the lesson into a checklist item for a new manuscript
const fromFile = loadRules(R.recordDir(), { useCache: false });
assert.equal(fromFile.length, 1);
const finding = runRules(parseText("# Introduction\n\nA new fictional manuscript for the same journal.\n"), got);
assert.equal(finding.length, 1); assert.equal(finding[0].status, "needs_human"); assert.equal(finding[0].rule, got[0].id);
// repository rulebook untouched
assert.ok(!fs.readdirSync(path.join(HERE, "..", "..", "rulebook")).some(f => /lesson/i.test(f)));
// every decision is also an owner event
assert.ok((await R.listEvents("TEST-WIDGET")).some(e => e.type === "user_decision" && e.data?.lesson_id === formal.id));
// retire removes it from the next review
await R.decideLesson(formal.id, "retire", { owner_confirm: true });
assert.equal((await R.getApprovedLessons({ journal: J1 })).length, 0);
await R.decideLesson((await R.listLessons({ status: "proposed", paper_id: "TEST-WIDGET" }))[0].id, "approve", { owner_confirm: true });
assert.equal((await R.getApprovedLessons({ journal: J1 })).length, 1);

// 8. Repeated lesson: the same category from a second journal proposes scope all
await R.createPaper({ id: "TEST-GADGET", title: "Pretend Loans and Gadget Firms", type: "empirical" });
await R.addEvent({ paper_id: "TEST-GADGET", type: "submitted", occurred_at: "2026-02-01", journal: J2, summary: "Submitted" });
const res3 = await R.recordLetter({ paper_id: "TEST-GADGET", type: "decision", occurred_at: "2026-02-15", journal: J2, data: { decision: "reject" }, body: L("L2-codes.txt") });
const rep = res3.repeated_lessons.map(l => l.rule_id);
assert.ok(rep.includes("ALL-external_validity") || rep.includes("ALL-literature_missing") || rep.length > 0, "repeated categories proposed");
const shared = (await R.listRequests({})).filter(q => q.category && q.category !== "other");
const multi = [...new Set(shared.map(q => q.category))].filter(c => new Set(shared.filter(q => q.category === c).map(q => q.journal)).size >= 2);
assert.deepEqual([...rep].sort(), multi.map(c => `ALL-${c}`).sort());
const allLesson = (await R.listLessons({ scope: "all" }))[0];
await R.decideLesson(allLesson.id, "approve", { owner_confirm: true });
assert.ok((await R.getApprovedLessons({ journal: J3 })).some(r => r.scope === "all"), "scope all applies to any journal");
assert.equal((await R.proposeRepeated()).length, 0, "proposed once per category");

// 9. Category change refreshes a proposed lesson
const q3 = (await R.listRequests({ paper_id: "TEST-GADGET" }))[0];
await R.updateRequest(q3.id, { category: "theory" });
assert.ok((await R.listLessons({ paper_id: "TEST-GADGET" })).some(l => l.from_request === q3.id && /-theory-/.test(l.rule_id)));
await assert.rejects(R.updateRequest(q3.id, { category: "nonsense" }), /category/);

// 10. Descriptive statistics
const st = await R.outcomeStats();
assert.match(st.label, /Not a prediction/);
const t1 = st.time_to_first_decision.find(x => x.journal === J1);
assert.equal(t1.days_median, 54);      // 2026-01-10 -> 2026-03-05
assert.equal(st.time_to_first_decision.find(x => x.journal === J2).days_median, 14);
assert.deepEqual(st.decisions_by_journal[J1], { major: 1, minor: 1 });
assert.equal(st.open_requests_total, 7 + 7);
assert.ok(!JSON.stringify(st).match(/probabilit|likely|predict(?!ion of any)/i));

// 11. Timeline: date order, own record only
const md = await R.timelineMarkdown("TEST-WIDGET");
const rowDates = md.rows.map(r => r.date);
assert.deepEqual(rowDates, [...rowDates].sort());
assert.ok(md.markdown.includes("Own note: widget firms and credit."), "own note exported");
assert.ok(!md.markdown.includes("contribution relative to existing work"), "editor letter text not exported");
const docx = await R.timelineDocx("TEST-WIDGET");
assert.ok(fs.statSync(docx).size > 1000 && fs.readFileSync(docx).subarray(0, 2).toString() === "PK");

// 12. Voiding a letter removes its requests from open lists and statistics
await R.addEvent({ paper_id: "TEST-GADGET", type: "correction", corrects: res3.event.id, summary: "Letter entered for the wrong paper", data: { void: true } });
assert.equal((await R.openRequests({ paper_id: "TEST-GADGET" })).total, 0);

// 13. Tools
assert.equal(TOOLS.filter(t => t.name.startsWith("record_")).length, 7);
const tp = await tool("record_paper").handler({ action: "create", id: "TEST-TOOL", title: "Tool test paper" });
assert.equal(tp.paper.id, "TEST-TOOL");
await tool("record_event").handler({ paper_id: "TEST-TOOL", type: "submitted", occurred_at: "2026-04-01", journal: J3, summary: "Submitted" });
const tl = await tool("record_letter").handler({ paper_id: "TEST-TOOL", type: "review_received", occurred_at: "2026-04-20", actor: "editor", body: L("L3-comment.txt") });
assert.equal(tl.requests.length, 5);
assert.equal((await tool("record_requests").handler({ action: "open", paper_id: "TEST-TOOL", revision: "1" })).open.length, 5);
await assert.rejects(tool("record_lessons").handler({ action: "approve", lesson_id: tl.lessons[0].id }), /owner_confirm/);
assert.ok((await tool("record_timeline").handler({ paper_id: "TEST-TOOL", format: "md" })).markdown.includes("review_received"));
assert.ok((await tool("record_stats").handler({})).label);
assert.equal((await tool("record_event").handler({ action: "replay", paper_id: "TEST-TOOL" })).steps.length, 2);

// 14. Splitter capture rate on fictional letters (development set and held-out set)
function score(dir) {
  const truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
  let n = 0, captured = 0, numbered = 0, found = 0, extra = 0;
  for (const [f, exp] of Object.entries(truth)) {
    const got = R.splitLetter(fs.readFileSync(path.join(dir, f), "utf8"));
    const used = new Set();
    for (const e of exp) {
      n++;
      const m = got.filter(g => g.text.toLowerCase().includes(e.key.toLowerCase()));
      if (m.length === 1 && !used.has(m[0].number)) { captured++; used.add(m[0].number); if (m[0].number === e.number) numbered++; }
    }
    found += got.length; extra += got.filter(g => !used.has(g.number)).length;
  }
  return { letters: Object.keys(truth).length, n, captured, rate: captured / n, numbered, found, extra };
}
const dev = score(path.join(HERE, "phase9-letters"));
const held = score(path.join(HERE, "phase9-letters", "heldout"));
assert.ok(dev.rate >= 0.9, `capture rate on development letters ${dev.rate}`);
assert.ok(held.rate >= 0.9, `capture rate on held-out letters ${held.rate}`);
console.log(`phase 9 splitter: development ${dev.captured}/${dev.n} captured (${dev.letters} letters, ${dev.numbered} numbered as annotated, ${dev.extra} extra); held-out ${held.captured}/${held.n} (${held.letters} letters, ${held.numbered} numbered as annotated, ${held.extra} extra)`);

(await db()).close();
console.log("phase 9 record: all checks passed");
