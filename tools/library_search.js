import { z } from "zod";
import { lib } from "./_library.js";
import { search } from "../core/library/index.js";
export default {
  name: "library_search",
  title: "Search the Quartile Library",
  description: "Full-text search (title, authors, abstract, venue) of the local library with filters: collection, tag, quartile, type, year range. list: 'collections' or 'tags' lists those instead. Local only.",
  inputSchema: {
    query: z.string().max(500).optional(), collection: z.string().max(200).optional(), tag: z.string().max(80).optional(),
    quartile: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(), type: z.string().max(40).optional(),
    year_from: z.number().int().optional(), year_to: z.number().int().optional(), limit: z.number().int().min(1).max(1000).optional(),
    list: z.enum(["collections", "tags"]).optional(),
  },
  async handler(args) {
    const L = await lib();
    if (args.list === "collections") return { collections: L.collections() };
    if (args.list === "tags") return { tags: L.tagCounts() };
    const results = search(L, args);
    return { count: results.length, results, library_items: L.count() };
  },
};
