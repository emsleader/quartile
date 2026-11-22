// Tool: style_check. Style findings (role "writing"): the STY code checks of core/style/checks.js plus the
// writing-role YAML rules (STY-* pattern rules and the Q1C-* corpus-profile notes). Local only.
import { z } from "zod";
import { parseText } from "../core/text/parse.js";
import { loadRules } from "../core/rules/loader.js";
import { runRules } from "../core/rules/engine.js";
import { run as styleRun } from "../core/style/checks.js";

export default {
  name: "style_check",
  title: "Style check (STY rules)",
  description: "Style findings for a manuscript: passive voice, readability, wordy phrases, clichés, intensifiers, repeated words, very long sentences, and distance from the measured Q1 abstract profile. Severity minor at most; confidence medium or low. Local only: no text leaves the machine.",
  inputSchema: { text: z.string().min(1).max(400000) },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async handler({ text }) {
    const doc = parseText(text);
    const yaml = runRules(doc, loadRules().filter(r => r.role === "writing"));
    const findings = [...yaml, ...(await styleRun(doc))].sort((a, b) => (a.span?.start ?? -1) - (b.span?.start ?? -1));
    const byRule = findings.reduce((a, f) => (a[f.rule] = (a[f.rule] || 0) + 1, a), {});
    return { kind: "style", count: findings.length, byRule, findings,
      note: "Style findings are suggestions, not errors: severity is minor at most and confidence medium or low. Manual items (status needs_human) are a checklist for the author." };
  },
};
