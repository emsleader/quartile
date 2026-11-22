// rule_feedback (specification Section 14.4): records "this flag is wrong" (or right) locally.
import { z } from "zod";
import { recordFeedback, ruleStats, feedbackPath, DOWNGRADE_AFTER } from "../core/report/feedback.js";

export function ruleFeedback({ rule, verdict, span = null, note = null }) {
  const entry = recordFeedback({ rule, verdict, span, note });
  const s = ruleStats()[entry.rule];
  return { saved: entry, file: feedbackPath(), rule: s,
    note: s.downgraded
      ? `${entry.rule} now has ${s.false_positives} confirmed false positives (more than ${DOWNGRADE_AFTER}); the committee report shows it as a note until it is reset (verdict "reset").`
      : `${entry.rule}: ${s.false_positives} confirmed false positive(s) since the last reset; it is downgraded to note after more than ${DOWNGRADE_AFTER}.` };
}

export default {
  name: "rule_feedback",
  title: "Rule feedback (this flag is wrong / right)",
  description: "Records a verdict on one finding in the local file $QUARTILE_HOME/feedback.jsonl (default ~/.quartile): false_positive (this flag is wrong), true_positive (this flag is right) or reset (the owner fixed the rule; counting starts again). A rule with more than 3 confirmed false positives is shown as a note in committee_review until it is reset. Stored only on this machine.",
  inputSchema: {
    rule: z.string().min(1).max(100).describe("Rule ID, e.g. QC-CLAIM-CAUSAL"),
    verdict: z.enum(["false_positive", "true_positive", "reset"]),
    span: z.object({ section: z.string().optional(), start: z.number().int().optional(), end: z.number().int().optional(), text: z.string().max(2000).optional() }).optional().describe("The finding's span"),
    note: z.string().max(1000).optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, idempotentHint: false },
  async handler(args) { return ruleFeedback(args); },
};
