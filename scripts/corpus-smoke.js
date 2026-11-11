// Smoke test of the corpus pipeline on real open-access papers (used by CI). Downloads a few PDFs into a temporary
// folder, measures them and prints only counts and medians. Nothing is uploaded or kept.
process.env.QUARTILE_CORPUS = process.env.QUARTILE_CORPUS || require("os").tmpdir() + "/quartile-corpus-smoke";
const CP = require("../mcp/corpus.js");
(async () => {
  await CP.build({ target: +(process.argv[2] || 15), perJournal: 2 });
  const t0 = Date.now(); while (CP.status().job.running && Date.now() - t0 < 25 * 60e3) await new Promise(r => setTimeout(r, 5000));
  const st = CP.status(); console.log(JSON.stringify({ papers: st.papers, measured: st.measured, byField: st.byField, job: st.job }, null, 1));
  const fs = require("fs"), p = JSON.parse(fs.readFileSync(process.env.QUARTILE_CORPUS + "/corpus-profile.json", "utf8"));
  const r = p.overall.roles; console.log("roles found:", Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { present: v.present, medianWords: v.words.median, citationsPer1k: v.citationsPer1k.median }])));
  const idx = JSON.parse(fs.readFileSync(process.env.QUARTILE_CORPUS + "/corpus-index.json", "utf8")); console.log("licenses:", idx.papers.reduce((a, x) => (a[x.license] = (a[x.license] || 0) + 1, a), {}));
  if (st.measured < 3) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
