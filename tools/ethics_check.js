// MCP tool: ethics_check (specification Section 10). Runs the ethics and data office on one manuscript: the
// rulebook's ethics rules (ETH-01, 02, 03, 05, 06 and wording rules) and the role module (ETH-04, ETH-04-DUAL,
// ETH-07). The author profile is read from a local file only; nothing leaves the machine.
import { z } from "zod";
import { parseText, parseFile } from "../core/text/parse.js";
import { DESIGNS } from "../core/text/design.js";
import { loadRules } from "../core/rules/loader.js";
import { runRules } from "../core/rules/engine.js";
import { checkEthics } from "../core/roles/ethics.js";

export const LABEL = "Simulated pre-submission review — not a journal decision";
const ORDER = { blocker: 0, major: 1, minor: 2, note: 3 };

export async function ethicsCheck({ text, path, author_profile, design } = {}) {
  if (!text && !path) throw new Error("Give the manuscript as text or as a path to a .docx, .pdf or .txt file.");
  const doc = path ? await parseFile(path, { design }) : parseText(text, { design });
  const rules = loadRules().filter(r => r.role === "ethics");
  const role = checkEthics(doc, { authorProfile: author_profile || null });
  const findings = [...runRules(doc, rules), ...role.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const counts = Object.fromEntries(Object.keys(ORDER).map(k => [k, findings.filter(f => f.severity === k).length]));
  return {
    label: LABEL,
    role: "ethics",
    design: { primary: doc.design.primary, declared: !!doc.design.declared },
    author_profile: { status: role.profile.status, entries: role.profile.entries, problems: role.profile.problems,
      note: role.profile.status === "loaded" ? "Dual-role check ran against the local profile." : "No author profile loaded, so the dual-role check (ETH-04-DUAL) did not run. Create author.yaml (see tests/fixtures/author.example.yaml)." },
    studied_sectors: role.studied_sectors,
    conflict_of_interest: role.coi,
    counts,
    findings,
  };
}

export default {
  name: "ethics_check",
  title: "Ethics and data office check",
  description: "Simulated ethics and data office review (not a journal decision): ethics approval with body and reference number, informed consent, GDPR data protection for EU participants, conflict of interest with a dual-role flag from your local author profile (author.yaml), data and code availability, funding, and small cells in firm-level tables. Runs locally.",
  inputSchema: {
    text: z.string().max(400000).optional().describe("Manuscript text (or give path)"),
    path: z.string().optional().describe("Local .docx, .pdf or .txt file"),
    author_profile: z.string().optional().describe("Path to author.yaml; default $QUARTILE_AUTHOR_PROFILE or $QUARTILE_HOME/author.yaml"),
    design: z.enum(DESIGNS).optional().describe("Declared design; overrides detection"),
  },
  handler: ethicsCheck,
};
