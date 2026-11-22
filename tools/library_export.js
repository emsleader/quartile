import path from "node:path";
import { z } from "zod";
import { lib, writeOut, WRITE } from "./_library.js";
import { exportItems } from "../core/library/index.js";
export default {
  name: "library_export",
  title: "Export the Quartile Library",
  description: "Export the library, a collection or a tag as BibTeX (stable cite keys AuthorYearWord), RIS, CSL-JSON or a pandoc-ready .bib for [@key] citations. backup: true writes the CSL-JSON backup library.json in the library folder. Existing files are not overwritten unless overwrite: true.",
  inputSchema: {
    format: z.enum(["bibtex", "pandoc-bib", "ris", "csl-json"]).optional(), collection: z.string().max(200).optional(), tag: z.string().max(80).optional(),
    path: z.string().max(1000).optional(), overwrite: z.boolean().optional(), backup: z.boolean().optional(), max_chars: z.number().int().min(0).max(2000000).optional(),
  },
  annotations: WRITE,
  async handler({ format = "bibtex", collection, tag, path: out, overwrite = false, backup = false, max_chars = 50000 }) {
    const L = await lib();
    if (backup) return { status: "backup written", ...L.backup() };
    let items = L.all();
    if (collection) { const ids = new Set(L.idsIn(collection)); items = items.filter(i => ids.has(i.id)); }
    if (tag) items = items.filter(i => i.tags.includes(tag));
    const r = exportItems(items, format);
    const res = { format, items: items.length, keys: items.map((it, i) => ({ id: it.id, key: r.keys[i] })).slice(0, 500) };
    if (out) res.path = writeOut(path.resolve(out), r.text, overwrite);
    res.text = r.text.length > max_chars ? r.text.slice(0, max_chars) : r.text;
    if (r.text.length > max_chars) res.truncated = true;
    return res;
  },
};
