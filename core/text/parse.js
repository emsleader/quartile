// Document model shared by all role modules (specification Section 2).
// parseText(text) is synchronous and offline. parseFile(path) reads DOCX (mammoth: real heading styles become
// headings), PDF (GROBID when QUARTILE_GROBID_URL is set, otherwise pdfjs-dist with the heading heuristics) or
// plain text / Markdown.
//
// Offsets: `doc.text` is the normalised text (paragraphs joined by a blank line, whitespace collapsed inside a
// paragraph). Every sentence, number and citation carries [start, end) into `doc.text`, so a finding's span can be
// shown and checked exactly.
import fs from "node:fs";
import L from "../lib.js";
import { detectSections } from "./sections.js";
import { splitSentences } from "./sentences.js";
import { classifyDesign } from "./design.js";

const NUM = /(?<![\w.])[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?|(?<![\w.])[-−]?\.\d+/g;
const CITE = /\(([A-Z][A-Za-zÀ-ÿ'’\-]+(?:\s+(?:et al\.|&|and)\s*(?:[A-Z][A-Za-zÀ-ÿ'’\-]+)?)?),?\s+((?:19|20)\d{2}[a-z]?)(?:[^()]*)\)|\b([A-Z][A-Za-zÀ-ÿ'’\-]+(?:\s+(?:et al\.|&|and)\s+[A-Z][A-Za-zÀ-ÿ'’\-]+)?(?:\s+et al\.)?)\s+\(((?:19|20)\d{2}[a-z]?)\)/g;

/**
 * @typedef {Object} Doc
 * @property {string} text
 * @property {Array} paragraphs  { id, index, text, start, end, isHeading, isRef, isTable, section }
 * @property {Array} sections    { key, heading, start, end, paraStart, paraEnd }   (start/end: char offsets)
 * @property {Array} sentences   { id, text, start, end, section, paragraph }
 * @property {Array} tables      { id, paragraph, rows: string[][], numbers: number[][] }
 * @property {Array} numbers     { value, raw, start, end, sentence, context }
 * @property {{ inText: Array, references: Array }} citations
 * @property {Object} design     filled by classifyDesign
 */
export function parseText(text, opts = {}) {
  const base = L.parse(String(text || ""));
  const roleOf = id => base.roleOf(id);
  // paragraphs with offsets into the normalised text
  let pos = 0; const parts = [];
  const paragraphs = base.paras.map((p, index) => {
    const t = p.text, start = pos, end = start + t.length; parts.push(t); pos = end + 2;
    return { id: p.id, index, text: t, start, end, isHeading: !!p.isHeading, isRef: !!p.isRef, isTable: !!p.isTable, role: p.isHeading ? sectionRole(base, p.id) : roleOf(p.id) };
  });
  const full = parts.join("\n\n");
  const secs = detectSections(paragraphs).map(s => ({ ...s, paraStart: s.start, paraEnd: s.end,
    start: paragraphs[s.start].start, end: s.end < paragraphs.length ? paragraphs[s.end].start - 2 : full.length }));
  // abstract written inline ("Abstract: We study ...") or text before the first heading
  const keyAt = i => { let k = "opening"; for (const s of secs) { if (s.paraStart <= i) k = s.key; else break; } return k; };
  paragraphs.forEach((p, i) => { p.section = p.isRef ? "references" : keyAt(i); if (p.isHeading) p.section = secs.find(s => s.paraStart === i)?.key || p.section; });

  const sentences = []; const tables = [];
  paragraphs.forEach(p => {
    if (p.isHeading) return;
    if (p.isTable) { tables.push(tableOf(p, tables.length)); return; }
    if (p.isRef) return;
    for (const s of splitSentences(p.text)) sentences.push({ id: "s" + (sentences.length + 1), text: s.text, start: p.start + s.start, end: p.start + s.end, section: p.section, paragraph: p.id });
  });
  const numbers = [];
  sentences.forEach(s => { for (const m of s.text.matchAll(NUM)) { const raw = m[0]; numbers.push({ raw, value: Number(raw.replace(/[,%]/g, "").replace("−", "-")), percent: raw.endsWith("%"), start: s.start + m.index, end: s.start + m.index + raw.length, sentence: s.id, section: s.section, context: s.text }); } });
  const inText = [];
  sentences.forEach(s => { for (const m of s.text.matchAll(CITE)) inText.push({ raw: m[0], authors: (m[1] || m[3]).trim(), year: m[2] || m[4], start: s.start + m.index, end: s.start + m.index + m[0].length, sentence: s.id, section: s.section }); });
  const references = paragraphs.filter(p => p.isRef).map(p => ({ id: p.id, text: p.text, ...safeRef(p.text) }));

  const byId = new Map(sentences.map((s, i) => [s.id, i]));
  const doc = {
    text: full, paragraphs, sections: secs, sentences, tables, numbers, citations: { inText, references }, design: null,
    sectionText(key) { const ks = [].concat(key); return paragraphs.filter(p => !p.isHeading && ks.includes(p.section)).map(p => p.text).join("\n\n"); },
    sentencesIn(keys) { if (!keys || keys === "all" || (Array.isArray(keys) && keys.includes("all"))) return sentences; const ks = [].concat(keys); return sentences.filter(s => ks.includes(s.section)); },
    window(sentenceId, n = 2) { const i = byId.get(sentenceId); if (i == null) return ""; return sentences.slice(Math.max(0, i - n), i + n + 1).map(s => s.text).join(" "); },
    hasSection(key) { return secs.some(s => s.key === key); },
  };
  doc.design = classifyDesign(doc, opts.design || null);
  return doc;
}

function sectionRole(base, id) { const s = base.sections.find(x => x.id === id); return s ? s.role : base.roleOf(id); }
function safeRef(t) { try { const r = L.Core.parseRef(t); return { doi: r.doi || null, year: r.year || null, first: r.first || r.author || null }; } catch (e) { return {}; } }
function tableOf(p, k) {
  const rows = p.text.replace(/^⟦TABLE⟧\s*/, "").split(" || ").map(r => r.split(" | ").map(c => c.trim()));
  return { id: "t" + (k + 1), paragraph: p.id, section: p.section, rows, numbers: rows.map(r => r.map(c => { const m = c.replace(/[,\s]/g, "").match(/^[-−]?\d*\.?\d+%?$/); return m ? Number(m[0].replace(/[%]/g, "").replace("−", "-")) : null; })) };
}

/** Read a manuscript file. DOCX keeps real heading styles; PDF uses GROBID when configured. */
export async function parseFile(file, opts = {}) {
  const ext = String(file).toLowerCase().split(".").pop();
  if (ext === "docx") return parseText(await docxText(file), opts);
  if (ext === "pdf") return parseText(process.env.QUARTILE_GROBID_URL ? await grobidText(file) : await pdfText(file), opts);
  return parseText(fs.readFileSync(file, "utf8"), opts);
}

async function docxText(file) {
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ path: file });
  return htmlToText(html);
}
/** Minimal HTML to text: headings become Markdown headings, tables become pipe rows. */
export function htmlToText(html) {
  const ent = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
  let out = html
    .replace(/<table[\s\S]*?<\/table>/gi, t => "\n\n" + [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(r => "| " + [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => ent(c[1])).join(" | ") + " |").join("\n") + "\n\n")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => "\n\n" + "#".repeat(+n) + " " + ent(t) + "\n\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => "\n\n" + ent(t) + "\n\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => "\n\n" + ent(t) + "\n\n");
  return ent(out.replace(/\n/g, "\u0000")).replace(/\u0000/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function pdfText(file) { const CP = (await import("../../mcp/corpus.js")).default; return CP.pdfToText(file); }
async function grobidText(file) {
  // GROBID is a service the user runs (Apache 2.0); the PDF goes only to that configured URL.
  const url = process.env.QUARTILE_GROBID_URL.replace(/\/+$/, "") + "/api/processFulltextDocument";
  const form = new FormData(); form.append("input", new Blob([fs.readFileSync(file)]), "paper.pdf");
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) throw new Error(`GROBID answered HTTP ${r.status}`);
  return teiToText(await r.text());
}
/** TEI from GROBID to text: title, abstract, section heads as headings, paragraphs, bibliography as a reference list. */
export function teiToText(tei) {
  const ent = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const parts = [];
  const title = (tei.match(/<titleStmt>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]; if (title) parts.push(ent(title));
  const abs = (tei.match(/<abstract>([\s\S]*?)<\/abstract>/) || [])[1]; if (abs) { parts.push("# Abstract"); for (const p of abs.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) parts.push(ent(p[1])); }
  const body = (tei.match(/<body>([\s\S]*?)<\/body>/) || [])[1] || "";
  for (const d of body.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)) {
    const head = d[1].match(/<head(?:\s+n="([^"]*)")?[^>]*>([\s\S]*?)<\/head>/); if (head) parts.push("# " + (head[1] ? head[1] + " " : "") + ent(head[2]));
    for (const p of d[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) parts.push(ent(p[1]));
  }
  const bibl = [...tei.matchAll(/<biblStruct[\s\S]*?<\/biblStruct>/g)].map(b => ent(b[0])).filter(Boolean);
  if (bibl.length) { parts.push("References"); parts.push(...bibl); }
  return parts.join("\n\n");
}

export default { parseText, parseFile, htmlToText, teiToText };
