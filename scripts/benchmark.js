#!/usr/bin/env node
// Benchmark: measures how often each Quartile module finds a known, injected error, and how often it raises an alarm
// on the clean paper. Run it on 30-50 of your own papers (Markdown or text; PDF/DOCX via the corpus extractor):
//   node scripts/benchmark.js <folder> [--out results.json]
// The papers stay where they are. Only counts are written; nothing from the papers is copied into the results.
const fs = require("fs"), path = require("path");
const L = require("../core/lib.js"), B = require("../core/benchmark.js");
const dir = process.argv[2]; if (!dir) { console.error("usage: node scripts/benchmark.js <folder> [--out file]"); process.exit(1); }
const outFile = (process.argv.indexOf("--out") > 0) ? process.argv[process.argv.indexOf("--out") + 1] : null;
async function textOf(f) {
  if (/\.(md|txt)$/i.test(f)) return fs.readFileSync(f, "utf8");
  if (/\.(pdf|docx)$/i.test(f)) { const CP = require("../mcp/corpus.js"); return CP.fileText(f); }
  return null;
}
(async () => {
  const files = fs.readdirSync(dir).filter(f => /\.(md|txt|pdf|docx)$/i.test(f)), texts = [];
  for (const f of files) { try { texts.push({ id: f, text: await textOf(path.join(dir, f)) }); } catch (e) {} }
  const res = B.run(texts); console.log(JSON.stringify(res, null, 2)); if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 2));
})();
