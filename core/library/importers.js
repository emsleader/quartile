// LIB-02: parse BibTeX, RIS, CSL-JSON (also Zotero's CSL-JSON and RIS exports) and Zotero RDF into CSL-JSON.
// BibTeX and RIS go through @citation-js/plugin-bibtex and plugin-ris (MIT). For BibTeX we also read the raw
// entries: the entry type decides the CSL type (the plugin guesses some types from fields), and fields the plugin
// does not map are kept verbatim in csl.custom.bibtex so that an export writes them back (no data loss).
// Zotero RDF is read with fast-xml-parser (MIT); its collections are returned with their member items.
import { Cite, plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import { XMLParser } from "fast-xml-parser";
import { cleanCsl } from "./normalize.js";

// BibTeX entry type -> CSL type (our mapping; overrides the plugin's guess).
export const BIB_TO_CSL = {
  article: "article-journal", book: "book", mvbook: "book", booklet: "book", proceedings: "book", collection: "book", mvcollection: "book",
  inbook: "chapter", incollection: "chapter", bookinbook: "chapter", inreference: "entry-encyclopedia",
  inproceedings: "paper-conference", conference: "paper-conference",
  techreport: "report", report: "report", manual: "report",
  phdthesis: "thesis", mastersthesis: "thesis", thesis: "thesis",
  unpublished: "manuscript", online: "webpage", electronic: "webpage", www: "webpage",
  dataset: "dataset", software: "software", misc: "document", preprint: "article",
};
// Fields the plugin maps to CSL (checked on @citation-js/plugin-bibtex 0.9.0). Everything else is kept raw.
export const BIB_MAPPED = new Set(["author", "editor", "title", "journal", "journaltitle", "booktitle", "year", "date", "month", "publisher", "address", "location",
  "volume", "number", "issue", "pages", "doi", "url", "issn", "isbn", "abstract", "edition", "type", "version", "note", "institution", "school", "series",
  "keywords", "urldate", "language"]);

export function detectFormat(text, filename = "") {
  const ext = String(filename).toLowerCase().split(".").pop();
  if (["bib", "bibtex", "biblatex"].includes(ext)) return "bibtex";
  if (["ris", "txt"].includes(ext) && /^\s*TY {2}- /m.test(text)) return "ris";
  if (ext === "rdf") return "zotero-rdf";
  if (ext === "json") return "csl-json";
  const t = String(text).replace(/^﻿/, "").trimStart();
  if (t.startsWith("<")) return /zotero|rdf:RDF/i.test(t.slice(0, 4000)) ? "zotero-rdf" : "unknown";
  if (t.startsWith("[") || t.startsWith("{")) return "csl-json";
  if (/^TY {2}- /m.test(t)) return "ris";
  if (/^@\w+\s*[{(]/m.test(t)) return "bibtex";
  return "unknown";
}

/** Parse any supported text. Returns { format, items: CSL[], collections: [{ name, parent, members: [index] }], warnings }. */
export async function parseAny(text, { format, filename } = {}) {
  const f = format && format !== "auto" ? format : detectFormat(text, filename);
  if (f === "bibtex") return { format: f, ...(await parseBibtex(text)), collections: [] };
  if (f === "ris") return { format: f, ...(await parseRis(text)), collections: [] };
  if (f === "csl-json") return { format: f, ...parseCslJson(text) };
  if (f === "zotero-rdf") return { format: f, ...parseZoteroRdf(text) };
  throw new Error("Unknown reference format. Use BibTeX (.bib), RIS (.ris), CSL-JSON (.json) or Zotero RDF (.rdf).");
}

export async function parseBibtex(text) {
  const src = String(text).replace(/^﻿/, "");
  const raw = await plugins.input.chainAsync(src, { target: "@biblatex/entries+list", generateGraph: false });
  const csl = await plugins.input.chainAsync(src, { generateGraph: false });
  const warnings = [];
  if (raw.length !== csl.length) warnings.push(`BibTeX: ${raw.length} raw entries but ${csl.length} parsed records.`);
  const byLabel = new Map(raw.map(r => [r.label, r]));
  const items = csl.map((c, i) => {
    const r = (raw[i] && raw[i].label === c["citation-key"] ? raw[i] : byLabel.get(c["citation-key"])) || {}; const o = cleanCsl(c);
    const t = String(r.type || "").toLowerCase();
    if (BIB_TO_CSL[t]) o.type = BIB_TO_CSL[t];
    const props = r.properties || {};
    // preprint markers from eprint fields
    const ep = String(props.eprinttype || props.archiveprefix || "").toLowerCase();
    const sub = String(props.entrysubtype || "").toLowerCase();
    if (t === "article" && (sub === "magazine" || sub === "newspaper")) o.type = "article-" + sub;
    const pre = String(props.pubstate || "").toLowerCase() === "preprint";
    if (pre && ["misc", "unpublished", "online", "article"].includes(t)) o.type = "article";
    if (t === "misc" && (ep || /arxiv|ssrn|preprint/i.test(String(props.howpublished || "") + " " + (o.publisher || "")))) o.type = "article";
    if (t === "phdthesis" && !o.genre) o.genre = "phdthesis";
    if (t === "mastersthesis" && !o.genre) o.genre = "mastersthesis";
    const extra = {};
    for (const [k, v] of Object.entries(props)) {
      const key = k.toLowerCase();
      if (BIB_MAPPED.has(key)) continue;
      if (key === "pubstate" && pre) continue;
      if (key === "eid") { o["article-number"] = String(v); continue; }               // encoded in the CSL type
      if (key === "entrysubtype" && o.type.startsWith("article-") && o.type !== "article-journal") continue;
      extra[key] = v;
    }
    if (Object.keys(extra).length) o.custom = { ...(o.custom || {}), bibtex: extra };
    if (r.label) o["citation-key"] = r.label;
    if (t) o.custom = { ...(o.custom || {}), bibtex_type: t };
    return o;
  });
  return { items, warnings };
}

export async function parseRis(text) {
  const src = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const csl = await plugins.input.chainAsync(src, { generateGraph: false });
  // plugin-ris 0.9 reads T2 of a conference paper as the event title; in RIS (and Zotero exports) T2 is the proceedings title
  const items = csl.map(cleanCsl).map(o => { if (o.type === "paper-conference" && !o["container-title"] && o["event-title"]) { o["container-title"] = o["event-title"]; delete o["event-title"]; } return o; });
  return { items, warnings: [] };
}

export function parseCslJson(text) {
  const j = typeof text === "string" ? JSON.parse(text.replace(/^﻿/, "")) : text;
  const list = Array.isArray(j) ? j : Array.isArray(j.items) ? j.items : [j];
  const collections = new Map();
  const items = list.map((c, i) => {
    const o = cleanCsl(c);
    const ql = o.custom?.quartile_library; // our own backup format keeps tags and collections
    if (ql) for (const name of ql.collections || []) { if (!collections.has(name)) collections.set(name, { name, parent: null, members: [] }); collections.get(name).members.push(i); }
    return o;
  });
  return { items, collections: [...collections.values()], warnings: [] };
}

// ---------- Zotero RDF ----------
const arr = v => v == null ? [] : Array.isArray(v) ? v : [v];
const txt = v => { if (v == null) return ""; if (typeof v === "string" || typeof v === "number") return String(v); if (Array.isArray(v)) return txt(v[0]); return txt(v["#text"] ?? v["rdf:value"] ?? ""); };
const ZTYPE = { journalArticle: "article-journal", book: "book", bookSection: "chapter", conferencePaper: "paper-conference", report: "report", thesis: "thesis",
  preprint: "article", dataset: "dataset", computerProgram: "software", webpage: "webpage", manuscript: "manuscript", magazineArticle: "article-magazine",
  newspaperArticle: "article-newspaper", encyclopediaArticle: "entry-encyclopedia", document: "document" };
const NODE_TYPES = ["bib:Article", "bib:Book", "bib:BookSection", "bib:Report", "bib:Thesis", "bib:Document", "bib:Data", "bib:Manuscript", "bib:Letter",
  "bib:ConferenceProceedings", "bib:Memo", "bib:Recording", "bib:Image", "bib:Illustration", "bib:Legislation", "bib:Patent", "rdf:Description"];

/** Zotero RDF export (File > Export Library > Zotero RDF). Written from the published format, tested on synthetic files. */
export function parseZoteroRdf(text) {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: false, isArray: () => false, textNodeName: "#text", parseTagValue: false });
  const doc = p.parse(String(text));
  const root = doc["rdf:RDF"]; if (!root) throw new Error("Zotero RDF: no rdf:RDF root element.");
  const nodes = [];
  for (const t of NODE_TYPES) for (const n of arr(root[t])) nodes.push({ tag: t, n });
  const byAbout = new Map();
  for (const [tag, v] of Object.entries(root)) if (!tag.startsWith("@")) for (const n of arr(v)) if (n && n["@rdf:about"]) byAbout.set(n["@rdf:about"], { tag, n });
  const items = [], aboutToIndex = new Map(), warnings = [];
  // containers (journals, books holding sections) are not items themselves
  const isContainer = new Set();
  for (const { n } of nodes) for (const part of arr(n["dcterms:isPartOf"])) { const ref = part["@rdf:resource"]; if (ref) isContainer.add(ref); }
  for (const { tag, n } of nodes) {
    const about = n["@rdf:about"];
    const zt = txt(n["z:itemType"]);
    if (!zt || zt === "attachment" || zt === "note") continue;
    if (isContainer.has(about) && !n["dc:title"]) continue;
    const csl = { type: ZTYPE[zt] || (tag === "bib:Article" ? "article-journal" : "document") };
    csl.title = txt(n["dc:title"]);
    for (const [role, key] of [["author", "bib:authors"], ["editor", "bib:editors"]]) {
      const seq = n[key]?.["rdf:Seq"]?.["rdf:li"]; const people = arr(seq).map(li => li["foaf:Person"] || li).filter(Boolean);
      const list = people.map(pp => pp["foaf:surname"] ? { family: txt(pp["foaf:surname"]), ...(pp["foaf:givenName"] ? { given: txt(pp["foaf:givenName"]) } : {}) } : (pp["foaf:name"] ? { literal: txt(pp["foaf:name"]) } : null)).filter(Boolean);
      if (list.length) csl[role] = list;
    }
    const date = txt(n["dc:date"]); const m = date.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
    if (m) csl.issued = { "date-parts": [[+m[1], ...(m[2] ? [+m[2]] : []), ...(m[3] ? [+m[3]] : [])]] }; else if (date) csl.issued = { literal: date };
    const abs = txt(n["dcterms:abstract"]); if (abs) csl.abstract = abs;
    const pages = txt(n["bib:pages"]); if (pages) csl.page = pages;
    const pub = n["dc:publisher"]?.["foaf:Organization"]; if (pub) { if (pub["foaf:name"]) csl.publisher = txt(pub["foaf:name"]); const loc = pub["vcard:adr"]?.["vcard:Address"]?.["vcard:locality"]; if (loc) csl["publisher-place"] = txt(loc); }
    const ids = arr(n["dc:identifier"]);
    for (const id of ids) {
      const s = txt(id); const uri = id?.["dcterms:URI"] ? txt(id["dcterms:URI"]["rdf:value"]) : "";
      if (/^DOI\s+/i.test(s)) csl.DOI = s.replace(/^DOI\s+/i, "");
      else if (/^ISBN\s+/i.test(s)) csl.ISBN = s.replace(/^ISBN\s+/i, "");
      else if (uri) csl.URL = uri;
    }
    for (const part of arr(n["dcterms:isPartOf"])) {
      const ref = part["@rdf:resource"]; const c = ref ? byAbout.get(ref)?.n : (part["bib:Journal"] || part["bib:Book"] || part["bib:Periodical"] || part["bib:Series"] || part);
      if (!c) continue;
      const ct = txt(c["dc:title"]); if (ct && !csl["container-title"]) csl["container-title"] = ct;
      if (c["prism:volume"]) csl.volume = txt(c["prism:volume"]);
      if (c["prism:number"]) csl.issue = txt(c["prism:number"]);
      for (const id of arr(c["dc:identifier"])) { const s = txt(id); if (/^ISSN\s+/i.test(s)) csl.ISSN = s.replace(/^ISSN\s+/i, ""); if (/^DOI\s+/i.test(s) && !csl.DOI) csl.DOI = s.replace(/^DOI\s+/i, ""); }
      if (c["bib:editors"] && !csl.editor) { const seq = arr(c["bib:editors"]["rdf:Seq"]?.["rdf:li"]).map(li => li["foaf:Person"] || li); const ed = seq.filter(x => x["foaf:surname"]).map(x => ({ family: txt(x["foaf:surname"]), given: txt(x["foaf:givenName"]) })); if (ed.length) csl.editor = ed; }
    }
    if (n["prism:volume"] && !csl.volume) csl.volume = txt(n["prism:volume"]);
    if (n["prism:number"] && !csl.issue) csl.issue = txt(n["prism:number"]);
    const subj = arr(n["dc:subject"]).map(s => txt(s?.["z:AutomaticTag"]?.["rdf:value"] ?? s)).filter(Boolean);
    if (subj.length) csl.keyword = subj.join(", ");
    aboutToIndex.set(about, items.length);
    items.push(cleanCsl(csl));
  }
  // collections, with nesting
  const cols = arr(root["z:Collection"]);
  const colAbout = new Map(cols.map(c => [c["@rdf:about"], txt(c["dc:title"])]));
  const parentOf = new Map();
  for (const c of cols) for (const part of arr(c["dcterms:hasPart"])) { const ref = part["@rdf:resource"]; if (colAbout.has(ref)) parentOf.set(ref, colAbout.get(c["@rdf:about"])); }
  const collections = cols.map(c => ({ name: txt(c["dc:title"]), parent: parentOf.get(c["@rdf:about"]) || null,
    members: arr(c["dcterms:hasPart"]).map(part => aboutToIndex.get(part["@rdf:resource"])).filter(i => i != null) }));
  if (!items.length) warnings.push("Zotero RDF: no items found.");
  return { items, collections, warnings };
}

/** Parse BibTeX/RIS/CSL with citation-js only (used to sanity-check a single pasted record). */
export async function parseQuick(text) { return (await Cite.async(text)).data.map(cleanCsl); }

export default { detectFormat, parseAny, parseBibtex, parseRis, parseCslJson, parseZoteroRdf, BIB_TO_CSL, BIB_MAPPED };
