// Role 7 — response-to-reviewers manager (specification Section 11).
// Input: the reviewer letter and the old and new manuscript. Output: a response table with one row per comment:
// comment | change (old -> new) | location (section, paragraph number in the new version) | status.
// Status is the author's decision (addressed / partly / declined with reason / open). Quartile only suggests
// which changed paragraphs may answer a comment; a row stays "open" until the author sets its status.
// Export (Markdown or DOCX) is refused while any comment is open.
import { diffArrays, diffWords } from "diff";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { parseText } from "../text/parse.js";
import { docxTable, DOCX_STYLES } from "../report/render.js";

export const ROLE = "response";
export const STATUSES = ["addressed", "partly", "declined", "open"];
export const LABEL = "Simulated pre-submission review — not a journal decision";

// The committee does not run this role on a single manuscript: it needs a letter and two versions.
export async function run(doc, opts = {}) { return []; }

// ---------- 1. split the letter into comments ----------
const REVIEWER = /^\s*(?:#+\s*)?(?:\*\*)?\s*(?:reviewer|referee)\s*(?:#|no\.?\s*)?\s*(\d+|[A-C]|one|two|three)\b(?:\*\*)?\s*(?:'s\s+comments?)?\s*[:.,\-–—]?\s*(?:\*\*)?\s*(.*)$/i;
const WORDNUM = { one: "1", two: "2", three: "3", a: "1", b: "2", c: "3" };
// R1.3 / R1-3 / R1C3 | Comment 2: / Point 2. / Issue #2 | 1. / 1) / (1) / 1.2. | Q2:
const MARKER = /^\s*(?:[-*•]\s+)?(?:\*\*)?(?:R(\d+)\s*(?:[.\-:]|C)\s*(\d+)|(?:comment|point|issue|remark|concern|query|question|Q)\s*#?\s*(\d+(?:\.\d+)*)|\((\d+)\)|(\d+(?:\.\d+)*)[.)](?=\s))(?:\*\*)?\s*[:.)\-–—]?\s*(?:\*\*)?\s*(.*)$/i;
const CLOSING = /^\s*(sincerely|best regards|kind regards|regards|yours (sincerely|faithfully)|thank you|with best wishes)\b/i;
const SALUTE = /^\s*(dear\b|to the (editor|authors?)\b|editor'?s? (comments?|decision)\b|comments (to|for) the authors?\b)/i;

/**
 * Split a reviewer letter into numbered comments. Understands "Reviewer 1" / "Referee 2" headers, "R1.3",
 * "Comment 2:", "Point 3.", numbered lists "1." "1)" "(1)" and sub-numbers "2.1". A letter with no markers falls back
 * to one comment per paragraph. Returns [{ id, reviewer, number, text }].
 */
export function splitComments(letter) {
  const lines = String(letter || "").replace(/\r\n?/g, "\n").split("\n");
  const out = []; let reviewer = null, cur = null, markers = 0;
  const start = (num, text, rev = reviewer) => { cur = { reviewer: rev, number: num, lines: text ? [text] : [] }; out.push(cur); markers++; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { if (cur) cur.lines.push(""); continue; }
    if (CLOSING.test(line) && line.length < 60) { cur = null; continue; }
    const rv = line.match(REVIEWER);
    if (rv) {
      reviewer = WORDNUM[rv[1].toLowerCase()] || rv[1]; cur = null;
      const rest = (rv[2] || "").trim();
      if (rest) { const mk = rest.match(MARKER); if (mk) startFrom(mk); else if (rest.length > 20) start(null, rest); }
      continue;
    }
    const mk = line.match(MARKER);
    if (mk) { startFrom(mk); continue; }
    if (cur) cur.lines.push(line.trim());
  }
  function startFrom(mk) {
    if (mk[1]) { reviewer = mk[1]; start(mk[2], mk[6]); return; }
    start(mk[3] || mk[4] || mk[5], (mk[6] || "").trim());
  }
  let comments = out.map(c => ({ reviewer: c.reviewer, number: c.number, text: c.lines.join("\n").replace(/\n{2,}/g, "\n\n").trim() })).filter(c => c.text.length > 20);
  if (!markers || !comments.length) {
    // fallback: one comment per paragraph, without salutation and closing lines
    comments = String(letter || "").split(/\n\s*\n/).map(t => t.trim()).filter(t => t.length > 40 && !SALUTE.test(t) && !CLOSING.test(t)).map((t, i) => ({ reviewer: null, number: String(i + 1), text: t }));
  }
  const seen = new Map();
  return comments.map((c, i) => {
    let id = c.reviewer && c.number ? `R${c.reviewer}.${c.number}` : c.reviewer ? `R${c.reviewer}.${i + 1}` : `C${c.number || i + 1}`;
    if (seen.has(id)) { const n = seen.get(id) + 1; seen.set(id, n); id = `${id}-${n}`; } else seen.set(id, 1);
    return { id, reviewer: c.reviewer, number: c.number, text: c.text };
  });
}

// ---------- 2. paragraph-level diff of the two versions ----------
function bodyParagraphs(text) {
  const doc = parseText(text);
  const counter = {};
  return doc.paragraphs.filter(p => !p.isHeading).map((p, i) => {
    const section = p.section || "opening";
    counter[section] = (counter[section] || 0) + 1;
    return { text: p.text, section, paragraph_in_section: counter[section], paragraph: i + 1 };
  });
}

/** Changed paragraphs between two versions: { kind: modified|added|deleted, old, new, location, diff, added_words, removed_words }. */
export function changedParagraphs(oldText, newText) {
  const A = bodyParagraphs(oldText), B = bodyParagraphs(newText);
  const parts = diffArrays(A.map(p => p.text), B.map(p => p.text));
  const changes = []; let ia = 0, ib = 0;
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    if (!part.added && !part.removed) { ia += part.count; ib += part.count; continue; }
    if (part.removed && parts[k + 1]?.added) {
      const rem = A.slice(ia, ia + part.count), add = B.slice(ib, ib + parts[k + 1].count);
      const n = Math.max(rem.length, add.length);
      for (let j = 0; j < n; j++) changes.push(change(rem[j] || null, add[j] || null, rem[j - 1] || A[ia - 1] || null));
      ia += part.count; ib += parts[k + 1].count; k++; continue;
    }
    if (part.removed) { for (const r of A.slice(ia, ia + part.count)) changes.push(change(r, null, null, B[ib] || B[ib - 1] || null)); ia += part.count; continue; }
    if (part.added) { for (const a of B.slice(ib, ib + part.count)) changes.push(change(null, a)); ib += part.count; }
  }
  return changes.map((c, i) => ({ id: "D" + (i + 1), ...c }));
}
function change(o, n, _prev, anchorNew) {
  const kind = o && n ? "modified" : n ? "added" : "deleted";
  const loc = n || anchorNew || o;
  const words = o && n ? diffWords(o.text, n.text) : [];
  const added_words = o && n ? words.filter(w => w.added).map(w => w.value).join(" ") : n ? n.text : "";
  const removed_words = o && n ? words.filter(w => w.removed).map(w => w.value).join(" ") : o ? o.text : "";
  const diff = o && n ? words.map(w => w.added ? `{+${w.value}+}` : w.removed ? `[-${w.value}-]` : w.value).join("") : n ? `{+${n.text}+}` : `[-${o.text}-]`;
  return { kind, old: o ? o.text : null, new: n ? n.text : null, diff, added_words, removed_words,
    location: { section: loc.section, paragraph: loc.paragraph_in_section, paragraph_overall: loc.paragraph, version: n ? "new" : anchorNew ? "new (paragraph after the deletion)" : "old" } };
}

// ---------- 3. match comments to changes ----------
const STOP = new Set("about above after again against also although among another because been before being below between both cannot could does doing during each either else enough even every from further have having here however into itself just least less like made make many more most much must need needs neither other otherwise over paper please perhaps rather really same should since some still such than that their them then there these they this those though through thus under until upon very were what when where whether which while whom whose with within without would your yours authors author manuscript study article section reviewer comment point think believe suggest suggests recommend clarify explain discuss consider provide include state stated clear clearer unclear better further also seems seem might could note".split(" "));
const stem = w => w.toLowerCase().replace(/[’']s$/, "").replace(/(ations?|ings?|ments?|ness|ities|ity|ies|ied|ed|es|s|ly)$/, "").slice(0, 7);
export function keyTerms(text) {
  const out = new Set();
  for (const w of String(text).toLowerCase().match(/[a-z][a-z\-]{3,}/g) || []) { if (STOP.has(w)) continue; const s = stem(w); if (s.length >= 4) out.add(s); }
  for (const m of String(text).matchAll(/\b(table|figure|fig\.|equation|eq\.|hypothes[ie]s|h)\s*(\d+[a-z]?)\b/gi)) out.add(m[1].toLowerCase().slice(0, 3) + m[2].toLowerCase());
  return out;
}
const SECTION_WORDS = { introduction: /\bintroduction\b/i, literature: /\b(literature|prior work|related work)\b/i, theory: /\b(theory|hypothes[ie]s|framework)\b/i,
  methods: /\b(methods?|methodology|data|sample|research design)\b/i, results: /\b(results?|findings|estimates)\b/i, discussion: /\bdiscussion\b/i,
  limitations: /\blimitations?\b/i, conclusion: /\bconclusions?\b/i, abstract: /\babstract\b/i, references: /\b(references?|citations?|cite)\b/i };

/** For one comment, rank the changes that share key terms with it. A match needs 2 shared terms, 1 in the changed words. */
export function matchComment(comment, changes, { max = 3 } = {}) {
  const terms = keyTerms(comment.text);
  if (!terms.size) return [];
  const scored = [];
  for (const c of changes) {
    const changed = keyTerms(c.added_words + " " + c.removed_words), whole = keyTerms((c.new || "") + " " + (c.old || ""));
    const sharedChanged = [...terms].filter(t => changed.has(t)), shared = [...terms].filter(t => whole.has(t) || changed.has(t));
    if (shared.length < 2 || !sharedChanged.length) continue;
    const secBonus = SECTION_WORDS[c.location.section] && SECTION_WORDS[c.location.section].test(comment.text) ? 0.1 : 0;
    const score = Math.min(1, (shared.length + sharedChanged.length) / (2 * Math.min(terms.size, 12)) + secBonus);
    scored.push({ change: c.id, score: Math.round(score * 1000) / 1000, shared_terms: shared });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

// ---------- 4. statuses and the table ----------
/** Accepts "addressed", "declined: reason", or { status, reason, response }. Returns { status, reason, response, problem }. */
export function parseStatus(v) {
  if (v == null) return { status: "open", reason: null, response: null, problem: null };
  let status, reason = null, response = null;
  if (typeof v === "string") { const m = v.match(/^\s*([a-z ]+?)\s*(?:[:\-–—]\s*([\s\S]*))?$/i); status = m ? m[1].toLowerCase() : v.toLowerCase(); reason = m && m[2] ? m[2].trim() : null; }
  else { status = String(v.status || "").toLowerCase(); reason = v.reason ? String(v.reason).trim() : null; response = v.response ? String(v.response) : null; }
  status = status.replace(/^declined with reason$/, "declined").replace(/^partly addressed$/, "partly").replace(/^partially( addressed)?$/, "partly").trim();
  if (!STATUSES.includes(status)) return { status: "open", reason, response, problem: `unknown status "${status}" (use addressed, partly, declined with a reason, or open)` };
  if (status === "declined" && !reason) return { status: "open", reason: null, response, problem: "declined needs a reason; the row stays open" };
  return { status, reason, response, problem: null };
}

/**
 * Build the response table. statuses: { [commentId]: status } (see parseStatus).
 * Returns { label, comments, changes, rows, open, unmatched_changes, ready_to_export }.
 */
export function buildTracker(letter, oldText, newText, statuses = {}) {
  const comments = splitComments(letter);
  const changes = changedParagraphs(oldText, newText);
  const byId = new Map(changes.map(c => [c.id, c]));
  const used = new Set();
  const unknown = Object.keys(statuses || {}).filter(k => !comments.some(c => c.id === k));
  const rows = comments.map(c => {
    const matches = matchComment(c, changes);
    matches.forEach(m => used.add(m.change));
    const st = parseStatus(statuses?.[c.id]);
    const best = matches[0] ? byId.get(matches[0].change) : null;
    return { id: c.id, reviewer: c.reviewer, comment: c.text,
      change: best ? { kind: best.kind, old: best.old, new: best.new, diff: best.diff } : null,
      location: best ? best.location : null,
      other_matches: matches.slice(1).map(m => ({ ...m, location: byId.get(m.change).location })),
      match: matches[0] || null,
      suggested_status: matches.length ? "addressed or partly (author to confirm)" : "open (no changed paragraph shares its key terms)",
      status: st.status, reason: st.reason, response: st.response, ...(st.problem ? { problem: st.problem } : {}) };
  });
  const open = rows.filter(r => r.status === "open").map(r => r.id);
  return { label: LABEL, comments: comments.length, changes: changes.length, rows, open,
    unmatched_changes: changes.filter(c => !used.has(c.id)).map(c => ({ id: c.id, kind: c.kind, location: c.location, diff: c.diff.slice(0, 300) })),
    unknown_status_ids: unknown, ready_to_export: comments.length > 0 && open.length === 0,
    note: "Matches are suggestions from shared key terms between each comment and the changed paragraphs. The author sets every status; export is refused while any comment is open." };
}

const statusText = r => r.status === "declined" ? `declined — ${r.reason}` : r.status;
const locText = l => l ? `${l.section}, paragraph ${l.paragraph}` : "—";
const changeText = c => !c ? "—" : c.kind === "modified" ? `${c.old} → ${c.new}` : c.kind === "added" ? `(new paragraph) → ${c.new}` : `${c.old} → (deleted)`;

/** Export the table. Throws an error with .open listing the open comments when any comment is open. */
export async function exportTracker(tracker, format = "markdown") {
  if (!tracker.rows.length) { const e = new Error("Export refused: no comments were found in the letter."); e.open = []; throw e; }
  if (tracker.open.length) { const e = new Error(`Export refused: ${tracker.open.length} comment(s) still open (${tracker.open.join(", ")}). Set a status for each: addressed, partly, or declined with a reason.`); e.open = tracker.open; throw e; }
  if (format === "markdown") {
    const c = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " <br> ");
    return ["# Response to reviewers", "", "| Comment | Response | Change (old → new) | Location | Status |", "|---|---|---|---|---|",
      ...tracker.rows.map(r => `| ${c(r.id + ": " + r.comment)} | ${c(r.response || "")} | ${c(changeText(r.change))} | ${c(locText(r.location))} | ${c(statusText(r))} |`)].join("\n");
  }
  if (format === "docx") {
    const doc = new Document({ creator: "Quartile", title: "Response to reviewers", styles: DOCX_STYLES, sections: [{ properties: { page: { size: { orientation: "landscape", width: 16838, height: 11906 } } }, children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Response to reviewers", color: "000000" })] }),
      docxTable(["Comment", "Response", "Change (old → new)", "Location", "Status"],
        tracker.rows.map(r => [`${r.id}: ${r.comment}`, r.response || "", changeText(r.change), locText(r.location), statusText(r)]), [28, 20, 32, 10, 10]),
    ] }] });
    return Packer.toBuffer(doc);
  }
  throw new Error(`Unknown export format: ${format}`);
}

export default { ROLE, run, splitComments, changedParagraphs, matchComment, keyTerms, parseStatus, buildTracker, exportTracker, STATUSES };
