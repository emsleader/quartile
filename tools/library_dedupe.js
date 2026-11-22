import { z } from "zod";
import { lib, brief, WRITE } from "./_library.js";
import { findDuplicates, merge } from "../core/library/index.js";
export default {
  name: "library_dedupe",
  title: "Suggested duplicate merges in the library",
  description: "List suggested merges: same DOI, or (without a DOI) title similarity >= 0.92, year within 1 and same first-author surname. Nothing is merged automatically. action merge with keep and remove shows a preview; it changes the library only with confirm: true.",
  inputSchema: { action: z.enum(["list", "merge"]).optional(), keep: z.string().max(40).optional(), remove: z.string().max(40).optional(), confirm: z.boolean().optional(), limit: z.number().int().min(1).max(5000).optional() },
  annotations: { ...WRITE, destructiveHint: true },
  async handler({ action = "list", keep, remove, confirm = false, limit = 200 }) {
    const L = await lib();
    if (action === "merge") {
      if (!keep || !remove) return { error: "Give keep and remove item ids." };
      const r = merge(L, keep, remove, { confirm });
      if (r.status === "merged") { r.item = brief(L.get(keep)); r.backup = L.backup(); }
      return r;
    }
    const pairs = findDuplicates(L.all());
    return { count: pairs.length, suggested_merges: pairs.slice(0, limit), note: "Suggestions only. To merge one pair: action merge, keep, remove, confirm: true." };
  },
};
