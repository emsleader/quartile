// Quartile corpus: a private, local library of full-text Q1 papers (PDF, DOCX, Markdown or text) in a folder on the
// user's own computer. Quartile downloads open-access articles into it, extracts and measures every section, and
// compares manuscripts with the result. Full texts never leave the folder; only measurements are written to
// corpus-profile.json inside it.
const fs = require("fs"), path = require("path");
const L = require("../core/lib.js");
const SM = require("../core/stylemetrics.js");
const ROLES = ["abstract", "introduction", "literature", "methods", "results", "discussion", "conclusion"];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = s => String(s).replace(/^https?:\/\/doi\.org\//, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
const job = { running: false, phase: "idle", done: 0, total: 0, log: [], startedAt: null, error: null };
const say = m => { job.log.push(new Date().toISOString().slice(11, 19) + " " + m); if (job.log.length > 60) job.log.shift(); };

// Corpus folder: QUARTILE_CORPUS, or on a hosted server (Render) a temporary folder whose texts are never served.
function folder() { let f = process.env.QUARTILE_CORPUS; if (!f || f.startsWith("${")) f = process.env.RENDER ? "/tmp/quartile-corpus" : null; if (!f) return null; fs.mkdirSync(f, { recursive: true }); return f; }
const indexPath = f => path.join(f, "corpus-index.json");
function readIndex(f) { try { return JSON.parse(fs.readFileSync(indexPath(f), "utf8")); } catch (e) { return { papers: [] }; } }
function writeIndex(f, idx) { fs.writeFileSync(indexPath(f), JSON.stringify(idx, null, 1)); }

// ---------- text extraction ----------
let pdfjs = null;
async function pdfToText(file) {
  if (!pdfjs) { const warn = console.warn, log = console.log; console.warn = () => {}; console.log = () => {}; pdfjs = require("pdfjs-dist/legacy/build/pdf.js"); console.warn = warn; console.log = log; }
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false, useSystemFonts: false, stopAtErrors: false, maxImageSize: 1, verbosity: 0 }).promise, lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n), tc = await page.getTextContent(), rows = new Map();
    tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const y = Math.round(it.transform[5]), h = Math.abs(it.transform[3]) || it.height; const k = [...rows.keys()].find(z => Math.abs(z - y) <= 2) ?? y; const r = rows.get(k) || { y: k, h: 0, parts: [] }; r.parts.push({ x: it.transform[4], s: it.str }); r.h = Math.max(r.h, h); rows.set(k, r); });
    const vh = (page.view && page.view[3]) || 842; page.cleanup();
    [...rows.values()].sort((a, b) => b.y - a.y).forEach(r => lines.push({ page: n, x: Math.min(...r.parts.map(p => p.x)), y: r.y, edge: r.y > vh * 0.92 || r.y < vh * 0.08, h: r.h, t: r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(" ").replace(/\s+/g, " ").trim() }));
  }
  await pdf.destroy();
  const hs = lines.map(l => l.h).sort((a, b) => a - b), body = hs[Math.floor(hs.length / 2)] || 10, freq = new Map();
  const xs = new Map(); lines.forEach(l => { const k = Math.round(l.x); xs.set(k, (xs.get(k) || 0) + 1); }); const left = +([...xs.entries()].sort((a, b) => b[1] - a[1])[0] || [0])[0];
  lines.forEach(l => { const k = l.t.replace(/\d+/g, "#"); freq.set(k, (freq.get(k) || 0) + 1); });
  const out = []; let prev = null, para = ""; const flush = () => { if (para.trim()) out.push(para.trim(), ""); para = ""; };
  const HEAD = /^(\d+(\.\d+)*\.?\s+)?(abstract|introduction|literature review|theory|theoretical|background|hypothes|data|method|methodology|research design|sample|results|findings|empirical|analysis|discussion|conclusions?|implications|limitations|references|bibliography)\b/i;
  for (const l of lines) {
    if ((l.edge && /^\d{1,4}$/.test(l.t)) || (l.edge && pdf.numPages > 3 && freq.get(l.t.replace(/\d+/g, "#")) >= pdf.numPages * 0.5)) continue; // page numbers and running headers sit at the page edges
    const big = l.h >= body * 1.12 && l.t.split(" ").length <= 14 && !/[.,;]$/.test(l.t);
    if ((big || (HEAD.test(l.t) && l.t.split(" ").length <= 10 && !/[.,;]$/.test(l.t)))) { flush(); out.push("# " + l.t, ""); prev = null; continue; }
    const gap = prev && prev.page === l.page ? prev.y - l.y : 0;
    const indent = l.x > left + body * 0.8 && l.x < left + body * 4;
    if (prev && (gap > body * 1.9 || (/[.!?:]$/.test(prev.t) && (gap > body * 1.45 || indent)))) flush();
    para = /-$/.test(para) && /^[a-z]/.test(l.t) ? para.slice(0, -1) + l.t : (para ? para + " " : "") + l.t;
    prev = l;
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function docxToText(file) {
  const mammoth = require("mammoth"); const r = await mammoth.convertToMarkdown({ path: file });
  return r.value.replace(/^(#{1,6})\s*\*\*(.*?)\*\*\s*$/gm, "$1 $2").replace(/\\([.#()\-_*\[\]])/g, "$1");
}
async function fileText(file) {
  const cache = file + ".quartile.txt";
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs >= fs.statSync(file).mtimeMs) return fs.readFileSync(cache, "utf8");
  const ext = path.extname(file).toLowerCase();
  const t = ext === ".pdf" ? await pdfToText(file) : ext === ".docx" ? await docxToText(file) : fs.readFileSync(file, "utf8");
  fs.writeFileSync(cache, t); return t;
}

// ---------- measurement of one paper ----------
function measurePaper(text) {
  const d = L.parse(text), out = { roles: {}, totalWords: 0 };
  const body = d.sections.filter(s => !["references", "declarations"].includes(s.role));
  const words = t => (t.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
  body.forEach(s => { s.text = s.paras.map(id => d.byId(id)).filter(p => !p.isTable).map(p => p.text).join("\n\n"); s.w = words(s.text); out.totalWords += s.w; });
  for (const role of ROLES) {
    const secs = body.filter(s => s.role === role); if (!secs.length) continue;
    const text = secs.map(s => s.text).join("\n\n"), paras = secs.flatMap(s => s.paras.map(id => d.byId(id)).filter(p => !p.isTable && !p.isHeading));
    const w = words(text); if (w < 40) continue;
    const m = SM.measure(text), cites = L.Core.citations(text).filter(c => !c.startsWith("10.")).length;
    out.roles[role] = { words: w, share: 0, paragraphs: paras.length, paragraphWords: +(w / Math.max(paras.length, 1)).toFixed(1), citationsPer1k: +(1000 * cites / w).toFixed(2),
      meanSentence: m.meanSentence, longSentenceShare: m.longSentenceShare, weShare: m.weShare, passiveShare: m.passiveShare, hedgesPer100: m.hedgesPer100, causalPer100: m.causalPer100, stockPer1k: m.stockPer1k,
      paragraphMoves: role === "introduction" ? paras.slice(0, 8).map(p => SM.measure(p.text.split(/(?<=[.!?])\s/)[0] || p.text).firstMove).join(">") : undefined };
  }
  for (const r of Object.keys(out.roles)) out.roles[r].share = +(out.roles[r].words / Math.max(out.totalWords, 1)).toFixed(3);
  out.refs = d.paras.filter(p => p.isRef).length; out.recognised = Object.keys(out.roles).length;
  return out;
}
const KEYS = ["words", "share", "paragraphs", "paragraphWords", "citationsPer1k", "meanSentence", "longSentenceShare", "weShare", "passiveShare", "hedgesPer100", "causalPer100", "stockPer1k"];
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(3); };
function summarise(papers) {
  const res = { n: papers.length, totalWords: { p25: q(papers.map(p => p.m.totalWords), .25), median: q(papers.map(p => p.m.totalWords), .5), p75: q(papers.map(p => p.m.totalWords), .75) }, references: { median: q(papers.map(p => p.m.refs), .5) }, roles: {} };
  for (const role of ROLES) {
    const rows = papers.map(p => p.m.roles[role]).filter(Boolean); if (rows.length < 5) continue;
    const r = { present: +(rows.length / papers.length).toFixed(3) };
    KEYS.forEach(k => { const v = rows.map(x => x[k]).filter(x => typeof x === "number"); r[k] = { p25: q(v, .25), median: q(v, .5), p75: q(v, .75) }; });
    if (role === "introduction") { const c = {}; rows.forEach(x => { const f = (x.paragraphMoves || "").split(">")[0]; if (f) c[f] = (c[f] || 0) + 1; }); r.firstParagraphMove = Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / rows.length).toFixed(3)])); }
    res.roles[role] = r;
  }
  return res;
}

// ---------- building the corpus ----------
const FIELDS = {
  finance: j => (j.c || []).some(c => c[0] === "Finance" && c[1] === "1"),
  small_business: j => /small business|entrepreneur|ventur|family business|smes?\b/i.test(j.t) && j.q === "Q1",
  management: j => (j.c || []).some(c => ["Strategy and Management", "Organizational Behavior and Human Resource Management", "Management of Technology and Innovation"].includes(c[0]) && c[1] === "1") && !/small business|entrepreneur|ventur|family business/i.test(j.t) && !(j.c || []).some(c => c[0] === "Finance")
};
const LICENSES = ["cc-by", "cc-by-sa", "cc0", "public-domain", "cc-by-nc", "cc-by-nd", "cc-by-nc-sa", "cc-by-nc-nd"];
async function getJSON(url) { for (let i = 0; i < 4; i++) { try { const r = await fetch(url, { headers: { "User-Agent": "Quartile corpus builder (https://github.com/emsleader/quartile)" } }); if (r.ok) return r.json(); } catch (e) {} await sleep(1500 * (i + 1)); } return null; }
async function download(url, file) {
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (Quartile research corpus; open-access text and data mining)", Accept: "application/pdf,*/*" } }); clearTimeout(t);
    if (!r.ok) return "http " + r.status; const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 20000 || buf.slice(0, 5).toString() !== "%PDF-") return "not a pdf"; if (buf.length > 30e6) return "too large";
    fs.writeFileSync(file, buf); return "ok";
  } catch (e) { return "error " + (e.name || ""); }
}
async function build({ target = 500, fields = Object.keys(FIELDS), perJournal = 6, fromYear = 2019, newest = false, licenses = LICENSES } = {}) {
  const f = folder(); if (!f) throw new Error("No corpus folder is set (QUARTILE_CORPUS).");
  if (job.running) return status();
  Object.assign(job, { running: true, phase: "downloading", done: 0, total: target, log: [], startedAt: new Date().toISOString(), error: null });
  // a free hosted instance sleeps after 15 idle minutes; ping our own public URL while the job runs
  const keep = process.env.RENDER_EXTERNAL_URL ? setInterval(() => { if (!job.running) return clearInterval(keep); fetch(process.env.RENDER_EXTERNAL_URL + "/").catch(() => {}); }, 4 * 60 * 1000) : null;
  (async () => {
    try {
      L.loadBank(); const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bank.json"), "utf8"));
      const idx = readIndex(f), have = new Set(idx.papers.map(p => p.doi)); const per = Math.ceil(target / fields.length);
      for (const field of fields) {
        fs.mkdirSync(path.join(f, field), { recursive: true });
        let got = idx.papers.filter(p => p.field === field && p.file).length;
        const journals = bank.filter(j => j.ty === "j" && FIELDS[field](j)).sort((a, b) => b.s - a.s);
        say(`${field}: ${got} already in the folder; ${journals.length} Q1 journals to try`);
        for (const j of journals) {
          if (got >= per) break; let took = 0;
          const issns = (j.i || []).map(x => x.slice(0, 4) + "-" + x.slice(4)).join("|");
          const url = `https://api.openalex.org/works?filter=primary_location.source.issn:${issns},from_publication_date:${fromYear}-01-01,type:article,is_oa:true&sort=${newest ? "publication_date:desc" : "cited_by_count:desc"}&per_page=25&select=doi,title,publication_year,best_oa_location,open_access`;
          const res = await getJSON(url); if (!res) continue;
          for (const w of res.results || []) {
            if (got >= per || took >= perJournal) break;
            const doi = (w.doi || "").replace("https://doi.org/", ""), loc = w.best_oa_location || {}, lic = loc.license || "";
            if (!doi || have.has(doi) || !loc.pdf_url || !licenses.includes(lic)) continue;
            const file = path.join(f, field, safe(doi) + ".pdf"), st = await download(loc.pdf_url, file);
            if (st !== "ok") { say(`skip ${doi}: ${st}`); continue; }
            idx.papers.push({ doi, title: w.title, year: w.publication_year, journal: j.t, field, license: lic, source: loc.pdf_url, file: path.relative(f, file) });
            have.add(doi); got++; took++; job.done++; writeIndex(f, idx);
            await sleep(300);
          }
          await sleep(200);
        }
        say(`${field}: ${got} papers`);
      }
      await analyse();
    } catch (e) { job.error = e.message; say("error: " + e.message); }
    job.running = false; job.phase = job.error ? "failed" : "done";
  })();
  return status();
}
// Measure every paper in the folder (downloaded or added by the user) and write corpus-profile.json
async function analyse() {
  const f = folder(); if (!f) throw new Error("No corpus folder is set.");
  job.phase = "analysing"; const idx = readIndex(f);
  // include files the user dropped into the folder
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const known = new Set(idx.papers.map(p => p.file));
  walk(f).filter(x => /\.(pdf|docx|md|txt)$/i.test(x) && !/\.quartile\.txt$/.test(x) && !/corpus-(index|profile)\.json$/.test(x)).forEach(x => { const rel = path.relative(f, x); if (!known.has(rel)) idx.papers.push({ doi: null, title: path.basename(x), field: rel.split(path.sep).length > 1 && FIELDS[rel.split(path.sep)[0]] ? rel.split(path.sep)[0] : "user", license: "user file", file: rel }); });
  job.total = idx.papers.length; job.done = 0; const measured = [];
  for (const p of idx.papers) {
    try { const t = await fileText(path.join(f, p.file)); const m = measurePaper(t); p.recognisedSections = m.recognised; p.words = m.totalWords; if (m.recognised >= 3 && m.totalWords >= 1500) measured.push({ ...p, m }); else p.note = "sections not recognised; excluded from the profile"; }
    catch (e) { p.note = "could not read: " + e.message; }
    job.done++;
  }
  writeIndex(f, idx);
  const profile = { built: new Date().toISOString().slice(0, 10), note: "Measurements of full-text papers in your private corpus folder. No text is stored here.", n: measured.length, overall: summarise(measured), fields: {} };
  for (const field of [...new Set(measured.map(p => p.field))]) { const ps = measured.filter(p => p.field === field); if (ps.length >= 10) profile.fields[field] = summarise(ps); }
  fs.writeFileSync(path.join(f, "corpus-profile.json"), JSON.stringify(profile, null, 1));
  say(`profile written: ${measured.length} of ${idx.papers.length} papers measured`); job.phase = "done";
  return profile;
}
function status() {
  const f = folder(); if (!f) return { available: false, note: "No corpus folder is set. Set QUARTILE_CORPUS (local install) or run on a hosted server.", published: !!loadCorpusProfile() };
  const idx = readIndex(f), byField = {}; idx.papers.forEach(p => byField[p.field] = (byField[p.field] || 0) + 1);
  let prof = null; try { prof = JSON.parse(fs.readFileSync(path.join(f, "corpus-profile.json"), "utf8")); } catch (e) {}
  return { available: true, folder: f, papers: idx.papers.length, byField, measured: prof ? prof.n : 0, profileBuilt: prof ? prof.built : null, job: { running: job.running, phase: job.phase, done: job.done, total: job.total, startedAt: job.startedAt, error: job.error, recent: job.log.slice(-12) } };
}
// The folder's profile if it exists, otherwise the published profile in data/ (measurements only, no text).
function loadCorpusProfile() { const f = folder(); for (const p of [f && path.join(f, "corpus-profile.json"), path.join(__dirname, "..", "data", "corpus-profile.json")]) { if (!p) continue; try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) {} } return null; }
// Error-injection benchmark on the newest corpus papers. Returns counts and bibliographic metadata, never text.
async function benchmark({ n = 10, minYear = 2025 } = {}) {
  const f = folder(); if (!f) return { error: status().note };
  const idx = readIndex(f), pick = idx.papers.filter(p => p.file && (+p.year || 0) >= minYear).sort((a, b) => (+b.year || 0) - (+a.year || 0)).slice(0, n);
  if (!pick.length) return { error: `No corpus papers from ${minYear} or later yet (${idx.papers.length} papers in the folder). Wait for corpus_build or lower min_year.` };
  const texts = []; for (const p of pick) { try { texts.push({ id: p.doi, text: await fileText(path.join(f, p.file)) }); } catch (e) {} }
  const res = require("../core/benchmark.js").run(texts), meta = new Map(pick.map(p => [p.doi, p]));
  res.perPaper = res.perPaper.map(r => { const m = meta.get(r.id) || {}; return { doi: r.id, title: m.title, journal: m.journal, year: m.year, field: m.field, aiStyle: r.ai, alarmsOnClean: r.alarmsOnClean, missed: r.missed }; });
  return { kind: "benchmark", ...res };
}
// Measurements and bibliographic metadata only: safe to publish. Never includes text.
function exportProfile() {
  const f = folder(), prof = loadCorpusProfile(); if (!prof) return { error: "No corpus profile yet. Run corpus_build or corpus_analyse first." };
  const idx = f ? readIndex(f) : { papers: [] };
  const sources = idx.papers.filter(p => p.doi).map(p => ({ doi: p.doi, title: p.title, journal: p.journal, year: p.year, field: p.field, license: p.license, words: p.words, measured: !p.note }));
  return { profile: { ...prof, note: "Measurements of open-access, Creative-Commons-licensed Q1 articles, section by section. No text is stored; see corpus-sources.json for the papers." }, sources };
}
const LAB = { share: "share of the paper", paragraphWords: "words per paragraph", citationsPer1k: "citations per 1,000 words", meanSentence: "mean sentence length", weShare: "'we' sentences", passiveShare: "passive sentences", hedgesPer100: "hedges per 100 words", causalPer100: "causal verbs per 100 words", stockPer1k: "stock words per 1,000", longSentenceShare: "sentences over 35 words", words: "words", paragraphs: "paragraphs" };
function compare(text, field) {
  const P = loadCorpusProfile(); if (!P) return { error: status().available ? "No corpus profile yet. Run corpus_build or corpus_analyse first." : status().note };
  const prof = (field && P.fields[field]) || P.overall, m = measurePaper(text), rows = [], gaps = [];
  for (const role of ROLES) {
    const pr = prof.roles[role], mine = m.roles[role]; if (!pr) continue;
    if (!mine) { if (pr.present > 0.7) gaps.push({ role, label: "section present", value: "missing", median: `${Math.round(pr.present * 100)}% of corpus papers have it`, size: 3 }); continue; }
    for (const k of ["share", "paragraphWords", "citationsPer1k", "meanSentence", "weShare", "passiveShare", "hedgesPer100", "causalPer100"]) {
      const s = pr[k]; if (!s || s.p25 === null) continue; const v = mine[k], out = v < s.p25 ? "below" : v > s.p75 ? "above" : "";
      rows.push({ role, measure: LAB[k], value: v, median: s.median, p25: s.p25, p75: s.p75, flag: out });
      if (out) gaps.push({ role, label: LAB[k], value: v, median: s.median, p25: s.p25, p75: s.p75, side: out, size: +(Math.abs(v - s.median) / Math.max(s.p75 - s.p25, 1e-9)).toFixed(2) });
    }
  }
  gaps.sort((a, b) => b.size - a.size);
  const intro = m.roles.introduction, notes = [];
  if (intro && prof.roles.introduction && prof.roles.introduction.firstParagraphMove) { const top = Object.entries(prof.roles.introduction.firstParagraphMove)[0], mineFirst = (intro.paragraphMoves || "").split(">")[0]; if (top && mineFirst !== top[0]) notes.push(`Your introduction opens with "${mineFirst}"; ${Math.round(top[1] * 100)}% of corpus introductions open with "${top[0]}".`); }
  notes.push(`Paper length: ${m.totalWords} words; corpus median ${prof.totalWords.median} (middle half ${prof.totalWords.p25}-${prof.totalWords.p75}).`);
  return { kind: "corpus", profile: { field: field || "all", n: prof.n, built: P.built }, distance: +(100 * gaps.length / Math.max(rows.length + gaps.filter(g => g.value === "missing").length, 1)).toFixed(0), largestGaps: gaps.slice(0, 5), table: rows, notes, recognisedSections: Object.keys(m.roles) };
}
// ---------- search: closest passages and papers (TF-IDF over paragraphs) ----------
let INDEX = null;
const STOP = new Set("the of and to in a is for on that with as by are this be we from at or an it its which their was were these our has have not can but also more than such between how into".split(" "));
const toks = t => (t.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter(w => !STOP.has(w));
async function buildIndex() {
  const f = folder(); const idx = readIndex(f), docs = [], df = new Map();
  for (const p of idx.papers) { let t; try { t = await fileText(path.join(f, p.file)); } catch (e) { continue; } const d = L.parse(t);
    d.sections.filter(s => !["references", "declarations"].includes(s.role)).forEach(s => s.paras.forEach(id => { const para = d.byId(id); if (para.isTable || para.text.split(/\s+/).length < 30) return; const tf = new Map(); toks(para.text).forEach(w => tf.set(w, (tf.get(w) || 0) + 1)); tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)); docs.push({ p, role: s.role, section: s.title, text: para.text, tf, len: para.text.split(/\s+/).length }); })); }
  INDEX = { docs, df, N: docs.length }; return INDEX;
}
async function search(query, k = 8) {
  if (!folder()) return { error: status().note }; if (!INDEX) await buildIndex();
  const qt = [...new Set(toks(query))], { docs, df, N } = INDEX;
  const scored = docs.map(d => ({ d, s: qt.reduce((a, w) => a + (d.tf.get(w) ? (1 + Math.log(d.tf.get(w))) * Math.log(N / (df.get(w) || 1)) : 0), 0) / Math.sqrt(d.len) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const seen = new Set(), out = [];
  for (const { d, s } of scored) { const key = d.p.doi || d.p.file; if (seen.has(key)) continue; seen.add(key);
    out.push({ title: d.p.title, journal: d.p.journal, year: d.p.year, doi: d.p.doi, section: d.section, role: d.role, score: +s.toFixed(3), snippet: d.text.split(/\s+/).slice(0, 40).join(" ") + "…" }); if (out.length >= k) break; }
  return { kind: "corpus_search", query, results: out, note: "Snippets are at most 40 words, for locating the source. Read and cite the paper itself." };
}
// ---------- originality: learn patterns, never copy text ----------
// A sentence that shares 8 or more consecutive words with any corpus paper is flagged.
let GRAMS = null; const NG = 8;
const normW = t => (t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
async function buildGrams() {
  if (!INDEX) await buildIndex(); GRAMS = new Map();
  INDEX.docs.forEach((d, i) => { const w = normW(d.text); for (let k = 0; k + NG <= w.length; k++) { const g = w.slice(k, k + NG).join(" "); if (!GRAMS.has(g)) GRAMS.set(g, i); } });
  return GRAMS;
}
async function originality(text) {
  if (!folder()) return { error: status().note }; if (!GRAMS) await buildGrams();
  const sents = String(text).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(s => s.split(" ").length >= NG), hits = [];
  for (const s of sents) { const w = normW(s); for (let k = 0; k + NG <= w.length; k++) { const i = GRAMS.get(w.slice(k, k + NG).join(" ")); if (i !== undefined) { const d = INDEX.docs[i]; hits.push({ sentence: s, overlap: w.slice(k, k + NG).join(" "), source: { title: d.p.title, doi: d.p.doi, journal: d.p.journal } }); break; } } }
  return { kind: "originality", pass: hits.length === 0, sentencesChecked: sents.length, overlapping: hits, rule: "Rewrite any flagged sentence in your own words. Quartile uses the corpus for patterns (structure, length, moves, voice), never for wording." };
}
async function sentenceLookup() { if (!folder()) return null; if (!GRAMS) await buildGrams(); return s => { const w = normW(s); let run = 0, max = 0, at = -1; for (let k = 0; k + NG <= w.length; k++) { const i = GRAMS.get(w.slice(k, k + NG).join(" ")); if (i !== undefined) { run++; if (run > max) { max = run; at = i; } } else run = 0; } if (!max) return null; const d = INDEX.docs[at]; return { id: d.p.doi || d.p.file, title: (d.p.title || "corpus paper") + (d.p.doi ? " (doi:" + d.p.doi + ")" : ""), covered: Math.min(1, (max + NG - 1) / w.length) }; }; }
module.exports = { benchmark, exportProfile, loadCorpusProfile, sentenceLookup, build, analyse, status, compare, search, originality, measurePaper, fileText, pdfToText, summarise };
