#!/usr/bin/env node
// Build Quartile's Q1 style profile from about 500 recent Q1 articles, using the OpenAlex API (CC0 metadata).
// Only measurements are stored (sentence length, voice, hedging, rhetorical moves...), never abstract text.
// Usage: node scripts/build-style-brain.js [--target 500] [--out data/style-profile.json]
const fs = require("fs"), path = require("path");
const { measure, summarise } = require("../core/stylemetrics.js");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TARGET = +opt("--target", 500), OUT = opt("--out", path.join(__dirname, "..", "data", "style-profile.json"));
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bank.json"), "utf8"));
// Fields: which Q1 journals count (SCImago category with quartile 1, or a title pattern)
const FIELDS = {
  finance: j => (j.c || []).some(c => c[0] === "Finance" && c[1] === "1"),
  small_business: j => /small business|entrepreneur|ventur|family business|smes?\b/i.test(j.t) && j.q === "Q1",
  management: j => (j.c || []).some(c => ["Strategy and Management", "Organizational Behavior and Human Resource Management", "Management of Technology and Innovation"].includes(c[0]) && c[1] === "1") && !/small business|entrepreneur|ventur|family business/i.test(j.t) && !(j.c || []).some(c => c[0] === "Finance")
};
const PER_JOURNAL = { finance: 6, small_business: 8, management: 6 }; // spread the sample across journals
const issn = s => s.slice(0, 4) + "-" + s.slice(4);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { "User-Agent": "Quartile style profile builder (https://github.com/emsleader/quartile)" } });
    if (r.ok) return r.json(); await sleep(1500 * (i + 1));
  }
  throw new Error("OpenAlex request failed: " + url);
}
const abstractOf = inv => { if (!inv) return ""; const pos = []; for (const [w, idx] of Object.entries(inv)) idx.forEach(i => pos[i] = w); return pos.join(" "); };
(async () => {
  const per = Math.ceil(TARGET / Object.keys(FIELDS).length), all = {}, sources = [];
  for (const [field, inField] of Object.entries(FIELDS)) {
    const journals = bank.filter(j => j.ty === "j" && inField(j)).sort((a, b) => b.s - a.s).slice(0, 80);
    const rows = []; const seen = new Set();
    for (const j of journals) {
      if (rows.length >= per) break;
      const url = `https://api.openalex.org/works?filter=primary_location.source.issn:${(j.i || []).map(issn).join("|")},from_publication_date:2020-01-01,type:article,has_abstract:true&sort=cited_by_count:desc&per_page=15&select=doi,publication_year,abstract_inverted_index,primary_location`;
      let res; try { res = await get(url); } catch (e) { continue; }
      let took = 0;
      for (const w of res.results || []) {
        if (rows.length >= per || took >= PER_JOURNAL[field]) break; const doi = (w.doi || "").replace("https://doi.org/", ""); if (!doi || seen.has(doi)) continue;
        const text = abstractOf(w.abstract_inverted_index); const words = text.split(/\s+/).length; if (words < 80 || words > 450) continue;
        if (/^(this (editorial|commentary)|in this (editorial|introduction))/i.test(text)) continue;
        seen.add(doi); const m = measure(text); m.journal = j.t; rows.push(m); took++;
        sources.push({ doi, year: w.publication_year, journal: j.t, field });
      }
      await sleep(150);
    }
    all[field] = rows; console.error(`${field}: ${rows.length} abstracts from ${journals.length} Q1 journals`);
  }
  const allRows = Object.values(all).flat();
  const byJournal = {}; allRows.forEach(r => { (byJournal[r.journal] = byJournal[r.journal] || []).push(r); });
  const journals = Object.fromEntries(Object.entries(byJournal).filter(([, v]) => v.length >= 6).map(([k, v]) => [k, summarise(v)]));
  const profile = { built: new Date().toISOString().slice(0, 10), source: "OpenAlex (CC0 metadata); abstracts of Q1 journal articles published 2020 or later, the most-cited articles of each journal, at most 6-8 per journal. Only measurements are stored.", target: TARGET, n: allRows.length,
    overall: summarise(allRows), fields: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, summarise(v)])), journals, sources };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(profile, null, 1));
  console.error(`Wrote ${OUT}: ${allRows.length} abstracts, ${Object.keys(journals).length} journal profiles.`);
})().catch(e => { console.error(e); process.exit(1); });
