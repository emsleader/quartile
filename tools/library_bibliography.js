import { z } from "zod";
import { lib, manuscript } from "./_library.js";
import { bibliography, matchManuscript } from "../core/library/index.js";
export default {
  name: "library_bibliography",
  title: "APA 7 reference list from the library",
  description: "Build an APA 7 reference list (our own formatter; journal article, book, chapter, report, preprint, conference paper, dataset, software) for a collection, a list of item ids, or the library items cited in a manuscript. Titles are printed as stored (no automatic case change). Output as markdown (*italics*), html or text.",
  inputSchema: {
    collection: z.string().max(200).optional(), item_ids: z.array(z.string().max(40)).max(5000).optional(),
    text: z.string().max(400000).optional(), path: z.string().max(1000).optional(), format: z.enum(["markdown", "html", "text"]).optional(),
  },
  async handler({ collection, item_ids, text, path, format = "markdown" }) {
    const L = await lib();
    let ids = item_ids || null, unmatched = null;
    if (collection) ids = L.idsIn(collection);
    if (text || path) { const m = matchManuscript(L, { doc: await manuscript({ text, path }) }); ids = m.matched_items; unmatched = m.citations.filter(c => c.status !== "matched").map(c => c.raw); }
    if (!ids) return { error: "Give collection, item_ids, text or path." };
    const items = ids.map(id => L.get(id)).filter(Boolean);
    const refs = bibliography(items.map(i => i.csl), { format });
    return { style: "APA 7 (Quartile formatter)", format, count: refs.length, references: refs, text: refs.map(r => r.reference).join("\n\n"), ...(unmatched ? { citations_not_matched: unmatched } : {}) };
  },
};
