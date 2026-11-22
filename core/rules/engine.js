// Rule engine (specification Section 4.2). Runs the rules that apply to the document's design and returns
// findings with rule ID, role, severity, confidence, source, exact span and fix.
import { isNegated } from "../text/negation.js";
import * as structural from "./structural.js";

// Denial rules from the claim audit (0.14.1), kept so moved rules behave exactly as before.
const NEG = "(?:not|never|no longer|no|nor|neither|rather than|instead of|cannot|can't|does not|do not|is not|was not|are not|were not|without)";
export function negBefore(s, index) { const before = s.slice(0, index).split(/\s+/).slice(-6).join(" "); return new RegExp("\\b" + NEG + "\\b", "i").test(before); }
export function negNear(s) { return new RegExp("\\b" + NEG + "\\b(?:\\W+\\w+){0,6}?\\W+(?:read|used|infer\\w*|treated|taken|interpreted|claim\\w*|equat\\w*|reported|shown|identif\\w*|estimat\\w*|establish\\w*|imply|implies|mean|means|prove\\w*|count\\w*)\\b", "i").test(s); }

const rx = (src, flags = "i") => new RegExp(src, flags);

/** Does a pattern rule fire on this sentence text? Returns the match objects that survive the filters. */
export function patternHits(r, text, nearText = "") {
  const flags = (r.flags || "i").includes("g") ? r.flags : (r.flags || "i") + "g";
  const re = rx(r.pattern, flags);
  if (r.context && !rx(r.context).test(text)) return [];
  if (r.except && rx(r.except).test(text)) return [];
  if (r.unless_nearby && rx(r.unless_nearby).test(nearText || text)) return [];
  const mode = r.negation || (r.negatable ? "scope" : "none");
  if (mode === "near" && negNear(text)) return [];
  if (mode === "before") { const first = text.match(rx(r.pattern, (r.flags || "i").replace("g", ""))); if (first && negBefore(text, first.index)) return []; }
  const hits = [];
  for (const m of text.matchAll(re)) {
    if (mode === "scope" && isNegated(text, m.index)) continue;
    hits.push(m);
  }
  return hits;
}

export function runRules(doc, rules, opts = {}) {
  const design = doc.design?.primary || "unknown";
  const findings = [];
  for (const r of rules) {
    if (!(r.designs.includes("all") || r.designs.includes(design))) continue;
    if (opts.roles && !opts.roles.includes(r.role)) continue;
    if (r.check === "pattern") {
      for (const s of doc.sentencesIn(r.where || "all")) {
        const hits = patternHits(r, s.text, r.unless_nearby ? doc.window(s.id, 2) : "");
        if (hits.length) findings.push(makeFinding(r, s, hits[0][0]));
      }
    } else if (r.check === "structural") {
      const res = structural.evaluate(r.test, doc, r.where);
      if (!res.ok) findings.push(makeFinding(r, res.anchor || null, null, res.detail));
    } else if (r.check === "manual") {
      findings.push({ ...base(r), severity: "note", confidence: "low", status: "needs_human", message: `Check by hand: ${r.title}`, span: null });
    }
  }
  return dedupe(findings);
}

function base(r) {
  return { rule: r.id, role: r.role, title: r.title, severity: r.severity, source: r.source_id, source_ref: r.source_ref, fix: r.fix || null };
}
function makeFinding(r, sentence, match, detail) {
  return { ...base(r), confidence: r.confidence || (r.check === "pattern" ? "medium" : "high"),
    message: r.message.replace("{match}", match ?? ""),
    span: sentence ? { section: sentence.section, start: sentence.start, end: sentence.end, text: sentence.text } : null, detail: detail || null };
}
function dedupe(fs) {
  const seen = new Set();
  return fs.filter(f => { const k = `${f.rule}|${f.span?.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export default { runRules, patternHits, negBefore, negNear };
