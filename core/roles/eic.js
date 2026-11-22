// Role module: editor-in-chief (specification Section 5).
// Code checks that need data from outside the text: EIC-01 contribution test, EIC-02 "first / novel" claims,
// EIC-03 scope fit, EIC-04 format limits. EIC-05 (title) and EIC-06 (problem, gap, aim) are text rules in
// rulebook/eic.yaml with structural tests in core/rules/tests/phase3.js.
// Output is a simulated desk assessment. It never predicts a journal decision.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNegated } from "../text/negation.js";
import { sentencesOf } from "../integrity.js";
import { loadRules } from "../rules/loader.js";
import { runRules } from "../rules/engine.js";

export const ROLE = "eic";
export const LABEL = "Simulated pre-submission review — not a journal decision";
export const SOURCE = "QUARTILE_EIC";
// Specification value. Not calibrated: it must be calibrated on the gold set with known closest prior work.
export const THRESHOLD = 0.55;
export const THRESHOLD_NOTE = "Threshold 0.55 is the specification's value. It is not calibrated yet; it must be calibrated on the gold set (papers with known closest prior work).";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- claim patterns ----------
// Specification Section 5 (CONTRIB, verbatim pattern).
export const CONTRIB = /\b(we contribute|our contribution|this (paper|study|article) (is the first|contributes|extends|adds)|unlike (prior|previous|existing) (work|studies|research)|to our knowledge|no (prior )?stud(y|ies) ha(s|ve))\b/i;
// EIC-02: "first", "novel", "no study has" claims.
export const NOVELTY = /\b((is|are|was) the first|the first (study|paper|article|analysis|attempt|evidence|to)|first (empirical )?(study|evidence|paper|analysis) (to|of|on)|for the first time|novel|no (prior |previous |existing |earlier )?(study|studies|research|paper|papers|work) (has|have)|(has|have) never been (studied|examined|investigated|analy[sz]ed|tested|measured|explored|addressed)|to (the best of )?our knowledge)\b/i;

function claimKeys(doc) {
  const keys = ["abstract", "introduction", "conclusion"];
  return doc.hasSection("abstract") || doc.hasSection("introduction") ? keys : [...keys, "opening"];
}
export function contributionClaims(doc) {
  return doc.sentencesIn(claimKeys(doc)).filter(s => { const m = s.text.match(CONTRIB); return m && !isNegated(s.text, m.index); });
}
export function noveltyClaims(doc) {
  return doc.sentencesIn([...claimKeys(doc), "discussion"]).flatMap(s => {
    const m = s.text.match(NOVELTY); return m && !isNegated(s.text, m.index) ? [{ sentence: s, match: m[0] }] : [];
  });
}

// ---------- text similarity (own code: tokens, TF-IDF, cosine) ----------
const STOP = new Set(("the of and to in a an is for on that with as by are this be we from at or it its which their was were these those our has have had not can but also more than such between how into " +
  "paper study article research work prior previous existing first novel contribute contribution contributes extends adds unlike knowledge show shows find finds use using based new").split(" "));
const stem = w => w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
export const tokens = t => (String(t || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).map(stem).filter(w => !STOP.has(w));
function tf(t) { const m = new Map(); for (const w of tokens(t)) m.set(w, (m.get(w) || 0) + 1); return m; }
function cos(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of a) na += v * v; for (const [, v] of b) nb += v * v;
  for (const [w, v] of a) if (b.has(w)) dot += v * b.get(w);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** Cosine of log term-frequency vectors (two texts, no IDF). */
export function cosineText(a, b) { const lg = m => new Map([...m].map(([w, v]) => [w, 1 + Math.log(v)])); return cos(lg(tf(a)), lg(tf(b))); }
/** TF-IDF vectors over a small set of texts; IDF is smoothed: log((1 + N) / (1 + df)) + 1. */
export function tfidf(texts) {
  const tfs = texts.map(tf), df = new Map(), N = texts.length;
  for (const m of tfs) for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  return tfs.map(m => new Map([...m].map(([w, v]) => [w, (1 + Math.log(v)) * (Math.log((1 + N) / (1 + df.get(w))) + 1)])));
}
export { cos as cosine };
const r3 = x => Math.round(x * 1000) / 1000;

// ---------- citations in the manuscript ----------
const normDoi = d => String(d || "").trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "").replace(/[.,;)\]]+$/, "");
const normT = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function citedSet(doc, extra = []) {
  const dois = new Set([...(extra instanceof Set ? extra : extra || [])].map(normDoi).filter(Boolean));
  const refs = doc.citations?.references || [];
  for (const r of refs) { if (r.doi) dois.add(normDoi(r.doi)); for (const m of String(r.text).matchAll(/\b10\.\d{1,9}\/[^\s"<>]+/g)) dois.add(normDoi(m[0])); }
  return { dois, refs: refs.map(r => " " + normT(r.text) + " ") };
}
/** A paper is cited when its DOI is in the reference list or given, or when 80% of its title words appear in one reference. */
export function isCited(paper, cited) {
  if (!paper) return false;
  if (paper.doi && cited.dois.has(normDoi(paper.doi))) return true;
  const words = normT(paper.title).split(" ").filter(w => w.length > 3);
  if (words.length < 3) return false;
  return cited.refs.some(r => words.filter(w => r.includes(" " + w + " ")).length / words.length >= 0.8);
}

// ---------- literature sources ----------
/**
 * An overlap source is async (claimText, { k }) => { searched, source, results: [{ title, doi, year, score, real }], sent, error }.
 * A plain array is read as { searched: true, results }. `real` is true when the score is a similarity computed on
 * the paper's own text; only then can a blocker be raised.
 */
function normalise(res, fallbackSource) {
  const o = Array.isArray(res) ? { searched: true, results: res } : (res || { searched: false });
  const results = (o.results || []).map(r => ({ title: r.title || null, doi: r.doi || null, year: r.year ?? null, journal: r.journal || null,
    score: Number.isFinite(r.score) ? r3(r.score) : null, real: r.real !== false && Number.isFinite(r.score), basis: r.basis || null, source: r.source || o.source || fallbackSource }));
  results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { searched: !!o.searched, source: o.source || fallbackSource, results, sent: o.sent || [], error: o.error || null };
}

/** Default source: the user's private corpus (mcp/corpus.js search). Nothing leaves the machine. */
export function corpusOverlap() {
  let CP = null;
  return async (claim, { k = 10 } = {}) => {
    CP ||= (await import("../../mcp/corpus.js")).default;
    const st = CP.status();
    if (!st.available) return { searched: false, source: "private corpus", error: "No corpus folder is set (QUARTILE_CORPUS)." };
    if (!st.papers) return { searched: false, source: "private corpus", error: "The corpus folder has no papers." };
    const r = await CP.search(claim, k);
    if (r.error) return { searched: false, source: "private corpus", error: r.error };
    // corpus_search ranks by a TF-IDF sum; for the threshold we compute our own 0-1 cosine on the matched passage
    return { searched: true, source: "private corpus", results: (r.results || []).map(x => ({ title: x.title, doi: x.doi, year: x.year, journal: x.journal,
      score: cosineText(claim, (x.title || "") + " " + String(x.snippet || "").replace(/…$/, "")), real: true, basis: "cosine of the claim with the title and the start of the best-matching paragraph", rank_score: x.score })) };
  };
}

/** The exact queries core/net.js literatureOverlap sends for a text (mirrors its sentence choice; checked in tests). */
export function plannedOpenAlexQueries(text, maxQueries = 25) {
  const S = sentencesOf(text).filter(s => s.split(" ").length >= 14 && !/\((?:[^()]*(?:19|20)\d{2})[^()]*\)/.test(s));
  const pick = S.map(s => ({ s, score: s.split(" ").filter(w => w.length > 7).length - (s.match(/\d/g) || []).length })).sort((a, b) => b.score - a.score).slice(0, maxQueries);
  return pick.map(({ s }) => { const w = s.replace(/[“”"]/g, "").split(/\s+/), mid = Math.max(0, Math.floor(w.length / 2) - 5);
    return { phrase: w.slice(mid, mid + 10).join(" ").replace(/[^\p{L}\p{N}\s'-]/gu, ""), filters: ["fulltext.search", "title_and_abstract.search"] }; });
}

/** Live source: OpenAlex through core/net.js literatureOverlap. Sends 10-word phrases of the claim sentence. */
export function openAlexOverlap(literatureOverlap) {
  return async (claim) => {
    const lo = literatureOverlap || (await import("../net.js")).default.literatureOverlap;
    const sent = plannedOpenAlexQueries(claim, 1).map(q => ({ service: "OpenAlex (api.openalex.org/works)", phrase: q.phrase, filters: q.filters }));
    if (!sent.length) return { searched: false, source: "OpenAlex", sent, error: "Claim not sent: shorter than 14 words or contains an author-year citation (literature_overlap skips such sentences)." };
    const r = await lo(claim, { maxQueries: 1 });
    if (r.warning) return { searched: false, source: "OpenAlex", sent, error: r.warning };
    // an exact phrase match has no similarity score: it is listed, but it cannot raise a blocker on its own
    return { searched: true, source: "OpenAlex", sent, results: (r.hits || []).flatMap(h => h.matches.map(m => ({ ...m, score: null, real: false, basis: `exact 10-word phrase found in ${m.matchedIn}` }))) };
  };
}

function combine(sources) {
  return async (claim, opt) => {
    const parts = await Promise.all(sources.map(s => s(claim, opt)));
    const ns = parts.map(p => normalise(p));
    const seen = new Set(), results = [];
    for (const r of ns.flatMap(n => n.results).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) { const key = normDoi(r.doi) || normT(r.title); if (seen.has(key)) continue; seen.add(key); results.push(r); }
    return { searched: ns.some(n => n.searched), source: ns.map(n => n.source).join(" + "), results, sent: ns.flatMap(n => n.sent), error: ns.map(n => n.error).filter(Boolean).join(" ") || null, sources: ns.map(n => ({ source: n.source, searched: n.searched, error: n.error })) };
  };
}

/** Pick the overlap function: injected (tests), else private corpus, plus OpenAlex only when live is true. */
export function overlapFor(opts = {}) {
  if (typeof opts.overlap === "function") return { fn: opts.overlap, name: opts.overlapName || "supplied source", live: false };
  const src = [corpusOverlap()]; if (opts.live === true) src.push(openAlexOverlap(opts.literatureOverlap));
  return { fn: combine(src), name: opts.live === true ? "private corpus + OpenAlex (live)" : "private corpus", live: opts.live === true };
}

// ---------- EIC-01 and EIC-02 ----------
const spanOf = s => s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null;
const show = p => p ? `${p.title || "untitled"}${p.year ? " (" + p.year + ")" : ""}` : "";

async function lookupAll(doc, sentences, opts) {
  const { fn, name } = overlapFor(opts), cache = new Map();
  for (const s of sentences) if (!cache.has(s.id)) cache.set(s.id, normalise(await fn(s.text, { k: opts.k || 10 }), name));
  return { cache, name };
}

/**
 * EIC-01. For each contribution claim: the closest prior papers and their scores. Blocker only when the closest
 * paper is not cited, its score is at or above the threshold, and the score came from a real comparison.
 */
export async function contributionTest(doc, opts = {}) {
  const threshold = opts.threshold ?? THRESHOLD, cited = citedSet(doc, opts.citedDois || opts.cited_dois);
  const claims = contributionClaims(doc), nov = noveltyClaims(doc);
  const { cache, name } = opts._cache ? opts._cache : await lookupAll(doc, [...claims, ...nov.map(n => n.sentence)], opts);
  const findings = claims.map(s => {
    const r = cache.get(s.id), top = r.results[0] || null;
    const closest = r.results.slice(0, 3).map(p => ({ ...p, cited: isCited(p, cited) }));
    const uncited = top && !isCited(top, cited), real = !!(top && top.real && top.score != null);
    const block = real && uncited && top.score >= threshold;
    const message = !r.searched ? `Contribution claim not checked: no literature source was searched (${String(r.error || name).replace(/\.$/, "")}). The closest prior work is unknown.`
      : !top ? `No prior paper was found in ${r.source}. This does not show that none exists.`
      : block ? `A close prior study is not cited: ${show(top)}, similarity ${top.score} (threshold ${threshold}).`
      : "Closest prior work listed for the author to confirm the difference.";
    return { rule: "EIC-01", role: ROLE, title: "Contribution test", severity: block ? "blocker" : "note",
      confidence: block ? "medium" : r.searched ? "medium" : "low", source: SOURCE, source_ref: "Quartile specification Section 5, EIC-01",
      message, fix: block ? "Cite this paper and state in one sentence how your contribution differs from it." : "Check the listed papers; cite the closest and say how your paper differs.",
      span: spanOf(s), ...(block ? {} : { status: "needs_human" }),
      detail: { claim: s.text, searched: r.searched, source: r.source, closest, threshold, score_from_real_comparison: real, error: r.error } };
  });
  return { findings, claims, novelty: nov, cache: { cache, name }, threshold };
}

/** EIC-02. "First / novel / no study has" claims checked against the EIC-01 search. Unverified: major. */
export function noveltyCheck(doc, { cache }, opts = {}) {
  const threshold = opts.threshold ?? THRESHOLD, cited = citedSet(doc, opts.citedDois || opts.cited_dois);
  return noveltyClaims(doc).map(({ sentence: s, match }) => {
    const r = cache.get(s.id), top = r.results[0] || null, real = !!(top && top.real && top.score != null);
    const close = real && top.score >= threshold;
    const phraseOnly = r.searched && top && !real;
    const verified = r.searched && !close && !phraseOnly;
    const base = { rule: "EIC-02", role: ROLE, title: "'First' or 'novel' claim", source: SOURCE, source_ref: "Quartile specification Section 5, EIC-02", span: spanOf(s) };
    const detail = { claim: s.text, match, searched: r.searched, source: r.source, closest: r.results.slice(0, 3).map(p => ({ ...p, cited: isCited(p, cited) })), threshold };
    if (verified) return { ...base, severity: "note", confidence: "low", status: "needs_human", message: `Novelty claim ('${match}'): no paper at or above the threshold was found in ${r.source}. A limited search does not prove the claim.`, fix: "Keep the claim only if a wider search supports it, or soften it (for example 'one of few studies').", detail };
    return { ...base, severity: "major", confidence: r.searched ? "medium" : "low",
      message: !r.searched ? `Novelty claim ('${match}') is unverified: no literature source was searched.`
        : close ? `Novelty claim ('${match}') is unverified: a close prior paper exists, ${show(top)}, similarity ${top.score}.`
        : `Novelty claim ('${match}') is unverified: the live search found matching wording in ${show(top)}.`,
      fix: "Support the claim with a documented search, or soften it and cite the closest prior work.", detail };
  });
}

// ---------- journal bank ----------
function rawBank() {
  const env = (process.env.QUARTILE_BANK || "").startsWith("${") ? "" : process.env.QUARTILE_BANK;
  try { return JSON.parse(fs.readFileSync(env || path.join(__dirname, "..", "..", "data", "bank.json"), "utf8")); } catch (e) { return []; }
}
const jn = t => String(t || "").toLowerCase().replace(/&/g, "and").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
/** Bank entry for a journal name or ISSN, with any aims text and format limits it carries (none carry them yet). */
export function bankEntry(q, bank = rawBank()) {
  if (!q) return null; const n = jn(q), issn = String(q).replace(/-/g, "").toUpperCase();
  const j = bank.find(x => jn(x.t) === n || (x.i || []).includes(issn)); if (!j) return null;
  return { title: j.t, issn: j.i || [], aims: j.aims || j.scope || null, limits: j.limits || null };
}

// ---------- EIC-03 scope fit ----------
const KEYWORDS = /^\s*(key ?words?|index terms)\s*[:—–-]\s*/i;
export function abstractText(doc) { return doc.paragraphs.filter(p => !p.isHeading && p.section === "abstract" && !KEYWORDS.test(p.text) && !/^highlights?\b/i.test(p.text)).map(p => p.text).join("\n\n"); }

/** Recent titles from Crossref by ISSN. Only the ISSN (and a date filter) is sent. */
export async function crossrefTitles(issn, { years = 2, fetchImpl = fetch } = {}) {
  const since = new Date(Date.now() - years * 365.25 * 864e5).toISOString().slice(0, 10);
  const url = `https://api.crossref.org/journals/${encodeURIComponent(issn)}/works?filter=from-pub-date:${since}&rows=200&select=title,DOI`;
  const r = await fetchImpl(url, { headers: { "User-Agent": "Quartile (https://github.com/emsleader/quartile)" } });
  if (!r.ok) throw new Error(`Crossref answered HTTP ${r.status}`);
  const j = await r.json();
  return { titles: ((j.message || {}).items || []).map(x => ({ title: (x.title || [""])[0], doi: x.DOI })).filter(x => x.title), sent: { service: "Crossref (api.crossref.org)", issn, from_pub_date: since } };
}

export async function scopeFit(doc, opts = {}) {
  const entry = bankEntry(opts.journal);
  const aims = opts.aims || entry?.aims || null;
  let titles = opts.titles ? opts.titles.map(t => typeof t === "string" ? { title: t } : t) : null, sent = null, error = null;
  const fmt = x => { const c = String(x || "").replace(/[^0-9Xx]/g, "").toUpperCase(); return c.length === 8 ? c.slice(0, 4) + "-" + c.slice(4) : x || null; };
  const issn = fmt(opts.issn || entry?.issn?.[0] || null);
  if (!titles && (opts.fetch_titles === true || opts.live === true) && issn) {
    try { const r = await (opts.crossrefTitles || crossrefTitles)(issn); titles = r.titles; sent = r.sent; } catch (e) { error = e.message; sent = { service: "Crossref (api.crossref.org)", issn }; }
  }
  if (!opts.journal && !aims && !titles) return [];
  const abs = abstractText(doc);
  const base = { rule: "EIC-03", role: ROLE, title: "Scope fit", severity: "note", confidence: "low", status: "needs_human", source: SOURCE, source_ref: "Quartile specification Section 5, EIC-03", span: null };
  const why = [!abs && "the manuscript has no abstract section", !aims && "no aims and scope text (give `aims`; the journal bank has none yet)", !titles?.length && (error ? `recent titles could not be fetched (${error})` : "no recent titles (give `titles`, or allow the Crossref lookup by ISSN)")].filter(Boolean);
  if (!abs || (!aims && !titles?.length)) return [{ ...base, message: "Scope fit not computed: " + why.join("; ") + ".", fix: "Supply the journal's aims text and recent titles.", detail: { journal: entry?.title || opts.journal || null, issn, sent } }];
  const texts = [abs, ...(aims ? [aims] : []), ...(titles || []).map(t => t.title)];
  const V = tfidf(texts), a = V[0];
  const aimsScore = aims ? r3(cos(a, V[1])) : null;
  const off = aims ? 2 : 1;
  const ranked = (titles || []).map((t, i) => ({ ...t, score: r3(cos(a, V[off + i])) })).sort((x, y) => y.score - x.score);
  const top5 = ranked.slice(0, 5), mean5 = top5.length ? r3(top5.reduce((s, t) => s + t.score, 0) / top5.length) : null;
  return [{ ...base, message: `Scope fit (TF-IDF cosine, 0 to 1): abstract vs aims ${aimsScore ?? "not available"}; mean of the 5 most similar recent titles ${mean5 ?? "not available"}. No cut-off is calibrated; read the similar titles and judge the fit.`,
    fix: "If the closest recent titles are far from your topic, explain the fit in the cover letter or choose another journal.",
    detail: { journal: entry?.title || opts.journal || null, issn, aims_similarity: aimsScore, titles_compared: ranked.length, top5_mean: mean5, most_similar: top5, method: "TF-IDF (smoothed IDF over the abstract, aims and titles) with cosine similarity, computed locally", missing: why, sent } }];
}

// ---------- EIC-04 format limits ----------
const words = t => (String(t).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
const STRUCT = /^\s*(purpose|aims?|objectives?|design\/methodology\/approach|methodology|approach|methods?|findings|results|originality(\/value)?|value|research limitations(\/implications)?|practical implications|social implications|background|context|conclusions?)\s*[:.—–-]\s/i;
export function formatMeasures(doc) {
  const body = doc.paragraphs.filter(p => !p.isHeading && !p.isRef && !p.isTable && p.section !== "references" && p.index > 0);
  const absParas = doc.paragraphs.filter(p => !p.isHeading && p.section === "abstract");
  const kw = doc.paragraphs.find(p => KEYWORDS.test(p.text));
  const hl = doc.paragraphs.findIndex(p => /^(#+\s*)?highlights?\s*:?\s*$/i.test(p.text.trim()) || /^highlights?\s*:/i.test(p.text.trim()));
  let highlights = 0;
  if (hl >= 0) { const p = doc.paragraphs[hl]; if (/^highlights?\s*:\s*\S/i.test(p.text)) highlights = p.text.split(/[•;]|\s-\s/).length; else for (let i = hl + 1; i < doc.paragraphs.length && !doc.paragraphs[i].isHeading && words(doc.paragraphs[i].text) <= 30; i++) highlights++; }
  return {
    main_text_words: body.reduce((s, p) => s + words(p.text), 0),
    abstract_words: words(abstractText(doc)),
    keywords: kw ? kw.text.replace(KEYWORDS, "").split(/[;,·•]/).map(s => s.trim()).filter(Boolean).length : 0,
    highlights,
    structured_abstract: absParas.filter(p => STRUCT.test(p.text)).length >= 3 || (absParas.map(p => p.text).join(" ").match(new RegExp(STRUCT.source.replace("^\\s*", "(?:^|\\s)"), "gi")) || []).length >= 3,
    counting_rule: "Words in all paragraphs except headings, the title line, tables and the reference list (journals count differently).",
  };
}

export function formatLimits(doc, opts = {}) {
  const entry = bankEntry(opts.journal);
  const L = opts.limits || entry?.limits || null, m = formatMeasures(doc);
  const base = { rule: "EIC-04", role: ROLE, title: "Format limits", source: SOURCE, source_ref: "Quartile specification Section 5, EIC-04", span: null };
  if (!L) return [{ ...base, severity: "note", confidence: "high", status: "needs_human",
    message: `Format limits not available${opts.journal ? " for " + (entry?.title || opts.journal) : ""}: the journal bank has no format limits yet. The measured values are listed for a manual check against the author guidelines.`,
    fix: "Give the journal's limits (`limits`) or check the author guidelines by hand.", detail: { measured: m, limits: null } }];
  const out = [], add = (sev, conf, msg, fix, d) => out.push({ ...base, severity: sev, confidence: conf, message: msg, fix, detail: { measured: m, limits: L, ...d } });
  if (L.max_words && m.main_text_words > L.max_words) add("major", "medium", `Main text has about ${m.main_text_words} words; the limit is ${L.max_words}.`, "Shorten the text or check how the journal counts words (references, tables).", { over_by: m.main_text_words - L.max_words });
  if (L.max_abstract_words && m.abstract_words > L.max_abstract_words) add("minor", "high", `Abstract has ${m.abstract_words} words; the limit is ${L.max_abstract_words}.`, "Shorten the abstract.", {});
  if (L.min_keywords && m.keywords < L.min_keywords) add("minor", "high", `${m.keywords} keywords; the journal asks for at least ${L.min_keywords}.`, "Add keywords.", {});
  if (L.max_keywords && m.keywords > L.max_keywords) add("minor", "high", `${m.keywords} keywords; the journal allows at most ${L.max_keywords}.`, "Remove keywords.", {});
  if (L.highlights_required && !m.highlights) add("minor", "medium", "The journal asks for highlights; none were found.", "Add 3 to 5 highlights.", {});
  if (L.max_highlights && m.highlights > L.max_highlights) add("minor", "medium", `${m.highlights} highlights; the limit is ${L.max_highlights}.`, "Cut highlights.", {});
  if (L.structured_abstract_required && !m.structured_abstract) add("minor", "medium", "The journal asks for a structured abstract; the abstract has no labelled parts.", "Use the journal's abstract headings (for example Purpose, Design, Findings, Originality).", {});
  return out;
}

// ---------- role entry points ----------
/** Code checks of the role (EIC-01 to EIC-04). Rulebook rules EIC-05 and EIC-06 run in the rule engine. */
export async function run(doc, opts = {}) {
  const ct = await contributionTest(doc, opts);
  return [...ct.findings, ...noveltyCheck(doc, ct.cache, opts), ...(await scopeFit(doc, opts)), ...formatLimits(doc, opts)];
}

/** The whole role on its own: rulebook rules of role eic plus the code checks. */
export async function review(doc, opts = {}) {
  const rules = loadRules().filter(r => r.role === ROLE);
  return { label: LABEL, findings: [...runRules(doc, rules), ...(await run(doc, opts))] };
}

export default { ROLE, LABEL, run, review, contributionTest, noveltyCheck, scopeFit, formatLimits, contributionClaims, noveltyClaims };
