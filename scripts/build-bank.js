#!/usr/bin/env node
// Build a local journal bank from your own SCImago Journal Rank export (CSV from scimagojr.com).
// The SCImago data are not redistributed with Quartile; each user builds their own bank.
// Usage: node scripts/build-bank.js scimagojr_2024.csv [more.csv ...] [--out data/bank.json] [--areas "Business,Economics,Decision"]
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2), files = args.filter(a => !a.startsWith("--") && !/^--/.test(args[args.indexOf(a) - 1] || ""));
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = opt("--out") || path.join(__dirname, "..", "data", "bank.json");
const areas = (opt("--areas") || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
if (!files.length) { console.error("Give at least one SCImago CSV file."); process.exit(1); }

const bank = new Map();
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean), sep = lines[0].includes(";") ? ";" : ",";
  const split = l => { const o = []; let cur = "", qt = false; for (const ch of l) { if (ch === '"') qt = !qt; else if (ch === sep && !qt) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o.map(x => x.trim()); };
  const H = split(lines[0]).map(h => h.toLowerCase()), col = k => H.findIndex(h => h.startsWith(k));
  const ci = { t: col("title"), i: col("issn"), ty: col("type"), s: col("sjr"), q: col("sjr best quartile"), h: col("h index"), d: col("total docs. (20"), cpd: col("cites / doc. (2"), c: col("categories"), a: col("areas") };
  if (ci.t < 0 || ci.s < 0) { console.error(f + ": not a SCImago CSV (no Title/SJR columns)."); continue; }
  const num = v => parseFloat(String(v || "0").replace(/\./g, "").replace(",", ".")) || 0, dec = v => parseFloat(String(v || "0").replace(",", ".")) || 0;
  for (const l of lines.slice(1)) {
    const r = split(l), t = r[ci.t]; if (!t) continue;
    if (areas.length && !areas.some(a => (r[ci.a] || "").toLowerCase().includes(a))) continue;
    const c = (r[ci.c] || "").split(";").map(x => x.trim().match(/^(.*) \(Q([1-4])\)$/)).filter(Boolean).map(m => [m[1], m[2]]);
    const j = { t, i: (r[ci.i] || "").split(",").map(x => x.trim().padStart(8, "0")).filter(x => x !== "00000000"), ty: (r[ci.ty] || "j")[0].toLowerCase(), q: r[ci.q] || "-", s: dec(r[ci.s]), h: num(r[ci.h]), d: num(r[ci.d]), cpd: dec(r[ci.cpd]), c, m: c.length ? c.slice().sort((a, b) => a[1] - b[1])[0][0] : "Uncategorised" };
    bank.set(j.i[0] || t.toLowerCase(), j);
  }
}
// Difficulty 0-100 within the main category (falls back to the whole bank when a category has < 15 journals).
const J = [...bank.values()], by = new Map(); J.forEach(j => { if (!by.has(j.m)) by.set(j.m, []); by.get(j.m).push(j); });
const pct = (arr, v) => { let k = 0; for (const x of arr) if (x < v) k++; return 100 * k / Math.max(arr.length - 1, 1); };
for (const j of J) {
  const g = (by.get(j.m) || []).length >= 15 ? by.get(j.m) : J;
  const ps = pct(g.map(x => x.s), j.s), ph = pct(g.map(x => x.h), j.h), pc = pct(g.map(x => x.cpd), j.cpd), pd = pct(g.map(x => x.d), j.d);
  let sc = 0.45 * ps + 0.2 * ph + 0.2 * pc + 0.15 * (100 - pd); if (j.ty === "c") sc *= 0.6;
  Object.assign(j, { x: Math.round(Math.min(sc, 100)), ps: Math.round(ps), pd: Math.round(pd), ng: g.length });
}
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(J));
console.log(`${J.length} journals written to ${out}. Set QUARTILE_BANK=${out} for the MCP server.`);
