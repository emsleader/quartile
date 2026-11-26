// Research Factory: one paper moves through Stages 0-9 in order. Each stage has one job, fixed checks
// and a gate. Author gates need a named person's approval; mechanical gates pass when their checks pass.
// State lives in $QUARTILE_HOME/factory/<paper_id>.json (one status file per paper) with every stage
// result in $QUARTILE_HOME/factory/<paper_id>/stage-<n>.json. Quartile never approves a gate itself.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { home } from "../store/db.js";

export const STAGES = [
  { n: 0, key: "brief", name: "Idea intake", gate: "author", job: "One-page brief: question, population, contribution claim, target tier." },
  { n: 1, key: "novelty", name: "Novelty and scope scan", gate: "author", decision: ["go", "reframe", "stop"], job: "Search the same question in several indexes, merge into the library, report the closest works and the threat level.", needs: ["novelty_report"] },
  { n: 2, key: "evidence", name: "Evidence base", gate: "author", job: "Screening register, extraction workbook and PRISMA counts; a named second reviewer checks a random sample.", needs: ["screening_register"] },
  { n: 3, key: "ledger", name: "Ledger and numbers", gate: "author", job: "Evidence ledger (claim, source, page) and number registry; the author locks the ledger.", needs: ["ledger"] },
  { n: 4, key: "draft", name: "Drafting in the author's voice", gate: "author", job: "Full draft by the author. Quartile records the file; it does not write the draft.", needs: ["manuscript"] },
  { n: 5, key: "verification", name: "Verification", gate: "author", job: "References against Crossref, claims against the design, statistics recomputed.", needs: ["manuscript"] },
  { n: 6, key: "voice", name: "Voice and pattern control", gate: "mechanical", job: "Style signal, prose lint and sentence length against the targets; logged, no human gate.", needs: ["manuscript"] },
  { n: 7, key: "committee", name: "Internal committee", gate: "author", job: "Simulated six-role review: readiness and fix list. Not a journal decision.", needs: ["manuscript"] },
  { n: 8, key: "submission", name: "Submission pack", gate: "author", job: "File properties, readiness and the hard quality gates. The author saves the final file in Word and submits.", needs: ["manuscript", "docx"] },
  { n: 9, key: "memory", name: "Memory of the paper", gate: "author", job: "Paper record, events, letters and lessons in Quartile Record." },
];
export const TARGETS = { pattern_band: "low", mean_sentence_length: [21, 27], triads_per_1000_words: 4 };
const ID = /^[a-z0-9][a-z0-9-]{1,60}$/;

const dir = () => path.join(home(), "factory");
const file = id => path.join(dir(), id + ".json");
const now = () => new Date().toISOString();
export const sha256 = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function check(id) { if (!ID.test(id || "")) throw new Error("paper_id: lowercase letters, digits and hyphens, 2-61 characters."); }
export function load(id) { check(id); if (!fs.existsSync(file(id))) throw new Error("No factory run for " + id + ". Start one with action start."); return JSON.parse(fs.readFileSync(file(id), "utf8")); }
function save(s) {
  fs.mkdirSync(path.join(dir(), s.paper_id), { recursive: true });
  s.updated = now(); const tmp = file(s.paper_id) + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(s, null, 1)); fs.renameSync(tmp, file(s.paper_id)); return s;
}
const log = (s, event, detail = {}) => s.log.push({ at: now(), event, ...detail });

export function start({ paper_id, brief, author }) {
  check(paper_id); if (fs.existsSync(file(paper_id))) throw new Error("A factory run already exists for " + paper_id + ".");
  const need = ["question", "population", "contribution", "target_tier"], missing = need.filter(k => !String((brief || {})[k] || "").trim());
  if (missing.length) throw new Error("The brief needs: " + missing.join(", ") + ".");
  if (!String(author || "").trim()) throw new Error("Name the author who owns the idea.");
  const s = { paper_id, author, created: now(), brief, current: 0, artefacts: {}, stages: STAGES.map(st => ({ n: st.n, key: st.key, state: "pending" })), log: [] };
  s.stages[0].state = "awaiting approval"; s.stages[0].summary = { brief };
  log(s, "start", { author }); return save(s);
}

/** Record input files with their SHA-256 (paths stay on the author's computer; nothing is copied). */
export function attach(s, files = {}) {
  for (const [k, p] of Object.entries(files)) {
    if (p == null || p === "") continue;
    const list = Array.isArray(p) ? p : [p];
    for (const f of list) if (!fs.existsSync(f)) throw new Error(`File not found for ${k}: ${f}`);
    s.artefacts[k] = list.map(f => ({ path: f, sha256: sha256(f), recorded: now() }));
    if (!Array.isArray(p)) s.artefacts[k] = s.artefacts[k][0];
  }
}
const art = (s, k) => s.artefacts[k];
const first = a => Array.isArray(a) ? a[0] : a;
const changed = a => a && fs.existsSync(first(a).path) && sha256(first(a).path) !== first(a).sha256;

/** Automatic checks of one stage. ctx: { readText, live, ... } supplied by the tool layer. */
async function runChecks(s, n, ctx) {
  const st = STAGES[n], missing = (st.needs || []).filter(k => !art(s, k));
  if (missing.length) return { ok: false, missing, note: "Attach: " + missing.join(", ") + "." };
  const text = art(s, "manuscript") ? await ctx.readText(first(art(s, "manuscript")).path) : null;
  const outputs = (art(s, "outputs") ? [].concat(art(s, "outputs")) : []).map(o => ({ name: path.basename(o.path), text: fs.readFileSync(o.path, "utf8") }));
  if (n === 1) return { ok: true, files: { novelty_report: art(s, "novelty_report"), search_results: art(s, "search_results") || [] }, note: "Record the decision: go, reframe or stop." };
  if (n === 2) return { ok: true, files: { screening_register: art(s, "screening_register"), extraction: art(s, "extraction") || null }, note: "Approval needs the name of the second reviewer who checked a random sample." };
  if (n === 3) {
    const ledger = ctx.checkLedger(fs.readFileSync(first(art(s, "ledger")).path, "utf8"));
    const reg = text && outputs.length ? ctx.registry(text, outputs) : null;
    return { ok: !ledger.error && !ledger.high, ledger: { claims: ledger.claims, high: ledger.high, issues: (ledger.issues || []).length, error: ledger.error }, registry: reg && { numbers: reg.numbers, matched: reg.matched, notFound: reg.notFound, coverage: reg.coverage }, note: "Approving this stage locks the ledger: its SHA-256 is stored and checked again at Stage 8." };
  }
  if (n === 4) return { ok: true, manuscript: first(art(s, "manuscript")), words: text.split(/\s+/).filter(Boolean).length };
  if (n === 5) {
    const refs = ctx.live ? await ctx.verifyReferences(text) : null, claims = ctx.claimAudit(text), stats = ctx.checkStatistics(text);
    const out = { ok: true, live: !!ctx.live, claims_flagged: claims.flagged, statistics_problems: Array.isArray(stats.problems) ? stats.problems.length : (stats.problems ?? null) };
    if (refs) { out.references = { checked: refs.checked, verified: refs.verified, problems: refs.problems, unverified: refs.results.filter(r => r.status !== "verified").map(r => ({ reference: r.reference, status: r.status })) }; out.manuscript_sha256 = first(art(s, "manuscript")).sha256; }
    else out.note = "References were not checked: run again with live: true (sends the reference list to Crossref).";
    return out;
  }
  if (n === 6) {
    const ai = ctx.aiStyle(text), words = ai.words || 1, msl = ai.meanSentenceLength;
    const triads = ai.features && ai.features.triads ? ai.features.triads.value : null;
    const fails = [];
    if (ai.band !== TARGETS.pattern_band) fails.push(`pattern score ${ai.score} (${ai.band}); target band low`);
    if (msl < TARGETS.mean_sentence_length[0] || msl > TARGETS.mean_sentence_length[1]) fails.push(`mean sentence length ${msl}; target 21-27`);
    return { ok: !fails.length, pattern_score: ai.score, band: ai.band, mean_sentence_length: msl, triads_per_1000_words: triads, words, hotspots: (ai.hotspots || []).length, fails, note: "Fix the hotspots in your own words, check each changed paragraph with verify_rewrite, then run this stage again." };
  }
  if (n === 7) { const r = await ctx.committee(text); return { ok: true, readiness: r.readiness, overall: r.overall, findings: r.findings.length, label: r.label }; }
  if (n === 8) return gates(s, text, outputs, ctx);
  if (n === 9) return { ok: true, note: "Create the paper record with record_paper and log events, letters and lessons with record_event, record_letter and record_lessons." };
  return { ok: true };
}

/** The hard quality gates (upgrade 7). No submission pack while any of them fails. */
export async function gates(s, text, outputs, ctx) {
  const g = [];
  // 1. every number in the registry
  if (!outputs.length) g.push({ gate: "numbers in registry", pass: false, detail: "No statistical output attached (outputs)." });
  else { const r = ctx.registry(text, outputs); g.push({ gate: "numbers in registry", pass: r.notFound === 0, detail: `${r.matched} of ${r.numbers} matched; ${r.notFound} not found in the output`, not_found: r.rows.filter(x => x.status === "not found in output").slice(0, 30).map(x => x.text) }); }
  // 2. every reference verified (live now, or at Stage 5 on the same manuscript)
  const s5 = s.stages[5].summary || {};
  let refs = null;
  if (ctx.live) { const v = await ctx.verifyReferences(text); refs = { verified: v.verified, checked: v.checked, unverified: v.results.filter(r => r.status !== "verified").map(r => ({ reference: r.reference, status: r.status })) }; }
  else if (s5.references && s5.manuscript_sha256 === first(art(s, "manuscript")).sha256) refs = s5.references;
  g.push(refs ? { gate: "references verified", pass: refs.checked > 0 && refs.unverified.length === 0, detail: `${refs.verified} of ${refs.checked} verified`, unverified: refs.unverified.slice(0, 30) }
    : { gate: "references verified", pass: false, detail: "No Crossref check on this version of the manuscript: run with live: true." });
  // 3. pattern score in the low band
  const ai = ctx.aiStyle(text); g.push({ gate: "pattern score in the low band", pass: ai.band === "low", detail: `score ${ai.score} (${ai.band})` });
  // 4. ledger unchanged since it was locked
  const led = art(s, "ledger"); g.push({ gate: "ledger locked and unchanged", pass: !!(s.stages[3].locked && led && !changed(led)), detail: !led ? "No ledger attached." : !s.stages[3].locked ? "Stage 3 not approved." : changed(led) ? "The ledger changed after it was locked: re-run Stage 3." : "unchanged" });
  // property check of the file to submit (reported; FAIL items block)
  const fc = await ctx.fileCheck(first(art(s, "docx")).path, !!ctx.anonymised);
  const fails = (fc.checks || []).filter(c => c.status === "FAIL");
  g.push({ gate: "file_check without FAIL", pass: fails.length === 0, detail: fails.length ? fails.map(c => c.check).join(", ") : "no FAIL" });
  return { ok: g.every(x => x.pass), gates: g, file_check_summary: fc.summary, note: "Save the final version yourself in Word after your own revision, and add the journal's required statement on the use of generative AI. Quartile does not change file metadata." };
}

/** Run the current stage's checks, and keep going through mechanical gates that pass. Stops at every author gate. */
export async function run(id, { files = {}, ...ctx }) {
  const s = load(id); attach(s, files); const ran = [];
  while (s.current < STAGES.length) {
    const n = s.current, st = STAGES[n], rec = s.stages[n];
    if (n === 0) break; // the brief has no checks: it waits for approval
    const res = await runChecks(s, n, ctx);
    fs.writeFileSync(path.join(dir(), id, `stage-${n}.json`), JSON.stringify({ at: now(), ...res }, null, 1));
    rec.summary = res; rec.last_run = now(); ran.push({ stage: n, name: st.name, ok: res.ok });
    log(s, "run", { stage: n, ok: res.ok });
    if (st.gate === "mechanical") {
      if (!res.ok) { rec.state = "failed checks"; break; }
      rec.state = "passed"; log(s, "passed", { stage: n, gate: "mechanical" }); s.current++; s.stages[s.current] && (s.stages[s.current].state = "ready"); continue;
    }
    rec.state = res.ok ? "awaiting approval" : "failed checks"; break;
  }
  save(s); return { ran, status: status(s) };
}

/** A named person approves the current stage (or records go/reframe/stop at Stage 1). */
export function approve(id, { stage, approver, decision, second_reviewer, note }) {
  const s = load(id), n = s.current, st = STAGES[n], rec = s.stages[n];
  if (stage !== n) throw new Error(`Stage ${n} (${st.name}) is the current stage; stages are approved in order.`);
  if (!String(approver || "").trim()) throw new Error("Approval needs the name of the person who approves.");
  if (st.gate === "mechanical") throw new Error("This stage has no human gate: it passes when its checks pass.");
  if (rec.state !== "awaiting approval") throw new Error(`Stage ${n} is "${rec.state}": run it and fix the failed checks first.`);
  if (st.decision) { if (!st.decision.includes(decision)) throw new Error("Decision: go, reframe or stop."); rec.decision = decision; }
  if (n === 2) {
    if (!String(second_reviewer || "").trim()) throw new Error("Name the second reviewer who checked a random sample of the screening.");
    if (second_reviewer.trim().toLowerCase() === approver.trim().toLowerCase()) throw new Error("The second reviewer must be a different person from the approver.");
    rec.second_reviewer = second_reviewer.trim();
  }
  if (n === 3) { const l = first(art(s, "ledger")); if (changed(l)) throw new Error("The ledger changed since Stage 3 ran: run it again."); rec.locked = { sha256: l.sha256, at: now() }; }
  if (n === 8 && !(rec.summary && rec.summary.ok)) throw new Error("The quality gates have not all passed.");
  rec.state = n === 1 && decision === "stop" ? "stopped" : "approved"; rec.approved = { by: approver.trim(), at: now(), note: note || null };
  log(s, "approve", { stage: n, by: approver.trim(), decision: decision || null });
  if (rec.state === "stopped") { s.stopped = true; }
  else if (n === 1 && decision === "reframe") { s.current = 0; s.stages[0].state = "awaiting approval"; s.stages[1].state = "pending"; log(s, "reframe"); }
  else { s.current = n + 1; if (s.stages[s.current]) s.stages[s.current].state = "ready"; else s.finished = now(); }
  save(s); return status(s);
}

/** Go back to an earlier stage; it and every later stage must be run and approved again. */
export function reopen(id, { stage, reason }) {
  const s = load(id); if (!(stage >= 0 && stage <= s.current)) throw new Error("Reopen a stage at or before the current one.");
  for (let k = stage; k < STAGES.length; k++) { const r = s.stages[k]; s.stages[k] = { n: r.n, key: r.key, state: k === stage ? (k === 0 ? "awaiting approval" : "ready") : "pending" }; }
  s.current = stage; delete s.finished; delete s.stopped; log(s, "reopen", { stage, reason: reason || null }); save(s); return status(s);
}

export function status(s) {
  if (typeof s === "string") s = load(s);
  const cur = STAGES[s.current];
  return { paper_id: s.paper_id, author: s.author, current_stage: s.finished ? null : s.current, current_name: s.finished ? null : cur.name, finished: s.finished || null, stopped: !!s.stopped,
    next: s.stopped ? "Stopped at Stage 1." : s.finished ? "All stages approved." : (() => { const r = s.stages[s.current]; return r.state === "awaiting approval" ? `Approve Stage ${s.current} (${cur.name}).` : r.state === "failed checks" ? `Fix the failed checks of Stage ${s.current} and run again.` : `Run Stage ${s.current} (${cur.name}); attach: ${(cur.needs || []).filter(k => !s.artefacts[k]).join(", ") || "nothing more"}.`; })(),
    stages: s.stages.map(r => ({ n: r.n, name: STAGES[r.n].name, gate: STAGES[r.n].gate, state: r.state, ...(r.approved ? { approved_by: r.approved.by, approved_at: r.approved.at } : {}), ...(r.decision ? { decision: r.decision } : {}), ...(r.second_reviewer ? { second_reviewer: r.second_reviewer } : {}), ...(r.locked ? { ledger_locked: r.locked.sha256.slice(0, 12) } : {}), ...(r.summary && r.n ? { ok: r.summary.ok } : {}) })),
    artefacts: Object.fromEntries(Object.entries(s.artefacts).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => x.path) : v.path])),
    status_file: file(s.paper_id) };
}
export function list() { if (!fs.existsSync(dir())) return []; return fs.readdirSync(dir()).filter(f => f.endsWith(".json")).map(f => status(f.slice(0, -5))); }
export default { STAGES, TARGETS, start, run, approve, reopen, status, list, gates, load, sha256 };
