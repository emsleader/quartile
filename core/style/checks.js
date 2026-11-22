// Style checks (STY-*), role "writing". Rule metadata (title, severity, confidence, source_ref, limits, message,
// fix) is read from rulebook/style.yaml (source.code_checks), so the YAML is the single documented source.
// Packages: retext + retext-english + retext-passive / retext-simplify / retext-readability, write-good, and the
// word lists in data/prose-rules.json. All local; no text leaves the machine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { retext } from "retext";
import retextEnglish from "retext-english";
import retextPassive from "retext-passive";
import retextSimplify from "retext-simplify";
import retextReadability from "retext-readability";
import writeGood from "write-good";
import { parseText } from "../text/parse.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ROLE = "writing";
const SKIP_SECTIONS = new Set(["references", "disclosure", "data_avail", "ethics"]);
const NOISE = /^(it|there|this) (is|was|are|were)$/i; // same filter as core/prose.js
const ILLUSION_OK = /^(that|had|is|very)$/i;
const SO_OK = /^so[\s-]+(far|that|called|long|much|many|too|as)\b/i;
const STAT = /\b(p|t|F|r)\s*[<=>]/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let META = null, LISTS = null;
/** Code-check metadata from rulebook/style.yaml, keyed by rule ID. */
export function meta() {
  if (!META) {
    const y = YAML.parse(fs.readFileSync(path.join(ROOT, "rulebook", "style.yaml"), "utf8"));
    META = Object.fromEntries((y.source.code_checks || []).map(c => [c.id, { ...c, source_id: y.source.id }]));
  }
  return META;
}
function lists() {
  if (!LISTS) { try { LISTS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "prose-rules.json"), "utf8")); } catch { LISTS = { redundancy: [], wordy: [], cliches: [], weasel: [] }; } }
  return LISTS;
}
const rxWord = a => new RegExp("(?<![\\p{L}-])" + esc(a) + "(?![\\p{L}-])", "giu");
let COMPILED = null;
function compiled() {
  if (COMPILED) return COMPILED;
  const r = lists();
  COMPILED = {
    wordy: [...(r.redundancy || []).map(([a, b]) => ({ a, b })), ...(r.wordy || []).filter(([a]) => !NOISE.test(a)).map(([a, b]) => ({ a, b }))].map(x => ({ ...x, re: rxWord(x.a) })),
    cliches: (r.cliches || []).map(a => ({ a, re: rxWord(a) })),
    weasel: (r.weasel || []).map(a => ({ a, re: rxWord(a) })),
  };
  return COMPILED;
}

/** Build a finding in the engine's shape. Severity is capped at minor (note for passive and readability). */
function finding(id, { span = null, match = "", expected = "", vars = {}, detail = null, severity, confidence } = {}) {
  const m = meta()[id];
  if (!m) throw new Error(`style.yaml has no code check ${id}`);
  let sev = severity || m.severity; if (!["minor", "note"].includes(sev)) sev = "minor";
  let conf = confidence || m.confidence; if (!["medium", "low"].includes(conf)) conf = "low";
  const fill = s => String(s || "").replace("{match}", match).replace("{expected}", expected).replace(/\{(\w+)\}/g, (x, k) => (k in vars ? vars[k] : x));
  return { rule: id, role: ROLE, title: m.title, severity: sev, confidence: conf, source: m.source_id, source_ref: m.source_ref,
    message: fill(m.message), fix: fill(m.fix) || null, span, detail };
}
const inWhere = (m, sec) => m.where === "all" || [].concat(m.where || "all").includes(sec);
const spanOf = (s, start = s.start, end = s.end) => ({ section: s.section, start, end, text: s.text.slice(start - s.start, end - s.start) || s.text });
const sentSpan = s => ({ section: s.section, start: s.start, end: s.end, text: s.text });

/** Run every STY code check on a parsed document. Returns findings sorted by position. */
export async function run(doc, opts = {}) {
  const M = meta();
  const sents = doc.sentences.filter(s => !SKIP_SECTIONS.has(s.section));
  const out = [];

  // word lists (proselint / too-wordy / no-cliches / weasel-words)
  const C = compiled();
  for (const s of sents) {
    for (const it of C.wordy) { it.re.lastIndex = 0; for (const m of s.text.matchAll(it.re)) {
      const rep = it.b, none = rep === null || rep === undefined;
      out.push(finding("STY-WORDY-01", { span: spanOf(s, s.start + m.index, s.start + m.index + m[0].length), match: m[0], expected: none ? "a shorter form" : rep === "" ? "nothing" : rep,
        severity: none ? "note" : undefined, confidence: none ? "low" : undefined, detail: { list: "prose-rules.json", replacement: rep ?? null } }));
    } }
    for (const it of C.cliches) { it.re.lastIndex = 0; for (const m of s.text.matchAll(it.re)) out.push(finding("STY-CLICHE-01", { span: spanOf(s, s.start + m.index, s.start + m.index + m[0].length), match: m[0] })); }
    if (!STAT.test(s.text)) for (const it of C.weasel) { it.re.lastIndex = 0; for (const m of s.text.matchAll(it.re)) out.push(finding("STY-WEASEL-01", { span: spanOf(s, s.start + m.index, s.start + m.index + m[0].length), match: m[0] })); }
  }

  // write-good: lexical illusions and "So" openings
  const wgOpts = { passive: false, illusion: true, so: true, thereIs: false, weasel: false, adverb: false, tooWordy: false, cliches: false, eprime: false };
  for (const s of sents) {
    for (const w of writeGood(s.text, wgOpts)) {
      const q = s.text.slice(w.index, w.index + w.offset);
      if (/repeated/.test(w.reason)) {
        if (ILLUSION_OK.test(q)) continue;
        const prev = s.text.slice(0, w.index).match(/(\S+)\s*$/);
        const a = prev ? w.index - prev[0].length : w.index;
        out.push(finding("STY-ILLUSION-01", { span: spanOf(s, s.start + a, s.start + w.index + w.offset), match: s.text.slice(a, w.index + w.offset) }));
      } else if (/^so$/i.test(q) && w.index === 0) {
        if (SO_OK.test(s.text)) continue;
        out.push(finding("STY-SO-01", { span: spanOf(s, s.start, s.start + w.offset), match: q }));
      }
    }
  }

  // retext: passive, simplify (allow list), readability, per paragraph so offsets map back to doc.text
  const R = M["STY-READ-01"].thresholds, allow = M["STY-SIMPLE-01"].thresholds.allow;
  const proc = retext().use(retextEnglish).use(retextPassive).use(retextSimplify, { ignore: [] })
    .use(retextReadability, { age: R.age, threshold: R.threshold, minWords: R.min_words });
  const allowSet = new Set(allow.map(a => a.toLowerCase()));
  const passiveBySent = new Set(), hardBySent = new Map();
  const sentAt = off => sents.find(s => s.start <= off && off < s.end);
  for (const p of doc.paragraphs) {
    if (p.isHeading || p.isRef || p.isTable || SKIP_SECTIONS.has(p.section)) continue;
    const file = await proc.process(p.text);
    for (const msg of file.messages) {
      const a = msg.place?.start?.offset, b = msg.place?.end?.offset; if (a == null) continue;
      const s = sentAt(p.start + a); if (!s) continue;
      if (msg.source === "retext-passive") passiveBySent.add(s.id);
      else if (msg.source === "retext-readability") hardBySent.set(s.id, s);
      else if (msg.source === "retext-simplify") {
        const phrase = String(msg.actual || "").toLowerCase().replace(/\s+/g, " ");
        if (!allowSet.has(phrase)) continue;
        const start = p.start + a, end = p.start + b;
        if (out.some(f => f.rule === "STY-WORDY-01" && f.span && f.span.start < end && start < f.span.end)) continue; // same phrase already flagged
        out.push(finding("STY-SIMPLE-01", { span: spanOf(s, start, end), match: msg.actual, expected: (msg.expected || []).map(x => `'${x}'`).join(" or ") || "a shorter form" }));
      }
    }
  }

  // STY-PASSIVE-01: per section, share of passive sentences (retext-passive or the profile's own be + participle test)
  const PM = M["STY-PASSIVE-01"], BE = /\b(is|are|was|were|been|be|being)\s+(\w+ly\s+)?\w+(ed|en)\b/i;
  const bySec = new Map(); for (const s of sents) { if (!bySec.has(s.section)) bySec.set(s.section, []); bySec.get(s.section).push(s); }
  for (const [sec, ss] of bySec) {
    if (!inWhere(PM, sec) || ss.length < PM.thresholds.min_sentences) continue;
    const pas = ss.filter(s => passiveBySent.has(s.id) || BE.test(s.text)), share = pas.length / ss.length;
    if (share > PM.thresholds.max_share) out.push(finding("STY-PASSIVE-01", { span: sentSpan(pas[0]), vars: { passive: pas.length, total: ss.length, share: share.toFixed(2), limit: PM.thresholds.max_share },
      detail: { section: sec, sentences: ss.length, passive: pas.length, share: +share.toFixed(3), limit: PM.thresholds.max_share, examples: pas.slice(0, 5).map(s => ({ start: s.start, end: s.end })) } }));
  }
  // STY-READ-01: one note per section listing the hard sentences
  const hardSec = new Map(); for (const s of hardBySent.values()) { if (!hardSec.has(s.section)) hardSec.set(s.section, []); hardSec.get(s.section).push(s); }
  for (const [sec, ss] of hardSec) {
    ss.sort((x, y) => x.start - y.start);
    out.push(finding("STY-READ-01", { span: sentSpan(ss[0]), vars: { count: ss.length },
      detail: { section: sec, count: ss.length, age: R.age, threshold: R.threshold, sentences: ss.slice(0, 10).map(s => ({ start: s.start, end: s.end })) } }));
  }
  const rank = { "STY-PASSIVE-01": 0, "STY-READ-01": 0 };
  return out.sort((x, y) => (x.span?.start ?? 0) - (y.span?.start ?? 0) || (rank[x.rule] ?? 1) - (rank[y.rule] ?? 1));
}

/** Convenience: style findings for plain text. */
export async function checkText(text, opts = {}) { return run(parseText(String(text || ""), opts), opts); }

export default { ROLE, run, checkText, meta };
