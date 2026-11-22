// LIB-09: export to BibTeX (stable cite keys AuthorYearWord), RIS, CSL-JSON and a pandoc-ready .bib.
// The BibTeX writer is our own, so that every field the importer reads comes back unchanged on re-import.
import { BIB_TO_CSL } from "./importers.js";
import { stripDiacritics, yearOf, familyOf, firstCreator, str } from "./normalize.js";

const STOP = new Set("a an the on of in and or for to with from at by as is are be into over under via toward towards about between among after before during its their our this that what why how when does do can new".split(" "));

/** Stable cite keys: AuthorYearWord; same key twice gets a, b, c in order of item id (creation order). */
export function citeKeys(items) {
  const base = items.map(it => baseKey(it.csl || it));
  const order = items.map((it, i) => i).sort((a, b) => String(items[a].id).localeCompare(String(items[b].id)));
  const seen = new Map(), dup = new Map();
  base.forEach(k => dup.set(k, (dup.get(k) || 0) + 1));
  const keys = new Array(items.length);
  for (const i of order) {
    const k = base[i];
    if (dup.get(k) === 1) { keys[i] = k; continue; }
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    keys[i] = k + suffix(n);
  }
  return keys;
}
const suffix = n => { let s = ""; n += 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const ascii = s => stripDiacritics(s).replace(/[^A-Za-z0-9]+/g, "");
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
export function baseKey(csl) {
  const p = firstCreator(csl);
  const fam = ascii(familyOf(p).split(/\s+/).map(cap).join("")) || "Anon";
  const y = yearOf(csl) || "nd";
  const word = (stripDiacritics(csl.title || "").toLowerCase().match(/[a-z0-9]+/g) || []).find(w => !STOP.has(w) && w.length > 1) || "untitled";
  return cap(fam) + y + cap(word);
}

// ---------- BibTeX ----------
const CSL_TO_BIB = { "article-journal": "article", "article-magazine": "article", "article-newspaper": "article", book: "book", chapter: "incollection",
  "entry-encyclopedia": "inreference", "entry-dictionary": "inreference", "paper-conference": "inproceedings", report: "techreport", thesis: "phdthesis",
  manuscript: "unpublished", webpage: "online", "post-weblog": "online", dataset: "dataset", software: "software", article: "misc", document: "misc" };
const ARTICLE_LIKE = new Set(["article", "inproceedings", "conference"]);

/** Escape a text value for BibTeX. URLs and DOIs are written verbatim. */
export function texEscape(s) {
  return String(s ?? "").replace(/\\/g, "\u0000")
    .replace(/([&%$#_])/g, "\\$1").replace(/[{}]/g, m => "\\" + m)
    .replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}").replace(/\u00a0/g, "~")
    .replace(/--/g, "-{}-").replace(/``/g, "`{}`").replace(/''/g, "'{}'")
    .replace(/\u0000/g, "\\textbackslash{}");
}
const person = p => {
  if (p.literal) return "{" + texEscape(p.literal) + "}";
  if (!p.given && !p["non-dropping-particle"] && !p["dropping-particle"]) return "{" + texEscape(p.family || "") + "}";
  const fam = [p["non-dropping-particle"], texEscape(p.family || "")].filter(Boolean).join(" ");
  const famB = /,/.test(p.family || "") ? "{" + fam + "}" : fam;
  const given = [p.given, p["dropping-particle"]].filter(Boolean).map(texEscape).join(" ");
  return p.suffix ? `${famB}, ${texEscape(p.suffix)}, ${given}` : `${famB}, ${given}`;
};
const people = (list, etal) => list.map(person).join(" and ") + (etal ? " and others" : "");
const dateParts = csl => csl.issued?.["date-parts"]?.[0] || null;
const pad = n => String(n).padStart(2, "0");

export function bibEntry(csl, key, { pandoc = false } = {}) {
  const bt = csl.custom?.bibtex_type, t = csl.type;
  let type = bt && BIB_TO_CSL[bt] === t ? bt : (CSL_TO_BIB[t] || "misc");
  if (t === "thesis" && !bt) type = /master/i.test(csl.genre || "") ? "mastersthesis" : "phdthesis";
  const F = [];
  const add = (k, v, raw = false) => { if (v == null || v === "") return; F.push([k, raw ? String(v) : texEscape(v)]); };
  if (csl.author) F.push(["author", people(csl.author, csl.custom?.author_etal)]);
  if (csl.editor) F.push(["editor", people(csl.editor, csl.custom?.editor_etal)]);
  add("title", csl.title);
  const ct = str(csl["container-title"]);
  if (ct) add(ARTICLE_LIKE.has(type) && type !== "inproceedings" ? "journal" : "booktitle", ct);
  const dp = dateParts(csl);
  if (dp) { add("year", dp[0], true); if (dp.length > 1) add("date", dp[0] + "-" + pad(dp[1]) + (dp[2] ? "-" + pad(dp[2]) : ""), true); }
  else if (csl.issued?.literal) add("year", csl.issued.literal);
  add("volume", csl.volume);
  // number: issue for articles and proceedings papers; report/series number otherwise
  if (ARTICLE_LIKE.has(type)) add("number", csl.issue);
  else { add("number", csl.number ?? csl["collection-number"]); if (csl.issue) add("issue", csl.issue); }
  if (csl["article-number"]) add("eid", csl["article-number"]);
  if (csl.page) add("pages", String(csl.page).replace(/[–—]/g, "--").replace(/(\d)-(\d)/g, "$1--$2"), true);
  add("publisher", csl.publisher);
  add("address", csl["publisher-place"]);
  add("series", csl["collection-title"]);
  add("edition", csl.edition);
  add("type", csl.genre);
  add("version", csl.version);
  if (csl.DOI) add("doi", csl.DOI, true);
  if (csl.URL) add("url", csl.URL, true);
  add("issn", csl.ISSN); add("isbn", csl.ISBN);
  add("abstract", csl.abstract);
  add("keywords", csl.keyword);
  add("language", csl.language);
  const acc = csl.accessed?.["date-parts"]?.[0];
  if (acc) add("urldate", acc[0] + (acc[1] ? "-" + pad(acc[1]) : "") + (acc[2] ? "-" + pad(acc[2]) : ""), true);
  add("note", csl.note);
  if (t === "article" && !csl.custom?.bibtex?.pubstate) add("pubstate", "preprint", true);
  if ((t === "article-magazine" || t === "article-newspaper") && type === "article") add("entrysubtype", t.slice(8), true);
  const extra = csl.custom?.bibtex || {};
  const keep = pandoc ? ["eprint", "eprinttype", "archiveprefix", "primaryclass", "howpublished", "organization"] : Object.keys(extra);
  for (const k of keep) if (extra[k] != null && !F.some(f => f[0] === k)) F.push([k, String(extra[k])]);
  return `@${type}{${key},\n` + F.map(([k, v]) => `  ${k} = {${v}}`).join(",\n") + "\n}\n";
}

/** items: [{ id, csl }] */
export function toBibtex(items, opts = {}) {
  const keys = citeKeys(items);
  const head = opts.pandoc
    ? "% Quartile Library export for pandoc. Cite each entry by its key in pandoc citation syntax. Format with: pandoc --citeproc --bibliography library.bib\n% UTF-8; biblatex field names.\n\n"
    : "% Quartile Library BibTeX export (UTF-8).\n\n";
  return { text: head + items.map((it, i) => bibEntry(it.csl, keys[i], opts)).join("\n"), keys };
}

// ---------- RIS ----------
const CSL_TO_RIS = { "article-journal": "JOUR", "article-magazine": "MGZN", "article-newspaper": "NEWS", book: "BOOK", chapter: "CHAP", "paper-conference": "CPAPER",
  report: "RPRT", thesis: "THES", manuscript: "UNPB", webpage: "ELEC", dataset: "DATA", software: "COMP", article: "UNPB", "entry-encyclopedia": "ENCYC", document: "GEN" };
export function toRis(items) {
  const keys = citeKeys(items);
  const out = items.map(({ csl }, i) => {
    const L = []; const add = (tag, v) => { if (v != null && v !== "") L.push(`${tag}  - ${String(v).replace(/\r?\n/g, " ")}`); };
    add("TY", CSL_TO_RIS[csl.type] || "GEN");
    add("ID", keys[i]);
    for (const p of csl.author || []) add("AU", p.literal || [[p["non-dropping-particle"], p.family].filter(Boolean).join(" "), p.given, p.suffix].filter(Boolean).join(", "));
    for (const p of csl.editor || []) add("A2", p.literal || [[p["non-dropping-particle"], p.family].filter(Boolean).join(" "), p.given].filter(Boolean).join(", "));
    add("TI", csl.title);
    // container and series tags as plugin-ris 0.9 reads them back
    const ty = CSL_TO_RIS[csl.type] || "GEN", ct = str(csl["container-title"]);
    if (ty === "RPRT" || ty === "BOOK") { add("JO", ct); add("T2", csl["collection-title"]); }
    else { add("T2", ct); add("T3", csl["collection-title"]); }
    const dp = dateParts(csl);
    if (dp) { add("PY", dp[0]); add("DA", `${dp[0]}/${dp[1] ? pad(dp[1]) : ""}/${dp[2] ? pad(dp[2]) : ""}/`); }
    add("VL", csl.volume); add("IS", csl.issue);
    if (csl.page) { const [sp, ep] = String(csl.page).split(/[-–—]+/); add("SP", sp); add("EP", ep); }
    add("PB", csl.publisher); add("CY", csl["publisher-place"]); add("ET", csl.edition);
    add("M3", csl.genre); add("SN", csl.ISSN || csl.ISBN); add("DO", csl.DOI); add("UR", csl.URL);
    add("AB", csl.abstract); add("N1", csl.note); add("LA", csl.language);
    if (csl.number && csl.type === "report") add("M1", csl.number);
    for (const k of String(csl.keyword || "").split(/\s*[,;]\s*/).filter(Boolean)) add("KW", k);
    L.push("ER  - ");
    return L.join("\n");
  });
  return { text: out.join("\n\n") + "\n", keys };
}

// ---------- CSL-JSON ----------
export function toCslJson(items) {
  const keys = citeKeys(items);
  return { text: JSON.stringify(items.map(({ csl }, i) => ({ ...csl, "citation-key": keys[i] })), null, 2), keys };
}

export function exportItems(items, format) {
  if (format === "bibtex") return toBibtex(items);
  if (format === "pandoc-bib" || format === "pandoc") return toBibtex(items, { pandoc: true });
  if (format === "ris") return toRis(items);
  if (format === "csl-json" || format === "json") return toCslJson(items);
  throw new Error("Unknown export format: use bibtex, pandoc-bib, ris or csl-json.");
}

export default { citeKeys, baseKey, texEscape, bibEntry, toBibtex, toRis, toCslJson, exportItems };
