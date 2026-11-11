#!/usr/bin/env node
// Build Quartile's Q1 style profile from about 500 recent Q1 articles, using the OpenAlex API (CC0 metadata).
// Only measurements are stored (sentence length, voice, hedging, rhetorical moves...), never abstract text.
// Usage: node scripts/build-style-brain.js [--target 500] [--out data/style-profile.json]
const fs = require("fs"), path = require("path");
const { measure, summarise } = require("../core/stylemetrics.js");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TARGET = +opt("--target", 500), OUT = opt("--out", path.join(__dirname, "..", "data", "style-profile.json"));
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "bank.json"), "utf8"));
// Fields and the SCImago categories that define them (Q1 in that category)
const FIELDS = {
  finance: ["Finance", "Accounting", "Economics and Econometrics"],
  small_business: ["Business and International Management", "Business, Management and Accounting (miscellaneous)", "Strategy and Management"],
  management: ["Management of Technology and Innovation", "Marketing", "Organizational Behavior and Human Resource Management", "Management Science and Operations Research", "Tourism, Leisure and Hospitality Management"]
};
const KEYWORDS = { finance: "", small_business: "small business OR entrepreneurship OR SME OR new ventures OR family firms", management: "" };
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
  for (const [field, cats] of Object.entries(FIELDS)) {
    const journals = bank.filter(j => j.ty === "j" && (j.c || []).some(c => cats.includes(c[0]) && c[1] === "1")).sort((a, b) => b.s - a.s).slice(0, 60);
    const rows = []; const seen = new Set();
    for (let k = 0; k < journals.length && rows.length < per; k += 15) {
      const group = journals.slice(k, k + 15).flatMap(j => (j.i || []).map(issn));
      const kw = KEYWORDS[field] ? "&search=" + encodeURIComponent(KEYWORDS[field]) : "";
      const url = `https://api.openalex.org/works?filter=primary_location.source.issn:${group.join("|")},from_publication_date:2020-01-01,type:article,has_abstract:true${kw}&sort=cited_by_count:desc&per_page=50&select=doi,title,publication_year,abstract_inverted_index,primary_location`;
      const res = await get(url);
      for (const w of res.results || []) {
        if (rows.length >= per) break; const doi = (w.doi || "").replace("https://doi.org/", ""); if (!doi || seen.has(doi)) continue;
        const text = abstractOf(w.abstract_inverted_index); const words = text.split(/\s+/).length; if (words < 80 || words > 450) continue;
        seen.add(doi); const m = measure(text); m.journal = (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || ""; rows.push(m);
        sources.push({ doi, year: w.publication_year, journal: m.journal, field });
      }
      await sleep(250);
    }
    all[field] = rows; console.error(`${field}: ${rows.length} abstracts from ${journals.length} Q1 journals`);
  }
  const allRows = Object.values(all).flat();
  const byJournal = {}; allRows.forEach(r => { (byJournal[r.journal] = byJournal[r.journal] || []).push(r); });
  const journals = Object.fromEntries(Object.entries(byJournal).filter(([, v]) => v.length >= 15).map(([k, v]) => [k, summarise(v)]));
  const profile = { built: new Date().toISOString().slice(0, 10), source: "OpenAlex (CC0 metadata); abstracts of Q1 journal articles published 2020 or later, most cited first. Only measurements are stored.", target: TARGET, n: allRows.length,
    overall: summarise(allRows), fields: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, summarise(v)])), journals, sources };
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(profile, null, 1));
  console.error(`Wrote ${OUT}: ${allRows.length} abstracts, ${Object.keys(journals).length} journal profiles.`);
})().catch(e => { console.error(e); process.exit(1); });
