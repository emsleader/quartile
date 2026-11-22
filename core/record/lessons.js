// Lessons (specification 21.5): proposed -> approved | rejected; approved -> retired. Only the owner decides.
// Approved lessons are written to $QUARTILE_HOME/record/lessons.yaml in rulebook format (never into the
// repository rulebook). They stay check: manual until a developer writes an automatic test for them.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { checkFile } from "../rules/loader.js";
import { db, lessonsFile, newId, nowIso, normJournal } from "./store.js";
import { proposeLesson, proposeRepeatedLesson } from "./learn.js";
import { addEvent } from "./events.js";

export const LESSON_STATUSES = ["proposed", "approved", "rejected", "retired"];
export const SOURCE = { id: "QUARTILE-RECORD", citation: "Lessons approved by the owner from the owner's own editor and reviewer letters (Quartile Record, specification Section 21)." };
const SCOPE = /^(all|journal:\S+|design:\S+)$/;

/** Parse and check one lesson rule. Throws with a plain message when it is not a valid manual rule. */
export function parseRule(rule_yaml) {
  let obj;
  try { obj = YAML.parse(String(rule_yaml)); } catch (e) { throw new Error(`rule_yaml is not valid YAML: ${e.message}`); }
  const rule = Array.isArray(obj) ? obj[0] : obj;
  if (!rule || typeof rule !== "object" || (Array.isArray(obj) && obj.length !== 1)) throw new Error("rule_yaml must hold exactly one rule");
  if (rule.check !== "manual") throw new Error("a lesson stays check: manual; an automatic check needs a developer-written test with positive and negative examples (specification 21.5)");
  const problems = checkFile({ source: SOURCE, rules: [rule] }, "lesson");
  if (problems.length) throw new Error("rule_yaml does not fit the rulebook schema: " + problems.join("; "));
  return rule;
}

const ruleIdOf = y => { try { return parseRule(y).id; } catch { return null; } };

function uniqueRuleId(h, wanted, exceptLesson = null) {
  const taken = new Set(h.all("SELECT id, rule_yaml FROM lessons").filter(l => l.id !== exceptLesson).map(l => ruleIdOf(l.rule_yaml)));
  let id = wanted;
  for (let k = 2; taken.has(id); k++) id = `${wanted}-${k}`;
  return id;
}

/** Insert a proposed lesson for a stored request (raw handle inside a transaction, or the db handle). */
export function insertProposal(h, r, request, journal) {
  const base = proposeLesson({ ...request, rule_id: null }, journal);
  const wanted = parseRule(base.rule_yaml).id;
  const p = proposeLesson({ ...request, rule_id: uniqueRuleId(h, wanted) }, journal);
  const id = newId();
  r.run("INSERT INTO lessons (id, from_request, scope, rule_yaml, status) VALUES (?,?,?,?,?)", [id, request.id, p.scope, p.rule_yaml, "proposed"]);
  return id;
}

export async function getLesson(id) {
  const h = await db();
  const l = h.get("SELECT * FROM lessons WHERE id = ?", [id]);
  return l ? decorate(l) : null;
}
function decorate(l) { let rule = null, problem = null; try { rule = parseRule(l.rule_yaml); } catch (e) { problem = e.message; } return { ...l, rule_id: rule?.id || null, rule, problem }; }

export async function listLessons({ status, scope, paper_id } = {}) {
  const h = await db();
  let rows = h.all("SELECT l.*, q.paper_id AS paper_id, q.number AS request_number, q.category AS request_category FROM lessons l LEFT JOIN requests q ON q.id = l.from_request ORDER BY l.id");
  if (status) rows = rows.filter(l => l.status === status);
  if (scope) rows = rows.filter(l => l.scope === scope);
  if (paper_id) rows = rows.filter(l => l.paper_id === paper_id);
  return rows.map(decorate);
}

/**
 * Owner decision on a lesson. action: approve | reject | retire | edit. owner_confirm must be true: the tool
 * only acts on the owner's explicit instruction. Each decision is also stored as a user_decision event.
 */
export async function decideLesson(id, action, { owner_confirm, note, rule_yaml, scope } = {}) {
  if (owner_confirm !== true) throw new Error("lesson decisions are the owner's: repeat the call with owner_confirm: true only on the owner's explicit instruction");
  const h = await db();
  const l = h.get("SELECT * FROM lessons WHERE id = ?", [id]);
  if (!l) throw new Error(`no lesson with id ${id}`);
  const allowed = { approve: ["proposed"], reject: ["proposed"], retire: ["approved"], edit: ["proposed", "approved"] }[action];
  if (!allowed) throw new Error("action must be approve, reject, retire or edit");
  if (!allowed.includes(l.status)) throw new Error(`cannot ${action} a lesson that is ${l.status}`);
  let newYaml = l.rule_yaml, newScope = l.scope;
  if (action === "edit") {
    if (rule_yaml == null && scope == null) throw new Error("edit needs rule_yaml or scope");
    if (rule_yaml != null) {
      const rule = parseRule(rule_yaml);
      if (rule.id !== ruleIdOf(l.rule_yaml) && uniqueRuleId(h, rule.id, id) !== rule.id) throw new Error(`rule id ${rule.id} is already used by another lesson`);
      newYaml = String(rule_yaml);
    }
    if (scope != null) { if (!SCOPE.test(scope)) throw new Error("scope must be all, journal:<issn> or design:<design>"); newScope = scope; }
  } else parseRule(l.rule_yaml);
  const status = { approve: "approved", reject: "rejected", retire: "retired", edit: l.status }[action];
  const when = nowIso();
  h.run("UPDATE lessons SET status = ?, rule_yaml = ?, scope = ?, decided_at = ?, note = ? WHERE id = ?",
    [status, newYaml, newScope, action === "edit" ? l.decided_at : when, note ?? l.note, id]);
  if (l.status === "approved" || status === "approved") writeLessonsFile(await approvedRows());
  const req = l.from_request ? h.get("SELECT paper_id FROM requests WHERE id = ?", [l.from_request]) : null;
  if (req) {
    const rid = ruleIdOf(newYaml);
    await addEvent({ paper_id: req.paper_id, type: "user_decision", occurred_at: when, actor: "self",
      summary: `USER DECISION — ${when.slice(0, 10)} — owner: lesson ${rid} ${action === "edit" ? "edited" : status}`,
      body: note || null, data: { lesson_id: id, action, rule_id: rid, scope: newScope } });
  }
  return getLesson(id);
}

async function approvedRows() { const h = await db(); return h.all("SELECT * FROM lessons WHERE status = 'approved' ORDER BY id"); }

/** Write every approved lesson to $QUARTILE_HOME/record/lessons.yaml (rulebook format; scopes in source.scopes). */
export function writeLessonsFile(rows) {
  const rules = [], scopes = {}, lesson_ids = {};
  for (const l of rows) { const r = parseRule(l.rule_yaml); rules.push(r); scopes[r.id] = l.scope; lesson_ids[r.id] = l.id; }
  const obj = { source: { ...SOURCE, licence_note: "Owner's own records; local only, never in the repository.", generated_at: nowIso(), scopes, lesson_ids }, rules };
  const problems = checkFile(obj, "lessons.yaml");
  if (rules.length && problems.length) throw new Error(problems.join("; "));
  const file = lessonsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, "# Approved Quartile Record lessons. Written by Quartile; edit through record_lessons, not by hand.\n" + YAML.stringify(obj));
  fs.renameSync(tmp, file);
  return file;
}

const inScope = (scope, journal, design) => scope === "all" || (journal && scope.startsWith("journal:") && normJournal(scope.slice(8)) === normJournal(journal)) ||
  (design && scope.startsWith("design:") && scope.slice(7).toLowerCase() === String(design).toLowerCase());

const asEngineRule = (rule, meta) => ({ ...rule, source_id: SOURCE.id, source_citation: SOURCE.citation, file: "lessons.yaml",
  tests: { positive: [], negative: [] }, ...meta });

/**
 * For committee_review: approved lessons for this journal (ISSN or journal-bank id), for scope all, and for
 * design:<design> when design is given. Rules are in the engine's shape (check: manual), plus lesson_id, scope,
 * from_request and decided_at.
 */
export async function getApprovedLessons({ journal = null, design = null } = {}) {
  return (await approvedRows()).filter(l => inScope(l.scope, journal, design)).map(l =>
    asEngineRule(parseRule(l.rule_yaml), { lesson_id: l.id, scope: l.scope, from_request: l.from_request, decided_at: l.decided_at }));
}

/** Same as getApprovedLessons, read synchronously from lessons.yaml (no database). */
export function readApprovedLessonsFile({ journal = null, design = null } = {}) {
  const file = lessonsFile();
  if (!fs.existsSync(file)) return [];
  const obj = YAML.parse(fs.readFileSync(file, "utf8")) || {};
  const scopes = obj.source?.scopes || {}, ids = obj.source?.lesson_ids || {};
  return (obj.rules || []).filter(r => inScope(scopes[r.id] || "", journal, design)).map(r => asEngineRule(r, { lesson_id: ids[r.id], scope: scopes[r.id] }));
}

/** 21.5 point 2: propose scope all for every category asked by two or more journals (once per category). */
export async function proposeRepeated() {
  const h = await db();
  const rows = h.all("SELECT id, journal, category FROM requests WHERE category IS NOT NULL AND category != 'other' AND journal IS NOT NULL ORDER BY id");
  const by = new Map();
  for (const r of rows) { const k = normJournal(r.journal); if (!k) continue; if (!by.has(r.category)) by.set(r.category, new Map()); const m = by.get(r.category); if (!m.has(k)) m.set(k, { journal: r.journal, ids: [] }); m.get(k).ids.push(r.id); }
  const taken = new Set(h.all("SELECT rule_yaml FROM lessons").map(l => ruleIdOf(l.rule_yaml)));
  const out = [];
  for (const [cat, m] of by) {
    if (m.size < 2 || taken.has(`ALL-${cat}`)) continue;
    const journals = [...m.values()].map(v => v.journal), ids = [...m.values()].flatMap(v => v.ids);
    const p = proposeRepeatedLesson(cat, journals, ids);
    const id = newId();
    h.run("INSERT INTO lessons (id, from_request, scope, rule_yaml, status, note) VALUES (?,?,?,?,?,?)",
      [id, ids[ids.length - 1], p.scope, p.rule_yaml, "proposed", `Same category from ${journals.length} journals: ${journals.join(", ")}`]);
    out.push(await getLesson(id));
  }
  return out;
}

export default { parseRule, listLessons, getLesson, decideLesson, writeLessonsFile, getApprovedLessons, readApprovedLessonsFile, proposeRepeated, insertProposal, LESSON_STATUSES, SOURCE };
