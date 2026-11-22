// Theory dictionary (data/theories.yaml) and a matcher for BUS-01 and BUS-02.
// Names and aliases match case-insensitively at a word start (a trailing word part is allowed, so "real option"
// also finds "real options"); acronyms match case-sensitively as whole words.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "theories.yaml");
let CACHE = null;

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flex = s => esc(s.toLowerCase()).replace(/\\-|-|\s+/g, "[\\s\\-]+").replace(/'/g, "['’]?");

/** The dictionary: [{ id, name, aliases, acronyms, field, reference }]. */
export function loadTheories(file = FILE) {
  if (CACHE && file === FILE) return CACHE;
  const obj = YAML.parse(fs.readFileSync(file, "utf8"));
  const list = (obj.theories || []).map(t => {
    const terms = [t.name, ...(t.aliases || [])];
    return { ...t, aliases: t.aliases || [], acronyms: t.acronyms || [],
      _rx: new RegExp("(?<![\\p{L}\\d])(?:" + terms.map(flex).join("|") + ")[\\p{L}]*", "giu"),
      _ax: (t.acronyms || []).length ? new RegExp("(?<![\\p{L}\\d])(?:" + t.acronyms.map(esc).join("|") + ")(?![\\p{L}\\d])", "gu") : null };
  });
  if (file === FILE) CACHE = list;
  return list;
}

/** Every theory mention in `text`: [{ id, name, start, end, match }], offsets relative to `text`. */
export function findTheories(text, list = loadTheories()) {
  const out = [], t = String(text || ""), low = t.toLowerCase();
  for (const th of list) {
    for (const m of low.matchAll(th._rx)) out.push({ id: th.id, name: th.name, start: m.index, end: m.index + m[0].length, match: t.slice(m.index, m.index + m[0].length) });
    if (th._ax) for (const m of t.matchAll(th._ax)) out.push({ id: th.id, name: th.name, start: m.index, end: m.index + m[0].length, match: m[0] });
  }
  return out.sort((a, b) => a.start - b.start);
}

export const hasTheory = (text, list) => findTheories(text, list).length > 0;

export default { loadTheories, findTheories, hasTheory };
