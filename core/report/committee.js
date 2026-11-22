// Final committee report (specification Section 13). Aggregates the findings of the rulebook and the role modules
// into one light per role, a readiness score, an overall readiness state and the human checklist.
// The states "ready to submit" / "revise first" / "not ready" describe the manuscript's readiness only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDowngrades, downgradedRules } from "./feedback.js";

export const LABEL = "Simulated pre-submission review — not a journal decision";
export const ROLES = ["eic", "methods", "finance", "business", "production", "ethics"];
export const ROLE_NAMES = { eic: "Editor-in-chief", methods: "Methods reviewer", finance: "Finance and statistics reviewer",
  business: "Business-administration committee", production: "Production editor", ethics: "Ethics and data office",
  writing: "Writing craft", core: "Quartile core checks", response: "Response manager", other: "Other checks" };
export const W = { blocker: 25, major: 8, minor: 2, note: 0 };
const SEV_RANK = { blocker: 0, major: 1, minor: 2, note: 3 };
const CONF_RANK = { high: 0, medium: 1, low: 2 };
// Each light has an icon and a word, so colour is never the only signal (Okabe-Ito colour-blind-safe colours).
export const LIGHTS = {
  green: { icon: "✔", word: "Green", meaning: "no major issue found", color: "#009E73" },
  amber: { icon: "▲", word: "Amber", meaning: "revise before submission", color: "#E69F00" },
  red: { icon: "✖", word: "Red", meaning: "serious issue to fix first", color: "#D55E00" },
};

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export function quartileVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || "unknown"; } catch { return "unknown"; }
}

/** Fill missing fields so every finding has the shape of hard rule 6. */
export function normalizeFinding(f) {
  const sev = SEV_RANK[f.severity] != null ? f.severity : "note";
  return { rule: f.rule || "UNKNOWN", role: f.role || "other", title: f.title || f.rule || "Finding", severity: sev,
    confidence: CONF_RANK[f.confidence] != null ? f.confidence : "medium", source: f.source ?? null, source_ref: f.source_ref ?? null,
    message: f.message || "", fix: f.fix ?? null, span: f.span ?? null, detail: f.detail ?? null,
    ...(f.status ? { status: f.status } : {}), ...(f.downgraded ? { downgraded: f.downgraded } : {}) };
}

const bySeverity = (a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || (CONF_RANK[a.confidence] - CONF_RANK[b.confidence])
  || ((a.span?.start ?? Infinity) - (b.span?.start ?? Infinity)) || String(a.rule).localeCompare(String(b.rule));

/** Light for one role. Human-checklist items never colour a light. */
export function light(fs) {
  const counted = fs.filter(f => f.status !== "needs_human");
  if (counted.some(f => f.severity === "blocker")) return "red";
  const majors = counted.filter(f => f.severity === "major").length;
  return majors >= 3 ? "red" : majors ? "amber" : "green";
}

function roleRow(role, fs) {
  const counted = fs.filter(f => f.status !== "needs_human");
  const l = light(fs);
  return { role, name: ROLE_NAMES[role] || role, light: l, icon: LIGHTS[l].icon, word: LIGHTS[l].word,
    blockers: counted.filter(f => f.severity === "blocker").length, majors: counted.filter(f => f.severity === "major").length,
    minors: counted.filter(f => f.severity === "minor").length, notes: counted.filter(f => f.severity === "note").length,
    findings: counted.length, top3: counted.filter(f => f.severity !== "note").sort(bySeverity).slice(0, 3) };
}

/**
 * committeeReport(findings, design, opts)
 * opts: { title, journal, date, version, feedback (default true: apply local downgrades), downgrades (Map, for tests) }
 */
export function committeeReport(findings, design, opts = {}) {
  const downgrades = opts.downgrades ?? (opts.feedback === false ? new Map() : downgradedRules());
  const all = applyDowngrades((findings || []).map(normalizeFinding), downgrades).sort(bySeverity);
  const byRole = Object.fromEntries(ROLES.map(r => [r, all.filter(f => f.role === r)]));
  const roles = ROLES.map(r => roleRow(r, byRole[r]));
  const otherKeys = [...new Set(all.map(f => f.role).filter(r => !ROLES.includes(r)))].sort();
  const other_roles = otherKeys.map(r => roleRow(r, all.filter(f => f.role === r)));
  const counted = all.filter(f => f.status !== "needs_human");
  const penalty = counted.reduce((s, f) => s + (f.confidence === "low" ? 0 : W[f.severity]), 0);
  const overall = roles.some(r => r.light === "red") ? "not ready" : roles.some(r => r.light === "amber") ? "revise first" : "ready to submit";
  const d = design && typeof design === "object" ? design : { primary: design || "unknown", declared: false };
  return {
    label: LABEL,
    header: { title: opts.title || null, design: d.primary || "unknown", design_source: d.declared ? "declared" : "detected",
      journal: opts.journal || null, date: opts.date || new Date().toISOString().slice(0, 10), quartile_version: opts.version || quartileVersion() },
    design: d,
    readiness: Math.max(0, 100 - penalty),
    readiness_note: "Readiness is 100 minus 25 per blocker, 8 per major and 2 per minor finding (low-confidence findings and the human checklist do not count). It measures open issues, not the chance of any journal outcome.",
    overall,
    overall_rule: "not ready: any role red (a blocker, or 3 or more majors); revise first: any role amber (1 or 2 majors); ready to submit: no blocker and no major in the six roles.",
    roles,
    other_roles,
    counts: { findings: all.length, blockers: counted.filter(f => f.severity === "blocker").length, majors: counted.filter(f => f.severity === "major").length,
      minors: counted.filter(f => f.severity === "minor").length, notes: counted.filter(f => f.severity === "note").length, needs_human: all.length - counted.length },
    needsHuman: all.filter(f => f.status === "needs_human"),
    downgraded: [...downgrades.values()].map(s => ({ rule: s.rule, false_positives: s.false_positives })),
    findings: all,
  };
}

export default { committeeReport, light, normalizeFinding, quartileVersion, LABEL, ROLES, ROLE_NAMES, LIGHTS, W };
