// file_check: technical traces in a .docx (properties, generator defaults, hidden content, blinding leaks).
// Read only: the tool never writes to the file and never changes metadata or text.
import { z } from "zod";
import fs from "node:fs";
import { checkFile, crossFileIdentity, summarise, identifiers, CLOSING } from "../core/filecheck.js";
import { loadProfile } from "../core/roles/ethics_lib.js";

const asInput = v => (typeof v === "string" && v.length < 4096 && fs.existsSync(v)) ? v : Buffer.from(v, "base64");

export async function fileCheck({ path, docx_base64, compare = [], anonymised = false, names = [], author_profile } = {}) {
  if (!path && !docx_base64) throw new Error("file_check: give path (a local .docx) or docx_base64");
  if (path && !fs.existsSync(path)) throw new Error("File not found: " + path);
  let profile = null; try { profile = anonymised ? loadProfile(author_profile).profile : null; } catch (e) { profile = null; }
  const opts = { anonymised, names, profile };
  const main = await checkFile(path || Buffer.from(docx_base64, "base64"), { ...opts, label: path || "file 1" });
  const extra = [];
  if (compare.length) {
    const others = [];
    for (let i = 0; i < compare.length; i++) others.push(await checkFile(asInput(compare[i]), { ...opts, label: typeof compare[i] === "string" && compare[i].length < 4096 && fs.existsSync(compare[i]) ? compare[i] : `file ${i + 2}` }));
    extra.push(crossFileIdentity([main, ...others]));
  }
  const all = [...main.checks, ...extra];
  const counts = { FAIL: all.filter(c => c.status === "FAIL").length, WARN: all.filter(c => c.status === "WARN").length, OK: all.filter(c => c.status === "OK").length };
  delete main._cmp;
  return { kind: "file_check", file: main.file, sha256: main.sha256, real_words: main.real_words, metadata: main.metadata, checks: all, counts,
    identifiers_checked: anonymised ? identifiers({ names, profile }).length : undefined,
    summary: summarise(main, extra), note: CLOSING, read_only: "The file was read, never written: its SHA-256 is reported so you can confirm it is unchanged." };
}

export default {
  name: "file_check",
  title: "File check: technical traces in a Word file",
  description: "Reads a .docx you plan to submit and reports what its file properties show to editors and publisher systems, each as OK / WARN / FAIL with the measured values and a plain explanation: edit time against the real word count, a stale stored word count, created and modified at the same moment, impossible dates (before 2015, in the future, or older than the newest reference), empty or default author fields, defaults left by generators (pandoc, python-docx, docx-js), blinding leaks when anonymised (name, ORCID, e-mail, institution or company in body, headers, footers, comments, tracked changes, properties or image metadata), hidden content (comments, tracked changes, hidden or white text, zero-width characters, custom XML) and, with compare, files that are identical in properties or text. READ ONLY: it never writes to the file and never changes timestamps, edit time, word counts, author fields or text. Fix problems by saving your own revised version in Word.",
  inputSchema: {
    path: z.string().optional().describe("Local .docx file"),
    docx_base64: z.string().max(40000000).optional().describe("The .docx as base64"),
    compare: z.array(z.string().max(40000000)).max(20).optional().describe("Other .docx files to compare (local paths or base64)"),
    anonymised: z.boolean().optional().describe("The file must be blinded for review"),
    names: z.array(z.string().max(200)).max(50).optional().describe("Names, e-mails, ORCIDs, institutions or companies that must not appear when anonymised (author.yaml is also read)"),
    author_profile: z.string().optional().describe("Path to author.yaml (default $QUARTILE_HOME/author.yaml)"),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler(args) { return fileCheck(args); },
};
