// Structural tests for the finance rules (rulebook/finance.yaml, Phase 2). The regular expressions live in the
// YAML; these functions only say how they are used. Arguments after `where` are joined back with commas, so a
// regex may contain commas. Two regexes in one argument are separated by " &&& " (trigger &&& required).
import { isNegated } from "../../text/negation.js";

const keysOf = where => String(where || "all").split("|").map(s => s.trim()).filter(Boolean);
function sentencesOf(doc, where) {
  const ks = keysOf(where);
  return ks.includes("all") ? doc.sentences : doc.sentences.filter(s => ks.includes(s.section));
}
function headingsOf(doc, where) {
  const ks = keysOf(where);
  return doc.paragraphs.filter(p => p.isHeading && (ks.includes("all") || ks.includes(p.section))).map(p => ({ text: p.text, section: p.section, start: p.start, end: p.end }));
}
/** First sentence that matches `re` and is not negated (negation scope of specification 3.2). */
export function findEvidence(doc, where, re, { negationAware = true, headings = true } = {}) {
  const rx = new RegExp(re, "gi");
  const pool = [...sentencesOf(doc, where), ...(headings ? headingsOf(doc, where) : [])];
  for (const s of pool) for (const m of s.text.matchAll(rx)) if (!negationAware || !isNegated(s.text, m.index)) return { sentence: s, match: m[0] };
  return null;
}
// An absence finding is anchored on the first sentence of the methods section, or of the paper.
const anchorOf = doc => doc.sentencesIn("methods")[0] || doc.sentences[0] || null;
const split2 = args => { const [a, b] = args.join(",").split(/\s*&&&\s*/); return [a, b]; };

export default {
  /** ok when a non-negated mention of the regex exists in `where` (sentences and headings). */
  fin_evidence: (doc, where, ...re) => {
    const hit = findEvidence(doc, where, re.join(","));
    return { ok: !!hit, anchor: anchorOf(doc), detail: hit ? { evidence: hit.match } : { evidence: null, searched: where } };
  },
  /** ok when the trigger is absent, or when the required evidence is also present (both negation-aware). */
  fin_evidence_if: (doc, where, ...args) => {
    const [trig, req] = split2(args);
    const t = findEvidence(doc, where, trig);
    if (!t) return { ok: true, detail: { trigger: null } };
    const hit = findEvidence(doc, where, req);
    return { ok: !!hit, anchor: t.sentence.start != null && t.sentence.id ? t.sentence : anchorOf(doc), detail: { trigger: t.match, evidence: hit ? hit.match : null } };
  },
  /** Like fin_evidence_if, but any mention of the required words counts, even a negated one ("no outliers"). */
  fin_mention_if: (doc, where, ...args) => {
    const [trig, req] = split2(args);
    const t = findEvidence(doc, where, trig);
    if (!t) return { ok: true, detail: { trigger: null } };
    const hit = findEvidence(doc, where, req, { negationAware: false });
    return { ok: !!hit, anchor: anchorOf(doc), detail: { trigger: t.match, evidence: hit ? hit.match : null } };
  },
  /** ok when the text reports at most `max` p-values, or names a correction for multiple testing. */
  fin_tests_without: (doc, where, max, ...re) => {
    const n = sentencesOf(doc, where).reduce((k, s) => k + (s.text.match(/(?<![\w.])p\s*(?:<=|>=|=|<|>|≤|≥)\s*(?:\d?\.\d+|0|1)\b/g) || []).length, 0);
    if (n <= Number(max)) return { ok: true, detail: { pValues: n } };
    const hit = findEvidence(doc, "all", re.join(","));
    return { ok: !!hit, anchor: anchorOf(doc), detail: { pValues: n, correction: hit ? hit.match : null } };
  },
};
