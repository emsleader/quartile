import fs from "node:fs";
import { z } from "zod";
import { lib, WRITE } from "./_library.js";
import { importText } from "../core/library/index.js";
export default {
  name: "library_import",
  title: "Import references into the Quartile Library",
  description: "Import a BibTeX, RIS, CSL-JSON or Zotero export (CSL JSON, RIS or Zotero RDF with collections) into the local library. Same DOI = skipped as duplicate; similar records are added and listed as suggested merges (never merged automatically). dry_run shows what would happen. The source file is only read.",
  inputSchema: {
    path: z.string().max(1000).optional(), text: z.string().max(5000000).optional(),
    format: z.enum(["auto", "bibtex", "ris", "csl-json", "zotero-rdf"]).optional(), collection: z.string().max(200).optional(),
    tags: z.array(z.string().max(80)).max(50).optional(), dry_run: z.boolean().optional(),
  },
  annotations: WRITE,
  async handler({ path, text, format = "auto", collection, tags = [], dry_run = false }) {
    if (!text && !path) return { error: "Give path or text." };
    if (path && !fs.existsSync(path)) return { error: "File not found: " + path };
    const src = text ?? fs.readFileSync(path, "utf8");
    const L = await lib();
    const r = await importText(L, src, { format, filename: path || "", collection, tags, dryRun: dry_run });
    if (!dry_run) r.backup = L.backup();
    const { ids, ...rest } = r;
    return { ...rest, added_ids: (ids || []).slice(0, 200), library_items: L.count() };
  },
};
