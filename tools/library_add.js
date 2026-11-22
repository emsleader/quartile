import { z } from "zod";
import { lib, brief, WRITE } from "./_library.js";
import { addByDoi, importText, attachFile } from "../core/library/index.js";
export default {
  name: "library_add",
  title: "Add to the Quartile Library",
  description: "Add a reference to the local Quartile Library by DOI (Crossref, then OpenAlex; only the DOI is sent), or from a BibTeX, RIS or CSL-JSON string. The journal quartile comes from your SCImago bank by ISSN. With item_id, adds tags or a collection to an existing item instead, or attaches a local PDF (pdf_path; copied into the library folder with its SHA-256; file_kind vor, aam, preprint or supplement). Same DOI = duplicate, not added.",
  inputSchema: {
    doi: z.string().max(300).optional(), bibtex: z.string().max(200000).optional(), ris: z.string().max(200000).optional(), csl_json: z.string().max(400000).optional(),
    item_id: z.string().max(40).optional(), pdf_path: z.string().max(1000).optional(), file_kind: z.enum(["vor", "aam", "preprint", "supplement"]).optional(), collection: z.string().max(200).optional(), tags: z.array(z.string().max(80)).max(50).optional(),
  },
  annotations: { ...WRITE, openWorldHint: true },
  async handler({ doi, bibtex, ris, csl_json, item_id, pdf_path, file_kind = "vor", collection, tags = [] }) {
    const L = await lib();
    if (item_id) {
      const it = L.get(item_id); if (!it) return { error: "Item not found: " + item_id };
      const file = pdf_path ? attachFile(L, item_id, pdf_path, file_kind) : undefined;
      L.tx(raw => { for (const t of tags) L.tag(item_id, t, raw); if (collection) L.addToCollection(item_id, collection, raw); });
      return { status: "updated", item: brief(L.get(item_id)), ...(file ? { file } : {}) };
    }
    if (doi) { const r = await addByDoi(L, doi, { collection, tags }); return r.id ? { ...r, item: brief(L.get(r.id)) } : r; }
    const text = bibtex || ris || csl_json; if (!text) return { error: "Give doi, bibtex, ris or csl_json (or item_id with tags/collection)." };
    const r = await importText(L, text, { format: bibtex ? "bibtex" : ris ? "ris" : "csl-json", collection, tags });
    return { ...r, items: r.ids.map(id => brief(L.get(id))) };
  },
};
