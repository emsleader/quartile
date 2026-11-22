import path from "node:path";
import { z } from "zod";
import { lib, writeOut, WRITE } from "./_library.js";
import { recordDecision, deleteDecision, prismaCounts, exportCsv } from "../core/library/index.js";
export default {
  name: "library_screening",
  title: "SLR screening decisions",
  description: "Record title/abstract or full-text screening decisions per reviewer (include, exclude with a primary reason, maybe; reviewer 'consensus' for the agreed decision), get PRISMA 2020 counts from the table, or export the table as CSV. Agreement (Cohen's kappa) is computed in R from the CSV with scripts/screening-agreement.R, not here. Deleting a decision needs confirm: true.",
  inputSchema: {
    action: z.enum(["record", "prisma", "export", "delete"]), review: z.string().min(1).max(200),
    item_id: z.string().max(40).optional(), stage: z.enum(["title_abstract", "full_text"]).optional(), decision: z.enum(["include", "exclude", "maybe"]).optional(),
    reason: z.string().max(500).optional(), reviewer: z.string().max(100).optional(), duplicates_removed: z.number().int().min(0).optional(), identified: z.number().int().min(0).optional(),
    path: z.string().max(1000).optional(), overwrite: z.boolean().optional(), confirm: z.boolean().optional(),
  },
  annotations: { ...WRITE, destructiveHint: true },
  async handler(a) {
    const L = await lib();
    if (a.action === "record") return recordDecision(L, a);
    if (a.action === "delete") return deleteDecision(L, a);
    if (a.action === "prisma") return prismaCounts(L, a.review, { identified: a.identified, duplicates_removed: a.duplicates_removed });
    const csv = exportCsv(L, a.review, { stage: a.stage });
    const out = { rows: csv.trim().split("\n").length - 1, next_step: "Rscript scripts/screening-agreement.R <file.csv> [reviewer_a reviewer_b]" };
    if (a.path) out.path = writeOut(path.resolve(a.path), csv, a.overwrite);
    out.csv = csv.length > 200000 ? csv.slice(0, 200000) : csv;
    return out;
  },
};
