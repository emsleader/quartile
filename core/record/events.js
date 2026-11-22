// Events of a paper (specification 21.3): append-only. Corrections are new events that point to the old one.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, filesDir, recordDir, newId, nowIso, normDate, parseJson } from "./store.js";

export const EVENT_GROUPS = {
  writing: ["idea", "outline", "draft_version", "co_author_comment", "supervisor_comment", "language_edit", "quartile_check"],
  literature: ["search_run", "fulltext_request", "fulltext_received", "fulltext_not_retrieved"],
  data: ["data_received", "analysis_run", "validation_record"],
  ethics: ["ethics_submitted", "ethics_approved", "ethics_amendment"],
  journal: ["presubmission_enquiry", "enquiry_reply", "submitted", "desk_decision", "under_review", "review_received", "decision", "revision_submitted", "proofs", "published"],
  outreach: ["conference_presented", "preprint_posted", "shared"],
  owner: ["user_decision"],
  other: ["note", "correction"],
};
export const EVENT_TYPES = Object.values(EVENT_GROUPS).flat();
export const DECISIONS = ["accept", "minor", "major", "reject", "transfer"];
export const FILE_KINDS = ["manuscript", "letter", "review", "proof", "email", "report", "data", "other"];
const CORRECTABLE = ["occurred_at", "type", "journal", "actor", "summary", "body", "data"];

const DECISION_STATUS = { accept: "accepted", minor: "minor revision", major: "major revision", reject: "rejected", transfer: "transfer offered" };
/** Paper status implied by one (effective) event, or null when the event does not change the status. */
export function statusOf(e) {
  const d = e.data || {};
  if (typeof d.status === "string" && d.status.trim()) return d.status.trim();
  switch (e.type) {
    case "idea": return "idea";
    case "outline": case "draft_version": return "drafting";
    case "presubmission_enquiry": return "pre-submission enquiry";
    case "submitted": return "submitted";
    case "desk_decision": return /reject/i.test(d.decision || "") ? "desk rejected" : /review/i.test(d.decision || "") ? "under review" : "desk decision";
    case "under_review": return "under review";
    case "decision": return DECISION_STATUS[d.decision] || "decision";
    case "revision_submitted": return "revision submitted";
    case "proofs": return "in proofs";
    case "published": return "published";
    default: return null;
  }
}

const sha256File = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/**
 * Add one event. files: [{ path, kind }] are copied to $QUARTILE_HOME/record/files/<event-id>/ with SHA-256.
 * A correction needs `corrects` (the event it fixes) and data { set: { field: value }, void?: true, reason? }.
 */
export async function addEvent(input) {
  const h = await db();
  const e = validate(input, h);
  const id = newId();
  const dir = path.join(filesDir(), id);
  const files = [];
  const names = new Set();
  try {
    for (const f of input.files || []) {
      const src = typeof f === "string" ? f : f.path;
      const kind = (typeof f === "object" && f.kind) || "other";
      if (!FILE_KINDS.includes(kind)) throw new Error(`file kind must be one of ${FILE_KINDS.join(", ")}`);
      if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`file not found: ${src}`);
      let base = path.basename(src).replace(/[^\w.\- ]/g, "_");
      for (let k = 2; names.has(base); k++) base = `${k}-${path.basename(src)}`;
      names.add(base);
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, base);
      fs.copyFileSync(src, dest);
      const sha = sha256File(dest);
      if (sha !== sha256File(src)) throw new Error(`copy of ${src} does not match the original`);
      fs.chmodSync(dest, 0o444);
      files.push({ path: path.relative(recordDir(), dest).split(path.sep).join("/"), sha256: sha, kind, original: path.basename(src) });
    }
    h.tx(r => {
      r.run(`INSERT INTO events (id, paper_id, occurred_at, recorded_at, type, journal, actor, summary, body, corrects, data) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, e.paper_id, e.occurred_at, nowIso(), e.type, e.journal, e.actor, e.summary, e.body, e.corrects, e.data == null ? null : JSON.stringify(e.data)]);
      for (const f of files) r.run(`INSERT INTO event_files (event_id, path, sha256, kind) VALUES (?,?,?,?)`, [id, f.path, f.sha256, f.kind]);
      if (input._also) input._also(r, id);
    });
  } catch (err) {
    if (fs.existsSync(dir)) { for (const f of fs.readdirSync(dir)) { fs.chmodSync(path.join(dir, f), 0o644); } fs.rmSync(dir, { recursive: true, force: true }); }
    throw err;
  }
  await refreshStatus(e.paper_id);
  return getEvent(id);
}

function validate(input, h) {
  const paper = h.get("SELECT id FROM papers WHERE id = ?", [input.paper_id]);
  if (!paper) throw new Error(`no paper with id ${input.paper_id}; create it with record_paper first`);
  if (!EVENT_TYPES.includes(input.type)) throw new Error(`type must be one of: ${EVENT_TYPES.join(", ")}`);
  const summary = String(input.summary || "").trim();
  if (!summary) throw new Error("summary is required (one line, in your own words)");
  const occurred_at = input.type === "correction" && !input.occurred_at ? nowIso() : normDate(input.occurred_at, "occurred_at");
  let data = input.data == null ? null : input.data;
  if (data != null && (typeof data !== "object" || Array.isArray(data))) throw new Error("data must be an object");
  let corrects = input.corrects || null;
  if (input.type === "correction") {
    if (!corrects) throw new Error("a correction event needs `corrects`: the id of the event it fixes");
    const old = h.get("SELECT paper_id FROM events WHERE id = ?", [corrects]);
    if (!old) throw new Error(`no event with id ${corrects}`);
    if (old.paper_id !== input.paper_id) throw new Error("a correction must belong to the same paper as the event it fixes");
    const set = data?.set || {};
    if (!data || (!data.void && !Object.keys(set).length)) throw new Error("a correction needs data.set (fields to replace) or data.void: true");
    for (const k of Object.keys(set)) if (!CORRECTABLE.includes(k)) throw new Error(`a correction can replace only: ${CORRECTABLE.join(", ")}`);
    if (set.occurred_at) set.occurred_at = normDate(set.occurred_at, "data.set.occurred_at");
    if (set.type && (!EVENT_TYPES.includes(set.type) || set.type === "correction")) throw new Error("data.set.type is not a valid event type");
  } else if (corrects) throw new Error("only a correction event may point to another event (corrects)");
  if (input.type === "decision") {
    const dec = data?.decision;
    if (!DECISIONS.includes(dec)) throw new Error(`a decision event needs data.decision: one of ${DECISIONS.join(", ")}`);
  }
  return { paper_id: input.paper_id, type: input.type, occurred_at, journal: input.journal ? String(input.journal).trim() : null,
    actor: input.actor ? String(input.actor).trim() : null, summary, body: input.body == null ? null : String(input.body), corrects, data };
}

function rowToEvent(r, files) {
  return { ...r, data: parseJson(r.data), files: files.filter(f => f.event_id === r.id).map(({ event_id, ...f }) => f) };
}

export async function getEvent(id) {
  const h = await db();
  const r = h.get("SELECT * FROM events WHERE id = ?", [id]);
  if (!r) return null;
  return rowToEvent(r, h.all("SELECT * FROM event_files WHERE event_id = ?", [id]));
}

/** Stored rows exactly as entered, in the order they were recorded. */
export async function rawEvents(paper_id) {
  const h = await db();
  const files = h.all("SELECT f.* FROM event_files f JOIN events e ON e.id = f.event_id WHERE e.paper_id = ?", [paper_id]);
  return h.all("SELECT * FROM events WHERE paper_id = ? ORDER BY id", [paper_id]).map(r => rowToEvent(r, files));
}

/**
 * Events in date order (occurred_at, then entry order) with corrections applied. Each corrected event keeps
 * `original` (the stored values) and `corrected_by`; voided events have voided: true. Correction events stay in
 * the list (they are part of the history) unless include_corrections is false.
 */
export async function listEvents(paper_id, { include_corrections = true, include_voided = true } = {}) {
  const raw = await rawEvents(paper_id);
  const byId = new Map(raw.map(e => [e.id, { ...e, corrected_by: [], voided: false }]));
  for (const c of raw.filter(e => e.type === "correction")) {
    const t = byId.get(c.corrects);
    if (!t) continue;
    if (!t.original) t.original = Object.fromEntries(CORRECTABLE.map(k => [k, t[k]]));
    t.corrected_by.push(c.id);
    if (c.data?.void) t.voided = true;
    for (const [k, v] of Object.entries(c.data?.set || {})) t[k] = v;
  }
  let out = [...byId.values()];
  if (!include_corrections) out = out.filter(e => e.type !== "correction");
  if (!include_voided) out = out.filter(e => !e.voided);
  return out.sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : a.id < b.id ? -1 : 1));
}

/** Replay the history in date order: each step gives the event and the paper status after it. */
export async function replay(paper_id) {
  let status = null;
  return (await listEvents(paper_id, { include_corrections: false, include_voided: false })).map(e => {
    const s = statusOf(e);
    if (s) status = s;
    return { id: e.id, occurred_at: e.occurred_at, type: e.type, journal: e.journal, summary: e.summary, status };
  });
}

/** Status from the latest status event (date order, corrections applied). */
export async function deriveStatus(paper_id) {
  const steps = await replay(paper_id);
  return steps.length ? steps[steps.length - 1].status : null;
}

async function refreshStatus(paper_id) {
  const h = await db();
  h.run("UPDATE papers SET status = ? WHERE id = ?", [await deriveStatus(paper_id), paper_id]);
}

export default { EVENT_TYPES, EVENT_GROUPS, DECISIONS, FILE_KINDS, addEvent, getEvent, rawEvents, listEvents, replay, deriveStatus, statusOf };
