// rulebook_status (specification Section 15): rules per source, test coverage from tests/rules, precision from
// local feedback, and the rules downgraded by feedback.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadRules, rulebookSummary, ROOT } from "../core/rules/loader.js";
import { runRules } from "../core/rules/engine.js";
import { parseText } from "../core/text/parse.js";
import { ruleStats, readFeedback, feedbackPath, DOWNGRADE_AFTER } from "../core/report/feedback.js";

export function rulebookStatus({ run_tests = false } = {}) {
  const rules = loadRules();
  const stats = ruleStats(readFeedback().entries);
  const testDir = path.join(ROOT, "tests", "rules");
  const perRule = rules.map(r => {
    const pos = r.tests.positive.filter(f => fs.existsSync(f)).length, neg = r.tests.negative.filter(f => fs.existsSync(f)).length;
    const row = { id: r.id, source: r.source_id, role: r.role, severity: r.severity, check: r.check,
      positive_tests: pos, negative_tests: neg, test_folder: fs.existsSync(path.join(testDir, r.id)),
      covered: r.check === "manual" || (pos > 0 && neg > 0) };
    if (run_tests && r.check !== "manual") {
      const design = r.designs[0] === "all" ? null : r.designs[0];
      const fires = f => runRules(parseText(fs.readFileSync(f, "utf8"), { design }), [r]).some(x => x.rule === r.id);
      row.tests_pass = r.tests.positive.every(f => fs.existsSync(f) && fires(f)) && r.tests.negative.every(f => fs.existsSync(f) && !fires(f));
    }
    if (stats[r.id]) row.feedback = stats[r.id];
    return row;
  });
  const bySource = rulebookSummary().map(s => {
    const rs = perRule.filter(r => r.source === s.source);
    return { ...s, covered: rs.filter(r => r.covered).length, manual: rs.filter(r => r.check === "manual").length,
      by_role: rs.reduce((o, r) => (o[r.role] = (o[r.role] || 0) + 1, o), {}) };
  });
  const auto = perRule.filter(r => r.check !== "manual");
  const known = new Set(rules.map(r => r.id));
  return {
    rules: rules.length, sources: bySource,
    coverage: { automatic_rules: auto.length, with_positive_and_negative_tests: auto.filter(r => r.covered).length,
      share: auto.length ? auto.filter(r => r.covered).length / auto.length : null,
      ...(run_tests ? { tests_pass: auto.filter(r => r.tests_pass).length, tests_fail: auto.filter(r => !r.tests_pass).map(r => r.id) } : {}) },
    uncovered: auto.filter(r => !r.covered).map(r => r.id),
    feedback: { file: feedbackPath(), rules_with_feedback: Object.keys(stats).length,
      precision: Object.values(stats).map(s => ({ rule: s.rule, in_rulebook: known.has(s.rule), true_positives: s.true_positives, false_positives: s.false_positives, precision: s.precision })),
      downgrade_rule: `More than ${DOWNGRADE_AFTER} confirmed false positives since the last reset -> shown as note.` },
    downgraded: Object.values(stats).filter(s => s.downgraded).map(s => ({ rule: s.rule, false_positives: s.false_positives, since: s.last_reset })),
    note: "Role-module checks written in code are tested in tests/phases, not in tests/rules; they appear here only when they have feedback.",
    rules_detail: perRule,
  };
}

export default {
  name: "rulebook_status",
  title: "Rulebook status",
  description: "Rules per source (rulebook/*.yaml), test coverage from tests/rules (positive and negative test files per rule; run_tests: true also runs them), precision per rule from local feedback (rule_feedback), and the rules downgraded to note by feedback. Local only.",
  inputSchema: { run_tests: z.boolean().optional().describe("Also run each rule's positive and negative tests") },
  async handler(args) { return rulebookStatus(args || {}); },
};
