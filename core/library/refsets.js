// Curated reference sets shipped in data/reference-sets/. A set names its curator;
// the papers stay the work of their own authors.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/reference-sets");
export function listSets() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => {
    const s = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return { id: s.id, title: s.title, curator: s.curator, curated: s.curated, count: s.count, topics: s.topics, note: s.note };
  });
}
export function getSet(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Bad set id: " + id);
  const p = path.join(DIR, id + ".json"); if (!fs.existsSync(p)) throw new Error("No reference set: " + id);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
/** CSL-JSON for one set item. */
export function toCsl(item, set) {
  const pages = item.pages || undefined;
  return {
    id: item.key, type: "article-journal", title: item.title, DOI: item.doi,
    author: (item.authors || []).map(a => ({ family: a.family, ...(a.given ? { given: a.given } : {}) })),
    issued: { "date-parts": [[item.year]] }, "container-title": item.journal, ISSN: item.issn ? [item.issn] : undefined,
    volume: item.volume || undefined, issue: item.issue || undefined, page: pages,
    note: [`Reference set ${set.id}, curated by ${set.curator.name}.`, item.note].filter(Boolean).join(" "),
    custom: { quartile_library: { quartile: item.quartile, tags: [set.id, item.topic] } },
  };
}
export const collectionName = set => `${set.id} (curated by ${set.curator.name})`;
