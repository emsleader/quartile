// record_paper (specification 21.6): create a paper record and link it to a Library collection.
import { z } from "zod";
import { createPaper, linkCollection, getPaper, listPapers, PAPER_TYPES } from "../core/record/index.js";

export default {
  name: "record_paper",
  title: "Quartile Record: paper",
  description: "Create a paper record in the local Quartile Record (action create), link it to a Library collection (link), or show one or all papers (get, list). Status is derived from the paper's latest status event. Stored locally only.",
  inputSchema: {
    action: z.enum(["create", "link", "get", "list"]).default("create"),
    id: z.string().max(64).optional().describe("Paper id, e.g. FER-HU-WBES"),
    title: z.string().max(500).optional(),
    short_name: z.string().max(100).optional(),
    type: z.enum(PAPER_TYPES).optional(),
    design: z.string().max(60).optional(),
    collection: z.string().max(200).optional().describe("Library collection id or name"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler(a) {
    const action = a.action || "create";
    if (action === "list") return { papers: await listPapers() };
    if (!a.id) throw new Error("id is required");
    if (action === "get") { const p = await getPaper(a.id); if (!p) throw new Error(`no paper with id ${a.id}`); return { paper: p }; }
    if (action === "link") { if (!a.collection) throw new Error("collection is required"); return linkCollection(a.id, a.collection); }
    return createPaper(a);
  },
};
