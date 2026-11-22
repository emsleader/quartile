// hypothesis_map: each hypothesis or proposition (H1, P1 ...) -> the theory or cited finding before it -> the
// verdict in the results (supported / not supported / mixed / not found). Local only.
import { z } from "zod";
import { parseText, parseFile } from "../core/text/parse.js";
import { hypothesisMap } from "../core/hypotheses.js";
import { DESIGNS } from "../core/text/design.js";

export const LABEL = "Simulated pre-submission review — not a journal decision";

export async function mapManuscript({ text, path, design } = {}) {
  if (!text && !path) throw new Error("Give the manuscript as text or as a path to a .docx, .pdf or .txt file.");
  const doc = path ? await parseFile(path, { design: design || null }) : parseText(text, { design: design || null });
  const rows = hypothesisMap(doc);
  const count = v => rows.filter(r => r.result.verdict === v).length;
  return {
    kind: "hypothesis_map", label: LABEL, design: doc.design,
    hypotheses: rows.map(r => ({
      label: r.label, kind: r.kind, statement: r.statement, section: r.section, span: r.span,
      basis: r.basis.kind, theories: r.basis.theories, citations: r.basis.citations,
      verdict: r.result.verdict, mentioned_in_results: r.result.mentioned,
      evidence: r.result.evidence.slice(0, 3).map(e => ({ verdict: e.verdict, section: e.section, start: e.start, end: e.end, sentence: e.sentence })),
    })),
    summary: { total: rows.length, supported: count("supported"), not_supported: count("not supported"), mixed: count("mixed"), not_found: count("not found"), without_basis: rows.filter(r => r.basis.kind === "none").length },
    note: rows.length ? "Verdicts are read from the wording of the results, discussion and conclusion. 'Not found' means no verdict word was found next to the label; check the paper by hand." : "No labelled hypotheses or propositions (H1, Hypothesis 1, P1, Proposition 1) were found.",
  };
}

export default {
  name: "hypothesis_map",
  title: "Hypothesis map",
  description: "Maps each hypothesis or proposition (H1, P1 ...) to the theory or cited finding before it and to the verdict in the results (supported, not supported, mixed, not found). Runs locally. Simulated pre-submission review — not a journal decision.",
  inputSchema: {
    text: z.string().min(1).max(400000).optional().describe("Manuscript text"),
    path: z.string().optional().describe("Path to a local .docx, .pdf or .txt manuscript"),
    design: z.enum(DESIGNS).optional().describe("Declared design; overrides detection"),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: args => mapManuscript(args),
};
