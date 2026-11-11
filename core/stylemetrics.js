// Style measurements for an abstract (or any passage). Shared by the profile builder and the comparison tool.
// Stores numbers and labels only: no text from the source papers is kept.
const HEDGE = /\b(may|might|could|suggests?|appears?|seems?|likely|possibly|potentially|consistent with|is associated with|are associated with|tend(s)? to|indicat(e|es|ing))\b/gi;
const CAUSAL = /\b(causes?|caused|leads? to|led to|drives?|driven by|results? in|determines?|impacts? on|effect of)\b/gi;
const STOCK = /\b(delve|crucial|pivotal|landscape|underscores?|showcases?|tapestry|testament|multifaceted|notably|furthermore|moreover|additionally|comprehensive|leverage|foster|navigate|realm|holistic|seamless|meticulous|vibrant|interplay|nuanced|paramount)\b/gi;
const MOVES = [
  ["finding", /\b(we (find|show|document|demonstrate|observe)|(results?|findings|evidence|estimates|analysis) (show|shows|suggest|suggests|indicate|indicates|reveal|reveals|confirm|confirms)|is (positively|negatively) (associated|related)|significant(ly)?|we report)\b/i],
  ["gap", /\b(little|limited|scarce|lack of|remains? (unclear|unknown|open|unexplored)|gap|understudied|overlooked|has (not|rarely) been|few studies|however,? (prior|existing|the literature|research))\b/i],
  ["method", /\b(using|we use|we employ|we estimate|data (from|on)|sample of|panel|survey of|difference-in-differences|instrumental|natural experiment|regression|interviews?|case stud(y|ies)|meta-analysis|simulation|we model|model)\b/i],
  ["aim", /\b(this (paper|study|article|research)|we (examine|investigate|study|analy[sz]e|explore|ask|develop|propose|test))\b/i],
  ["implication", /\b(implications?|contribut\w+|policy ?makers?|managers|practitioners|regulators|inform\w*|important for)\b/i]
];
const PRIMARY = ["implication", "finding", "gap", "method", "aim"];
const STRICT_IMPL = /\b(implications?|policy ?makers?|managers|practitioners|regulators)\b/i;
const sentencesOf = t => String(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 3);
const wordsOf = t => String(t).match(/[\p{L}\p{N}'’-]+/gu) || [];
const labels = s => MOVES.filter(([, re]) => re.test(s)).map(([k]) => k);
const move = s => { const L = labels(s); if (!L.length) return "background"; if (L.includes("implication") && STRICT_IMPL.test(s)) return "implication"; return PRIMARY.slice(1).find(k => L.includes(k)) || L[0]; };
function measure(text) {
  const S = sentencesOf(text), W = wordsOf(text), n = Math.max(W.length, 1);
  const lens = S.map(s => wordsOf(s).length), mean = lens.reduce((a, b) => a + b, 0) / Math.max(lens.length, 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lens.length, 1));
  const cnt = re => (String(text).match(re) || []).length;
  const nums = (String(text).match(/\b\d[\d,.]*%?/g) || []).filter(x => !/^(19|20)\d{2}$/.test(x)).length;
  const moves = S.map(move), present = [...new Set(S.flatMap(labels).concat(moves))];
  return {
    words: W.length, sentences: S.length, meanSentence: +mean.toFixed(1), sdSentence: +sd.toFixed(1),
    longSentenceShare: +(lens.filter(l => l > 35).length / Math.max(lens.length, 1)).toFixed(3),
    weShare: +(S.filter(s => /\b(we|our)\b/i.test(s)).length / Math.max(S.length, 1)).toFixed(3),
    passiveShare: +(S.filter(s => /\b(is|are|was|were|been|be|being)\s+(\w+ly\s+)?\w+(ed|en)\b/i.test(s)).length / Math.max(S.length, 1)).toFixed(3),
    hedgesPer100: +(100 * cnt(HEDGE) / n).toFixed(2), causalPer100: +(100 * cnt(CAUSAL) / n).toFixed(2), stockPer1k: +(1000 * cnt(STOCK) / n).toFixed(2),
    numbers: nums, dataClause: /\b\d[\d,]*\s+(?:[a-z-]+\s+){0,2}(firms|companies|enterprises|establishments|smes|observations|respondents|countries|banks|households|firm-years|employees|managers|cases)\b|\bn\s*=\s*\d/i.test(text) ? 1 : 0,
    firstMove: moves[0] || "none", lastMove: moves[moves.length - 1] || "none", moveSequence: moves.join(">"), moves: present
  };
}
const METRICS = ["words", "sentences", "meanSentence", "sdSentence", "longSentenceShare", "weShare", "passiveShare", "hedgesPer100", "causalPer100", "stockPer1k", "numbers"];
const LABEL = { words: "Abstract length (words)", sentences: "Sentences", meanSentence: "Mean sentence length", sdSentence: "Sentence-length variety", longSentenceShare: "Share of sentences over 35 words", weShare: "Sentences in active 'we' voice", passiveShare: "Passive sentences", hedgesPer100: "Hedges per 100 words", causalPer100: "Causal verbs per 100 words", stockPer1k: "AI-style stock words per 1,000", numbers: "Numbers reported" };
const FIX = {
  words: ["Shorten the abstract to the profile range; cut background sentences first.", "Add the missing elements (data, main number, implication) rather than padding."],
  meanSentence: ["Split long sentences; Q1 abstracts average shorter sentences.", "Combine very short sentences that repeat one idea."],
  longSentenceShare: ["Split sentences over 35 words.", ""], weShare: ["State what you did and found in active voice ('We find...').", "Vary the subject; not every sentence needs 'we'."],
  passiveShare: ["Replace passive constructions with active ones where the actor matters.", ""], hedgesPer100: ["Remove hedges the design does not require.", "Hedge claims the design cannot support."],
  causalPer100: ["Check causal verbs: use 'is associated with' unless the design identifies causation.", ""], stockPer1k: ["Remove stock words (crucial, notably, moreover...).", ""],
  numbers: ["Report one or two key numbers from the results.", "Keep only the one or two numbers that carry the finding."], sentences: ["Reduce the number of sentences.", "Develop the abstract to the usual structure."], sdSentence: ["", "Vary sentence length a little more."]
};
function quantile(a, q) { const s = a.slice().sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(3); }
function summarise(rows) {
  const m = {}; METRICS.forEach(k => { const v = rows.map(r => r[k]).filter(x => typeof x === "number"); m[k] = { p25: quantile(v, 0.25), median: quantile(v, 0.5), p75: quantile(v, 0.75) }; });
  const share = f => +(rows.filter(f).length / Math.max(rows.length, 1)).toFixed(3);
  const dist = key => { const c = {}; rows.forEach(r => c[r[key]] = (c[r[key]] || 0) + 1); return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / rows.length).toFixed(3)])); };
  const movePresence = {}; ["background", "gap", "aim", "method", "finding", "implication"].forEach(mv => movePresence[mv] = share(r => r.moves.includes(mv)));
  return { n: rows.length, metrics: m, dataClauseShare: share(r => r.dataClause), firstMove: dist("firstMove"), lastMove: dist("lastMove"), movePresence };
}
function compare(text, profile) {
  const x = measure(text), gaps = [];
  METRICS.forEach(k => { const p = profile.metrics[k]; if (!p || p.p25 === null) return; const v = x[k]; if (v < p.p25) gaps.push({ metric: k, label: LABEL[k], value: v, p25: p.p25, median: p.median, p75: p.p75, side: "below", fix: FIX[k] ? FIX[k][1] || FIX[k][0] : "" }); else if (v > p.p75) gaps.push({ metric: k, label: LABEL[k], value: v, p25: p.p25, median: p.median, p75: p.p75, side: "above", fix: FIX[k] ? FIX[k][0] : "" }); });
  const iqr = k => Math.max((profile.metrics[k].p75 - profile.metrics[k].p25) || 1e-9, 1e-9);
  gaps.forEach(g => g.size = +(Math.abs(g.value - g.median) / iqr(g.metric)).toFixed(2));
  gaps.sort((a, b) => b.size - a.size);
  const moveNotes = [];
  if (profile.movePresence.finding > 0.6 && !x.moves.includes("finding")) moveNotes.push(`${Math.round(profile.movePresence.finding * 100)}% of profile abstracts state a finding; this one does not.`);
  if (profile.movePresence.method > 0.6 && !x.moves.includes("method")) moveNotes.push(`${Math.round(profile.movePresence.method * 100)}% of profile abstracts name the data or method; this one does not.`);
  if (profile.dataClauseShare > 0.4 && !x.dataClause) moveNotes.push(`${Math.round(profile.dataClauseShare * 100)}% of profile abstracts give the sample size in one clause; this one does not.`);
  const topFirst = Object.keys(profile.firstMove)[0]; if (topFirst && x.firstMove === "background" && topFirst !== "background") moveNotes.push(`This abstract opens with background; the most common opening in the profile is "${topFirst}" (${Math.round(profile.firstMove[topFirst] * 100)}%).`);
  const outside = gaps.length / METRICS.length;
  return { measured: x, distance: +(100 * outside).toFixed(0), withinProfile: METRICS.length - gaps.length, metricsChecked: METRICS.length, largestGaps: gaps.slice(0, 3), allGaps: gaps, moveNotes, profileN: profile.n,
    note: "Distance = share of measures outside the middle 50% of the Q1 profile. It describes style, not quality, and cannot fix a weak contribution." };
}
module.exports = { measure, summarise, compare, METRICS, LABEL };
