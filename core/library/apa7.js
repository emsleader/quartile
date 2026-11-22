// LIB-08: our own APA 7 reference formatter (Publication Manual of the APA, 7th ed., 2020, Chapters 9-10).
// Written from the rules, not from citeproc or any CSL processor (citeproc-js is CPAL/AGPL; not bundled).
// Types: journal article, book, chapter, report, preprint, conference paper, dataset, software (plus thesis and
// a generic fallback). Titles are printed as stored: we do not change capitalisation (sentence case for article
// and book titles is the author's job; automatic case changes break proper nouns).
// Output: markdown (*italics*), html (<i>) or text (no italics).
import { kindOf, yearOf, familyOf, stripDiacritics } from "./normalize.js";

const I = s => ({ i: String(s) });                       // italic segment
const endsPunct = s => /[.?!]$/.test(s);
const dot = s => (s && !endsPunct(s) ? s + "." : s);

/** "Jean-Paul Marie" -> "J.-P. M." */
export function initials(given) {
  if (!given) return "";
  return String(given).trim().split(/\s+/).map(w => w.split("-").map(p => {
    const m = p.replace(/^[^\p{L}]+/u, ""); if (!m) return "";
    if (/^\p{Lu}\.?$/u.test(m)) return m[0] + ".";
    return /\./.test(m) && /^(\p{L}\.)+$/u.test(m) ? m.replace(/\./g, ". ").trim() : m[0].toUpperCase() + ".";
  }).filter(Boolean).join("-")).filter(Boolean).join(" ").replace(/\s+/g, " ");
}
const isGroup = p => !!p.literal || (!p.given && !p["non-dropping-particle"]);
const famFull = p => [p["non-dropping-particle"], p.family].filter(Boolean).join(" ");
/** Author in reference position: "Family, G. I." (group authors as written). */
export function nameInverted(p) {
  if (isGroup(p)) return familyOf(p);
  const ini = initials([p.given, p["dropping-particle"]].filter(Boolean).join(" "));
  return famFull(p) + (ini ? ", " + ini : "") + (p.suffix ? ", " + p.suffix : "");
}
/** Editor in "In" position: "G. I. Family". */
export const nameDirect = p => isGroup(p) ? familyOf(p) : [initials(p.given), famFull(p)].filter(Boolean).join(" ") + (p.suffix ? ", " + p.suffix : "");

/** APA 7 author list: up to 20 names; 21 or more: first 19, ellipsis, last. */
export function authorList(list) {
  const n = list.map(nameInverted);
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]}, & ${n[1]}`;
  if (n.length <= 20) return n.slice(0, -1).join(", ") + ", & " + n[n.length - 1];
  return n.slice(0, 19).join(", ") + ", . . . " + n[n.length - 1];
}
function editorsIn(list) {
  const n = list.map(nameDirect);
  const s = n.length === 1 ? n[0] : n.length === 2 ? `${n[0]} & ${n[1]}` : n.slice(0, -1).join(", ") + ", & " + n[n.length - 1];
  return `${s} (${list.length === 1 ? "Ed." : "Eds."})`;
}
const ordinal = e => { const s = String(e).trim(); if (!/^\d+$/.test(s)) return s.replace(/\s*ed(ition)?\.?$/i, "") + " ed."; const n = +s, t = n % 100;
  return n + (t >= 11 && t <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" })[n % 10] || "th") + " ed."; };
const pages = p => String(p || "").replace(/\s*(--|-|—|–)\s*/g, "–");
const link = csl => csl.DOI ? "https://doi.org/" + String(csl.DOI).replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "") : (csl.URL || "");

function dateStr(csl, { withDay = false } = {}) {
  const y = yearOf(csl); const sfx = csl["year-suffix"] || "";
  if (!y) return "n.d." + (sfx ? "-" + sfx : "");
  const dp = csl.issued?.["date-parts"]?.[0] || [];
  const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (withDay && dp[1]) return `${y}${sfx}, ${M[dp[1] - 1]}${dp[2] ? " " + dp[2] : ""}`;
  return `${y}${sfx}`;
}

/** Author element; when there is no author, the editor or the title takes its place. */
function lead(csl, titleItalic) {
  if (csl.author?.length) return { who: dot(authorList(csl.author)), titleUsed: false, edLead: false };
  if (csl.editor?.length && ["book"].includes(kindOf(csl))) return { who: authorList(csl.editor) + (csl.editor.length === 1 ? " (Ed.)." : " (Eds.)."), titleUsed: false, edLead: true };
  return { who: null, titleUsed: true, titleItalic };
}

function parts(csl) {
  const kind = kindOf(csl);
  const T = csl.title || "Untitled";
  const out = [];
  const L = lead(csl, ["book", "report", "preprint", "dataset", "software", "thesis", "webpage", "other"].includes(kind));
  const date = `(${dateStr(csl, { withDay: kind === "paper-conference" && !csl["container-title"] })}).`;
  if (L.who) out.push(L.who, " ", date); else { out.push(L.titleItalic ? I(T) : T, L.titleItalic ? "." : (endsPunct(T) ? "" : "."), " ", date); }
  const titleSeg = (italic, bracket, paren) => {
    if (L.titleUsed) { if (paren || bracket) out.splice(1, 0, [paren && ` (${paren})`, bracket && ` [${bracket}]`].filter(Boolean).join("")); return; }
    out.push(" ", italic ? I(T) : T);
    if (paren) out.push(` (${paren})`);
    if (bracket) out.push(` [${bracket}]`);
    if (!(paren || bracket) && endsPunct(T)) return;
    out.push(".");
  };
  const publisher = p => { if (!p) return; const auth = (csl.author || []).filter(isGroup).map(familyOf); if (auth.includes(p)) return; out.push(" ", dot(p)); };
  const ver = csl.version ? `Version ${csl.version}` : null;
  const ed = csl.edition ? ordinal(csl.edition) : null;
  switch (kind) {
    case "article-journal": {
      titleSeg(false);
      const j = csl["container-title"];
      if (j) {
        out.push(" ", I(j));
        if (csl.volume) { out.push(", ", I(csl.volume)); if (csl.issue) out.push(`(${csl.issue})`); }
        else if (csl.issue) out.push(`, (${csl.issue})`);
        if (csl["article-number"]) out.push(`, Article ${csl["article-number"]}`);
        else if (csl.page) out.push(", " + pages(csl.page));
        out.push(".");
      }
      break;
    }
    case "book": titleSeg(true, null, ed); publisher(csl.publisher); break;
    case "chapter": case "paper-conference": {
      if (kind === "paper-conference" && !csl["container-title"]) { // unpublished presentation
        titleSeg(true, csl.genre && !/paper|conference/i.test(csl.genre) ? csl.genre : "Paper presentation");
        const ev = [csl["event-title"] || csl.event || csl["collection-title"], csl["event-place"] || csl["publisher-place"]].filter(Boolean).join(", ");
        if (ev) out.push(" ", dot(ev));
        break;
      }
      titleSeg(false);
      const inner = [ed, csl.volume ? `Vol. ${csl.volume}` : null, csl.page ? `pp. ${pages(csl.page)}` : null].filter(Boolean).join(", ");
      out.push(" In ", csl.editor?.length ? editorsIn(csl.editor) + ", " : "", I(csl["container-title"] || "Untitled volume"), inner ? ` (${inner})` : "", ".");
      publisher(csl.publisher);
      break;
    }
    case "report": {
      const g = csl.genre && !/^tech(nical)?report$/i.test(csl.genre) ? csl.genre : (csl.number ? "Report" : null);
      titleSeg(true, null, csl.number ? `${g} No. ${csl.number}` : null);
      publisher(csl.publisher);
      break;
    }
    case "preprint": titleSeg(true, "Preprint"); publisher(csl.publisher || csl["container-title"] || csl.archive); break;
    case "dataset": titleSeg(true, "Data set", ver); publisher(csl.publisher); break;
    case "software": titleSeg(true, "Computer software", ver); publisher(csl.publisher); break;
    case "thesis": {
      const lvl = /master/i.test(csl.genre || "") ? "Master’s thesis" : "Doctoral dissertation";
      titleSeg(true, [lvl, csl.publisher].filter(Boolean).join(", ")); if (csl.archive) out.push(" ", dot(csl.archive)); break;
    }
    default: titleSeg(true, csl.genre || null); publisher(csl.publisher || csl["container-title"]);
  }
  const l = link(csl); if (l) out.push(" ", l);
  return out;
}

/** Format one CSL record. format: markdown | html | text. */
export function formatReference(csl, { format = "markdown" } = {}) {
  const segs = parts(csl);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return segs.map(s => typeof s === "string" ? (format === "html" ? esc(s) : s) : format === "markdown" ? `*${s.i}*` : format === "html" ? `<i>${esc(s.i)}</i>` : s.i).join("").replace(/ {2,}/g, " ").trim();
}

// ---------- reference list order (APA 7, section 9.44-9.47) ----------
const sortName = p => stripDiacritics(isGroup(p) ? familyOf(p) : famFull(p) + " " + initials(p.given)).toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
const authorKey = csl => (csl.author?.length ? csl.author : csl.editor?.length ? csl.editor : null);
const titleKey = s => stripDiacritics(String(s || "")).toLowerCase().replace(/^(a|an|the)\s+/, "").replace(/[^a-z0-9 ]+/g, "");

/** Sort records and add year suffixes (2020a, 2020b) for the same authors in the same year. */
export function bibliography(list, { format = "markdown" } = {}) {
  const recs = list.map(c => ({ ...c }));
  const key = c => { const a = authorKey(c); return a ? a.map(sortName) : [titleKey(c.title)]; };
  const cmp = (a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < Math.min(ka.length, kb.length); i++) { const r = ka[i].localeCompare(kb[i]); if (r) return r; }
    if (ka.length !== kb.length) return ka.length - kb.length;       // one-author works before multi-author works
    const ya = yearOf(a) ?? -1, yb = yearOf(b) ?? -1; if (ya !== yb) return ya - yb; // n.d. first
    return titleKey(a.title).localeCompare(titleKey(b.title));
  };
  recs.sort(cmp);
  for (let i = 0; i < recs.length;) {
    let j = i + 1; const k = JSON.stringify(key(recs[i])) + "|" + yearOf(recs[i]);
    while (j < recs.length && JSON.stringify(key(recs[j])) + "|" + yearOf(recs[j]) === k) j++;
    if (j - i > 1 && authorKey(recs[i])) for (let x = i; x < j; x++) recs[x]["year-suffix"] = String.fromCharCode(97 + x - i);
    i = j;
  }
  return recs.map(c => ({ id: c.id, reference: formatReference(c, { format }), year_suffix: c["year-suffix"] || null }));
}

export default { formatReference, bibliography, authorList, initials, nameInverted, nameDirect };
