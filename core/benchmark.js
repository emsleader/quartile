// Error-injection benchmark: how often each module finds a known, injected error (recall) and how often the same
// alarm fires on the clean paper. Shared by scripts/benchmark.js and the MCP tool benchmark_corpus.
const L = require("./lib.js"), AI = require("./aistyle.js"), REG = require("./registry.js");
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

function run(texts) {
  const R = Object.fromEntries(Object.keys(INJ).map(k => [k, { tp: 0, fn: 0, fp: 0, tn: 0 }])), aiScores = [], perPaper = [];
  for (const { id, text: t } of texts) {
    if (!t || t.length < 3000) continue; const row = { id, ai: AI.check(t, { maxFixes: 0 }).score, alarmsOnClean: [], missed: [] }; aiScores.push(row.ai);
    for (const k of Object.keys(INJ)) { const clean = DET[k](t); clean ? (R[k].fp++, row.alarmsOnClean.push(k)) : R[k].tn++; const bad = INJ[k](t); if (!bad) continue; DET[k](bad) ? R[k].tp++ : (R[k].fn++, row.missed.push(k)); }
    perPaper.push(row);
  }
  const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : null; aiScores.sort((a, b) => a - b);
  return { papers: aiScores.length, run: new Date().toISOString(), modules: Object.fromEntries(Object.entries(R).map(([k, r]) => [k, { recall: pct(r.tp, r.tp + r.fn), falseAlarmRate: pct(r.fp, r.fp + r.tn), ...r }])),
    aiStyleOnCleanPapers: aiScores.length ? { median: aiScores[Math.floor(aiScores.length / 2)], p90: aiScores[Math.floor(aiScores.length * 0.9)], max: aiScores[aiScores.length - 1] } : null, perPaper,
    note: "Recall: share of injected errors found. False-alarm rate: share of clean papers where the same alarm fires (some are real problems in the paper, so read them). Use aiStyleOnCleanPapers to recalibrate the AI-style reference values." };
}
module.exports = { run, INJ, DET };
