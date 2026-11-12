// AI-style signal: a transparent score of surface patterns that are common in unedited LLM prose.
// It measures style, not authorship. Human authors trigger it too, and edited AI text passes it.
//
// Formula (documented in docs/AI-STYLE.md):
//   For each feature f with rate x_f (per 1,000 words, except sentence-length CV):
//     z_f = (x_f - mu_f) / sd_f            (for CV: z = (mu - x) / sd, because uniform sentence length is the signal)
//     s_f = min(max(z_f, 0), 3) / 3        (0 = at or below the typical published rate, 1 = three SDs above)
//   score = 100 * sum(w_f * s_f) / sum(w_f)
//   bands: < 25 low, 25-45 moderate, > 45 high; paragraph hotspots > 60 (v1.1, from the 2026 benchmark)
// mu and sd are reference values for edited business and economics journal prose (v1, set by hand from the
// measured Q1 abstracts and the corpus; recalibrated by scripts/benchmark.js on labelled samples).
const L = require("./lib.js");
const C = L.Core;

const STOCK = ["delve", "delves", "delving", "crucial", "pivotal", "landscape", "underscore", "underscores", "showcase", "showcases", "tapestry", "testament", "multifaceted", "notably", "comprehensive", "leverage", "leverages", "leveraging", "foster", "fosters", "fostering", "navigate", "navigating", "realm", "holistic", "seamless", "seamlessly", "meticulous", "meticulously", "vibrant", "interplay", "nuanced", "paramount", "intricate", "intricacies", "robust framework", "shed light", "sheds light", "in today's", "ever-evolving", "it is important to note", "it is worth noting", "plays a crucial role", "plays a pivotal role", "a key role", "in the realm of", "serves as a", "valuable insights", "deeper understanding", "unlock", "unlocks", "harness", "harnessing", "embark", "elevate", "garner", "garnered", "bolster", "bolstered"];
const OPENERS = /^(Moreover|Furthermore|Additionally|Notably|Importantly|Crucially|Ultimately|Overall|In conclusion|In summary|In essence|Interestingly|Significantly|Consequently)\b,?/;
const FEATURES = {
  stock:   { mu: 1.0, sd: 1.5, w: 2, label: "Stock AI words and phrases per 1,000 words" },
  dashes:  { mu: 0.5, sd: 1.0, w: 1, label: "Em dashes or spaced dashes per 1,000 words" },
  notBut:  { mu: 0.3, sd: 0.5, w: 2, label: "'Not X but Y' / 'not only ... but also' contrasts per 1,000 words" },
  triads:  { mu: 4.0, sd: 2.5, w: 1, label: "Three-item lists ('X, Y, and Z') per 1,000 words" },
  openers: { mu: 1.5, sd: 1.5, w: 1.5, label: "Staged sentence openers (Moreover, Furthermore, Notably ...) per 1,000 words" },
  closers: { mu: 0.3, sd: 0.6, w: 1, label: "Summary closers ('This highlights ...', 'This underscores ...') per 1,000 words" },
  cv:      { mu: 0.42, sd: 0.12, w: 1.5, reverse: true, label: "Sentence-length variation (coefficient of variation; low = uniform)" },
};
// deterministic, meaning-neutral substitutions (each is checked by verify_rewrite before use)
const FIX = [
  [/\bdelve(s)? into\b/gi, (m, s) => s ? "examines" : "examine"], [/\bdelving into\b/gi, "examining"],
  [/\b(it is (important|worth) (to note|noting) that)\s*/gi, ""], [/\bplays a (crucial|pivotal|key|vital) role in\b/gi, "affects"],
  [/\b(a|A) crucial\b/g, (m, a) => a + "n important"], [/\bcrucial\b/gi, "important"], [/\bpivotal\b/gi, "central"], [/\bparamount\b/gi, "essential"],
  [/\bleverag(e|es|ing)\b/gi, (m, e) => ({ e: "use", es: "uses", ing: "using" })[e.toLowerCase()]],
  [/\bfoster(s|ing)?\b/gi, (m, e) => "support" + (e ? (e.toLowerCase() === "s" ? "s" : "ing") : "")],
  [/\bshed(s)? light on\b/gi, (m, s) => s ? "clarifies" : "clarify"], [/\bunderscore(s)?\b/gi, (m, s) => s ? "shows" : "show"],
  [/\bshowcase(s)?\b/gi, (m, s) => s ? "shows" : "show"], [/\bmultifaceted\b/gi, "complex"], [/\bholistic\b/gi, "overall"],
  [/\bmeticulous(ly)?\b/gi, (m, l) => l ? "carefully" : "careful"], [/\bseamless(ly)?\b/gi, (m, l) => l ? "smoothly" : "smooth"],
  [/\bin the realm of\b/gi, "in"], [/\bthe landscape of\b/gi, ""], [/\bnavigat(e|ing)\b/gi, (m, e) => e === "e" ? "manage" : "managing"],
  [/\bvaluable insights\b/gi, "evidence"], [/\bgarner(ed)?\b/gi, (m, e) => e ? "received" : "receive"], [/\bbolster(ed)?\b/gi, (m, e) => e ? "strengthened" : "strengthen"],
  [/^(Moreover|Furthermore|Additionally),\s*/, "Also, "], [/^(Notably|Importantly|Crucially|Interestingly),\s*/, ""],
  [/\s+—\s+|\s+–\s+|\s+--\s+|—/g, ", "],
];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function sentences(t) { return String(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map(s => s.trim()).filter(s => s.split(" ").length >= 4); }
function body(text) {
  const d = L.parse(text);
  return d.paras.filter(p => !p.isHeading && !p.isRef && !p.isTable && !["references", "declarations"].includes(d.roleOf(p.id))).map(p => p.text).join("\n\n");
}
function measure(text) {
  const t = body(text), prose = t.replace(/\([^()]*(?:19|20)\d{2}[a-z]?[^()]*\)/g, " "), low = " " + prose.toLowerCase() + " ";
  const w = Math.max(C.words(prose).length, 1), k = 1000 / w, S = sentences(prose);
  const stockHits = []; STOCK.forEach(p => { const re = new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"); const n = (low.match(re) || []).length; if (n) stockHits.push([p, n]); });
  const n = {
    stock: stockHits.reduce((a, b) => a + b[1], 0),
    dashes: (prose.match(/—|\s–\s|\s--\s/g) || []).length,
    notBut: (prose.match(/\bnot (only|just|merely|simply)\b[^.;]{1,120}\bbut\b|\bnot\b[^.;,]{1,60},\s*but\b|\bis not (about )?[^.;]{1,60}\.\s+It is\b/gi) || []).length,
    triads: (prose.match(/\b[\p{L}-]+(?: [\p{L}-]+){0,2}, [\p{L}-]+(?: [\p{L}-]+){0,2},? and [\p{L}-]+/gu) || []).length,
    openers: S.filter(s => OPENERS.test(s)).length,
    closers: S.filter(s => /^(This|These|Such|Together, these)\b[^.]{0,40}\b(highlights?|underscores?|demonstrates?|illustrates?|shows?|reflects?|emphasi[sz]es?)\b[^.]{0,40}\b(importance|need|value|role|potential|significance)\b/i.test(s)).length,
  };
  const L2 = S.map(s => s.split(/\s+/).length), mean = L2.reduce((a, b) => a + b, 0) / Math.max(L2.length, 1), sd = Math.sqrt(L2.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(L2.length - 1, 1));
  const rates = Object.fromEntries(Object.entries(n).map(([f, v]) => [f, +(v * k).toFixed(2)])); rates.cv = +(mean ? sd / mean : 0).toFixed(3);
  return { words: w, sentences: S.length, counts: n, rates, stockHits: stockHits.sort((a, b) => b[1] - a[1]).slice(0, 15), meanSentence: +mean.toFixed(1) };
}
function score(rates) {
  let num = 0, den = 0; const parts = {};
  for (const [f, p] of Object.entries(FEATURES)) { const x = rates[f], z = p.reverse ? (p.mu - x) / p.sd : (x - p.mu) / p.sd, s = Math.min(Math.max(z, 0), 3) / 3; parts[f] = { value: x, typical: p.mu, z: +z.toFixed(2), contribution: +s.toFixed(3), weight: p.w, label: p.label }; num += p.w * s; den += p.w; }
  const sc = Math.round(100 * num / den); return { score: sc, band: sc < 25 ? "low" : sc <= 45 ? "moderate" : "high", parts };
}
function fixSentence(s) { let out = s; for (const [re, rep] of FIX) out = out.replace(re, rep); out = out.replace(/\s{2,}/g, " ").replace(/\s+([,;:])/g, "$1").replace(/\s+\.(?=\s|$)/g, ".").replace(/,\s*,/g, ","); return out !== s ? cap(out.trim()) : null; }
function check(text, { maxFixes = 200 } = {}) {
  const m = measure(text), sc = score(m.rates), t = body(text), edits = [];
  for (const para of t.split(/\n\n/)) for (const s of sentences(para)) { if (edits.length >= maxFixes) break; const f = fixSentence(s); if (!f) continue; const v = L.verify(s, f); if (v.pass) edits.push({ quote: s, replacement: f }); }
  const after = score(measure(L.applyReplacements(text, edits).text).rates);
  // paragraph hotspots: a generic passage is diluted in a long paper, so score paragraphs of 60+ words separately
  const hotspots = t.split(/\n\n/).filter(p => p.split(/\s+/).length >= 60).map(p => ({ score: score(measure(p).rates).score, start: p.slice(0, 160) })).filter(h => h.score > 60).sort((a, b) => b.score - a.score).slice(0, 10);
  return { kind: "ai_style", score: sc.score, band: sc.band, scoreAfterFixes: after.score, hotspots, features: sc.parts, stockWords: m.stockHits, words: m.words, sentences: m.sentences, meanSentenceLength: m.meanSentence,
    replacements: edits, formula: "score = 100 × Σ w·min(max(z,0),3)/3 ÷ Σ w, with z = (rate − typical) / sd per feature (sentence-length CV reversed). Bands: <25 low, 25–45 moderate, >45 high; paragraphs above 60 are hotspots.",
    note: "A style signal, not proof of authorship. No tool can tell reliably whether a person or an AI wrote a text; human prose can score high and edited AI prose low. Use the score to find passages that read as generic, then fix them. Pass the replacements you accept to apply_replacements: each already passed verify_rewrite." };
}
module.exports = { check, measure, score, FEATURES, fixSentence };
