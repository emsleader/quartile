// Structural tests for the editor-in-chief rules EIC-05 (title) and EIC-06 (problem, gap, aim) in rulebook/eic.yaml.
// Each test returns { ok, anchor, detail }. When the element cannot be found (no title line, no introduction
// section), the test returns ok: true, because the rule cannot judge (false positives are worse than misses).
import { isNegated } from "../../text/negation.js";

const CANON_HEAD = new Set(["abstract", "introduction", "literature", "methods", "results", "discussion", "implications", "limitations", "conclusion", "disclosure", "ethics", "data_avail", "references", "funding"]);

/** The title: the first paragraph, when it is short and is not a section heading such as "Abstract". */
export function titleOf(doc) {
  const p = doc.paragraphs[0]; if (!p) return null;
  if (p.isHeading && CANON_HEAD.has(p.section) && doc.sections.some(s => s.paraStart === 0)) return null;
  const text = p.text.replace(/^#+\s*/, "").replace(/^title\s*:\s*/i, "").replace(/[*_]+/g, "").trim();
  const n = text.split(/\s+/).filter(Boolean).length;
  // a title has no final full stop and is followed by detected sections
  if (!n || n > 40 || /[.;:,]$/.test(text) || !doc.sections.some(s => s.paraStart > 0)) return null;
  return { text, words: n, anchor: { section: "title", start: p.start, end: p.end, text: p.text } };
}

// Abbreviations most business and economics readers know; listed, not inferred.
export const KNOWN_ABBR = new Set(["GDP", "EU", "US", "USA", "UK", "UN", "OECD", "IMF", "COVID-19", "COVID", "CEO", "CEOS", "CFO", "R&D", "IPO", "IPOS", "ESG", "CSR", "AI", "IT", "ICT", "FDI", "SME", "SMES", "M&A", "B2B", "B2C", "HR", "IFRS", "GAAP", "NGO", "NGOS", "STEM"]);
const QUESTION = /\?\s*$|^(how|why|what|when|where|which|who|whom|whose|does|do|did|is|are|was|were|can|could|should|will|would|has|have)\b/i;
const FINDING_VERB = /\b(increases?|reduces?|lowers?|raises?|shapes?|drives?|predicts?|explains?|affects?|improves?|matters?|delays?|shortens?|lengthens?|boosts?|hurts?|harms?|slows?|speeds? up|limits?|enables?|undermines?|outperforms?|pays? off|fails?|helps?|leads? to|causes?|depends? on|determines?|weakens?|strengthens?|amplif(y|ies)|mitigates?|moderates?|mediates?|crowds? out|signals?|reveals?|is|are|was|were|do(es)? not|did not|cannot|makes?|keeps?|turns?|costs?|protects?|buffers?|accelerates?|deters?|hinders?|spurs?|fuels?|erodes?)\b/i;

// Words that are often plural nouns in titles ("Opening Delays: Evidence ..."): read as verbs only when a word
// follows in the same clause and the word before is not a preposition, article or "and".
const AMBIG = /^(delays|limits|costs|signals|buffers|turns|keeps|makes|helps|matters|harms|hurts|cuts|slows|fails|drives|shapes|causes|raises|increases|leads|fuels|spurs|moderates|affects|lowers|boosts|explains|predicts|reveals|determines)$/i;
const NOT_BEFORE = /^(and|or|of|the|on|in|for|with|to|a|an|their|its|from|by|at|as)$/i;
function hasFindingVerb(title) {
  const toks = title.split(/\s+/);
  return toks.some((w, i) => {
    const bare = w.replace(/[^A-Za-z-]/g, "");
    if (!FINDING_VERB.test(bare + (/^(speed|speeds|pay|pays|lead|leads|crowd|crowds|depend|depends)$/i.test(bare) ? " " + (toks[i + 1] || "").replace(/[^A-Za-z]/g, "") : "")) && !(/^(do|does|did)$/i.test(bare) && /^not$/i.test(toks[i + 1] || ""))) return false;
    if (!AMBIG.test(bare)) return true;
    return i > 0 && i + 1 < toks.length && !/[:;,.?!]$/.test(w) && !NOT_BEFORE.test(toks[i - 1].replace(/[^A-Za-z]/g, ""));
  });
}

function abbreviations(title) {
  const letters = title.match(/\b[A-Za-z][A-Za-z]+\b/g) || [];
  if (letters.length && letters.filter(w => w === w.toUpperCase()).length / letters.length > 0.5) return []; // all-caps title
  const found = [...title.matchAll(/(?<![\w-])([A-Z][A-Z0-9&]*(?:-[A-Z0-9&]+)*[A-Z0-9&]s?)(?![\w-])/g)].map(m => m[1]).filter(a => (a.match(/[A-Z]/g) || []).length >= 2);
  return [...new Set(found)].filter(a => !KNOWN_ABBR.has(a.toUpperCase()) && !new RegExp("\\(\\s*" + a.replace(/[&]/g, "\\&") + "\\s*\\)").test(title) && !new RegExp(a.replace(/[&]/g, "\\&") + "\\s*\\([^)]{6,}\\)").test(title));
}

const intro = doc => doc.paragraphs.filter(p => !p.isHeading && !p.isTable && p.section === "introduction");
const sentsOf = (doc, paras) => { const ids = new Set(paras.map(p => p.id)); return doc.sentences.filter(s => ids.has(s.paragraph)); };
const CITE_NEAR = /\(([^()]*?[A-Z][^()]*?)(19|20)\d{2}[a-z]?[^()]*\)|\b[A-Z][A-Za-z'’-]+(\s+(et al\.|and|&)\s*([A-Z][A-Za-z'’-]+)?)?\s+\((19|20)\d{2}[a-z]?\)|\[\d+([,–-]\s*\d+)*\]/;
export const GAP = /\b(little is known|less is known|few (studies|papers|scholars)|(remains?|is|are) (unclear|unknown|unexplored|understudied|under-?researched|poorly understood|open)|(has|have) (not|rarely|seldom|yet to) (been )?(examined|studied|addressed|investigated|considered|tested|explored|measured)|(do|does|did) not (examine|address|consider|study|test|measure|explain|account for|look at)|lack(s|ing)? (of )?(evidence|research|studies|empirical)|(research|literature|knowledge) gap|\bgap in\b|overlooked|neglected|under-?(researched|studied|explored)|scarce|limited (evidence|research|attention|knowledge)|silent on|no (prior |previous )?stud(y|ies))\b/i;
export const AIM = /\b(this (paper|study|article|research|work) (aims|seeks|sets out|examines|investigates|asks|studies|addresses|tests|estimates|explores|analy[sz]es|develops|proposes)|the (aim|purpose|objective|goal) of this (paper|study|article|research)|(we|i) (aim|ask|examine|investigate|study|test|address|estimate|explore|analy[sz]e|seek)\b|in this (paper|study|article),? (we|i) )/i;

export default {
  /** EIC-05: the title has at most `max` words. */
  eic_title_length(doc, max = 20) {
    const t = titleOf(doc); if (!t) return { ok: true, detail: { title: null, skipped: "no title line found" } };
    return { ok: t.words <= Number(max), anchor: t.anchor, detail: { title: t.text, words: t.words, max: Number(max) } };
  },
  /** EIC-05: the title states a finding (a verb) or asks a question. */
  eic_title_finding_or_question(doc) {
    const t = titleOf(doc); if (!t) return { ok: true, detail: { title: null, skipped: "no title line found" } };
    const q = QUESTION.test(t.text), f = hasFindingVerb(t.text);
    return { ok: q || f, anchor: t.anchor, detail: { title: t.text, question: q, finding_verb: f } };
  },
  /** EIC-05: every abbreviation in the title is explained in the title or widely known. */
  eic_title_abbreviations(doc) {
    const t = titleOf(doc); if (!t) return { ok: true, detail: { title: null, skipped: "no title line found" } };
    const a = abbreviations(t.text);
    return { ok: !a.length, anchor: t.anchor, detail: { title: t.text, unexplained: a } };
  },
  /** EIC-06 (a): the first n paragraphs of the introduction give the problem with a number or a citation. */
  eic_intro_problem_evidence(doc, n = 3) {
    const ps = intro(doc); if (!ps.length) return { ok: true, detail: { skipped: "no introduction section" } };
    const ss = sentsOf(doc, ps.slice(0, Number(n)));
    const ids = new Set(ss.map(s => s.id));
    const cite = doc.citations.inText.some(c => ids.has(c.sentence)) || ss.some(s => CITE_NEAR.test(s.text));
    const num = doc.numbers.some(x => ids.has(x.sentence));
    return { ok: cite || num, anchor: ss[0] || null, detail: { paragraphs: Math.min(ps.length, Number(n)), citation: cite, number: num } };
  },
  /** EIC-06 (b): a gap sentence in the introduction names specific studies (a citation in it or next to it). */
  eic_intro_gap_names_studies(doc) {
    const ps = intro(doc); if (!ps.length) return { ok: true, detail: { skipped: "no introduction section" } };
    const gaps = sentsOf(doc, ps).filter(s => GAP.test(s.text));
    // the gap sentence, or the sentence just before or after it in the same paragraph, cites a study
    const near = s => { const i = doc.sentences.indexOf(s); return doc.sentences.slice(Math.max(0, i - 1), i + 2).filter(x => x.paragraph === s.paragraph).map(x => x.text).join(" "); };
    const named = gaps.filter(s => CITE_NEAR.test(near(s)));
    return { ok: named.length > 0, anchor: gaps[0] || sentsOf(doc, ps)[0] || null,
      detail: { gap_sentences: gaps.length, gap_sentences_with_citation: named.length, reason: gaps.length ? "the gap sentences cite no specific study" : "no gap sentence found" } };
  },
  /** EIC-06 (c): the introduction has an explicit aim sentence (not negated). */
  eic_intro_aim_sentence(doc) {
    const ps = intro(doc); if (!ps.length) return { ok: true, detail: { skipped: "no introduction section" } };
    const ss = sentsOf(doc, ps);
    const aims = ss.filter(s => { const m = s.text.match(AIM); return m && !isNegated(s.text, m.index); });
    return { ok: aims.length > 0, anchor: ss[0] || null, detail: { aim_sentences: aims.length } };
  },
};
