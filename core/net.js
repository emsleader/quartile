// Network checks (run where the server has internet: Render, Claude Desktop, a local server).
// Crossref for DOI verification and corrections/retractions, OpenAlex full-text search for overlap with published
// literature, LanguageTool for grammar. Each function degrades gracefully when a service is unreachable.
const L = require("./lib.js");
const UA = { "User-Agent": "Quartile (https://github.com/emsleader/quartile)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), opts.timeout || 20000); const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: ctl.signal }); clearTimeout(t);
      if (r.ok) return await r.json(); if (r.status === 404) return { __notFound: true }; if (r.status === 429) await sleep(3000 * (i + 1)); }
    catch (e) { if (i === tries - 1) return { __error: e.name || "network error" }; }
    await sleep(800 * (i + 1));
  }
  return { __error: "unavailable" };
}
async function pool(items, n, fn) { let i = 0; const out = []; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
const contain = (title, text) => { const t = norm(title).split(" ").filter(w => w.length > 3); if (!t.length) return 1; const x = " " + norm(text) + " "; return t.filter(w => x.includes(" " + w + " ")).length / t.length; };
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---------- live reference verification (Crossref) ----------
async function verifyReferences(text, { max = 80 } = {}) {
  const refs = L.references(L.parse(text)).references.slice(0, max);
  const checked = await pool(refs, 4, async r => {
    const out = { reference: r.text.slice(0, 200), doi: r.doi || null };
    let doi = r.doi ? r.doi.replace(/[.,;]+$/, "") : null, rec = null;
    if (doi) {
      const j = await getJSON("https://api.crossref.org/works/" + encodeURIComponent(doi));
      if (j.__notFound) { out.status = "DOI not found"; out.severity = "high"; out.fix = "The DOI does not resolve in Crossref. Check it at doi.org."; }
      else if (j.__error) { out.status = "lookup failed"; return out; }
      else rec = j.message;
    } else {
      const j = await getJSON("https://api.crossref.org/works?rows=1&select=DOI,title,issued,author,container-title,score&query.bibliographic=" + encodeURIComponent(r.text.slice(0, 300)));
      const it = j && j.message && j.message.items && j.message.items[0];
      if (it && contain((it.title || [""])[0], r.text) > 0.8) { out.status = "no DOI in the reference"; out.severity = "low"; out.suggestedDoi = it.DOI; out.fix = `Crossref match: "${(it.title || [""])[0]}" (doi:${it.DOI}). Add the DOI if it is the same work.`; }
      else { out.status = "no DOI; no confident match"; out.severity = "low"; }
      return out;
    }
    if (rec) {
      const title = (rec.title || [""])[0], yr = k => (((rec[k] || {})["date-parts"] || [[null]])[0] || [null])[0], year = yr("issued"), fam = ((rec.author || [])[0] || {}).family || "";
      const years = new Set([year, yr("published-print"), yr("published-online"), yr("published")].filter(Boolean).map(String));
      const ji = rec["journal-issue"] && ((rec["journal-issue"]["published-print"] || rec["journal-issue"]["published-online"] || {})["date-parts"] || [[null]])[0][0]; if (ji) years.add(String(ji));
      const issues = [];
      if (title && contain(title, r.text) < 0.5) issues.push(`title differs: Crossref has "${title}"`);
      const ry = r.year && String(r.year).slice(0, 4), soft = [];
      if (ry && years.size && !years.has(ry)) issues.push(`year differs: Crossref has ${[...years].sort().join(" / ")}`);
      else if (ry && year && ry !== String(year)) soft.push(`year ${ry} is the issue year; first published online ${year} (fine in APA)`);
      if (r.surname && fam && norm(fam) !== norm(r.surname) && !norm(r.text).includes(norm(fam))) issues.push(`first author differs: Crossref has ${fam}`);
      out.crossref = { title, year, firstAuthor: fam, journal: (rec["container-title"] || [""])[0], type: rec.type };
      const upd = await getJSON("https://api.crossref.org/works?rows=5&select=DOI,type,title,update-to&filter=updates:" + encodeURIComponent(doi));
      const notices = ((upd.message || {}).items || []).flatMap(n => (n["update-to"] || []).filter(u => norm(u.DOI) === norm(doi)).map(u => ({ type: u.type, notice: n.DOI })));
      if (notices.length) { out.updates = notices; if (notices.some(n => /retract|withdraw/i.test(n.type))) { issues.push("RETRACTED: " + notices.map(n => n.type + " doi:" + n.notice).join(", ")); out.severity = "high"; } else issues.push("has a " + notices.map(n => n.type).join(", ") + " notice"); }
      if (soft.length) out.notes = soft; out.status = issues.length ? "check" : "verified"; if (issues.length && !out.severity) out.severity = "med"; out.issues = issues;
      if (issues.length) out.fix = "Correct the reference to match the published record" + (out.severity === "high" ? " or remove a retracted source." : ".");
    }
    return out;
  });
  const count = s => checked.filter(c => c.status === s).length;
  return { kind: "references_live", checked: checked.length, verified: count("verified"), problems: checked.filter(c => c.severity === "high" || c.severity === "med").length, results: checked, source: "Crossref REST API (works, bibliographic query, and update notices such as corrections and retractions)." };
}

// ---------- overlap with published literature (OpenAlex full-text index) ----------
async function literatureOverlap(text, { maxQueries = 25, ownDois = [] } = {}) {
  const S = require("./integrity.js").sentencesOf(text).filter(s => s.split(" ").length >= 14 && !/\((?:[^()]*(?:19|20)\d{2})[^()]*\)/.test(s));
  // most distinctive sentences first: longer words, fewer digits
  const pick = S.map(s => ({ s, score: s.split(" ").filter(w => w.length > 7).length - (s.match(/\d/g) || []).length })).sort((a, b) => b.score - a.score).slice(0, maxQueries);
  const own = new Set(ownDois.map(d => norm(d)));
  const hits = []; let errors = 0;
  await pool(pick, 3, async ({ s }) => {
    const w = s.replace(/[“”"]/g, "").split(/\s+/), mid = Math.max(0, Math.floor(w.length / 2) - 5), phrase = w.slice(mid, mid + 10).join(" ").replace(/[^\p{L}\p{N}\s'-]/gu, "");
    const q = encodeURIComponent('"' + phrase + '"'), seen = new Set(), res = [];
    for (const [where, f] of [["full text", "fulltext.search"], ["title or abstract", "title_and_abstract.search"]]) {
      const j = await getJSON(`https://api.openalex.org/works?per_page=3&select=doi,title,publication_year,primary_location&filter=${f}:${q}`);
      if (j.__error || j.__notFound || !j.results) { errors++; continue; }
      j.results.forEach(x => { const d = norm((x.doi || "").replace("https://doi.org/", "")); if (own.has(d) || seen.has(x.id || x.title)) return; seen.add(x.id || x.title); res.push({ title: x.title, doi: (x.doi || "").replace("https://doi.org/", ""), year: x.publication_year, journal: ((x.primary_location || {}).source || {}).display_name, matchedIn: where }); });
    }
    if (res.length) hits.push({ sentence: s, phrase, matches: res });
  });
  return { kind: "literature_overlap", sentencesQueried: pick.length, sentencesWithMatches: hits.length, queryErrors: errors, hits,
    note: "Exact 10-word phrases from your most distinctive sentences were searched in the OpenAlex full-text index and in titles and abstracts (published, mostly open-access literature). A match means the phrase appears in another work: check it, quote and cite, or rewrite. This covers indexed scholarly full texts, not the whole web, and short common phrases can match by chance." };
}

// ---------- grammar (LanguageTool) ----------
// overlapping phrase edits conflict, so combine all fixes inside one sentence into a single sentence edit
function sentenceEdits(issues) {
  const by = new Map();
  issues.filter(i => i.replacement != null && i.quote.length < 80 && i.sentence).forEach(i => { if (!by.has(i.sentence)) by.set(i.sentence, []); by.get(i.sentence).push(i); });
  const out = [];
  for (const [sent, list] of by) { let t = sent; list.sort((a, b) => b.at - a.at).forEach(i => { if (t.substr(i.at, i.quote.length) === i.quote) t = t.slice(0, i.at) + i.replacement + t.slice(i.at + i.quote.length); }); if (t !== sent) out.push({ quote: sent, replacement: t }); }
  return out;
}
const NOISY = /^(WHITESPACE_RULE|EN_QUOTES|DASH_RULE|COMMA_PARENTHESIS_WHITESPACE|UPPERCASE_SENTENCE_START|PUNCTUATION_PARAGRAPH_END|EN_UNPAIRED_BRACKETS|ENGLISH_WORD_REPEAT_BEGINNING_RULE|MORFOLOGIK_RULE_EN_.*|SENTENCE_WHITESPACE|DOUBLE_PUNCTUATION)$/;
async function grammar(text, { language = "auto", spelling = false } = {}) {
  const paras = L.parse(text).paras.filter(p => !p.isHeading && !p.isRef && !p.isTable).map(p => p.text);
  const chunks = []; let cur = ""; for (const p of paras) { if ((cur + "\n\n" + p).length > 15000 && cur) { chunks.push(cur); cur = ""; } cur = cur ? cur + "\n\n" + p : p; } if (cur) chunks.push(cur);
  const issues = []; let failed = 0;
  for (const c of chunks.slice(0, 12)) {
    const body = new URLSearchParams({ text: c, language, enabledOnly: "false", level: "picky" });
    const j = await getJSON("https://api.languagetool.org/v2/check", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 40000 });
    if (j.__error) { failed++; continue; }
    (j.matches || []).forEach(m => { const id = m.rule && m.rule.id || ""; if (NOISY.test(id) && !(spelling && /MORFOLOGIK/.test(id))) return; if (/\((?:19|20)\d{2}/.test(c.slice(Math.max(0, m.offset - 30), m.offset + m.length + 30)) && m.rule.category && m.rule.category.id === "TYPOS") return;
      const quote = c.substr(m.offset, m.length), a = Math.max(0, c.lastIndexOf(" ", Math.max(0, m.offset - 25)) + 1), b0 = c.indexOf(" ", m.offset + m.length + 20), b = b0 < 0 ? c.length : b0;
      const rep = (m.replacements || [])[0] ? m.replacements[0].value : null, ctx = c.slice(a, b);
      const dot = c.lastIndexOf(". ", m.offset), sa = Math.max(dot < 0 ? 0 : dot + 2, c.lastIndexOf("\n", m.offset) + 1), se0 = c.slice(m.offset).search(/[.!?](\s|$)/), se = se0 < 0 ? c.length : m.offset + se0 + 1;
      issues.push({ quote, sentence: c.slice(sa, se), at: m.offset - sa, context: ctx, message: m.message, rule: id, category: (m.rule.category || {}).name, replacement: rep, edit: rep == null ? null : { quote: ctx, replacement: c.slice(a, m.offset) + rep + c.slice(m.offset + m.length, b) } });
    });
    await sleep(3500); // public API limit: 20 requests per minute
  }
  return { kind: "grammar", issues: issues.slice(0, 300), count: issues.length, chunksChecked: chunks.length - failed, chunksFailed: failed,
    replacements: sentenceEdits(issues),
    note: "Grammar and style rules from LanguageTool (public API, open-source rule set). Pass the replacements you accept to apply_replacements: each is checked by the hallucination guard. Spelling suggestions for names and technical terms are suppressed unless spelling is true." };
}
module.exports = { verifyReferences, literatureOverlap, grammar };
