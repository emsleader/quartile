// LIB-01 and LIB-05: Crossref and OpenAlex lookups. Only the DOI is sent. The fetcher is injectable
// (opts.fetchJson) so tests run offline. Default fetcher: global fetch with a 20 s timeout.
import L from "../lib.js";
import { normDoi, cleanCsl } from "./normalize.js";

const UA = { "User-Agent": "Quartile (https://github.com/emsleader/quartile)" };
export async function defaultFetchJson(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (r.status === 404) return { __notFound: true };
    if (!r.ok) return { __error: "HTTP " + r.status };
    return await r.json();
  } catch (e) { return { __error: e.name || "network error" }; } finally { clearTimeout(t); }
}

const CR_TYPE = { "journal-article": "article-journal", "book-chapter": "chapter", "book-section": "chapter", "book-part": "chapter", "reference-entry": "entry-encyclopedia",
  "proceedings-article": "paper-conference", "posted-content": "article", report: "report", "report-component": "report", dataset: "dataset", book: "book",
  monograph: "book", "edited-book": "book", "reference-book": "book", dissertation: "thesis", component: "document", other: "document" };
const dp = d => d?.["date-parts"]?.[0]?.[0] ? { "date-parts": [d["date-parts"][0].filter(x => x != null)] } : undefined;
const stripTags = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Crossref work message -> CSL-JSON. */
export function crossrefToCsl(m) {
  const csl = {
    type: CR_TYPE[m.type] || "document",
    title: stripTags((m.title || [])[0] || ""),
    author: (m.author || []).map(a => a.family ? { family: a.family, ...(a.given ? { given: a.given } : {}) } : { literal: a.name || "" }),
    editor: (m.editor || []).map(a => a.family ? { family: a.family, ...(a.given ? { given: a.given } : {}) } : { literal: a.name || "" }),
    issued: dp(m.issued) || dp(m["published-print"]) || dp(m["published-online"]) || dp(m.published),
    "container-title": (m["container-title"] || [])[0],
    volume: m.volume, issue: m.issue, page: m.page, publisher: m.publisher, DOI: m.DOI,
    ISSN: (m.ISSN || []).join(", ") || undefined, ISBN: (m.ISBN || [])[0], URL: m.URL,
    abstract: m.abstract ? stripTags(m.abstract) : undefined, "article-number": m["article-number"],
  };
  if (m.subtype === "preprint") csl.type = "article";
  for (const k of Object.keys(csl)) if (csl[k] == null || (Array.isArray(csl[k]) && !csl[k].length)) delete csl[k];
  return cleanCsl(csl);
}

const OA_TYPE = { article: "article-journal", "book-chapter": "chapter", book: "book", preprint: "article", dataset: "dataset", report: "report", dissertation: "thesis" };
/** OpenAlex work -> CSL-JSON. */
export function openalexToCsl(w) {
  const src = w.primary_location?.source || {};
  const csl = {
    type: OA_TYPE[w.type] || "document",
    title: w.title || w.display_name || "",
    author: (w.authorships || []).map(a => { const n = String(a.author?.display_name || "").trim().split(/\s+/); return n.length > 1 ? { family: n.pop(), given: n.join(" ") } : { literal: n[0] || "" }; }),
    issued: w.publication_year ? { "date-parts": [[w.publication_year]] } : undefined,
    "container-title": src.display_name, ISSN: (src.issn || []).join(", ") || undefined,
    volume: w.biblio?.volume, issue: w.biblio?.issue,
    page: w.biblio?.first_page ? w.biblio.first_page + (w.biblio.last_page && w.biblio.last_page !== w.biblio.first_page ? "-" + w.biblio.last_page : "") : undefined,
    DOI: normDoi(w.doi) || undefined, publisher: src.host_organization_name,
  };
  for (const k of Object.keys(csl)) if (csl[k] == null || (Array.isArray(csl[k]) && !csl[k].length)) delete csl[k];
  return cleanCsl(csl);
}

/** Metadata for a DOI: Crossref first, then OpenAlex. Returns { csl, source, crossref } or { error }. */
export async function fetchDoi(doi, { fetchJson = defaultFetchJson } = {}) {
  const d = normDoi(doi); if (!d) return { error: "Not a DOI: " + doi };
  const cr = await fetchJson("https://api.crossref.org/works/" + encodeURIComponent(d));
  if (cr && cr.message && !cr.__error && !cr.__notFound) return { csl: crossrefToCsl(cr.message), source: "crossref", crossref: cr.message };
  const key = process.env.OPENALEX_API_KEY ? "?api_key=" + encodeURIComponent(process.env.OPENALEX_API_KEY) : "";
  const oa = await fetchJson("https://api.openalex.org/works/doi:" + encodeURIComponent(d) + key);
  if (oa && oa.id && !oa.__error) return { csl: openalexToCsl(oa), source: "openalex" };
  return { error: `DOI ${d} not found in Crossref or OpenAlex` + (cr?.__error ? ` (Crossref: ${cr.__error})` : "") };
}

/** Quartile from the user's SCImago bank by ISSN (core/lib.js journalLookup). The bank has no year field. */
export function quartileFor(csl, { bankYear } = {}) {
  const issns = String([].concat(csl.ISSN || []).join(",")).match(/\d{4}-?\d{3}[\dXx]/g) || [];
  for (const raw of issns) {
    const issn = raw.replace("-", "").toUpperCase();
    const hit = L.journalLookup(issn).find(j => (j.issn || []).includes(issn));
    if (hit && /^Q[1-4]$/.test(hit.quartile)) return { quartile: hit.quartile, year: bankYear ?? (Number(process.env.QUARTILE_BANK_YEAR) || null), journal: hit.title, issn };
  }
  return { quartile: null, year: null };
}

const STATUS_ORDER = ["retracted", "expression_of_concern", "corrected", "verified"];
const classify = type => { const t = String(type || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (/retract|withdraw|removal/.test(t)) return "retracted"; if (/concern/.test(t)) return "expression_of_concern"; if (/correct|erratum|corrigendum|addendum/.test(t)) return "corrected"; return null; };

/**
 * Retraction status from Crossref metadata: updated-by / update-to / relation on the record, plus notices that
 * point to it (works?filter=updates:DOI). Returns { status, notices, note }.
 */
export async function crossrefStatus(doi, { fetchJson = defaultFetchJson, record } = {}) {
  const d = normDoi(doi); if (!d) return { status: "could_not_verify", notices: [], note: "not a DOI" };
  let m = record;
  if (!m) { const r = await fetchJson("https://api.crossref.org/works/" + encodeURIComponent(d)); if (!r || r.__error) return { status: "could_not_verify", notices: [], note: "Crossref unavailable: " + (r?.__error || "no answer") }; if (r.__notFound) return { status: "could_not_verify", notices: [], note: "DOI not found in Crossref" }; m = r.message; }
  const notices = [];
  for (const u of m["updated-by"] || []) { const s = classify(u.type); if (s) notices.push({ status: s, type: u.type, notice: u.DOI || null, via: "updated-by" }); }
  for (const [k, list] of Object.entries(m.relation || {})) { const s = classify(k); if (s && /^(is|has)[-_]/.test(k)) for (const x of [].concat(list)) notices.push({ status: s, type: k, notice: x.id || null, via: "relation" }); }
  const isNotice = (m["update-to"] || []).filter(u => normDoi(u.DOI) !== d).map(u => ({ type: u.type, updates: u.DOI }));
  const upd = await fetchJson("https://api.crossref.org/works?rows=20&select=DOI,type,title,update-to&filter=updates:" + encodeURIComponent(d));
  for (const n of upd?.message?.items || []) for (const u of n["update-to"] || []) if (normDoi(u.DOI) === d) { const s = classify(u.type); if (s) notices.push({ status: s, type: u.type, notice: n.DOI, via: "update-to" }); }
  if (/^\s*(retracted|withdrawn)\b/i.test((m.title || [])[0] || "")) notices.push({ status: "retracted", type: "title marks the work as retracted", notice: null, via: "title" });
  const status = STATUS_ORDER.find(s => notices.some(n => n.status === s)) || "verified";
  return { status, notices, is_notice_for: isNotice, note: notices.length ? notices.map(n => `${n.type}${n.notice ? " doi:" + n.notice : ""}`).join("; ") : "Crossref record found; no update notices.", record: m, updates_checked: !upd?.__error };
}

export default { fetchDoi, crossrefToCsl, openalexToCsl, quartileFor, crossrefStatus, defaultFetchJson };
