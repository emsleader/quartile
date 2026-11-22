// Shared helpers for the library_* tools (not a tool: files starting with "_" are skipped by tools/index.js).
import fs from "node:fs";
import { openLibrary } from "../core/library/index.js";
import { parseFile, parseText } from "../core/text/parse.js";
export const LABEL = "Simulated pre-submission review — not a journal decision";
export const lib = () => openLibrary();
/** Manuscript from text or a local .docx/.pdf/.txt path. */
export async function manuscript({ text, path }) {
  if (text) return parseText(text);
  if (path) { if (!fs.existsSync(path)) throw new Error("File not found: " + path); return parseFile(path); }
  throw new Error("Give text or path.");
}
/** Write a file without overwriting unless asked. */
export function writeOut(path, content, overwrite = false) {
  if (fs.existsSync(path) && !overwrite) throw new Error("File exists: " + path + ". Choose another path or set overwrite: true.");
  fs.writeFileSync(path, content); return path;
}
export const brief = it => ({ id: it.id, title: it.csl.title, year: it.year, type: it.type, doi: it.doi, venue: it.venue, quartile: it.quartile, quartile_year: it.quartile_year, tags: it.tags, collections: it.collections });
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
