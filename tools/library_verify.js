import { z } from "zod";
import { lib, WRITE } from "./_library.js";
import { recordVerification, verifyCrossref, verificationLog } from "../core/library/index.js";
export default {
  name: "library_verify",
  title: "Record a verification for a library item",
  description: "Add a row to an item's verification log (history is kept). source crossref with live: true checks the DOI on Crossref now, including retractions, corrections and expressions of concern (only the DOI is sent). For scite or manual, give the status you found. Tags verified-YYYY-MM-DD and retracted are set automatically.",
  inputSchema: {
    item_id: z.string().max(40).optional(), doi: z.string().max(300).optional(),
    source: z.enum(["crossref", "openalex", "scite", "manual"]), status: z.enum(["verified", "could_not_verify", "retracted", "corrected", "expression_of_concern"]).optional(),
    note: z.string().max(2000).optional(), live: z.boolean().optional(),
  },
  annotations: { ...WRITE, openWorldHint: true },
  async handler({ item_id, doi, source, status, note, live = false }) {
    const L = await lib();
    const it = item_id ? L.get(item_id) : doi ? L.byDoi(doi) : null;
    if (!it) return { error: "Item not found. Give item_id or the DOI of a library item." };
    let r;
    if (source === "crossref" && live) r = await verifyCrossref(L, it.id);
    else { if (!status) return { error: "Give status (or source crossref with live: true)." }; r = recordVerification(L, it.id, { source, status, note }); }
    return { result: r, log: verificationLog(L, it.id), tags: L.get(it.id).tags };
  },
};
