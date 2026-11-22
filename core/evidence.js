// Evidence ledger and claim audit for empirical business research.
// Ledger: one row per material claim, graded by evidence class (A-E) and, separately, by status
// (OBSERVED / DERIVED / CONDITIONAL / NOT_IDENTIFIED). checkLedger validates a ledger; claimAudit reads a
// manuscript and flags claims that go further than this kind of evidence can support.
import L from "./lib.js";
import { loadRules } from "./rules/loader.js";
import { patternHits } from "./rules/engine.js";

const FIELDS = ["claim_id", "claim", "source_url", "source_document_title", "publication_date", "capture_date", "retrieval_date", "source_type",
  "country", "legal_entity_id", "site_id", "sector", "technology_type", "business_model", "observation_unit", "period",
  "original_value", "original_currency", "unit", "extracted_quote_or_locator", "evidence_grade", "verification_status", "uncertainty",
  "calculation_method", "conflicts", "related_party", "reviewer_notes"];
const REQUIRED = ["claim_id", "claim", "source_type", "observation_unit", "period", "evidence_grade", "verification_status"];
const CLASSES = { A: "directly verified official or administrative filing, or primary legal source", B: "official operator or institutional disclosure, correctly dated and attributed", C: "credible independent corroboration", D: "advertisement, franchisor, vendor or marketplace statement (asking prices are not transactions)", E: "model assumption, projection, extrapolation or unverified candidate" };
const STATUSES = ["OBSERVED", "DERIVED", "CONDITIONAL", "NOT_IDENTIFIED"];
const UNITS = ["legal entity", "establishment", "site", "franchise network", "supplier", "manufacturer", "service offering", "equipment device", "web record", "country", "sector", "country-sector", "market"];

function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false; const s = String(text).replace(/^﻿/, "");
  const sep = (s.split(/\r?\n/)[0].match(/;/g) || []).length > (s.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
  for (let i = 0; i < s.length; i++) { const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}
function template() { return FIELDS.join(",") + "\n" + ["C001", "Example: the studio lists 39 EUR per session", "https://example.org/prices", "Price list", "2026-11-01", "2026-11-09", "2026-11-09", "operator website", "RO", "", "S-001", "fitness", "WB-EMS", "integrated", "service offering", "2026-11", "39", "EUR", "per session", "Prices section, 2nd table", "D", "OBSERVED", "asking price; contract terms not shown", "", "", "no", ""].map(v => /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join(",") + "\n"; }

function checkLedger(text) {
  const rows = parseCsv(text), issues = [], add = (id, sev, problem, fix) => issues.push({ claim_id: id, severity: sev, problem, fix });
  if (!rows.length) return { kind: "ledger", error: "The ledger has no rows. Start from the template." , template: template() };
  const cols = Object.keys(rows[0]); const missingCols = REQUIRED.filter(c => !cols.includes(c));
  if (missingCols.length) add("—", "high", "Missing required columns: " + missingCols.join(", "), "Add the columns (see template).");
  const ids = new Map();
  rows.forEach((r, i) => {
    const id = r.claim_id || `row ${i + 2}`; const g = (r.evidence_grade || "").toUpperCase(), st = (r.verification_status || "").toUpperCase().replace(/[\s/]+/g, "_").replace("UNOBSERVED_NOT_IDENTIFIED", "NOT_IDENTIFIED").replace("UNOBSERVED", "NOT_IDENTIFIED");
    const t = (r.source_type || "").toLowerCase(), unit = (r.observation_unit || "").toLowerCase(), claim = (r.claim || "") + " " + (r.reviewer_notes || "");
    if (ids.has(r.claim_id) && r.claim_id) add(id, "high", `Duplicate claim_id (also row ${ids.get(r.claim_id)})`, "Give every claim its own id."); else ids.set(r.claim_id, i + 2);
    REQUIRED.forEach(c => { if (cols.includes(c) && !r[c] && !(c === "evidence_grade") && !(st === "NOT_IDENTIFIED" && ["source_type"].includes(c))) add(id, "med", `Empty ${c}`, `Fill ${c}.`); });
    const noGrade = !g || /^[—–\-]+$|^n\/?a$|^none$/i.test(g);
    if (noGrade && st === "NOT_IDENTIFIED") { /* nothing was found, so there is no source to grade */ }
    else if (noGrade && cols.includes("evidence_grade")) add(id, "med", "Empty evidence grade", "Grade the source A-E, or set the status to NOT_IDENTIFIED if no source exists.");
    else if (g && !CLASSES[g]) add(id, "high", `Evidence grade '${r.evidence_grade}' is not A-E`, "Use A, B, C, D or E.");
    if (st && !STATUSES.includes(st)) add(id, "high", `Status '${r.verification_status}' is not one of ${STATUSES.join(", ")}`, "Use the status axis, separate from the grade.");
    if (g === "A" && /(advert|vendor|franchis|marketplace|web|site|directory|snapshot|listing|press|news|blog|wayback|secondary|summary|aggregator)/.test(t)) add(id, "high", `Grade A with source type '${r.source_type}'`, "Grade A needs the official filing or primary legal text itself; a website, vendor page or secondary summary is B-D.");
    if (g === "A" && !r.source_url && !r.extracted_quote_or_locator) add(id, "med", "Grade A without a source link or locator", "Add the filing link and the page or line.");
    if (/(advert|vendor|franchis|marketplace|listing)/.test(t) && ["A", "B", "C"].includes(g)) add(id, "med", `Grade ${g} for a ${r.source_type} source`, "Advertisements and vendor statements are class D.");
    if (st === "DERIVED" && !r.calculation_method) add(id, "high", "DERIVED without calculation_method", "Write the formula and the inputs (claim ids).");
    if (st === "CONDITIONAL" && g !== "E" && !/(assum|scenario|range|if )/i.test(r.calculation_method + " " + r.uncertainty)) add(id, "med", "CONDITIONAL without stated assumptions", "State the assumption or parameter range the result depends on.");
    if (g === "E" && st === "OBSERVED") add(id, "high", "Grade E (assumption or projection) marked OBSERVED", "An assumption is CONDITIONAL or NOT_IDENTIFIED, never OBSERVED.");
    if (r.original_value && !r.unit) add(id, "med", "Value without a unit", "Add the unit (per session, per month, EUR thousand ...).");
    if (r.original_value && !/percent|%|ratio|share|count|number|sessions?$/i.test(r.unit) && /[€$£]|eur|ron|pln|huf|bgn|usd|price|revenue|cost|profit/i.test(claim + r.unit) && !r.original_currency) add(id, "med", "Money value without currency", "Add the original currency; convert in a DERIVED row.");
    if (/(market share|market-wide growth|growth rate|resilien|survival rate)/i.test(claim) && /(snapshot|web record|advert|listing|wayback|directory)/i.test(t + " " + unit)) add(id, "high", "A snapshot, advertisement or web-visible list used for market share, growth or resilience", "These sources show presence at a date, not share, growth or survival. Restate as 'visible on <date>'.");
    if (/(wn|ems|service).{0,40}(profit|margin)/i.test(claim) && /legal entity/.test(unit) && !/separat|segment|service-level/i.test(r.calculation_method + r.reviewer_notes)) add(id, "high", "Service-level profit from legal-entity accounts", "A diversified company's net profit is not the service's profit; mark NOT_IDENTIFIED or model it as CONDITIONAL.");
    if (/(discontinu|closed|exit|ceased)/i.test(claim) && /wayback|archive|snapshot/i.test(t) && st === "OBSERVED") add(id, "high", "Discontinuation 'observed' from missing archive snapshots", "A missing snapshot does not prove discontinuation; needs a dated record (registry, notice).");
    if (unit && !UNITS.some(u => unit.includes(u))) add(id, "low", `Observation unit '${r.observation_unit}' is not one of the standard units`, "Use one unit: " + UNITS.join(", ") + ".");
    if (/^(yes|true|1)$/i.test(r.related_party || "") && !/independ/i.test(r.reviewer_notes + r.conflicts)) add(id, g === "A" ? "med" : "high", "Related-party source without independent verification", "Corroborate with an independent source or keep the claim out of the main results.");
  });
  const by = (k, f) => rows.reduce((a, r) => { const v = f(r) || "(empty)"; a[v] = (a[v] || 0) + 1; return a; }, {});
  return { kind: "ledger", claims: rows.length, byGrade: by("g", r => (r.evidence_grade || "").toUpperCase()), byStatus: by("s", r => (r.verification_status || "").toUpperCase()), byUnit: by("u", r => r.observation_unit), issues,
    high: issues.filter(i => i.severity === "high").length, classes: CLASSES, statuses: STATUSES, fields: FIELDS,
    note: "Grade (A-E) says how strong the source is; status says what kind of statement the claim is. A claim can be well sourced and still only CONDITIONAL." };
}

// ---- manuscript claim audit ----
// The pattern rules live in rulebook/quartile_core.yaml (moved there in Phase 0, behaviour unchanged).
const RULES = loadRules().filter(r => r.source_id === "QUARTILE_CORE" && r.legacy_id).map(r => ({ ...r, label: r.title }));
function claimAudit(text) {
  const d = L.parse(text), out = [];
  const paras = d.paras.filter(p => !p.isHeading && !p.isRef && !p.isTable && !["references"].includes(d.roleOf(p.id)));
  paras.forEach(p => p.text.split(/(?<=[.!?])\s+(?=[A-Z])/).forEach(s => RULES.forEach(r => {
    if (!patternHits(r, s).length) return;
    out.push({ rule: r.legacy_id, label: r.label, sentence: s.trim(), section: d.roleOf(p.id), fix: r.fix });
  })));
  const all = d.paras.filter(p => !p.isRef).map(p => p.text).join(" "); // headings included: "10. Conflict of interest" or "9. Limitations" are disclosures
  const checks = [
    { ok: /\b(conflicts? of interest|competing interests?|declarations? of interests?|disclos\w+|related[- ]part(y|ies))\b/i.test(all), t: "Conflict-of-interest disclosure present", fix: "Disclose commercial roles in the industry studied, and mark related-party sources." },
    { ok: /\b(OBSERVED|DERIVED|CONDITIONAL|NOT IDENTIFIED|not identified|conditional on|under the assumption)\b/.test(all), t: "Evidence status stated for results", fix: "Label results as observed, derived, conditional on assumptions, or not identified." },
    { ok: !/\b(market share|growth rate)\b/i.test(all) || /\b(not identified|cannot (be )?(estimat|identif))/i.test(all), t: "Share or growth either identified or explicitly not identified", fix: "If the data are a snapshot, say that share and growth are not identified." },
    { ok: /\b(limitations?|threats to validity)\b/i.test(all), t: "Limitations section or paragraph", fix: "State what the evidence cannot show." },
  ];
  return { kind: "claims", flagged: out.length, findings: out, checks, rules: RULES.map(r => ({ id: r.legacy_id, label: r.label, rulebook_id: r.id })),
    output_contract: ["FACT/OBSERVED", "DERIVED", "CONDITIONAL MODEL RESULT", "NOT IDENTIFIED"],
    note: "Rule-based: a flag means the sentence combines a strong claim with evidence words that cannot carry it. Read each in context; some will be fine." };
}
export { checkLedger, claimAudit, template, FIELDS, CLASSES, STATUSES, parseCsv };
export default { checkLedger, claimAudit, template, FIELDS, CLASSES, STATUSES, parseCsv };
