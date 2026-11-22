// Feedback loop (specification Section 14.4). Each "this flag is wrong" (or "this flag is right") verdict is saved
// locally in $QUARTILE_HOME/feedback.jsonl (default ~/.quartile) as { rule, span, verdict, note, at }.
// A rule with more than 3 confirmed false positives since its last reset is downgraded to severity "note" when the
// committee aggregates, until the owner resets it (verdict "reset"). Nothing leaves the machine.
import fs from "node:fs";
import path from "node:path";
import { home } from "../store/db.js";

export const VERDICTS = ["false_positive", "true_positive", "reset"];
export const DOWNGRADE_AFTER = 3; // more than this many confirmed false positives -> note

export const feedbackPath = () => path.join(home(), "feedback.jsonl");

const cleanSpan = span => {
  if (!span || typeof span !== "object") return null;
  const out = {};
  if (span.section != null) out.section = String(span.section);
  if (Number.isFinite(Number(span.start)) && span.start !== null && span.start !== "") out.start = Number(span.start);
  if (Number.isFinite(Number(span.end)) && span.end !== null && span.end !== "") out.end = Number(span.end);
  if (span.text != null) out.text = String(span.text).slice(0, 300);
  return Object.keys(out).length ? out : null;
};

/** Append one verdict. Returns the saved entry. */
export function recordFeedback({ rule, span = null, verdict, note = null, at = null } = {}) {
  if (!rule || typeof rule !== "string") throw new Error("rule_feedback: `rule` (rule ID) is required");
  if (!VERDICTS.includes(verdict)) throw new Error(`rule_feedback: verdict must be one of ${VERDICTS.join(", ")}`);
  const entry = { rule: rule.trim(), span: cleanSpan(span), verdict, note: note == null ? null : String(note).slice(0, 1000), at: at || new Date().toISOString() };
  fs.mkdirSync(path.dirname(feedbackPath()), { recursive: true });
  fs.appendFileSync(feedbackPath(), JSON.stringify(entry) + "\n");
  return entry;
}

/** All saved verdicts, oldest first. Broken lines are skipped and counted. */
export function readFeedback(file = feedbackPath()) {
  if (!fs.existsSync(file)) return { entries: [], skipped: 0 };
  const entries = []; let skipped = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e && e.rule && VERDICTS.includes(e.verdict)) entries.push(e); else skipped++; } catch { skipped++; }
  }
  return { entries, skipped };
}

// The same flag reported twice counts once: key = rule + span start/end (or span text, or the note when no span).
const flagKey = e => e.span ? `${e.span.start ?? ""}:${e.span.end ?? ""}:${e.span.start == null ? (e.span.text || "") : ""}` : `nospan:${e.at}`;

/** Per-rule counts. `current` counts only verdicts after the rule's last reset; `total` counts everything. */
export function ruleStats(entries = readFeedback().entries) {
  const out = {};
  for (const e of entries) {
    const s = (out[e.rule] ||= { rule: e.rule, total: { false_positive: 0, true_positive: 0 }, current: { fp: new Map(), tp: new Map() }, resets: 0, last_reset: null });
    if (e.verdict === "reset") { s.resets++; s.last_reset = e.at; s.current = { fp: new Map(), tp: new Map() }; continue; }
    s.total[e.verdict]++;
    // a later verdict on the same flag replaces the earlier one
    const k = flagKey(e);
    if (e.verdict === "false_positive") { s.current.tp.delete(k); s.current.fp.set(k, e); } else { s.current.fp.delete(k); s.current.tp.set(k, e); }
  }
  return Object.fromEntries(Object.entries(out).map(([rule, s]) => {
    const fp = s.current.fp.size, tp = s.current.tp.size;
    return [rule, { rule, false_positives: fp, true_positives: tp, precision: fp + tp ? tp / (fp + tp) : null,
      total: s.total, resets: s.resets, last_reset: s.last_reset, downgraded: fp > DOWNGRADE_AFTER }];
  }));
}

/** Map rule ID -> stats for every rule that is downgraded now. */
export function downgradedRules(entries) {
  const st = ruleStats(entries ?? readFeedback().entries);
  return new Map(Object.values(st).filter(s => s.downgraded).map(s => [s.rule, s]));
}

/** Return copies of the findings with downgraded rules set to severity "note"; the original severity stays in detail. */
export function applyDowngrades(findings, downgrades = downgradedRules()) {
  if (!downgrades || !downgrades.size) return findings;
  return findings.map(f => {
    const d = downgrades.get(f.rule);
    if (!d || f.severity === "note") return f;
    return { ...f, severity: "note", downgraded: { from: f.severity, false_positives: d.false_positives,
      reason: `Downgraded to note: ${d.false_positives} confirmed false positives in local feedback (more than ${DOWNGRADE_AFTER}). The owner can reset this with rule_feedback verdict "reset".` } };
  });
}

export default { VERDICTS, DOWNGRADE_AFTER, feedbackPath, recordFeedback, readFeedback, ruleStats, downgradedRules, applyDowngrades };
