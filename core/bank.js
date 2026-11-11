// Build a journal bank (with difficulty scores) from SCImago CSV text.
// Used by scripts/build-bank.js and by the server, which can download the public SCImago list itself at start-up.
function parseCsv(text, areas = []) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = l => { const o = []; let cur = "", qt = false; for (const ch of l) { if (ch === '"') qt = !qt; else if (ch === sep && !qt) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o.map(x => x.trim()); };
  const H = split(lines[0]).map(h => h.toLowerCase()), col = k => H.findIndex(h => h.startsWith(k));
  const ci = { t: col("title"), i: col("issn"), ty: col("type"), s: col("sjr"), q: col("sjr best quartile"), h: col("h index"), d: col("total docs. (20"), cpd: col("cites / doc. (2"), c: col("categories"), a: col("areas") };
  if (ci.t < 0 || ci.s < 0) return [];
  const num = v => parseFloat(String(v || "0").replace(/\./g, "").replace(",", ".")) || 0, dec = v => parseFloat(String(v || "0").replace(",", ".")) || 0;
  const ar = areas.map(a => a.toLowerCase()), out = new Map();
  for (const l of lines.slice(1)) {
    const r = split(l), t = r[ci.t]; if (!t) continue;
    if (ar.length && !ar.some(a => (r[ci.a] || "").toLowerCase().includes(a))) continue;
    const c = (r[ci.c] || "").split(";").map(x => x.trim().match(/^(.*) \(Q([1-4])\)$/)).filter(Boolean).map(m => [m[1], m[2]]);
    const j = { t, i: (r[ci.i] || "").split(",").map(x => x.trim().padStart(8, "0")).filter(x => x !== "00000000"), ty: (r[ci.ty] || "j")[0].toLowerCase(), q: r[ci.q] || "-", s: dec(r[ci.s]), h: num(r[ci.h]), d: num(r[ci.d]), cpd: dec(r[ci.cpd]), c, m: c.length ? c.slice().sort((a, b) => a[1] - b[1])[0][0] : "Uncategorised" };
    out.set(j.i[0] || t.toLowerCase(), j);
  }
  return [...out.values()];
}
// Difficulty 0-100 within the main category (whole bank when a category has < 15 journals).
function score(J) {
  const by = new Map(); J.forEach(j => { if (!by.has(j.m)) by.set(j.m, []); by.get(j.m).push(j); });
  const pct = (arr, v) => { let k = 0; for (const x of arr) if (x < v) k++; return 100 * k / Math.max(arr.length - 1, 1); };
  for (const j of J) {
    const g = (by.get(j.m) || []).length >= 15 ? by.get(j.m) : J;
    const ps = pct(g.map(x => x.s), j.s), ph = pct(g.map(x => x.h), j.h), pc = pct(g.map(x => x.cpd), j.cpd), pd = pct(g.map(x => x.d), j.d);
    let sc = 0.45 * ps + 0.2 * ph + 0.2 * pc + 0.15 * (100 - pd); if (j.ty === "c") sc *= 0.6;
    Object.assign(j, { x: Math.round(Math.min(sc, 100)), ps: Math.round(ps), pd: Math.round(pd), ng: g.length });
  }
  return J;
}
const buildBank = (csvText, areas) => score(parseCsv(csvText, areas));
module.exports = { parseCsv, score, buildBank };
