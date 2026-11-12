#!/usr/bin/env node
// Benchmark: measures how often each Quartile module finds a known, injected error, and how often it raises an alarm
// on the clean paper. Run it on 30-50 of your own papers (Markdown or text; PDF/DOCX via the corpus extractor):
//   node scripts/benchmark.js <folder> [--out results.json]
// The papers stay where they are. Only counts are written; nothing from the papers is copied into the results.
const fs = require("fs"), path = require("path");
const L = require("../core/lib.js"), AI = require("../core/aistyle.js"), REG = require("../core/registry.js");

const dir = process.argv[2]; if (!dir) { console.error("usage: node scripts/benchmark.js <folder> [--out file]"); process.exit(1); }
const outFile = (process.argv.indexOf("--out") > 0) ? process.argv[process.argv.indexOf("--out") + 1] : null;
async function textOf(f) {
  if (/\.(md|txt)$/i.test(f)) return fs.readFileSync(f, "utf8");
  if (/\.(pdf|docx)$/i.test(f)) { const CP = require("../mcp/corpus.js"); return CP.fileText(f); }
  return null;
}
function addToRole(t, role, add) { const d = L.parse(t), s = d.sections.find(x => x.role === role) || d.sections.find(x => x.role === "introduction"); if (!s) return null; const p = s.paras.map(id => d.byId(id)).find(p => p && !p.isHeading && !p.isTable && p.text.length > 200); return p ? t.replace(p.text, p.text + add) : null; }
// ---- injections: each returns the corrupted text, or null if the paper has nothing to corrupt ----
const INJ = {
  statistics: t => { const m = t.match(/\bt\s*\(\s*\d+\s*\)\s*=\s*(\d+\.\d+),\s*p\s*[=<]\s*\.?\d+/); if (m) return t.replace(m[0], m[0].replace(/p\s*[=<]\s*\.?\d+/, "p = .48")); return addToRole(t, "results", " The effect is significant, t(120) = 0.41, p = .003."); },
  missingReference: t => L.references(L.parse(t)).references.length ? addToRole(t, "introduction", " This extends earlier evidence (Qwertzuiop, 2021).") : null,
  abstractNumber: t => { const d = L.parse(t), a = d.sections.find(s => s.role === "abstract"); if (!a) return null; const p = d.byId(a.paras[0]); if (!p) return null; return t.replace(p.text, p.text + " The average effect is 0.873."); },
  aiStyle: t => { const d = L.parse(t), intro = d.sections.find(s => s.role === "introduction"); if (!intro) return null; const p = d.byId(intro.paras[0]); return t.replace(p.text, p.text + "\n\nMoreover, this study delves into the multifaceted landscape of firm finance — a crucial realm. It is not merely a study of cash, but a testament to resilience. Furthermore, we leverage robust data, rich models, and deep insights. This underscores the importance of liquidity. Notably, firms navigate a pivotal and ever-evolving landscape. Additionally, our findings shed light on this vital interplay."); },
};
// ---- detectors: true if the module raises the alarm the injection should trigger ----
const DET = {
  statistics: t => L.Stats.checkAll(L.parse(t).paras.map(p => p.text).join("\n\n")).problems.some(p => /Decision error|inconsistent/i.test(p.problem)),
  missingReference: t => L.references(L.parse(t)).missingFromList.some(c => /Qwertzuiop/.test(c)) ,
  abstractNumber: t => REG.registry(t, []).summaryNotInResults.length > 0,
  aiStyle: t => { const a = AI.check(t, { maxFixes: 0 }); return a.band !== "low" || a.hotspots.length > 0; },
};
(async () => {
  const files = fs.readdirSync(dir).filter(f => /\.(md|txt|pdf|docx)$/i.test(f)).map(f => path.join(dir, f));
  const R = Object.fromEntries(Object.keys(INJ).map(k => [k, { tp: 0, fn: 0, fp: 0, tn: 0 }])), aiScores = [];
  for (const f of files) {
    let t; try { t = await textOf(f); } catch (e) { continue; } if (!t || t.length < 3000) continue;
    aiScores.push(AI.check(t, { maxFixes: 0 }).score);
    for (const k of Object.keys(INJ)) {
      const clean = DET[k](t); clean ? R[k].fp++ : R[k].tn++;
      const bad = INJ[k](t); if (!bad) continue; DET[k](bad) ? R[k].tp++ : R[k].fn++;
    }
  }
  const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : null;
  const summary = Object.fromEntries(Object.entries(R).map(([k, r]) => [k, { recall: pct(r.tp, r.tp + r.fn), falseAlarmRate: pct(r.fp, r.fp + r.tn), ...r }]));
  aiScores.sort((a, b) => a - b);
  const res = { papers: aiScores.length, run: new Date().toISOString(), modules: summary, aiStyleOnCleanPapers: { median: aiScores[Math.floor(aiScores.length / 2)], p90: aiScores[Math.floor(aiScores.length * 0.9)], max: aiScores[aiScores.length - 1] },
    note: "Recall: share of injected errors found. False-alarm rate: share of clean papers where the same alarm fires (some are real problems in the paper, so read them). Use aiStyleOnCleanPapers to recalibrate the AI-style reference values." };
  console.log(JSON.stringify(res, null, 2)); if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 2));
})();
