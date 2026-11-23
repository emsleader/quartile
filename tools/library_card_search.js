// library_card_search: search the saved paper cards.
import { z } from "zod";
import { searchCards, getCard } from "../core/library/cards.js";
import { lib } from "./_library.js";
export default {
  name: "library_card_search",
  title: "Search paper cards",
  description: "Full-text search over the paper cards saved in the local library (title, question and contribution, design and methods, findings, theory, data). Returns one line per card; give id to get the whole card.",
  inputSchema: {
    query: z.string().max(500).optional().describe("Words to find, e.g. 'leasing panel'; empty lists the newest cards"),
    field: z.enum(["title", "question", "design", "findings", "theory", "data"]).optional(),
    design: z.string().optional().describe("Only cards with this detected design (regression, slr, survey, ...)"),
    id: z.string().optional().describe("Return the full card with this id"),
    limit: z.number().int().min(1).max(200).optional(),
  },
  async handler({ query, field, design, id, limit }) {
    const L = await lib();
    if (id) { const c = getCard(L, id); if (!c) throw new Error("No card " + id); return c; }
    const results = searchCards(L, { query, field, design, limit });
    return { results, count: results.length };
  },
};
