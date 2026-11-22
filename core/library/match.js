// LIB-07: match a manuscript's in-text citations and reference list to the library (specification 20.5).
// Author-year ("Smith et al., 2021", "(Smith & Jones, 2020a; Lee, 2019)", "Smith (2020)") and numbered
// ("[1]", "[2, 4-6]") styles. Each citation gets one status: matched, not_in_library, ambiguous, year_mismatch,
// author_mismatch; and, separately, whether it is in the reference list. Each reference entry: matched to a
// library item or not, and cited or not. The citation policy (policy.js) is applied to every matched item.
import { parseText } from "../text/parse.js";
import { normName, normTitle, normDoi, yearOf, similarity, familyOf } from "./normalize.js";
import { citationPolicy } from "./policy.js";

const NAME = String.raw`(?:(?:van|von|de|der|den|del|della|du|da|di|le|la|ten|ter|bin|al|el)\s+)*[\p{Lu}][\p{L}'’\-]+(?:\s+[\p{Lu}][\p{L}'’\-]+){0,3}`;
const YEAR = String.raw`(?:(?:19|20)\d{2}[a-z]?|n\.\s?d\.)`;
const YEARS_RE = new RegExp(String.raw`^(${YEAR}(?:\s*,\s*${YEAR})*)$`, "u");
const AUTHORS_RE = new RegExp(String.raw`^(${NAME})(?:(?:\s*,\s*${NAME})*\s*,?\s+(?:&|and)\s+(${NAME})|\s+et\s+al\.?)?$`, "u");
const NARR_RE = new RegExp(String.raw`(${NAME})(?:\s+(?:&|and)\s+(${NAME})|(?:\s*,\s*${NAME})+\s*,?\s+(?:&|and)\s+(${NAME})|\s+et\s+al\.)?(?:['’]s)?\s*$`, "u");
const PREFIX = /^(?:e\.g\.,?|i\.e\.,?|see also|see|cf\.|for example,?|for a review,? see|as cited in|also|but see|and)\s+/i;
const NOT_AUTHOR = new Set(["in", "since", "by", "from", "table", "figure", "fig", "wave", "year", "model", "until", "during", "after", "before", "of", "the", "and", "or", "between", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "spring", "summer", "autumn", "fall", "winter", "q1", "q2", "q3", "q4", "covid", "section", "appendix", "equation", "eq", "step", "phase", "round", "study"]);

const splitYear = y => { const m = String(y).match(/^((?:19|20)\d{2})([a-z]?)$/); return m ? { year: +m[1], suffix: m[2] } : { year: null, suffix: "" }; };
const surnameOf = s => s == null ? null : String(s).trim().replace(/['’]s$/, "").split(/\s+/).join(" ");

/** In-text citations with offsets into doc.text. Each: { raw, first, second, etal, year, suffix, start, end, kind } */
export function extractCitations(doc) {
  const out = [];
  for (const s of doc.sentences) {
    const t = s.text;
    for (const m of t.matchAll(/\(([^()]*)\)/g)) {
      const inner = m[1]; const at = s.start + m.index;
      if (!new RegExp(YEAR, "u").test(inner)) continue;
      const yOnly = inner.trim().replace(/,\s*pp?\.\s*[\d–\-]+$/, "");
      if (YEARS_RE.test(yOnly.trim())) { // narrative: Name (2020)
        const before = t.slice(0, m.index); const nm = before.match(NARR_RE);
        if (!nm) continue;
        const toks = nm[1].trim().split(/\s+/); while (toks.length > 1 && NOT_AUTHOR.has(toks[0].toLowerCase())) toks.shift(); // "The World Bank (2021)"
        const firstName = toks.join(" "); if (NOT_AUTHOR.has(toks[0].toLowerCase())) continue;
        const skip = nm[0].indexOf(firstName);
        for (const y of yOnly.split(/\s*,\s*/)) {
          const { year, suffix } = splitYear(y.trim());
          out.push({ raw: nm[0].slice(skip).trim() + " (" + inner + ")", first: surnameOf(firstName), second: surnameOf(nm[2] || nm[3] || null), etal: /et\s+al/.test(nm[0]), year, suffix, nd: /n\.\s?d/.test(y), start: s.start + nm.index + skip, end: at + m[0].length, kind: "narrative", sentence: s.id, section: s.section });
        }
        continue;
      }
      let off = 0;
      for (const partRaw of inner.split(";")) {
        const partStart = at + 1 + off; off += partRaw.length + 1;
        let part = partRaw.trim().replace(PREFIX, "").replace(PREFIX, "");
        part = part.replace(/,\s*(?:pp?\.|para\.|chap\.|ch\.)\s*[\w–\-]+$/i, "").trim();
        const mm = part.match(new RegExp(String.raw`^(.*?),\s*(${YEAR}(?:\s*,\s*${YEAR})*)$`, "u"));
        if (!mm) continue;
        const auth = mm[1].trim(); const am = auth.match(AUTHORS_RE);
        if (!am || /\d/.test(auth)) continue;
        if (NOT_AUTHOR.has(am[1].split(/\s+/)[0].toLowerCase())) continue;
        for (const y of mm[2].split(/\s*,\s*/)) {
          const { year, suffix } = splitYear(y.trim());
          const lead = partRaw.length - partRaw.trimStart().length;
          out.push({ raw: partRaw.trim(), first: surnameOf(am[1]), second: surnameOf(am[2] || null), etal: /et\s+al/.test(auth), year, suffix, nd: /n\.\s?d/.test(y), start: partStart + lead, end: partStart + partRaw.trimEnd().length, kind: "parenthetical", sentence: s.id, section: s.section });
        }
      }
    }
    for (const m of t.matchAll(/\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g)) {
      const nums = [];
      for (const piece of m[1].split(/\s*,\s*/)) { const r = piece.split(/\s*[-–]\s*/).map(Number); if (r.length === 2 && r[1] >= r[0] && r[1] - r[0] < 200) for (let k = r[0]; k <= r[1]; k++) nums.push(k); else nums.push(r[0]); }
      for (const n of nums) out.push({ raw: m[0], number: n, start: s.start + m.index, end: s.start + m.index + m[0].length, kind: "numbered", sentence: s.id, section: s.section });
    }
  }
  return out;
}

/** Reference-list entries: { index, number, text, first, firstAlt, year, suffix, doi, title, start, end } */
export function parseReferences(doc) {
  const paras = doc.paragraphs.filter(p => p.isRef);
  return paras.map((p, index) => {
    let t = p.text, number = null;
    const nm = t.match(/^\s*(?:\[(\d+)\]|(\d+)\.)\s+/); if (nm) { number = +(nm[1] || nm[2]); t = t.slice(nm[0].length); }
    const doi = normDoi((t.match(/10\.\d{4,9}\/[^\s"<>]+/) || [])[0]);
    const ym = t.match(/\((\d{4}[a-z]?|n\.\s?d\.)[^)]*\)/) || t.match(/\b((?:19|20)\d{2}[a-z]?)\b(?!.*\b(?:19|20)\d{2}\b)/);
    const { year, suffix } = ym ? splitYear(ym[1]) : { year: null, suffix: "" };
    let first = "";
    const ini = t.match(/^(?:\p{Lu}\.\s?(?:-\p{Lu}\.)?\s*)+((?:(?:van|von|de|der|den|du|da|di|le|la)\s+)*[\p{Lu}][\p{L}'’\-]+)/u);
    if (ini) first = ini[1];
    else first = (t.match(/^\s*((?:(?:van|von|de|der|den|du|da|di|le|la)\s+)*[\p{L}][\p{L}'’\-]*(?:\s+[\p{Lu}][\p{L}'’\-]+)*?)(?=,|\s+\p{Lu}{1,3}[,.\s]|\.\s|\s*\()/u) || [])[1] || "";
    let title = "";
    const ap = t.match(/\)\.\s+(.+?[.?!])(?:\s|$)/); if (ap) title = ap[1];
    const q = t.match(/["“]([^"”]+)["”]/); if (!title && q) title = q[1];
    if (!title) { const segs = t.split(/\.\s+/); title = segs[1] || ""; }
    return { index, number, id: p.id, text: p.text, first, year, suffix, nd: !!(ym && /n\.\s?d/.test(ym[1])), doi, title: title.replace(/[.,]$/, ""), start: p.start, end: p.end };
  });
}

const keysOf = p => { if (!p) return []; const fam = familyOf(p); const k = [normName(fam)]; if (p["non-dropping-particle"]) k.push(normName(p["non-dropping-particle"] + fam)); return k.filter(Boolean); };
const sameName = (a, p) => { const n = normName(a); return !!n && keysOf(p).includes(n); };

function indexLibrary(items) {
  const bySurname = new Map();
  for (const it of items) for (const k of keysOf((it.csl.author || it.csl.editor || [])[0])) { if (!bySurname.has(k)) bySurname.set(k, []); bySurname.get(k).push(it); }
  return { items, bySurname, cand: name => bySurname.get(normName(name)) || [] };
}

/** Match one reference entry to the library. */
export function matchReference(ref, L) {
  if (ref.doi) { const it = L.items.find(i => i.doi === ref.doi); if (it) return { status: "matched", item: it.id, by: "doi" }; }
  const tn = normTitle(ref.title), full = normTitle(ref.text);
  const titleHit = it => { const x = it.title_norm; return x && ((tn && similarity(tn, x) >= 0.92) || (x.length >= 15 && full.includes(x))); };
  const cands = L.cand(ref.first);
  const byTitle = cands.filter(titleHit);
  if (byTitle.length) {
    const same = byTitle.filter(it => ref.year == null || yearOf(it.csl) === ref.year);
    if (same.length === 1) return { status: "matched", item: same[0].id, by: "author+title+year" };
    if (same.length > 1) return { status: "ambiguous", items: same.map(i => i.id) };
    return { status: "year_mismatch", items: byTitle.map(i => i.id), library_years: byTitle.map(i => yearOf(i.csl)) };
  }
  const titleOnly = L.items.filter(it => titleHit(it) && (ref.year == null || Math.abs((yearOf(it.csl) || 0) - ref.year) <= 1));
  if (titleOnly.length === 1 && tn.length >= 15) return { status: "author_mismatch", items: [titleOnly[0].id], library_first_author: familyOf((titleOnly[0].csl.author || [])[0]) };
  const sy = cands.filter(it => yearOf(it.csl) === ref.year);
  if (sy.length === 1 && !tn) return { status: "matched", item: sy[0].id, by: "author+year" };
  if (sy.length > 1) return { status: "ambiguous", items: sy.map(i => i.id) };
  return { status: "not_in_library" };
}

/** Direct match of an in-text citation to the library (no reference entry). Spec 20.5 matchCitation. */
export function matchCitationDirect(c, L) {
  const hits = L.cand(c.first).filter(it => { const y = yearOf(it.csl); return c.year == null ? y == null : y != null && Math.abs(y - c.year) <= 1; });
  const exact = hits.filter(h => yearOf(h.csl) === c.year);
  if (exact.length === 1) return { status: "matched", item: exact[0].id };
  if (exact.length > 1) return { status: "ambiguous", items: exact.map(h => h.id) };
  if (hits.length) return { status: "year_mismatch", items: hits.map(h => h.id) };
  return { status: "not_in_library" };
}

const LABEL = "Simulated pre-submission review — not a journal decision";
const SRC = "Quartile Library manuscript matching, specification Section 20.5";
const FINDING = {
  not_in_library: ["LIB-MAT-01", "minor", "high", "Cited work not in the library", "Add the work to the library (library_add by DOI) so it can be verified and checked against the citation policy."],
  in_list_not_cited: ["LIB-MAT-02", "minor", "high", "Reference list entry not cited in the text", "Cite the work in the text or remove it from the reference list."],
  ambiguous: ["LIB-MAT-03", "note", "medium", "Citation matches more than one library item", "Add a year suffix (2020a, 2020b) or check which work is meant."],
  year_mismatch: ["LIB-MAT-04", "minor", "medium", "Year differs from the library record", "Check the year; online-first and print years can differ."],
  author_mismatch: ["LIB-MAT-05", "minor", "medium", "Authors differ from the library record", "Check the author names and the et al. rule (APA 7: et al. from three authors)."],
  cited_not_in_list: ["LIB-MAT-06", "minor", "medium", "Citation has no entry in the reference list", "Add the reference list entry, or correct the author or year in the text."],
};
function finding(kind, span, message, detail) {
  const [rule, severity, confidence, title, fix] = FINDING[kind];
  return { rule, role: "production", title, severity, confidence, source: SRC, source_ref: "Spec 20.5 / " + rule, message, fix, span, detail };
}
const spanOf = (doc, x) => x ? { section: x.section || "references", start: x.start, end: x.end, text: doc.text.slice(x.start, x.end) } : null;

/**
 * Full matching report. lib: Library; text or doc; paperType: slr | empirical | conceptual (default from design).
 */
export function matchManuscript(lib, { text, doc, paperType } = {}) {
  doc ||= parseText(text);
  const pt = paperType || (doc.design?.primary === "slr" ? "slr" : doc.design?.primary === "conceptual" ? "conceptual" : "empirical");
  const items = lib.all(); const L = indexLibrary(items); const byId = new Map(items.map(i => [i.id, i]));
  const refs = parseReferences(doc).map(r => ({ ...r, library: matchReference(r, L), cited_by: 0 }));
  const numbered = refs.some(r => r.number != null);
  const cites = extractCitations(doc).filter(c => c.kind !== "numbered" || numbered);
  const findings = [];
  for (const c of cites) {
    let ref = null;
    if (c.kind === "numbered") ref = refs.find(r => r.number === c.number) || null;
    else {
      const same = refs.filter(r => normName(r.first) === normName(c.first) || normName(r.first).endsWith(normName(c.first)));
      const yr = same.filter(r => (c.nd ? r.nd : r.year === c.year) && (!c.suffix || !r.suffix || r.suffix === c.suffix));
      ref = yr.length === 1 ? yr[0] : yr.find(r => r.suffix === c.suffix) || null;
      if (!ref && yr.length > 1) { c.status = "ambiguous"; c.reference_candidates = yr.map(r => r.index); }
      if (!ref && !yr.length && same.length) c.list_year_mismatch = same.map(r => r.year);
    }
    if (ref) { ref.cited_by++; c.reference = ref.index; }
    c.in_reference_list = !!ref;
    if (!c.status) {
      const m = ref ? ref.library : (c.kind === "numbered" ? { status: "not_in_library" } : matchCitationDirect(c, L));
      c.status = m.status; c.item = m.item || null; c.items = m.items || null;
    }
    if (c.status === "matched" && c.kind !== "numbered") {
      const it = byId.get(c.item); const n = (it.csl.author || []).length;
      if (c.etal && n > 0 && n < 3) { c.status = "author_mismatch"; c.note = `"et al." used but the work has ${n} author(s); APA 7 names one or two authors in full.`; }
      else if (c.second && n >= 2 && !sameName(c.second, it.csl.author[1])) { c.status = "author_mismatch"; c.note = `second author in the text is ${c.second}; the library record has ${familyOf(it.csl.author[1])}.`; }
    }
  }
  for (const c of cites) {
    const sp = spanOf(doc, c);
    if (!c.in_reference_list && c.status !== "ambiguous") findings.push(finding("cited_not_in_list", sp, `"${c.raw}" has no matching entry in the reference list${c.list_year_mismatch ? ` (the list has ${c.first} ${c.list_year_mismatch.join(", ")})` : ""}.`, { citation: c.raw }));
    if (c.status !== "matched") findings.push(finding(c.status, sp, `"${c.raw}": ${c.status.replace(/_/g, " ")}${c.note ? " — " + c.note.replace(/\.$/, "") : ""}.`, { citation: c.raw, items: c.items || (c.item ? [c.item] : []) }));
  }
  for (const r of refs) if (!r.cited_by) findings.push(finding("in_list_not_cited", spanOf(doc, { ...r, section: "references" }), `Reference "${r.text.slice(0, 120)}" is not cited in the text.`, { reference: r.index }));
  // citation policy, once per matched item, at its first citation
  const done = new Set();
  for (const c of cites) {
    if (c.status !== "matched" || done.has(c.item)) continue; done.add(c.item);
    const p = citationPolicy(byId.get(c.item), byId.get(c.item).tags, pt, spanOf(doc, c)); if (p) findings.push(p);
  }
  for (const r of refs) if (r.library.status === "matched" && !done.has(r.library.item)) { done.add(r.library.item); const p = citationPolicy(byId.get(r.library.item), byId.get(r.library.item).tags, pt, spanOf(doc, { ...r, section: "references" })); if (p) findings.push(p); }
  const count = (l, k) => l.reduce((o, x) => (o[x[k]] = (o[x[k]] || 0) + 1, o), {});
  return {
    label: LABEL, paper_type: pt, style: numbered ? "numbered" : "author-year",
    summary: { citations: cites.length, citation_status: count(cites, "status"), references: refs.length, reference_status: count(refs.map(r => ({ s: r.library.status })), "s"),
      references_not_cited: refs.filter(r => !r.cited_by).length, citations_not_in_list: cites.filter(c => !c.in_reference_list).length, library_items: items.length },
    citations: cites.map(c => ({ raw: c.raw, kind: c.kind, first: c.first || null, year: c.year ?? null, suffix: c.suffix || null, number: c.number ?? null, start: c.start, end: c.end, status: c.status, item: c.item || null, items: c.items || null, in_reference_list: c.in_reference_list, reference: c.reference ?? null, note: c.note || null })),
    references: refs.map(r => ({ index: r.index, number: r.number, text: r.text, first: r.first, year: r.year, doi: r.doi, status: r.library.status, item: r.library.item || null, items: r.library.items || null, cited_by: r.cited_by })),
    findings,
    matched_items: [...new Set([...cites.filter(c => c.status === "matched").map(c => c.item), ...refs.filter(r => r.library.status === "matched").map(r => r.library.item)])],
  };
}

export default { extractCitations, parseReferences, matchReference, matchCitationDirect, matchManuscript };
