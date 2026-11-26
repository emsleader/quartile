// proofread_submission: a full proofreading pass over every submission file of a paper.
// Quartile itself writes no prose (it is deterministic and uses no language model). The pass therefore has two
// steps:
//   plan   detects the issues paragraph by paragraph and returns, for each flagged paragraph, the issues, the
//          author's voice targets and the hard constraints (numbers, citations, locked terms, claim strength);
//   apply  receives the client's revisions (written by the author or by an assistant at the author's request),
//          keeps a revision only when verify_rewrite passes and no wording is copied, applies safe grammar fixes,
//          and re-checks the whole paper (claims, references, numbers, file properties, readiness, disclosure).
// Rules: meaning beats style (a failed check keeps the original); numbers and citations are read only; nothing is
// invented; a disclosure statement is never touched; file properties are never written; every decision is logged.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import L from "../lib.js";
import AI from "../aistyle.js";
import PR from "../prose.js";
import EV from "../evidence.js";
import REG from "../registry.js";
import RD from "../readiness.js";
import NET from "../net.js";
import { parseText, parseFile } from "../text/parse.js";
import { loadRules } from "../rules/loader.js";
import { runRules } from "../rules/engine.js";
import { checkFile, CLOSING } from "../filecheck.js";
import { voiceProfile, shingles } from "./voice.js";

export const STYLE_GUIDE = { empirical: "empirical", systematic_review: "systematic_review", conceptual: "conceptual" };
const DISCLOSURE = /\b(generative (AI|artificial intelligence)|large language models?|language models?|LLMs?|ChatGPT|AI[- ](assisted|based)|artificial intelligence (tools?|was|were)|use of (AI|artificial intelligence)|writing (support|assistance)|language (editing|polishing) (service|support))\b/i;
const NUM = /(?<![\p{L}\d.])[-−–]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/gu;
const CITE = /\([^()]*\b(?:19|20)\d{2}[a-z]?[^()]*\)|\b[A-Z][\p{L}'’-]+(?:\s+(?:et al\.|and|&)\s*(?:[A-Z][\p{L}'’-]+)?)?\s+\((?:19|20)\d{2}[a-z]?\)/gu;
const CITE1 = new RegExp(CITE.source, "u");
const UNSUPPORTED = /\b(studies (show|have shown|find|suggest)|research (shows|has shown|suggests|indicates)|evidence (shows|suggests|indicates)|it is (well )?(known|established|documented)|has (often |widely )?been (shown|argued|documented|found)|prior (work|research|studies)|the literature (shows|suggests|agrees)|scholars (agree|argue)|is widely (recognised|recognized|accepted))\b/i;

const sha = t => crypto.createHash("sha256").update(t).digest("hex");
const words = t => String(t).trim().split(/\s+/).filter(Boolean);
const sd = a => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };

/** Read one input file (path or { name, text } or { name, docx_base64 }) into { name, text, doc, docx }. */
async function readInput(f, i) {
  if (typeof f === "string") {
    if (!fs.existsSync(f)) throw new Error("File not found: " + f);
    const doc = await parseFile(f); return { name: path.basename(f), path: f, text: doc.text, doc, docx: /\.docx$/i.test(f) ? f : null };
  }
  if (f.docx_base64) {
    const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "qpr-")), p = path.join(tmp, "f.docx");
    try { fs.writeFileSync(p, Buffer.from(f.docx_base64, "base64")); const doc = await parseFile(p); return { name: f.name || `file ${i + 1}.docx`, text: doc.text, doc, docx: Buffer.from(f.docx_base64, "base64") }; }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  const doc = parseText(f.text || ""); return { name: f.name || `file ${i + 1}`, text: doc.text, doc, docx: null };
}
const readVoice = async v => { const list = [].concat(v || []); const out = []; for (const x of list) out.push(typeof x === "string" && fs.existsSync(x) ? (await parseFile(x)).text : String(x)); return out; };

/** Issues in one paragraph, with the evidence for each. */
export function paragraphIssues(p, { voice, rules, design, locked = [] }) {
  const t = p.text, issues = [];
  const ai = AI.check(t, { maxFixes: 0 });
  if (ai.stockWords && ai.stockWords.length) issues.push({ issue: "stock words", detail: ai.stockWords.map(([w]) => w).join(", ") });
  for (const [k, label] of [["dashes", "dash chains"], ["notBut", "'not X but Y' contrasts"], ["triads", "forced triads"], ["openers", "empty transitions or staged openers"], ["closers", "generic closing"]])
    if (ai.features?.[k] && ai.features[k].value > 0 && ai.features[k].z > 2) issues.push({ issue: label, detail: ai.features[k].label });
  for (const x of PR.lint(t).issues.slice(0, 6)) issues.push({ issue: "prose: " + x.type, detail: x.message });
  const lens = p.sentences.map(s => words(s.text).length);
  if (lens.length >= 4 && voice?.sentence_length?.sd && sd(lens) < 0.4 * voice.sentence_length.sd) issues.push({ issue: "uniform sentence rhythm", detail: `sentence lengths ${lens.join(", ")}; your papers vary with SD ${voice.sentence_length.sd}` });
  const doc = { design: { primary: design }, sentencesIn: () => p.sentences, window: id => p.sentences.map(s => s.text).join(" ") };
  for (const f of runRules(doc, rules)) issues.push({ issue: "claim beyond the design: " + f.rule, detail: f.message });
  for (const lt of locked) { const rx = new RegExp(lt.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]+"), "gi"); for (const m of t.matchAll(rx)) if (m[0] !== lt) issues.push({ issue: "term drift", detail: `'${m[0]}' should read '${lt}'` }); }
  return issues;
}

export async function plan(opts) {
  const { files, author_voice, paper_type = "empirical", language_variant = "en-GB", target_journal = null, locked_terms = [], time_budget_minutes = 240, seed = 0 } = opts;
  const clock = opts._clock || (() => Date.now()), start = clock(), budget = time_budget_minutes * 60000;
  const voiceTexts = await readVoice(author_voice), voice = voiceTexts.length ? voiceProfile(voiceTexts) : null;
  const rules = loadRules().filter(r => /^MTH-CAUSAL-|^QC-CLAIM-(CAUSAL|ASSUMPTION)/.test(r.id));
  const tasks = [], notProcessed = [], fileSummaries = [];
  for (let i = 0; i < files.length; i++) {
    if (clock() - start > budget) { notProcessed.push(...files.slice(i).map((f, k) => ({ file: typeof f === "string" ? path.basename(f) : f.name || `file ${i + k + 1}`, reason: "time budget reached before this file" }))); break; }
    const F = await readInput(files[i], i), design = F.doc.design.primary;
    let flagged = 0, stopped = false;
    for (const p of F.doc.paragraphs) {
      if (p.isHeading || p.isRef || p.isTable || p.section === "references") continue;
      if (clock() - start > budget) { notProcessed.push({ file: F.name, from_paragraph: p.id, reason: "time budget reached inside this file" }); stopped = true; break; }
      const sents = F.doc.sentences.filter(s => s.paragraph === p.id);
      if (DISCLOSURE.test(p.text)) { tasks.push({ file: F.name, paragraph: p.id, section: p.section, text: p.text, locked: true, reason: "disclosure statement: never changed", issues: [] }); continue; }
      const issues = paragraphIssues({ text: p.text, sentences: sents }, { voice, rules, design, locked: locked_terms });
      if (!issues.length) continue;
      flagged++;
      tasks.push({ file: F.name, paragraph: p.id, section: p.section, text: p.text, issues,
        constraints: { numbers: [...p.text.matchAll(NUM)].map(m => m[0]), citations: [...p.text.matchAll(CITE)].map(m => m[0]), locked_terms: locked_terms.filter(t => p.text.toLowerCase().includes(t.toLowerCase())), claim_strength: "keep: do not strengthen or weaken any claim" } });
    }
    fileSummaries.push({ file: F.name, design, paragraphs: F.doc.paragraphs.filter(p => !p.isHeading).length, flagged, stopped });
    if (stopped) break;
  }
  return { kind: "proofread_plan", mode: "plan", seed, paper_type, language_variant, target_journal, style_guide: safeGuide(paper_type),
    voice_profile: voice, files: fileSummaries, tasks, not_processed: notProcessed,
    instructions: "Rewrite only the paragraphs in tasks that are not locked, toward the voice profile. Keep every number, citation, locked term and the strength of every claim exactly. Then call proofread_submission again with mode 'apply', the same files and revisions: [{ file, paragraph, text }]. Paragraphs you do not revise stay as they are." };
}
// q1_style_guide paper types: A empirical, C conceptual, R review
function safeGuide(t) { try { return L.styleGuide("Q1", t === "systematic_review" ? "R" : t === "conceptual" ? "C" : "A"); } catch (e) { return null; } }

/** Candidate references for unsupported claims: local library items with a DOI and a known quartile only. */
async function candidates(claimText, { paper_type, max = 3 }) {
  let lib; try { const { openLibrary } = await import("../library/index.js"); const { dbPath } = await import("../store/db.js"); if (!fs.existsSync(dbPath())) return []; lib = await openLibrary(); } catch (e) { return []; }
  const allowed = paper_type === "systematic_review" ? ["Q1", "Q2", "Q3", "Q4"] : ["Q1", "Q2"];
  const kw = new Set(claimText.toLowerCase().match(/\p{L}{5,}/gu) || []);
  return lib.all()
    .filter(it => it.doi && it.quartile && allowed.includes(it.quartile) && (it.type === "article-journal" || (paper_type === "systematic_review" && /^(book|chapter)$/.test(it.type))))
    .map(it => ({ it, score: [...kw].filter(w => (it.csl.title || "").toLowerCase().includes(w)).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || (a.it.id < b.it.id ? -1 : 1)).slice(0, max)
    .map(({ it }) => ({ doi: it.doi, title: it.csl.title, journal: it.venue, year: it.year, quartile: it.quartile, quartile_year: it.quartile_year || null, source: "local library" }));
}

export async function apply(opts) {
  const { files, revisions = [], author_voice, paper_type = "empirical", language_variant = "en-GB", target_journal = null, locked_terms = [], time_budget_minutes = 240, seed = 0,
    live = false, word_limit = null, anonymised = false, journal_policy_text = null, out_dir = null } = opts;
  const clock = opts._clock || (() => Date.now()), start = clock(), budget = time_budget_minutes * 60000;
  const voiceTexts = await readVoice(author_voice), voiceSh = new Set(voiceTexts.flatMap(t => [...shingles(t)]));
  const log = [], numberTable = [], refReport = [], readiness = [], notProcessed = [], outFiles = [];
  let CP = null; try { CP = (await import("../../mcp/corpus.js")).default; } catch (e) { CP = null; }
  const inputs = [];
  for (let i = 0; i < files.length; i++) {
    if (clock() - start > budget) { notProcessed.push(...files.slice(i).map((f, k) => ({ file: typeof f === "string" ? path.basename(f) : f.name || `file ${i + k + 1}`, reason: "time budget reached before this file" }))); break; }
    const F = await readInput(files[i], i); inputs.push(F);
    const byPara = new Map(revisions.filter(r => r.file === F.name).map(r => [r.paragraph, r.text]));
    const paras = []; let stopped = false;
    for (const p of F.doc.paragraphs) {
      let text = p.text;
      if (!stopped && clock() - start > budget) { notProcessed.push({ file: F.name, from_paragraph: p.id, reason: "time budget reached inside this file; the rest is kept unchanged" }); stopped = true; }
      if (!stopped && byPara.has(p.id) && !p.isHeading && !p.isRef && !p.isTable) {
        const rev = byPara.get(p.id), entry = { file: F.name, paragraph: p.id, issue: "revision supplied", action: "kept original", verify_rewrite: null, originality: null };
        if (DISCLOSURE.test(p.text)) { entry.issue = "disclosure statement"; entry.verify_rewrite = "not run: disclosure statements are never changed"; }
        else {
          const v = L.verify(p.text, rev, locked_terms);
          entry.verify_rewrite = v.pass ? "pass" : "fail: " + v.blocking.map(b => b.type + (b.detail ? ` (${b.detail})` : "")).join("; ");
          if (v.pass) {
            const copiedVoice = [...shingles(rev)].filter(s => voiceSh.has(s) && !shingles(p.text).has(s));
            let corpus = null; if (CP) { try { corpus = await CP.originality(rev); if (corpus && corpus.error) corpus = null; } catch (e) { corpus = null; } }
            const corpusHit = !!(corpus && corpus.pass === false);
            entry.originality = copiedVoice.length ? `fail: ${copiedVoice.length} eight-word phrase(s) copied from your voice samples` : corpusHit ? "fail: wording found in the Q1 corpus" : corpus ? "pass" : "pass (voice samples checked; no corpus on this machine)";
            if (!copiedVoice.length && !corpusHit) { text = rev; entry.action = "rewritten"; }
          }
        }
        log.push(entry);
      }
      paras.push({ ...p, text });
    }
    // safe grammar fixes (live LanguageTool, only when allowed: it sends the text out)
    let revised = paras.map(p => p.text).join("\n\n");
    if (live) {
      const g = await NET.grammar(revised, { language: language_variant });
      // only spelling, grammar and punctuation edits, and never an edit that touches a number
      const reps = (g.issues || []).filter(x => /possible typo|grammar|punctuation|casing|typography|spelling/i.test(x.category || "") && x.edit && !/\d/.test(x.edit.quote + x.edit.replacement))
        .map(x => x.edit);
      if (reps.length) { const a = L.applyReplacements(revised, reps, locked_terms); if (a.applied) { revised = a.text; log.push({ file: F.name, paragraph: "*", issue: "grammar (LanguageTool)", action: `grammar fix ×${a.applied}`, verify_rewrite: "guarded by apply_replacements", originality: "n/a" }); } }
    } else log.push({ file: F.name, paragraph: "*", issue: "grammar", action: "not run", verify_rewrite: "n/a", originality: "n/a", note: "grammar_check sends the text to LanguageTool; set live: true to allow it" });
    // whole-file checks
    const claims = EV.claimAudit(revised);
    const reg = REG.registry(revised, []);
    for (const s of reg.summaryNotInResults || []) numberTable.push({ file: F.name, number: s.text, where: s.role, problem: "stated in the " + s.role + " but not found in the results or tables", context: s.context });
    // references
    const doc2 = parseText(revised);
    const unsupported = doc2.sentences.filter(s => ["introduction", "literature", "discussion", "opening"].includes(s.section) && UNSUPPORTED.test(s.text) && !CITE1.test(s.text));
    const refs = { file: F.name, references: doc2.citations.references.length, verified: null, not_verified: null, live: live ? "Crossref (reference strings and DOIs only)" : "not run (set live: true)", unsupported_claims: [] };
    if (live && refs.references) { const vr = await NET.verifyReferences(revised); refs.verified = vr.verified; refs.not_verified = vr.checked - vr.verified; refs.problems = (vr.results || []).filter(r => r.severity === "high" || r.severity === "med").map(r => ({ reference: (r.reference || r.text || "").slice(0, 160), problem: r.problem || r.status })); }
    for (const s of unsupported.slice(0, 15)) refs.unsupported_claims.push({ sentence: s.text, section: s.section, candidates: await candidates(s.text, { paper_type }) });
    refReport.push(refs);
    // file properties and readiness
    const ready = { file: F.name, words: words(revised).length, word_limit, over_limit: word_limit ? words(revised).length > word_limit : null, claim_audit_flags: claims.flagged };
    if (F.docx) { const fc = await checkFile(F.docx, { anonymised }); delete fc._cmp; ready.file_check = fc.checks.map(c => ({ check: c.check, status: c.status, explain: c.explain })); }
    const r = RD.readiness(revised, { journal: target_journal }); ready.readiness = { score: r.score, band: r.band };
    readiness.push(ready);
    const outName = F.name.replace(/\.(docx|pdf|txt|md)$/i, "") + ".revised.md";
    const outRec = { file: F.name, revised_name: outName, sha256_input: sha(F.text), sha256_revised: sha(revised), changed_paragraphs: log.filter(e => e.file === F.name && e.action === "rewritten").length, text: revised };
    if (out_dir) { fs.mkdirSync(out_dir, { recursive: true }); const p = path.join(out_dir, outName); if (fs.existsSync(p)) throw new Error("Will not overwrite " + p + ": choose another out_dir."); fs.writeFileSync(p, revised); outRec.written_to = p; delete outRec.text; }
    outFiles.push(outRec);
    if (stopped) break;
  }
  // numbers across files: a number in the abstract or title-page file that the manuscript does not contain
  if (inputs.length > 1) { const main = inputs[0].text; for (const F of inputs.slice(1)) for (const m of F.text.matchAll(NUM)) { const n = m[0]; if (/\./.test(n) || /%$/.test(n) || Number(n.replace(/,/g, "")) >= 100 && !/^(19|20)\d{2}$/.test(n)) if (!main.includes(n)) numberTable.push({ file: F.name, number: n, where: "other file", problem: `not found in ${inputs[0].name}` }); } }
  const disclosure = inputs.map(F => ({ file: F.name, statement_in_input: F.doc.paragraphs.filter(p => !p.isHeading && DISCLOSURE.test(p.text)).map(p => p.text) }));
  const policy = journal_policy_text ? { source: "supplied by you", relevant: (journal_policy_text.match(/[^.]*\b(AI|artificial intelligence|language model|ChatGPT|generative|writing (support|assistance)|editing)\b[^.]*\./gi) || []).map(s => s.trim()).slice(0, 10) } : { source: null, relevant: [], note: target_journal ? `Read ${target_journal}'s policy on generative AI and writing support, or pass its text as journal_policy_text.` : "No target journal given." };
  return { kind: "proofread_result", mode: "apply", seed, paper_type, language_variant, target_journal,
    files: outFiles, log, number_mismatches: numberTable, references: refReport, readiness, not_processed: notProcessed,
    disclosure: { statements: disclosure, journal_policy: policy, rule: "Quartile never adds, removes or changes a disclosure statement; that is your decision." },
    note: "Numbers and citations were not changed; a revision that changed them was rejected and the original kept. Candidate references are suggestions only (DOI and quartile required) and were not inserted. " + CLOSING };
}

export default { plan, apply, paragraphIssues };
