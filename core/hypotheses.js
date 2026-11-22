// Hypotheses and propositions: where each is declared, what precedes it (theory or cited finding) and what the
// results say about it. Used by BUS-02, BUS-03 and the hypothesis_map tool.
import { findTheories, loadTheories } from "./theories.js";

// sections where a hypothesis is declared (not where it is tested)
const NOT_DECL = new Set(["results", "discussion", "conclusion", "implications", "limitations", "abstract", "references", "disclosure", "ethics", "data_avail", "funding"]);
const TEST_SECTIONS = ["results", "discussion", "conclusion"];

const STRONG = /(?<![\p{L}\d])(?:(H|P)(\d{1,2}[a-z]?)\s*[:.)]|(Hypothesis|Proposition)\s+(\d{1,2}[a-z]?)(?:\s*\((?:H|P)\d{1,2}[a-z]?\))?\s*[:.])/gu;
const INLINE = /\((H|P)(\d{1,2}[a-z]?)\)/g;
const PREDICT = /\b(associated|related|positive(ly)?|negative(ly)?|will|increase[sd]?|reduce[sd]?|lower|higher|moderat\w+|mediat\w+|affect\w*|influenc\w+|predict\w*|lead to|leads to|more likely|less likely|strengthen\w*|weaken\w*)\b/i;
// author-year in parentheses, narrative author (year), or numeric [12]
export const CITE_ANY = /\([^()]*\b[A-Z][\p{L}'’-]+[^()]*?(?:19|20)\d{2}[a-z]?[^()]*\)|\b[A-Z][\p{L}'’-]+(?:\s+(?:et al\.|and|&)\s*(?:[A-Z][\p{L}'’-]+)?)?\s+\((?:19|20)\d{2}[a-z]?\)|\[\d+(?:[,–-]\s*\d+)*\]/u;

const norm = (kind, num) => (/^(H|Hypothesis)$/i.test(kind) ? "H" : "P") + num;

/** Declared hypotheses and propositions, first declaration of each label. */
export function declarations(doc) {
  const out = new Map(), inline = [];
  const paras = doc.paragraphs.filter(p => !p.isRef && !p.isTable && !NOT_DECL.has(p.section));
  for (const p of paras) {
    for (const m of p.text.matchAll(STRONG)) {
      const label = norm(m[1] || m[3], m[2] || m[4]);
      if (out.has(label)) continue;
      const rest = p.text.slice(m.index + m[0].length);
      const statement = (rest.match(/^[^]*?(?:[.!?](?=\s|$)|$)/) || [rest])[0].trim();
      if (statement.length < 12) continue; // "H1." used as a reference, not a statement
      out.set(label, { label, kind: label[0] === "H" ? "hypothesis" : "proposition", statement, paragraph: p, start: p.start + m.index, end: p.start + m.index + m[0].length + statement.length, section: p.section, how: "labelled" });
    }
    for (const m of p.text.matchAll(INLINE)) inline.push({ p, m });
  }
  for (const { p, m } of inline) {
    const label = norm(m[1], m[2]); if (out.has(label)) continue;
    const s = doc.sentences.find(x => x.start <= p.start + m.index && p.start + m.index < x.end);
    const text = s ? s.text : p.text;
    if (!PREDICT.test(text)) continue;
    out.set(label, { label, kind: label[0] === "H" ? "hypothesis" : "proposition", statement: text, paragraph: p, start: s ? s.start : p.start, end: s ? s.end : p.end, section: p.section, how: "inline" });
  }
  const order = l => [l[0], parseInt(l.slice(1), 10), l.replace(/^\D\d+/, "")];
  return [...out.values()].sort((a, b) => { const x = order(a.label), y = order(b.label); return x[0].localeCompare(y[0]) || x[1] - y[1] || x[2].localeCompare(y[2]); });
}

const isHypPara = p => { STRONG.lastIndex = 0; const r = STRONG.test(p.text) && /^\s*(?:\(?[HP]\d|Hypothesis|Proposition)/.test(p.text); STRONG.lastIndex = 0; return r; };

/** What precedes a declaration: theories and citations in its paragraph and up to two argument paragraphs before it. */
export function basis(doc, decl, theories = loadTheories()) {
  const idx = doc.paragraphs.indexOf(decl.paragraph);
  const used = [decl.paragraph];
  for (let i = idx - 1, n = 0; i >= 0 && n < 2; i--) {
    const p = doc.paragraphs[i];
    if (p.isRef || p.isTable || p.isHeading) continue;
    if (isHypPara(p)) { if (n === 0) continue; break; } // a list of hypotheses shares one argument; an earlier hypothesis ends the search
    used.unshift(p); n++;
  }
  const text = used.map(p => p.text).join(" ");
  const th = [...new Map(findTheories(text, theories).map(t => [t.id, t.name])).values()];
  const cites = [];
  const rx = new RegExp(CITE_ANY.source, "gu");
  for (const m of text.matchAll(rx)) cites.push(m[0]);
  return { theories: th, citations: [...new Set(cites)].slice(0, 6), paragraphs: used.map(p => p.id),
    kind: th.length && cites.length ? "theory and cited finding" : th.length ? "theory" : cites.length ? "cited finding" : "none" };
}

// label mentions in a sentence, ranges expanded
export function labelsIn(text) {
  const out = [];
  const push = (kind, a, b, idx) => { for (let k = a; k <= b && k - a < 20; k++) out.push({ label: kind + k, index: idx }); };
  const R = /(?<![\p{L}\d])(H|P)(\d{1,2})([a-z]?)\s*(?:[–-]|to)\s*(?:H|P)?(\d{1,2})(?![\p{L}\d])/gu;
  const taken = [];
  for (const m of text.matchAll(R)) { push(m[1], +m[2], +m[4], m.index); taken.push([m.index, m.index + m[0].length]); }
  const W = /\b(Hypothes[ie]s|Propositions?)\s+(\d{1,2}[a-z]?)((?:\s*(?:,|and|&|to|[–-])\s*\d{1,2}[a-z]?)*)/g;
  for (const m of text.matchAll(W)) {
    const kind = /^H/.test(m[1]) ? "H" : "P";
    if (/(to|[–-])/.test(m[3])) { const nums = (m[2] + m[3]).match(/\d+/g).map(Number); push(kind, nums[0], nums[nums.length - 1], m.index); }
    else for (const n of (m[2] + m[3]).match(/\d{1,2}[a-z]?/g)) out.push({ label: kind + n, index: m.index });
    taken.push([m.index, m.index + m[0].length]);
  }
  const S = /(?<![\p{L}\d])(H|P)(\d{1,2}[a-z]?)(?![\p{L}\d])/gu;
  for (const m of text.matchAll(S)) if (!taken.some(([a, b]) => m.index >= a && m.index < b)) out.push({ label: m[1] + m[2], index: m.index });
  return out;
}

const MIXED = /\b(partial(ly)?|mixed|partly|in part|some support|limited support|only (partly|partially))\b/i;
const NOT = /\b(not (supported|confirmed|accepted|upheld)|unsupported|no (support|evidence)|(?<!null (hypothesis )?(is |was )?)reject(ed|s)?\b(?! the null)|refut\w+|fail(s|ed)? to (support|confirm)|(does|do|did) not (support|confirm|hold)|not in line|inconsistent with|contrary to|not for)\b|\b(is|are|was|were) not(?=\s*[.;,)]|\s*$)/i;
const SUP = /\b(supported|support for|supports|confirm(ed|s)?|accepted|consistent with|in line with|corroborat\w+|upheld|holds)\b/i;
const CLAUSE = /;|\b(?:but|whereas|while|however|although)\b/i;

export function classify(clause) {
  if (MIXED.test(clause)) return "mixed";
  if (NOT.test(clause)) return "not supported";
  if (SUP.test(clause)) return "supported";
  return null;
}

/** Verdict for each label from the results, discussion and conclusion. */
export function verdicts(doc, labels) {
  const res = new Map(labels.map(l => [l, { label: l, verdict: "not found", mentioned: false, evidence: [] }]));
  for (const s of doc.sentencesIn(TEST_SECTIONS)) {
    const hits = labelsIn(s.text).filter(h => res.has(h.label)); if (!hits.length) continue;
    // clause boundaries
    const cuts = [0]; for (const m of s.text.matchAll(new RegExp(CLAUSE.source, "gi"))) cuts.push(m.index); cuts.push(s.text.length);
    const distinct = new Set(hits.map(h => h.label));
    for (const h of hits) {
      const r = res.get(h.label); r.mentioned = true;
      let a = 0, b = s.text.length; for (let k = 0; k < cuts.length - 1; k++) if (h.index >= cuts[k] && h.index < cuts[k + 1]) { a = cuts[k]; b = cuts[k + 1]; }
      let v = classify(s.text.slice(a, b));
      if (!v && /\bnot\s+(for\s+)?$/i.test(s.text.slice(a, h.index))) v = "not supported";
      if (!v && distinct.size === 1) v = classify(s.text);
      r.evidence.push({ verdict: v, sentence: s.text, section: s.section, start: s.start, end: s.end });
    }
  }
  for (const r of res.values()) {
    const vs = new Set(r.evidence.map(e => e.verdict).filter(Boolean));
    r.verdict = !vs.size ? "not found" : vs.has("mixed") || (vs.has("supported") && vs.has("not supported")) ? "mixed" : [...vs][0];
  }
  return [...res.values()];
}

/** Full map: declarations, basis and verdicts. */
export function hypothesisMap(doc, theories = loadTheories()) {
  const decls = declarations(doc);
  const vs = new Map(verdicts(doc, decls.map(d => d.label)).map(v => [v.label, v]));
  return decls.map(d => ({ label: d.label, kind: d.kind, statement: d.statement, section: d.section, span: { section: d.section, start: d.start, end: d.end, text: doc.text.slice(d.start, d.end) },
    basis: basis(doc, d, theories), result: vs.get(d.label) }));
}

export default { declarations, basis, labelsIn, classify, verdicts, hypothesisMap, CITE_ANY };
