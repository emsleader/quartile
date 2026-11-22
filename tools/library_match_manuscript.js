import { z } from "zod";
import { lib, manuscript } from "./_library.js";
import { matchManuscript } from "../core/library/index.js";
export default {
  name: "library_match_manuscript",
  title: "Match a manuscript's citations to the library",
  description: "Match every in-text citation (author-year or numbered) and every reference-list entry of a manuscript to the local library, and apply your citation policy (LIB-POL-*: Q1/Q2 rule, SLR rule, retractions; own-work and close-idea exceptions). Reports cited-not-in-library, in-list-not-cited, ambiguous and year/author mismatches. Runs locally.",
  inputSchema: { text: z.string().min(1).max(400000).optional(), path: z.string().max(1000).optional(), paper_type: z.enum(["empirical", "conceptual", "slr"]).optional() },
  async handler({ text, path, paper_type }) {
    const doc = await manuscript({ text, path });
    return matchManuscript(await lib(), { doc, paperType: paper_type });
  },
};
