import { z } from "zod";
import { lib, brief, WRITE } from "./_library.js";
import { importText } from "../core/library/index.js";
import { listSets, getSet, toCsl, collectionName } from "../core/library/refsets.js";
export default {
  name: "reference_set",
  title: "Curated reference sets",
  description: "List or load the curated reference sets that ship with Quartile. alavi-core-2026 is 100 DOI-verified Q1 journal articles on financial flexibility, financing constraints, investment irreversibility and real options, collateral, leasing, SME finance, trade credit, firm survival and growth, curated by Seyed Mehdi Alavi (EMS Leader). The curator selected the papers; the papers are the work of their own authors. action list shows the sets; action show returns a set's items (optionally one topic); action load imports a set into the local Quartile Library as a collection, tagged by topic. Nothing is sent over the network.",
  inputSchema: {
    action: z.enum(["list", "show", "load"]).default("list"),
    set: z.string().max(80).optional(), topic: z.string().max(80).optional(),
  },
  annotations: { ...WRITE, openWorldHint: false },
  async handler({ action = "list", set, topic }) {
    if (action === "list") return { sets: listSets() };
    if (!set) return { error: "Give set (see action list)." };
    const s = getSet(set);
    const items = topic ? s.items.filter(i => i.topic === topic) : s.items;
    if (action === "show") return { id: s.id, title: s.title, curator: s.curator, note: s.note, method: s.method, count: items.length, items: items.map(({ key, topic, title, authors, year, journal, doi, quartile, note }) => ({ key, topic, title, authors: authors.map(a => a.family).join(", "), year, journal, doi, quartile, ...(note ? { note } : {}) })) };
    const L = await lib();
    const r = await importText(L, JSON.stringify(items.map(i => toCsl(i, s))), { format: "csl-json", collection: collectionName(s) });
    return { status: "loaded", set: s.id, curator: s.curator, note: s.note, collection: collectionName(s), read: r.read, added: r.added, duplicates: r.duplicates.length, warnings: r.warnings, items: r.ids.slice(0, 5).map(id => brief(L.get(id))) };
  },
};
