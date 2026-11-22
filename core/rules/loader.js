// Rulebook loader (specification Section 4.3). Reads every *.yaml file in a folder, validates it against the
// schema, and refuses: a rule without source_ref, a rule (other than check: manual) without both a positive and a
// negative test, two rules with the same ID, and a pattern that is not a valid regular expression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv from "ajv";
import { fileSchema } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
export const RULEBOOK = path.join(ROOT, "rulebook");
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(fileSchema);
const cache = new Map();

/** Validate one parsed file; returns a list of problems (empty when the file is valid). */
export function checkFile(obj, name = "file") {
  const problems = [];
  if (!validate(obj)) for (const e of validate.errors) problems.push(`${name}${e.instancePath} ${e.message}`);
  for (const r of (obj && obj.rules) || []) {
    for (const k of ["pattern", "context", "except", "unless_nearby"]) if (r[k]) { try { new RegExp(r[k], "i"); } catch (e) { problems.push(`${name}: ${r.id}: ${k} is not a valid regular expression (${e.message})`); } }
    if (r.check !== "manual") {
      const pos = r.tests?.positive || [], neg = r.tests?.negative || [];
      if (!pos.length || !neg.length) problems.push(`${name}: ${r.id}: needs at least one positive and one negative test`);
    }
  }
  return problems;
}

/** Load and validate every rule in `dir`. Throws on any problem. Each rule gets source_id and file. */
export function loadRules(dir = RULEBOOK, { useCache = true } = {}) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (useCache && cache.has(abs)) return cache.get(abs);
  const files = fs.existsSync(abs) ? fs.readdirSync(abs).filter(f => /\.ya?ml$/.test(f)).sort() : [];
  const rules = [], seen = new Map(), problems = [];
  for (const f of files) {
    const obj = YAML.parse(fs.readFileSync(path.join(abs, f), "utf8")) || {};
    if (Array.isArray(obj.rules) && obj.rules.length === 0 && obj.source) { continue; } // a documented, still-empty source file
    problems.push(...checkFile(obj, f));
    for (const r of obj.rules || []) {
      if (seen.has(r.id)) problems.push(`${f}: duplicate rule ID ${r.id} (also in ${seen.get(r.id)})`); else seen.set(r.id, f);
      rules.push({ ...r, source_id: obj.source?.id, source_citation: obj.source?.citation, file: f,
        tests: { positive: (r.tests?.positive || []).map(t => path.join(ROOT, t)), negative: (r.tests?.negative || []).map(t => path.join(ROOT, t)) } });
    }
  }
  if (problems.length) throw new Error("Rulebook invalid:\n" + problems.join("\n"));
  if (useCache) cache.set(abs, rules);
  return rules;
}

/** Sources and rule counts per file, for rulebook_status. */
export function rulebookSummary(dir = RULEBOOK) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  return (fs.existsSync(abs) ? fs.readdirSync(abs).filter(f => /\.ya?ml$/.test(f)).sort() : []).map(f => {
    const obj = YAML.parse(fs.readFileSync(path.join(abs, f), "utf8")) || {};
    return { file: f, source: obj.source?.id, citation: obj.source?.citation, rules: (obj.rules || []).length };
  });
}

export default { loadRules, checkFile, rulebookSummary, RULEBOOK, ROOT };
