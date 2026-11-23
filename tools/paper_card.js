// paper_card: extractive card of a published paper (question, contribution, theory, hypotheses, data, methods,
// search and screening, findings with evidence labels, limitations, declarations), saved in the local library.
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFile, parseText } from "../core/text/parse.js";
import { buildCard, saveCard } from "../core/library/cards.js";
import { lib } from "./_library.js";

export async function paperCard({ path: p, text, pdf_base64, docx_base64, purpose = "both", item_id, save }) {
  let doc, source;
  if (pdf_base64 || docx_base64) {
    // a file passed as bytes (for example downloaded from Google Drive by the client): parsed in a private temp folder, then deleted
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcard-")), f = path.join(dir, pdf_base64 ? "paper.pdf" : "paper.docx");
    try { fs.writeFileSync(f, Buffer.from(pdf_base64 || docx_base64, "base64")); doc = await parseFile(f); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } else if (p) { if (!fs.existsSync(p)) throw new Error("File not found: " + p); doc = await parseFile(p); }
  else if (text) doc = parseText(text);
  else throw new Error("paper_card: give path (local PDF, DOCX or text file), pdf_base64, docx_base64 or text");
  source = doc.text;
  if (doc.sentences.length < 5) throw new Error("Too little text was read from the file (" + doc.sentences.length + " sentences). A scanned PDF needs OCR first.");
  const card = buildCard(doc, { purpose });
  // on the hosted server the library is temporary and shared, so a card is saved only when asked
  const doSave = save ?? !process.env.RENDER;
  const saved = doSave ? saveCard(await lib(), card, source, { item_id }) : null;
  return { ...card, saved, privacy: "The card holds sentences from the paper. It is stored only in your local library (QUARTILE_HOME); it is never published." + (doSave ? "" : " Not saved: set save: true to keep it.") };
}

export default {
  name: "paper_card",
  title: "Paper card: extract the key parts of a paper",
  description: "Reads a published paper (local PDF, DOCX or text file; or PDF/DOCX bytes as base64, for example a file downloaded from Google Drive) and builds an extractive card: research question, contribution claims, theory, hypotheses with verdicts, data (sample, countries, period, unit of analysis), methods, search and screening (for reviews), findings with an evidence label (FACT/OBSERVED, DERIVED, CONDITIONAL MODEL RESULT, NOT IDENTIFIED; heuristic, low confidence), limitations, funding and conflicts. Every entry is a sentence copied from the paper with its section and offsets; nothing is paraphrased or generated. purpose 'slr' stresses data, design and screening; 'citing' stresses question, contribution and findings; 'both' fills all. The card is saved in the local Quartile Library (linked to the library item with the same DOI) for later search and export.",
  inputSchema: {
    path: z.string().optional().describe("Local .pdf, .docx or .txt file (a Google Drive for desktop folder works too)"),
    pdf_base64: z.string().max(40000000).optional().describe("PDF bytes as base64"),
    docx_base64: z.string().max(40000000).optional().describe("DOCX bytes as base64"),
    text: z.string().max(2000000).optional().describe("Plain text of the paper"),
    purpose: z.enum(["slr", "citing", "both"]).optional().describe("Emphasis of the card (default both)"),
    item_id: z.string().optional().describe("Library item to link the card to (default: the item with the paper's DOI)"),
    save: z.boolean().optional().describe("Save the card in the local library (default true; false on the hosted server)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler(args) { return paperCard(args); },
};
