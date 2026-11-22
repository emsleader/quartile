// Small helpers shared by the library modules: DOI, title, name, year and type normalisation.

export const stripDiacritics = s => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/ø/g, "o").replace(/Ø/g, "O").replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/Æ/g, "AE").replace(/œ/g, "oe").replace(/Œ/g, "OE")
  .replace(/đ/g, "d").replace(/Đ/g, "D").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/ı/g, "i");

/** DOI in lower case without resolver prefix or trailing punctuation; null when it is not a DOI. */
export function normDoi(s) {
  if (!s) return null;
  let d = String(Array.isArray(s) ? s[0] : s).trim().replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").replace(/[.,;]+$/, "").trim();
  if (!/^10\.\d{4,9}\/\S+$/.test(d)) return null;
  return d.toLowerCase();
}

/** Lower case, no diacritics, no punctuation, single spaces. Used for duplicate search. */
export const normTitle = s => stripDiacritics(s).toLowerCase().replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Surname for matching: no diacritics, lower case, letters only. */
export const normName = s => stripDiacritics(s).toLowerCase().replace(/[^a-z]+/g, "");

export const first = v => Array.isArray(v) ? v[0] : v;
export const str = v => v == null ? "" : String(first(v));

export function yearOf(csl) {
  const dp = csl?.issued?.["date-parts"]?.[0]?.[0];
  if (dp != null && /^\d{4}$/.test(String(dp))) return Number(dp);
  const lit = csl?.issued?.literal || csl?.issued?.raw;
  const m = lit && String(lit).match(/(1[5-9]|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/** First creator: author, otherwise editor. */
export function firstCreator(csl) { return (csl?.author && csl.author[0]) || (csl?.editor && csl.editor[0]) || null; }
export function familyOf(p) { if (!p) return ""; return p.family || p.literal || ""; }
export const firstSurname = csl => normName(familyOf(firstCreator(csl)));

/** ISSN as 8 characters without hyphen, upper-case X; the first one when several are given. */
export function issnOf(csl) {
  const raw = [].concat(csl?.ISSN || []).join(",");
  const m = raw.match(/\d{4}-?\d{3}[\dXx]/);
  return m ? m[0].replace("-", "").toUpperCase() : null;
}
export const venueOf = csl => str(csl?.["container-title"]) || null;

const PREPRINT = /\b(arxiv|ssrn|psyarxiv|socarxiv|osf preprints|research square|preprints\.org|biorxiv|medrxiv|repec|nber|preprint|working paper|discussion paper)\b/i;
/**
 * Library kind used in items.type and by the citation policy: article-journal, book, chapter, preprint,
 * paper-conference, report, dataset, software, thesis, webpage, other.
 */
export function kindOf(csl) {
  const t = csl?.type || "";
  const doi = normDoi(csl?.DOI) || "";
  const pub = [csl?.publisher, csl?.genre, csl?.["container-title"], csl?.["collection-title"], csl?.archive].map(str).join(" ");
  if (t === "article" || t === "posted-content" || t === "preprint") return "preprint";
  if (doi.startsWith("10.48550/") || doi.startsWith("10.2139/ssrn") || doi.startsWith("10.31234/") || doi.startsWith("10.31235/") || doi.startsWith("10.1101/") || doi.startsWith("10.21203/") || doi.startsWith("10.20944/")) return t === "article-journal" ? "article-journal" : "preprint";
  if ((t === "manuscript" || t === "document") && PREPRINT.test(pub)) return "preprint";
  if (t === "report" && /\b(working|discussion) paper\b/i.test(pub)) return "report";
  if (["article-journal", "book", "chapter", "paper-conference", "report", "dataset", "software", "thesis", "webpage"].includes(t)) return t;
  if (t === "article-magazine" || t === "article-newspaper") return "other";
  if (t === "entry-encyclopedia" || t === "entry-dictionary") return "chapter";
  return "other";
}

/** Clean a CSL-JSON record from any importer: drop citation-js internals, trim strings, handle "and others". */
export function cleanCsl(c) {
  const o = JSON.parse(JSON.stringify(c || {}));
  delete o._graph;
  for (const k of Object.keys(o)) if (typeof o[k] === "string") { o[k] = o[k].trim(); if (!o[k]) delete o[k]; }
  for (const role of ["author", "editor"]) {
    if (!Array.isArray(o[role])) continue;
    const before = o[role].length;
    o[role] = o[role].filter(p => p && !(p.family === "others" && !p.given) && !(p.literal === "others"));
    if (o[role].length < before) { o.custom = { ...(o.custom || {}), [role + "_etal"]: true }; }
    if (!o[role].length) delete o[role];
  }
  if (Array.isArray(o.title)) o.title = o.title[0];
  if (Array.isArray(o["container-title"])) o["container-title"] = o["container-title"][0];
  if (o.title) o.title = String(o.title).replace(/\s+/g, " ");
  if (!o.type) o.type = "document";
  return o;
}

/** Levenshtein distance (two-row dynamic programming). */
export function levenshtein(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), cur = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
/** Normalised similarity 1 - distance / longer length, in [0, 1]. */
export const similarity = (a, b) => { const n = Math.max(a.length, b.length); return n ? 1 - levenshtein(a, b) / n : 1; };

export const now = () => new Date().toISOString();
export const today = () => now().slice(0, 10);
