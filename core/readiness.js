// Submission readiness: a transparent pre-submission score from 0 to 100.
// It is NOT a prediction of acceptance. Acceptance depends on the contribution, the editor, the reviewers and the
// fit with the journal, none of which a rule-based tool can observe. The score counts fixable problems, with the
// penalties below, so the author can see exactly why it is what it is and raise it.
const L = require("./lib.js");
const AI = require("./aistyle.js");
const REG = require("./registry.js");

const PEN = {
  deskFail: 8, deskWarn: 2,             // per desk-screen check (cap 40)
  statHigh: 6, statOther: 3,            // per statistics problem (cap 25)
  refMissing: 1, refUnused: 0.5,        // per reference problem (cap 10)
  bizHigh: 3, bizMed: 1.5,              // per business-research issue (cap 15)
  ruleHigh: 1.5, ruleMed: 0.5,          // per Q1 rule flag (cap 8)
  aiModerate: 4, aiHigh: 10,            // AI-style band
  numNotFound: 1,                       // per untraced number when outputs are supplied (cap 15)
};
function readiness(text, { journal, guidelines, outputs = [] } = {}) {
  const a = L.analyze(text, { journal, guidelines }), st = L.Stats.checkAll(L.parse(text).paras.map(p => p.text).join("\n\n"));
  const items = []; const add = (area, pts, cap, why) => { const p = Math.min(pts, cap); if (p > 0) items.push({ area, penalty: +p.toFixed(1), why }); };
  const checks = a.deskScreen.criteria.flatMap(c => c.checks.map(k => ({ ...k, criterion: c.criterion })));
  const fails = checks.filter(c => c.s === "fail"), warns = checks.filter(c => c.s === "warn");
  add("Desk-rejection screen", fails.length * PEN.deskFail + warns.length * PEN.deskWarn, 40, fails.map(f => f.t).concat(warns.map(w => w.t)).slice(0, 8).join("; "));
  const sp = st.problems || [], sh = sp.filter(p => p.severity === "high").length;
  add("Statistics", sh * PEN.statHigh + (sp.length - sh) * PEN.statOther, 25, sp.slice(0, 5).map(p => p.problem).join("; "));
  add("References", a.references.missingFromList.length * PEN.refMissing + a.references.neverCited.length * PEN.refUnused, 10, `${a.references.missingFromList.length} cited but not listed, ${a.references.neverCited.length} listed but not cited`);
  const bz = a.businessResearchIssues; add("Business-research design", bz.filter(b => b.severity === "high").length * PEN.bizHigh + bz.filter(b => b.severity === "med").length * PEN.bizMed, 15, bz.filter(b => b.severity !== "low").slice(0, 5).map(b => b.problem).join("; "));
  const rf = a.q1RuleFlags; add("Q1 writing rules", rf.filter(r => r.sev === "high").length * PEN.ruleHigh + rf.filter(r => r.sev === "med").length * PEN.ruleMed, 8, `${rf.length} rule flags`);
  const ai = AI.check(text, { maxFixes: 0 }); add("AI-style signal", ai.band === "high" ? PEN.aiHigh : ai.band === "moderate" ? PEN.aiModerate : 0, 10, `score ${ai.score} (${ai.band})`);
  let reg = null; if (outputs.length) { reg = REG.registry(text, outputs); const cov = reg.numbers ? reg.matched / reg.numbers : 1;
    // when most numbers are untraced, the outputs supplied are probably incomplete: report it, do not penalise
    if (cov >= 0.4) add("Number registry", reg.notFound * PEN.numNotFound, 10, `${reg.notFound} of ${reg.numbers} numbers not found in the supplied output`);
    else reg.incomplete = `Only ${reg.matched} of ${reg.numbers} numbers matched: the outputs supplied probably do not cover all tables. Supply every output file to trace the rest; no penalty applied.`; }
  const total = items.reduce((s, i) => s + i.penalty, 0), score = Math.max(0, Math.round(100 - total));
  return { kind: "readiness", score, band: score >= 80 ? "ready to submit after a final read" : score >= 60 ? "revise before submitting" : "not ready: fix the listed problems first",
    penalties: items.sort((x, y) => y.penalty - x.penalty), deskRisk: a.deskScreen.risk, aiStyle: { score: ai.score, band: ai.band }, numberRegistry: reg && { matched: reg.matched, notFound: reg.notFound, numbers: reg.numbers, note: reg.incomplete || null },
    formula: "score = 100 − Σ penalties. Desk screen: 8 per failed check, 2 per warning (max 40). Statistics: 6 per high, 3 per other problem (max 25). References: 1 per citation missing from the list, 0.5 per unused entry (max 10). Business design: 3 per high, 1.5 per medium issue (max 15). Q1 rules: 1.5 per high, 0.5 per medium flag (max 8). AI-style: 4 moderate, 10 high. Number registry: 1 per untraced number (max 10), only when at least 40% of numbers are traced (fewer means the outputs are incomplete; no penalty).",
    note: "Readiness counts fixable problems; it does not predict acceptance. No tool can: decisions depend on contribution, fit, editor and reviewers. A high score means the paper is unlikely to be desk-rejected for avoidable reasons." };
}
module.exports = { readiness, PEN };
