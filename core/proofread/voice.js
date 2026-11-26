// Author voice profile from the author's own approved papers: sentence-length distribution, person and voice,
// preferred verbs, paragraph openings and frequent terms. Numbers only, plus the author's own frequent words; no
// sentence of the samples is stored. Deterministic: the same samples always give the same profile.
import crypto from "node:crypto";
import { parseText } from "../text/parse.js";

const STOP = new Set("the a an of to in and or for on with by as at from that this these those is are was were be been being it its their our we they which who whom whose than then there here not no can may might could would should will shall do does did has have had also such into over under between within about more most less least very only both each other".split(" "));
const VERBS = /\b(show|find|argue|estimate|test|examine|use|measure|compare|propose|suggest|indicate|document|identify|report|observe|analy[sz]e|explain|link|bound|model|study|investigate|demonstrate|reveal|confirm|contribute|extend|address|focus|assess|evaluate|explore|develop)(s|ed|ing)?\b/gi;
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return +(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)).toFixed(2); };
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([k, v]) => ({ term: k, n: v }));

export function voiceProfile(texts) {
  const lens = [], openings = new Map(), verbs = new Map(), bigrams = new Map(); let we = 0, i = 0, passive = 0, sents = 0, paras = 0;
  for (const t of texts) {
    const d = parseText(t);
    for (const p of d.paragraphs.filter(p => !p.isHeading && !p.isRef && !p.isTable && p.section !== "references")) {
      paras++; const w = p.text.split(/\s+/).slice(0, 2).join(" ").replace(/[^\p{L}\s'-]/gu, "").toLowerCase(); if (w) openings.set(w, (openings.get(w) || 0) + 1);
    }
    for (const s of d.sentences.filter(s => s.section !== "references")) {
      const words = s.text.split(/\s+/).filter(Boolean); if (words.length < 3) continue;
      sents++; lens.push(words.length);
      if (/\bwe\b|\bour\b/i.test(s.text)) we++; if (/\bI\b|\bmy\b/.test(s.text)) i++;
      if (/\b(is|are|was|were|be|been|being)\s+(\w+ly\s+)?\w+(ed|en)\b/i.test(s.text)) passive++;
      for (const m of s.text.matchAll(VERBS)) { const v = m[1].toLowerCase(); verbs.set(v, (verbs.get(v) || 0) + 1); }
      const toks = s.text.toLowerCase().match(/\p{L}[\p{L}-]+/gu) || [];
      for (let k = 0; k + 1 < toks.length; k++) if (!STOP.has(toks[k]) && !STOP.has(toks[k + 1])) { const b = toks[k] + " " + toks[k + 1]; bigrams.set(b, (bigrams.get(b) || 0) + 1); }
    }
  }
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : null;
  const sd = lens.length > 1 ? Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length - 1)) : null;
  return {
    kind: "voice_profile", samples: texts.length, paragraphs: paras, sentences: sents,
    sentence_length: { mean: mean && +mean.toFixed(2), sd: sd && +sd.toFixed(2), p10: q(lens, .1), p25: q(lens, .25), median: q(lens, .5), p75: q(lens, .75), p90: q(lens, .9) },
    person: { we_share: sents ? +(we / sents).toFixed(3) : null, i_share: sents ? +(i / sents).toFixed(3) : null },
    passive_share: sents ? +(passive / sents).toFixed(3) : null,
    preferred_verbs: top(verbs, 12), paragraph_openings: top(openings, 12), terms: top(new Map([...bigrams].filter(([, v]) => v >= 2)), 25),
    fingerprint: crypto.createHash("sha256").update(texts.join("\u0000")).digest("hex").slice(0, 16),
    note: "Measured from your own approved papers. Only counts and your own frequent words are kept; no sentence of the samples is stored.",
  };
}

/** Shingles of n words, for the check that a revision copies no wording from the voice samples. */
export function shingles(text, n = 8) {
  const w = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean), out = new Set();
  for (let k = 0; k + n <= w.length; k++) out.add(w.slice(k, k + n).join(" "));
  return out;
}

export default { voiceProfile, shingles };
