// Builds the full-text corpus profile on a CI runner: downloads open-access, CC-licensed Q1 papers into a temporary
// folder, measures every section and writes ONLY measurements and bibliographic metadata to data/.
// The PDFs and extracted texts are deleted with the runner; nothing else is kept or published.
const fs = require("fs"), os = require("os"), path = require("path");
process.env.QUARTILE_CORPUS = fs.mkdtempSync(path.join(os.tmpdir(), "quartile-corpus-"));
const CP = require("../mcp/corpus.js");
const target = +(process.argv[2] || 500);
(async () => {
  await CP.build({ target, perJournal: 6 });
  const t0 = Date.now(); let last = -1;
  while (CP.status().job.running && Date.now() - t0 < 170 * 60e3) { await new Promise(r => setTimeout(r, 15000)); const s = CP.status(); if (s.job.done !== last) { last = s.job.done; console.log(`${s.job.phase}: ${s.job.done}/${s.job.total}`); } }
  const dir = process.env.QUARTILE_CORPUS, st = CP.status();
  console.log(JSON.stringify({ papers: st.papers, measured: st.measured, byField: st.byField, recent: st.job.recent }, null, 1));
  const prof = JSON.parse(fs.readFileSync(path.join(dir, "corpus-profile.json"), "utf8"));
  const idx = JSON.parse(fs.readFileSync(path.join(dir, "corpus-index.json"), "utf8"));
  prof.note = "Measurements of open-access, Creative-Commons-licensed Q1 articles, section by section. No text is stored; see corpus-sources.json for the papers.";
  fs.writeFileSync(path.join(__dirname, "..", "data", "corpus-profile.json"), JSON.stringify(prof, null, 1));
  const sources = idx.papers.filter(p => p.doi).map(p => ({ doi: p.doi, title: p.title, journal: p.journal, year: p.year, field: p.field, license: p.license, words: p.words, measured: !p.note }));
  fs.writeFileSync(path.join(__dirname, "..", "data", "corpus-sources.json"), JSON.stringify(sources, null, 1));
  console.log("licenses:", sources.reduce((a, x) => (a[x.license] = (a[x.license] || 0) + 1, a), {}));
  if (prof.n < 10) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
