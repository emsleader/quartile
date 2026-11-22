// MCP tool: reporting_checklist (specification Section 15). Item-by-item reporting table for the design.
import { z } from "zod";
import { parseText, parseFile } from "../core/text/parse.js";
import { DESIGNS } from "../core/text/design.js";
import { loadChecklists, checklistsFor, evaluateChecklist } from "../core/roles/checklists.js";

export const LABEL = "Simulated pre-submission review — not a journal decision";

export async function reportingChecklist({ text, path, checklist, design }) {
  if (!text && !path) throw new Error("Give the manuscript as text or as path.");
  const doc = path ? await parseFile(path, { design: design || null }) : parseText(text, { design: design || null });
  const all = loadChecklists();
  let lists;
  if (checklist) {
    const key = Object.keys(all).find(k => k.toLowerCase() === String(checklist).toLowerCase().replace(/[\s-]+/g, "_").replace(/^prisma(_2020)?$/, "prisma2020"));
    if (!key) throw new Error(`Unknown checklist '${checklist}'. Known: ${Object.keys(all).join(", ")}.`);
    lists = [all[key]];
  } else lists = checklistsFor(doc.design.primary, doc);
  const results = lists.map(c => evaluateChecklist(doc, c));
  return {
    label: LABEL,
    design: doc.design.primary, design_declared: !!doc.design.declared,
    checklists: results.map(r => ({ id: r.id, name: r.name, citation: r.citation, numbering: r.numbering, stub: r.stub, counts: r.counts,
      table: r.items.map(i => ({ number: i.number, topic: i.topic, item: i.item, status: i.status, evidence: i.evidence })) })),
    note: results.length
      ? "found = keyword evidence was seen in the text (a person should confirm the item is fully reported); not_found = no evidence seen; needs_human = judge by hand. Item text is paraphrased; see each checklist's citation for the official wording."
      : `No checklist is encoded for design '${doc.design.primary}'. Declare a design or name a checklist (${Object.keys(all).join(", ")}).`,
    available: Object.values(all).map(c => ({ id: c.id, name: c.name, designs: c.designs })),
  };
}

export default {
  name: "reporting_checklist",
  title: "Reporting checklist",
  description: "Item-by-item reporting checklist for the manuscript's design (PRISMA 2020, STROBE, CHERRIES, conjoint, COREQ, AAPOR stub). Each item is marked found, not_found or needs_human with the evidence sentence. Local only. Simulated pre-submission review, not a journal decision.",
  inputSchema: {
    text: z.string().min(1).max(400000).optional().describe("Manuscript text"),
    path: z.string().optional().describe("Local .docx, .pdf or .txt file"),
    checklist: z.string().optional().describe("PRISMA2020, STROBE, CHERRIES, CONJOINT, COREQ or AAPOR_STUB; default: chosen by design"),
    design: z.enum(DESIGNS).optional().describe("Declared design; overrides detection"),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: reportingChecklist,
};
