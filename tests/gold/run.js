// Precision, recall and F1 per role and per severity on the gold set (specification 14.1 to 14.2).
// Reads tests/gold/cases/*.json and, on the owner's machine, $QUARTILE_GOLD_PRIVATE/*.json.
// Fails when a target is missed: precision >= 0.85 per role, recall on planted errors >= 0.90, blocker precision >= 0.95.
// Roles with fewer than 5 annotated or flagged items are reported but not gated (too few to measure).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseText } from "../../core/text/parse.js";
import { loadRules } from "../../core/rules/loader.js";
import { runRules } from "../../core/rules/engine.js";
import { runAll } from "../../core/roles/index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dirs = [path.join(dir, "cases"), process.env.QUARTILE_GOLD_PRIVATE].filter(d => d && fs.existsSync(d));
const cases = dirs.flatMap(d => fs.readdirSync(d).filter(f => f.endsWith(".json")).map(f => ({ ...JSON.parse(fs.readFileSync(path.join(d, f), "utf8")), _dir: d, _file: f })));
const rules = loadRules();
const tally = {}, sev = {}, planted = { tp: 0, n: 0 };
const T = (o, k) => (o[k] ||= { tp: 0, fp: 0, fn: 0 });
const overlap = (f, e) => e.start == null || (f.span && f.span.start < e.end && e.start < f.span.end);
for (const c of cases) {
  const text = c.text ?? fs.readFileSync(path.join(c._dir, c.file), "utf8");
  const doc = parseText(text, { design: c.design || null });
  const found = [...runRules(doc, rules), ...(await runAll(doc, { journal: c.journal }))].filter(f => f.severity !== "note" || f.rule);
  const used = new Set();
  for (const e of c.expected || []) {
    const i = found.findIndex((f, k) => !used.has(k) && f.rule === e.rule && overlap(f, e));
    const role = e.role || (i >= 0 ? found[i].role : roleOf(e.rule));
    if (i >= 0) { used.add(i); T(tally, role).tp++; T(sev, found[i].severity).tp++; } else T(tally, role).fn++;
    if (c.planted) { planted.n++; if (i >= 0) planted.tp++; }
  }
  found.forEach((f, k) => { if (!used.has(k) && f.status !== "needs_human") { T(tally, f.role).fp++; T(sev, f.severity).fp++; } });
}
function roleOf(id) { return ({ MTH: "methods", STA: "finance", FIN: "finance", EIC: "eic", BUS: "business", PRD: "production", ETH: "ethics" })[String(id).split("-")[0]] || "other"; }
const m = x => ({ ...x, precision: x.tp + x.fp ? x.tp / (x.tp + x.fp) : null, recall: x.tp + x.fn ? x.tp / (x.tp + x.fn) : null });
const roles = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, m(v)])), sevs = Object.fromEntries(Object.entries(sev).map(([k, v]) => [k, m(v)]));
const fails = [];
for (const [k, v] of Object.entries(roles)) if (v.tp + v.fp >= 5 && v.precision < 0.85) fails.push(`${k}: precision ${v.precision.toFixed(2)} < 0.85`);
if (planted.n >= 5 && planted.tp / planted.n < 0.9) fails.push(`planted recall ${(planted.tp / planted.n).toFixed(2)} < 0.90`);
if (sevs.blocker && sevs.blocker.tp + sevs.blocker.fp >= 5 && sevs.blocker.precision < 0.95) fails.push(`blocker precision ${sevs.blocker.precision.toFixed(2)} < 0.95`);
console.log(JSON.stringify({ cases: cases.length, roles, severities: sevs, planted: { ...planted, recall: planted.n ? planted.tp / planted.n : null } }, null, 1));
if (fails.length) { console.error("Gold targets missed:\n" + fails.join("\n")); process.exit(1); }
console.log(`Gold set: ${cases.length} cases, targets met (roles with fewer than 5 items not gated).`);
