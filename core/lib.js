// Document-level API shared by the MCP server and the tests.
// Everything here is deterministic: no AI calls, no network unless a function says so.
const Core = require("./core.js");
const Stats = require("./stats.js");
const Style = require("./style.js");

function parse(text) {
  const paras = Core.splitParagraphs(String(text || ""));
  const secs = []; let cur = { id: "_start", title: "Text before the first heading", paras: [] };
  for (const p of paras) { if (p.isHeading) { if (cur.paras.length || cur.id !== "_start") secs.push(cur); cur = { id: p.id, title: p.text.replace(/^#+\s*/, ""), paras: [] }; } else cur.paras.push(p.id); }
  secs.push(cur);
  const sections = secs.filter(x => x.paras.length).map(x => ({ ...x, role: x.id === "_start" ? "opening" : Core.detectRole(x.title) }));
  const roleOf = id => { const s = sections.find(x => x.paras.includes(id)); return s ? s.role : "other"; };
  return { paras, sections, roleOf, byId: id => paras.find(p => p.id === id) };
}

function references(doc) {
  const refs = doc.paras.filter(p => p.isRef || doc.roleOf(p.id) === "references").map(p => ({ id: p.id, text: p.text, ...Core.parseRef(p.text) }));
  const body = doc.paras.filter(p => !p.isHeading && !p.isRef && !["references", "declarations"].includes(doc.roleOf(p.id))).map(p => p.text).join(" ");
  const cites = [...new Set(Core.citations(body).filter(c => !c.startsWith("10.")))];
  const keys = new Map(refs.map(r => [Core.citeKey(r.surname, r.year), r]));
  const missing = [], used = new Set();
  if (cites.some(c => c.startsWith("["))) {
    const nums = new Set(); cites.filter(c => c.startsWith("[")).forEach(c => c.slice(1, -1).split(",").forEach(part => { const [a, b] = part.split(/[–-]/).map(Number); for (let k = a; k <= (b || a); k++) nums.add(k); }));
    nums.forEach(n => { if (n > refs.length) missing.push("[" + n + "]"); else used.add(refs[n - 1].id); });
  } else cites.forEach(c => { const i = c.lastIndexOf(" "), nm = c.slice(0, i), yr = c.slice(i + 1); const r = keys.get(Core.citeKey(nm, yr)); if (r) used.add(r.id); else if (!/^(Table|Figure|Section|Appendix|Model|Eq|Equation|Hypothesis|H)$/i.test(nm)) missing.push(c); });
  const now = new Date().getFullYear(), years = refs.map(r => parseInt(r.year)).filter(Boolean);
  return { references: refs.map(r => ({ id: r.id, surname: r.surname, year: r.year, doi: r.doi || null, text: r.text })), inTextCitations: cites, missingFromList: missing, neverCited: refs.filter(r => !used.has(r.id)).map(r => r.text), last5Years: years.filter(y => y >= now - 5).length };
}

function desk(doc, opts = {}) {
  const txt = id => { const p = doc.byId(id) || {}; return p.isTable ? "" : (p.text || ""); };
  const refs = doc.paras.filter(p => p.isRef || doc.roleOf(p.id) === "references").map(p => Core.parseRef(p.text));
  return Core.deskScreen({ sections: doc.sections, text: txt, refs, verified: {}, guidelines: opts.guidelines || "", journal: opts.journal || "", allText: doc.paras.filter(p => !p.isRef).map(p => p.text).join("\n") });
}

function analyze(text, opts = {}) {
  const doc = parse(text), terms = opts.terms || [];
  const body = doc.paras.filter(p => !p.isRef).map(p => p.text).join("\n\n");
  const txt = id => { const p = doc.byId(id) || {}; return p.isTable ? "" : (p.text || ""); };
  const biz = Core.bizChecks(doc.paras, doc.sections);
  return {
    words: Core.words(body).length, paragraphs: doc.paras.filter(p => !p.isHeading).length,
    sections: doc.sections.map(s => ({ title: s.title, role: s.role, paragraphs: s.paras.length })),
    diagnostics: Core.diagnostics(body), aiStyle: Core.aiTells(body), design: biz.method, namedTheories: biz.theories,
    q1RuleFlags: Core.ruleChecks(doc.sections, txt), businessResearchIssues: biz.issues, consistency: Core.consistency(doc.paras), citationStyle: Core.citeStyle(doc.paras),
    deskScreen: desk(doc, opts), references: references(doc), statistics: Stats.checkAll(doc.paras.map(p => p.text).join("\n\n")).summary,
    protectedTerms: terms
  };
}

// The guard: what changed between an original and a revision that could alter scientific meaning.
function verify(original, revised, terms) {
  const flags = Core.compare(original, revised, terms || []);
  const blocking = flags.filter(f => f.guard);
  return { pass: blocking.length === 0, blocking, warnings: flags.filter(f => !f.guard), rule: "Reject the revision if pass is false: it adds or changes numbers, citations, protected terms, names or causal claims, or adds sentences." };
}

function applyReplacements(text, reps, terms) {
  let out = String(text); const report = [];
  for (const r of reps || []) {
    const q = r.quote || "", n = q ? out.split(q).length - 1 : 0;
    if (!q || n === 0) { report.push({ quote: q, status: "skipped", reason: "quote not found exactly" }); continue; }
    if (n > 1 && !r.occurrence) { report.push({ quote: q, status: "skipped", reason: `quote occurs ${n} times; give occurrence (1-based)` }); continue; }
    const words = (r.replacement || "").split(/\s+/).length, qw = q.split(/\s+/).length;
    if (words > qw * 2 + 8) { report.push({ quote: q, status: "rejected", reason: "replacement is much longer than the quote (possible added content)" }); continue; }
    const v = verify(q, r.replacement || "", terms);
    if (!v.pass) { report.push({ quote: q, status: "rejected", reason: v.blocking.map(f => f.type + (f.detail ? ": " + f.detail : "")).join("; ") }); continue; }
    let idx = -1; for (let k = 0; k < (r.occurrence || 1); k++) idx = out.indexOf(q, idx + 1);
    out = out.slice(0, idx) + r.replacement + out.slice(idx + q.length); report.push({ quote: q, status: "applied" });
  }
  return { text: out, report, applied: report.filter(x => x.status === "applied").length };
}

// ---- journal bank (user-built from their own SCImago export; not distributed) ----
let BANK = null;
function loadBank(path) {
  const fs = require("fs"); const p = path || process.env.QUARTILE_BANK || require("path").join(__dirname, "..", "data", "bank.json");
  try { BANK = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { BANK = []; }
  return BANK.length;
}
const jnorm = t => (t || "").toLowerCase().replace(/&amp;/g, "and").replace(/&/g, "and").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
const diffLevel = x => x >= 80 ? "Very hard" : x >= 60 ? "Hard" : x >= 40 ? "Moderate" : "Accessible";
function journalLookup(q) {
  if (!BANK) loadBank(); const n = jnorm(q), issn = String(q).replace(/-/g, "").toUpperCase();
  const hit = BANK.filter(j => jnorm(j.t) === n || (j.i || []).includes(issn));
  const list = hit.length ? hit : BANK.filter(j => jnorm(j.t).includes(n)).slice(0, 10);
  return list.map(j => ({ title: j.t, issn: j.i, quartile: j.q, sjr: j.s, hIndex: j.h, docs: j.d, citesPerDoc: j.cpd, mainCategory: j.m, difficulty: j.x, level: diffLevel(j.x), categories: j.c }));
}
function journalSuggest({ keywords = [], quartile, maxDifficulty = 100, limit = 15 }) {
  if (!BANK) loadBank(); const ks = keywords.map(k => k.toLowerCase());
  return BANK.filter(j => (!quartile || j.q === quartile) && j.x <= maxDifficulty && (!ks.length || ks.some(k => (j.t + " " + (j.c || []).map(c => c[0]).join(" ")).toLowerCase().includes(k))))
    .sort((a, b) => b.x - a.x).slice(0, limit).map(j => ({ title: j.t, quartile: j.q, sjr: j.s, difficulty: j.x, level: diffLevel(j.x), mainCategory: j.m }));
}

function styleGuide(tier = "Q1", type = "A", role) {
  return { tier, tierStandard: Style.TIERS[tier] || Style.TIERS.Q1, rigorRule: Style.TIER_RIGOR, writingType: Style.WTYPES[type] || Style.WTYPES.A, sectionRules: role ? Style.ROLE_RULES[role] : Style.ROLE_RULES, q1Rules: Style.BASE_RULES, editLevels: Style.LEVELS,
    nonNegotiable: ["Keep every number, statistic, unit, sample size and p-value exactly.", "Keep every citation attached to the same claim.", "Keep protected constructs verbatim and distinct.", "Never strengthen a hedge or turn association into causation.", "Never add claims, findings, names, references or numbers; every revised sentence must come from an original sentence.", "Run verify_rewrite on every revised paragraph and keep the original if pass is false."] };
}

module.exports = { Core, Stats, Style, parse, analyze, references, desk, verify, applyReplacements, loadBank, journalLookup, journalSuggest, styleGuide, diffLevel };
