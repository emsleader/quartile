#!/usr/bin/env node
// Build a local journal bank from SCImago Journal Rank CSV exports (scimagojr.com).
// Usage: node scripts/build-bank.js scimagojr_2024.csv [more.csv ...] [--out data/bank.json] [--areas "Business,Economics,Decision"]
const fs = require("fs"), path = require("path"), { parseCsv, score } = require("../core/bank.js");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const skip = new Set(["--out", "--areas"].map(k => args.indexOf(k) + 1).filter(i => i > 0));
const files = args.filter((a, i) => !a.startsWith("--") && !skip.has(i));
const out = opt("--out") || path.join(__dirname, "..", "data", "bank.json");
const areas = (opt("--areas") || "").split(",").map(x => x.trim()).filter(Boolean);
if (!files.length) { console.error("Give at least one SCImago CSV file."); process.exit(1); }
const all = new Map(); for (const f of files) parseCsv(fs.readFileSync(f, "utf8"), areas).forEach(j => all.set(j.i[0] || j.t.toLowerCase(), j));
const J = score([...all.values()]);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(J));
console.log(`${J.length} journals written to ${out}. Set QUARTILE_BANK=${out} for the MCP server.`);
