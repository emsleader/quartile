// contribution_test (specification Sections 5 and 15): contribution claims (EIC-01) and "first / novel" claims
// (EIC-02) with the closest prior work. Default source: the private corpus on this machine. With live: true the
// claim sentences are also searched in OpenAlex, which sends 10-word phrases of them; the output lists exactly what
// was sent.
import { z } from "zod";
import { parseText, parseFile } from "../core/text/parse.js";
import { contributionTest, noveltyCheck, LABEL, THRESHOLD, THRESHOLD_NOTE } from "../core/roles/eic.js";

export default {
  name: "contribution_test",
  title: "Contribution test (editor-in-chief)",
  description: "Simulated pre-submission review, not a journal decision. Finds contribution claims (abstract, introduction, conclusion) and 'first / novel / no study has' claims, and lists the closest prior papers with a similarity score. Searches your private corpus (QUARTILE_CORPUS) on this machine. live: true also searches OpenAlex and SENDS 10-word phrases of the claim sentences to OpenAlex; do not use it for unpublished manuscripts unless you accept that.",
  inputSchema: {
    text: z.string().min(1).max(400000).optional().describe("Manuscript text (or give path)"),
    path: z.string().optional().describe("Local .docx, .pdf, .txt or .md file"),
    cited_dois: z.array(z.string()).optional().describe("DOIs the manuscript cites, in addition to those found in its reference list"),
    live: z.boolean().optional().describe("Also search OpenAlex (sends phrases of the claim sentences). Default false."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler({ text, path, cited_dois, live } = {}) {
    if (!text && !path) throw new Error("Give the manuscript as text or path.");
    const doc = path ? await parseFile(path) : parseText(text);
    const opts = { cited_dois: cited_dois || [], live: live === true };
    const ct = await contributionTest(doc, opts);
    const novelty = noveltyCheck(doc, ct.cache, opts);
    const sent = [...ct.cache.cache.values()].flatMap(r => r.sent || []);
    const searched = [...ct.cache.cache.values()].some(r => r.searched);
    return {
      kind: "contribution_test",
      label: LABEL,
      source: ct.cache.name,
      literature_searched: searched,
      sent_outside: live === true ? { sent: sent.length ? sent : "nothing (no claim sentence was eligible for the OpenAlex query)", note: "Only these phrases left the machine; nothing else from the manuscript was sent." } : "nothing: all comparisons ran on this machine",
      threshold: THRESHOLD, threshold_note: THRESHOLD_NOTE,
      claims: ct.findings.map(f => ({ sentence: f.detail.claim, section: f.span?.section, severity: f.severity, confidence: f.confidence, message: f.message, closest: f.detail.closest, searched: f.detail.searched })),
      novelty_claims: novelty.map(f => ({ sentence: f.detail.claim, match: f.detail.match, severity: f.severity, confidence: f.confidence, message: f.message, closest: f.detail.closest })),
      findings: [...ct.findings, ...novelty],
      note: "The test depends on the literature it can search: a missing closest paper is possible. Scores are similarity of wording, not a judgment of the contribution.",
    };
  },
};
