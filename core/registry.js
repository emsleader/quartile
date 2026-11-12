// Number registry: traces every reported number in a manuscript to the raw software output that produced it
// (R, Stata, SPSS, Python, EViews log or a CSV of estimates), allowing for rounding, dropped leading zeros,
// percentages and sign. A number with no source in the output is listed for the author to trace or correct.
// This is the only honest way to show where a number came from: match it to the output the author supplies.
const L = require("./lib.js");

const NUM = /(?<![\p{L}\d.,])[-−–]?(?:(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?%?/gu;
function toNum(s) { const neg = /^[-−–]/.test(s); const v = parseFloat(s.replace(/^[-−–]/, "").replace(/,/g, "").replace(/%$/, "")); return neg ? -v : v; }
function decimals(s) { const m = s.replace(/%$/, "").match(/\.(\d+)(?:[eE]|$)/); return m ? m[1].length : 0; }

function outputNumbers(out) {
  const vals = []; String(out).replace(/<\s*2(?:\.2)?e-16/gi, " 0 ").replace(NUM, m => { const v = toNum(m); if (isFinite(v)) vals.push(v); return m; });
  return vals;
}
// numbers worth tracing: estimates and statistics, not years, citations, section/table labels or small counts
function manuscriptNumbers(text) {
  const d = L.parse(text), out = [];
  d.paras.forEach(p => {
    const role = d.roleOf(p.id); if (p.isHeading || p.isRef || ["references", "declarations"].includes(role)) return;
    const t = p.text.replace(/\([^()]*(?:19|20)\d{2}[a-z]?[^()]*\)/g, m => " ".repeat(m.length)); // blank citations, keep offsets
    let m; NUM.lastIndex = 0;
    while ((m = NUM.exec(t))) {
      const s = m[0], v = toNum(s), dec = decimals(s), before = t.slice(Math.max(0, m.index - 30), m.index), after = t.slice(m.index + s.length, m.index + s.length + 20);
      if (!dec && !s.endsWith("%") && (Math.abs(v) < 100 || (v >= 1900 && v <= 2100))) continue; // small integers, years
      if (/\b(Table|Figure|Fig\.|Section|Model|Column|Hypothesis|H|Eq\.|Equation|Appendix|Step|Wave)\s*$/i.test(before)) continue;
      if (/^[-–]\d/.test(after) && v >= 1900 && v <= 2100) continue;
      out.push({ text: s, value: v, decimals: dec, percent: s.endsWith("%"), role, para: p.id, context: (before + s + after).replace(/\s+/g, " ").trim() });
    }
  });
  return out;
}
function match(n, outVals) {
  const tol = n.decimals ? 0.5 * Math.pow(10, -n.decimals) + 1e-9 : 0.5 + 1e-9;
  const cands = n.percent ? [n.value, n.value / 100] : [n.value];
  for (const c of cands) for (const o of outVals) {
    if (Math.abs(o - c) <= tol) return { how: c === n.value ? "exact or rounded" : "percentage of a proportion", source: o };
    if (Math.abs(Math.abs(o) - Math.abs(c)) <= tol) return { how: "same magnitude, sign differs", source: o, warn: true };
  }
  // truncated rather than rounded (e.g. 0.0349 reported as 0.034)
  for (const o of outVals) if (n.decimals && Math.abs(Math.trunc(o * 10 ** n.decimals) / 10 ** n.decimals - n.value) < 1e-9 && Math.abs(o - n.value) > tol - 1e-9) return { how: "truncated, not rounded", source: o, warn: true };
  return null;
}
function registry(text, outputs = []) {
  const nums = manuscriptNumbers(text), vals = outputs.flatMap(o => outputNumbers(o.text).map(v => v)), byOut = outputs.map(o => ({ name: o.name, vals: outputNumbers(o.text) }));
  const rows = nums.map(n => { const m = vals.length ? match(n, vals) : null; const src = m ? (byOut.find(b => b.vals.includes(m.source)) || {}).name : null; return { ...n, status: !vals.length ? "no output supplied" : m ? (m.warn ? "check" : "matched") : "not found in output", how: m && m.how, sourceValue: m ? m.source : null, sourceFile: src }; });
  // consistency inside the manuscript: numbers stated in the abstract or conclusion must also appear in the results or tables
  const results = new Set(nums.filter(n => !["abstract", "opening", "conclusion", "introduction"].includes(n.role)).map(n => n.value));
  const summaryOnly = nums.filter(n => ["abstract", "conclusion"].includes(n.role) && !results.has(n.value) && n.decimals > 0).map(n => ({ text: n.text, role: n.role, context: n.context }));
  const traced = rows.filter(r => ["results", "methods", "abstract", "conclusion", "discussion"].includes(r.role) || r.role === "body");
  const cnt = s => rows.filter(r => r.status === s).length;
  return { kind: "number_registry", numbers: rows.length, matched: cnt("matched"), check: cnt("check"), notFound: cnt("not found in output"), outputsSupplied: outputs.length, outputValues: vals.length,
    coverage: vals.length && rows.length ? +(100 * cnt("matched") / rows.length).toFixed(1) : null,
    rows, summaryNotInResults: summaryOnly, tracedSections: traced.length,
    note: outputs.length ? "Each number was matched to the supplied output allowing for rounding to the reported decimals, a dropped leading zero, percentages of proportions and sign. 'Not found' means the number has no source in these files: add the output that produced it or correct it. A match shows the number is consistent with the output, not that the analysis is right." : "No software output was supplied. Paste the R/Stata/SPSS/Python log or a CSV of estimates as outputs to trace every number. The abstract-versus-results check below runs anyway." };
}
module.exports = { registry, manuscriptNumbers, outputNumbers, match };
