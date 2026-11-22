// Reporting checklists (specification Section 6, MTH-02). Checklists are YAML data in rulebook/checklists/, with
// their own small schema; the main rule loader reads only rulebook/*.yaml and does not see them.
// Item status: found (the detection hint matched; a human should still confirm), not_found (auto item, no match),
// needs_human (manual item without a matching hint).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import Ajv from "ajv";
import { ROOT } from "../rules/loader.js";

export const CHECKLIST_DIR = path.join(ROOT, "rulebook", "checklists");

export const checklistSchema = {
  type: "object", required: ["checklist", "items"], additionalProperties: false,
  properties: {
    checklist: {
      type: "object", required: ["id", "name", "citation", "designs", "numbering"], additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^[A-Z0-9_]+$" }, name: { type: "string" }, citation: { type: "string" },
        designs: { type: "array", minItems: 1, items: { type: "string" } },
        requires: { type: "string" }, numbering: { enum: ["official", "quartile"] },
        official_items: { type: "integer" }, stub: { type: "boolean" }, licence_note: { type: "string" }, url: { type: "string" },
      },
    },
    items: {
      type: "array", minItems: 1,
      items: {
        type: "object", required: ["number", "topic", "item", "check"], additionalProperties: false,
        properties: {
          number: { type: "string" }, topic: { type: "string" }, item: { type: "string", minLength: 10 },
          check: { enum: ["auto", "manual"] }, detect: { type: "string" },
          where: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
        },
        if: { properties: { check: { const: "auto" } } }, then: { required: ["detect"] },
      },
    },
  },
};
const validate = new Ajv({ allErrors: true, strict: false }).compile(checklistSchema);

/** Problems in one parsed checklist file (empty list when valid). */
export function checkChecklist(obj, name = "checklist") {
  const out = [];
  if (!validate(obj)) for (const e of validate.errors) out.push(`${name}${e.instancePath} ${e.message}`);
  const seen = new Set();
  for (const it of obj?.items || []) {
    if (seen.has(it.number)) out.push(`${name}: duplicate item number ${it.number}`); seen.add(it.number);
    if (it.detect) { try { new RegExp(it.detect, "i"); } catch (e) { out.push(`${name}: item ${it.number}: bad regex (${e.message})`); } }
  }
  if (obj?.checklist?.requires) { try { new RegExp(obj.checklist.requires, "i"); } catch (e) { out.push(`${name}: requires: bad regex`); } }
  return out;
}

let cache = null;
/** Load and validate every checklist. Throws on any problem. */
export function loadChecklists(dir = CHECKLIST_DIR) {
  if (cache && dir === CHECKLIST_DIR) return cache;
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort() : [];
  const out = {}, problems = [];
  for (const f of files) {
    const obj = YAML.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    problems.push(...checkChecklist(obj, f));
    if (obj?.checklist?.id) { if (out[obj.checklist.id]) problems.push(`${f}: duplicate checklist id`); out[obj.checklist.id] = { ...obj.checklist, file: f, items: obj.items }; }
  }
  if (problems.length) throw new Error("Checklists invalid:\n" + problems.join("\n"));
  if (dir === CHECKLIST_DIR) cache = out;
  return out;
}

/** Checklists that apply to a design. A checklist with `requires` applies only when its regex matches the text. */
export function checklistsFor(design, doc) {
  const all = loadChecklists();
  return Object.values(all).filter(c => c.designs.includes(design) && (!c.requires || (doc && new RegExp(c.requires, "i").test(doc.text))));
}

const span = s => s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null;

function candidates(doc, where) {
  if (where === "title") {
    const p = doc.paragraphs.find(x => x.text.trim());
    const title = p ? [{ section: "title", start: p.start, end: p.end, text: p.text }] : [];
    return title.concat(doc.sentencesIn(["abstract", "opening"]).slice(0, 3));
  }
  if (!where || where === "all") return doc.sentences;
  const keys = [].concat(where).filter(k => k !== "title");
  const titleToo = [].concat(where).includes("title") ? candidates(doc, "title") : [];
  if (!keys.some(k => doc.hasSection(k))) return titleToo.concat(doc.sentences);   // no such section: search everywhere
  return titleToo.concat(doc.sentencesIn(keys));
}

/** Evaluate one checklist on a parsed document. */
export function evaluateChecklist(doc, cl) {
  const items = cl.items.map(it => {
    let hit = null;
    if (it.detect) { const rx = new RegExp(it.detect, "i"); hit = candidates(doc, it.where).find(s => rx.test(s.text)) || null; }
    const status = hit ? "found" : it.check === "auto" ? "not_found" : "needs_human";
    return { number: it.number, topic: it.topic, item: it.item, status, evidence: span(hit) };
  });
  const counts = { found: 0, not_found: 0, needs_human: 0 };
  for (const i of items) counts[i.status]++;
  return { id: cl.id, name: cl.name, citation: cl.citation, numbering: cl.numbering, stub: !!cl.stub, items, counts };
}

export default { loadChecklists, checklistsFor, evaluateChecklist, checkChecklist, checklistSchema, CHECKLIST_DIR };
