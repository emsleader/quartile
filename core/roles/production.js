// Role 5: production editor (specification Section 9). Checks PRD-01 to PRD-07.
// run(doc, opts) returns findings: { rule, role, title, severity, confidence, source, source_ref, message, fix,
// span, detail }. Options (all optional):
//   glossary | glossary_path   term groups for PRD-06 (object, array or a .yaml/.json file)
//   citation_policy            { min_q1q2_share, q1q2_only, flag_conference (default true) } for PRD-05
//   reference_year             year used for recency (default: this year); recency_min_share (default 0.20)
//   author | authors           the author's surname(s) for the self-citation share; self_citation_max_share (0.25)
//   bibliography               BibTeX or RIS text, parsed locally with citation-js, added to the reference list
// No network calls: DOI resolution and retraction checks stay in the existing verify_references_live tool.
import fs from "node:fs";
import YAML from "yaml";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-ris";
import L from "../lib.js";

export const ROLE = "production";
const SOURCE = "QUARTILE_PRODUCTION";
const ALL = ["regression", "bounds", "sem", "experiment", "slr", "qualitative", "survey", "conceptual", "simulation", "unknown"];
export const APPLIES = { "PRD-01": ALL, "PRD-02": ALL, "PRD-03": ALL, "PRD-04": ALL, "PRD-05": ALL, "PRD-06": ALL, "PRD-07": ALL };
const NOT_BODY = new Set(["references", "abstract", "opening"]);
const spanOf = s => s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null;
const paraSpan = p => p ? { section: p.section, start: p.start, end: p.end, text: p.text } : null;
const f = (rule, title, severity, confidence, source_ref, message, fix, span = null, detail = null) =>
  ({ rule, role: ROLE, title, severity, confidence, source: SOURCE, source_ref, message, fix, span, detail });
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const decimals = raw => { const m = String(raw).replace(/%$/, "").match(/\.(\d+)$/); return m ? m[1].length : 0; };
const CITE_PAREN = /\([^()]*(?:19|20)\d{2}[a-z]?[^()]*\)/g;

// ---- PRD-01 number consistency ----
const COUNT_UNITS = /^(firms?|compan(?:y|ies)|respondents?|observations?|owners?|participants?|employees?|establishments?|firm-years?|SMEs|households?|individuals?|studios?|cases?)$/i;
const unitKey = u => u.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

function counts(text) {
  const out = [];
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d{2,})\s+([A-Za-z-]+)/g)) if (COUNT_UNITS.test(m[2]) && !/^(19|20)\d{2}$/.test(m[1])) out.push({ n: Number(m[1].replace(/,/g, "")), unit: unitKey(m[2]), at: m.index });
  for (const m of text.matchAll(/\b[Nn]\s*=\s*(\d{1,3}(?:,\d{3})+|\d+)/g)) out.push({ n: Number(m[1].replace(/,/g, "")), unit: "n", at: m.index });
  return out;
}

export function numberConsistency(doc) {
  const summary = doc.sentencesIn(["abstract", "conclusion"]);
  if (!summary.length) return [];
  const bodySecs = ["results", "methods", "discussion", "literature", "implications", "limitations", "other"];
  const bodyNums = doc.numbers.filter(n => bodySecs.includes(n.section)).map(n => n.value);
  const tableParas = doc.paragraphs.filter(p => p.isTable || /^(Notes?|Source)\b/i.test(p.text));
  for (const t of doc.tables) for (const r of t.numbers) for (const v of r) if (v != null) bodyNums.push(v);
  for (const p of tableParas) for (const m of p.text.matchAll(/[-−]?\d*\.?\d+/g)) bodyNums.push(Number(m[0].replace("−", "-")));
  const bodyCounts = [...doc.sentencesIn(bodySecs).flatMap(s => counts(s.text)), ...tableParas.flatMap(p => counts(p.text))];
  for (const t of doc.tables) for (const r of t.rows) if (/^(n|N|observations|obs\.?|firms|number of (firms|observations))$/i.test(r[0] || "")) for (const c of r.slice(1)) { const v = Number(String(c).replace(/,/g, "")); if (Number.isFinite(v)) bodyCounts.push({ n: v, unit: "n" }), bodyCounts.push({ n: v, unit: "*" }); }
  const out = [];
  for (const s of summary) {
    const masked = s.text.replace(CITE_PAREN, m => " ".repeat(m.length));
    // decimals and percentages
    for (const m of masked.matchAll(/(?<![\w.])[-−]?(?:\d+\.\d+|\d+(?:\.\d+)?%|\.\d+)/g)) {
      const raw = m[0], before = masked.slice(Math.max(0, m.index - 25), m.index);
      if (/\bp\s*[<>=≤≥]\s*$|\b(level|significan\w*)( at)?( the)?\s*$|[<>≤≥]\s*$/i.test(before)) continue;
      const pct = raw.endsWith("%"), v = Number(raw.replace(/[%]/g, "").replace("−", "-")), dec = decimals(raw), tol = 0.5 * 10 ** -dec + 1e-9;
      const cands = pct ? [v, v / 100] : [v, v * 100];
      const ok = bodyNums.some(b => cands.some((c, k) => Math.abs(b - c) <= (k === 0 ? tol : pct ? tol / 100 : tol * 100)));
      if (!ok) out.push(f("PRD-01", "Number consistency", "minor", "medium", "Specification Section 9 (PRD-01); extends number_registry",
        `The ${s.section} reports ${raw}, but this value was not found in the results, methods, discussion or tables.`, "Make the number the same everywhere, or report it in the results or a table as well.", spanOf(s), { value: raw, section: s.section }));
    }
    // sample sizes
    for (const c of counts(masked)) {
      const same = bodyCounts.filter(b => b.unit === c.unit || b.unit === "*" || (c.unit === "n" && b.unit !== "*"));
      const sameUnit = bodyCounts.filter(b => b.unit === c.unit);
      if (!sameUnit.length) continue; // nothing to compare with
      if (!same.some(b => b.n === c.n)) out.push(f("PRD-01", "Number consistency", "minor", "medium", "Specification Section 9 (PRD-01)",
        `The ${s.section} gives ${c.n.toLocaleString("en-US")} ${c.unit === "n" ? "(n)" : c.unit + "(s)"}, but the body reports ${[...new Set(sameUnit.map(b => b.n))].slice(0, 4).join(", ")}.`, "Use the same sample size in the abstract, body, tables and conclusion, or explain the difference (for example a sample flow).", spanOf(s), { value: c.n, unit: c.unit, body: [...new Set(sameUnit.map(b => b.n))] }));
    }
  }
  return dedupeBy(out, x => x.span?.start + "|" + x.detail.value);
}
function dedupeBy(a, key) { const seen = new Set(); return a.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); }

// ---- PRD-02 tables and figures ----
const CAP = /^(?:#+\s*)?(Table|Figure|Fig\.)\s+([A-Z]?\d+[a-z]?)(?:\s*([.:—–|-])\s*|\s+|$)(.*)$/;
const MENTION = /\b(Tables?|Figures?|Figs?\.)\s+([A-Z]?\d+[a-z]?(?:\s*(?:–|-|to|and|,|&)\s*[A-Z]?\d+[a-z]?)*)/gi;
const kindOf = k => /^t/i.test(k) ? "table" : "figure";

export function captions(doc) {
  const out = [];
  doc.paragraphs.forEach((p, i) => {
    if (p.isRef || p.isTable || p.text.length > 250) return;
    const m = p.text.match(CAP); if (!m) return;
    if (!m[3] && !p.isHeading) return; // "Table 1 reports ..." is a sentence, not a caption
    if (!m[3] && /^\s*(reports?|shows?|presents?|gives|lists?|summari[sz]es|displays?|illustrates?|compares?|contains?)\b/i.test(m[4])) return;
    out.push({ kind: kindOf(m[1]), label: m[2], title: (m[4] || "").trim(), para: p, index: i });
  });
  return out;
}
function mentions(doc, capParas) {
  const out = [];
  for (const s of doc.sentences) {
    if (capParas.has(s.paragraph) || s.section === "references") continue;
    for (const m of s.text.matchAll(MENTION)) {
      const kind = kindOf(m[1]), labels = [];
      const parts = m[2].split(/\s*(?:and|,|&)\s*/);
      for (const part of parts) {
        const r = part.match(/^([A-Z]?)(\d+)\s*(?:–|-|to)\s*[A-Z]?(\d+)$/);
        if (r) for (let k = +r[2]; k <= +r[3] && k - +r[2] < 30; k++) labels.push(r[1] + k); else if (part) labels.push(part.trim());
      }
      for (const l of labels) out.push({ kind, label: l, sentence: s });
    }
  }
  return out;
}

export function tablesFigures(doc) {
  const caps = captions(doc), capParas = new Set(caps.map(c => c.para.id)), ments = mentions(doc, capParas);
  const out = [], REF = "Specification Section 9 (PRD-02); APA Publication Manual (7th ed., 2020), ch. 7, tables and figures";
  for (const kind of ["table", "figure"]) {
    const K = kind === "table" ? "Table" : "Figure";
    const cs = caps.filter(c => c.kind === kind), ms = ments.filter(m => m.kind === kind);
    const seen = new Set();
    for (const c of cs) {
      if (seen.has(c.label)) out.push(f("PRD-02", "Tables and figures", "minor", "medium", REF, `${K} ${c.label} has two captions.`, "Give each table and figure its own number.", paraSpan(c.para), { kind, label: c.label, issue: "duplicate" }));
      seen.add(c.label);
      if (!ms.some(m => m.label === c.label)) out.push(f("PRD-02", "Tables and figures", "minor", "medium", REF, `${K} ${c.label} is never cited in the text.`, `Refer to ${K} ${c.label} in the text before it appears.`, paraSpan(c.para), { kind, label: c.label, issue: "not cited" }));
      if (!c.title) out.push(f("PRD-02", "Tables and figures", "minor", "medium", REF, `${K} ${c.label} has no title.`, `Add a short descriptive title after "${K} ${c.label}".`, paraSpan(c.para), { kind, label: c.label, issue: "no title" }));
      if (kind === "table") {
        const after = doc.paragraphs.slice(c.index + 1, c.index + 5);
        const hasTable = after.some(p => p.isTable);
        if (hasTable) {
          const tIdx = after.findIndex(p => p.isTable);
          const near = after.slice(tIdx + 1, tIdx + 3).filter(p => !CAP.test(p.text));
          const note = near.find(p => /^(Notes?|Sources?)\b\s*[:.]/i.test(p.text));
          if (!note) out.push(f("PRD-02", "Tables and figures", "minor", "low", REF, `Table ${c.label} has no note (source, n, period).`, "Add a note under the table giving the data source, the number of observations and the period.", paraSpan(c.para), { kind, label: c.label, issue: "no note" }));
        }
      }
    }
    if (cs.length) {
      for (const l of [...new Set(ms.map(m => m.label))]) if (!cs.some(c => c.label === l)) {
        const m = ms.find(x => x.label === l);
        out.push(f("PRD-02", "Tables and figures", "minor", "low", REF, `${K} ${l} is cited in the text but has no caption.`, `Add ${K} ${l} with its caption, or correct the number.`, spanOf(m.sentence), { kind, label: l, issue: "missing" }));
      }
      const main = cs.filter(c => /^\d+$/.test(c.label)).map(c => +c.label);
      const bad = main.findIndex((n, i) => n !== i + 1);
      if (bad >= 0 && new Set(main).size === main.length) out.push(f("PRD-02", "Tables and figures", "minor", "medium", REF, `${K}s are not numbered 1, 2, 3 ... in order of appearance (found ${main.join(", ")}).`, `Number ${kind}s in the order they appear.`, paraSpan(cs.filter(c => /^\d+$/.test(c.label))[bad].para), { kind, issue: "order", sequence: main }));
      const firsts = []; for (const m of ms) if (/^\d+$/.test(m.label) && !firsts.some(x => x.label === m.label)) firsts.push(m);
      const nums = firsts.map(m => +m.label);
      const k = nums.findIndex((n, i) => i > 0 && n < Math.max(...nums.slice(0, i)));
      if (k > 0 && bad < 0) out.push(f("PRD-02", "Tables and figures", "minor", "low", REF, `${K} ${nums[k]} is first cited after ${K} ${Math.max(...nums.slice(0, k))}.`, `Cite ${kind}s in numerical order, or renumber them.`, spanOf(firsts[k].sentence), { kind, issue: "citation order", first_mentions: nums }));
    }
  }
  return out;
}

// ---- PRD-03 abbreviations ----
export const COMMON_ABBR = new Set(["US", "USA", "UK", "EU", "UN", "GDP", "CEO", "CEOs", "CFO", "CFOs", "USD", "EUR", "HUF", "GBP", "ID", "IDs", "PDF", "URL", "DOI", "ISBN", "ISSN", "ORCID", "JEL", "APA", "SPSS", "STATA", "SAS", "AMOS", "OK", "AI", "IT", "COVID", "SD", "SE", "SEs", "CI", "CIs", "OR", "ORs", "DC", "PhD", "MBA", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "AD", "BC", "TV", "NA", "HTML", "XML", "CSV", "TODO", "TBD", "PRISMA", "STROBE", "CONSORT", "COREQ", "CHERRIES", "SRQR", "CRediT", "JSTOR", "SSRN", "NBER", "OECD", "IMF", "WHO"]);
const ACR = /(?<![\p{L}\d-])(\d?[A-Z][A-Z0-9&]*[A-Z0-9]s?(?:-[A-Z][A-Z0-9]*[A-Z0-9]s?)*)(?![\p{L}\d-])/gu;
const isAcr = a => (a.match(/[A-Z]/g) || []).length >= 2 && !/^[IVXLC]+$/.test(a) && a.length <= 12;
const base = a => (/[A-Z]s$/.test(a) && a.length > 2 ? a.slice(0, -1) : a);
const esc = s => s.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&");
function defines(text, a) {
  const forms = [...new Set([a, base(a), base(a) + "s"])].map(esc).join("|");
  return new RegExp(`[\\p{L}\\)]\\s*\\(\\s*(?:hereafter,?\\s*|hereinafter,?\\s*|henceforth,?\\s*)?(?:${forms})\\s*[;,)]`, "u").test(text)
    || new RegExp(`(?<![\\p{L}\\d])(?:${forms})\\s*\\(\\s*[A-Za-z][a-z]+[^()]*\\)`, "u").test(text) && !new RegExp(`(?:${forms})\\s*\\([^()]*(?:19|20)\\d{2}`, "u").test(text)
    || new RegExp(`(?<![\\p{L}\\d])(?:${forms})\\s*(?:=|:|refers to|stands for|denotes)\\s*[a-z]`, "u").test(text);
}
function acronymUses(sentences) {
  const uses = new Map();
  for (const s of sentences) {
    const masked = s.text.replace(CITE_PAREN, m => " ".repeat(m.length));
    for (const m of masked.matchAll(ACR)) {
      const a = m[1]; if (!isAcr(a) || COMMON_ABBR.has(a) || COMMON_ABBR.has(base(a))) continue;
      const k = base(a); if (!uses.has(k)) uses.set(k, { form: a, first: s, defAt: null });
      const u = uses.get(k); if (u.defAt == null && defines(s.text, a)) u.defAt = s;
    }
  }
  return uses;
}
export function abbreviations(doc) {
  const out = [], REF = "Specification Section 9 (PRD-03); APA Publication Manual (7th ed., 2020), ch. 6, abbreviations";
  const noteParas = doc.paragraphs.filter(p => /^(Notes?|Sources?)\b\s*[:.]/i.test(p.text));
  const noteIds = new Set(noteParas.map(p => p.id)), notes = noteParas.map(p => p.text).join(" ");
  const body = doc.sentences.filter(s => !NOT_BODY.has(s.section) && !noteIds.has(s.paragraph));
  for (const [k, u] of acronymUses(body)) {
    if (u.defAt === u.first) continue;
    if (u.defAt) out.push(f("PRD-03", "Abbreviations defined at first use", "minor", "medium", REF, `${u.form} is used before it is defined.`, `Define ${u.form} at its first use in the body and use the short form after that.`, spanOf(u.first), { abbreviation: u.form, where: "body", issue: "defined late" }));
    else if (!defines(notes, u.form)) out.push(f("PRD-03", "Abbreviations defined at first use", "minor", "medium", REF, `${u.form} is never defined.`, `Write the full term followed by (${u.form}) at its first use.`, spanOf(u.first), { abbreviation: u.form, where: "body", issue: "not defined" }));
  }
  const abs = doc.sentencesIn("abstract");
  for (const [, u] of acronymUses(abs)) if (u.defAt !== u.first) out.push(f("PRD-03", "Abbreviations defined at first use", "minor", "medium", REF,
    `${u.form} is not defined in the abstract. The abstract is read on its own, so abbreviations are defined there separately.`, `Define ${u.form} in the abstract, or write the term in full there.`, spanOf(u.first), { abbreviation: u.form, where: "abstract" }));
  return out;
}

// ---- PRD-04 reference integrity ----
const PART = /^(?:(?:e\.g\.|i\.e\.|cf\.|see also|see|for example|for a review,? see|reviewed in)\s*,?\s*)?((?:(?:van|von|de|der|den|da|di|le|la|du|dos|del)\s+)*[A-Z][\p{L}'’-]+)((?:(?:,\s*|\s+)(?:&\s*|and\s+)?(?:(?:van|von|de|der)\s+)?[A-Z][\p{L}'’-]+|\s+et al\.)*),?\s+((?:19|20)\d{2}[a-z]?(?:\s*,\s*(?:19|20)\d{2}[a-z]?)*)(?:\s*,\s*(?:pp?\.|chap\.|ch\.)\s*[\d–-]+)?\s*$/u;
const NARR = /(?<![\p{L}])((?:(?:van|von|de|der|den)\s+)?[A-Z][\p{L}'’-]+)((?:,\s*[A-Z][\p{L}'’-]+)*,?\s+(?:and|&)\s+(?:(?:van|von|de)\s+)?[A-Z][\p{L}'’-]+|\s+et al\.)?(?:['’]s?)?\s+\(((?:19|20)\d{2}[a-z]?(?:\s*,\s*(?:19|20)\d{2}[a-z]?)*)(?:,\s*pp?\.\s*[\d–-]+)?\)/gu;
const NOT_NAME = new Set(["Table", "Tables", "Figure", "Figures", "Section", "Model", "Models", "Wave", "Appendix", "Panel", "Column", "In", "The", "Since", "From", "Until", "By", "During", "After", "Before", "Between", "Fig"]);
const surnameKey = s => fold(String(s).replace(/^(?:(?:van|von|de|der|den|da|di|le|la|du|dos|del)\s+)+/i, ""));

export function inTextCitations(doc) {
  const out = [];
  for (const s of doc.sentences) {
    if (NOT_BODY.has(s.section) && s.section !== "abstract") continue;
    if (s.section === "references") continue;
    for (const m of s.text.matchAll(/\(([^()]*(?:19|20)\d{2}[a-z]?[^()]*)\)/g)) {
      for (const part of m[1].split(/\s*;\s*/)) {
        const p = part.trim().match(PART); if (!p || NOT_NAME.has(p[1])) continue;
        for (const y of p[3].split(/\s*,\s*/)) out.push({ surname: p[1], key: surnameKey(p[1]), year: y, sentence: s, raw: part.trim() });
      }
    }
    for (const m of s.text.matchAll(NARR)) {
      if (NOT_NAME.has(m[1])) continue;
      for (const y of m[3].split(/\s*,\s*/)) out.push({ surname: m[1], key: surnameKey(m[1]), year: y, sentence: s, raw: m[0] });
    }
  }
  return out;
}
export function referenceEntries(doc, bibliography) {
  const refs = doc.citations.references.map(r => {
    const p = L.Core.parseRef(r.text), para = doc.paragraphs.find(x => x.id === r.id);
    return { text: r.text, surname: p.surname, key: surnameKey(p.surname), year: p.year, num: p.num, doi: p.doi || null, para };
  });
  if (bibliography) for (const it of parseBibliography(bibliography)) refs.push(it);
  return refs;
}
export function parseBibliography(text) {
  const t = String(text || "").trim(); if (!t) return [];
  const type = /^\s*@\w+\s*\{/.test(t) ? "@bibtex/text" : /^TY\s+-/m.test(t) ? "@ris/file" : null;
  if (!type) return []; // DOIs or other inputs are not resolved here (no network)
  try {
    return new Cite(t, { forceType: type }).data.map(d => {
      const fam = d.author?.[0]?.family || d.author?.[0]?.literal || "";
      return { text: d.title || "", surname: fam, key: surnameKey(fam), year: String(d.issued?.["date-parts"]?.[0]?.[0] || ""), doi: d.DOI || null, para: null, from: "bibliography" };
    });
  } catch (e) { return []; }
}

export function referenceIntegrity(doc, opts = {}) {
  const refs = referenceEntries(doc, opts.bibliography), cites = inTextCitations(doc), out = [];
  const REF = "Specification Section 9 (PRD-04); APA Publication Manual (7th ed., 2020), ch. 8";
  if (!refs.length) return cites.length ? [f("PRD-04", "Reference integrity", "note", "low", REF, "In-text citations were found but no reference list was detected.", "Add a reference list under a 'References' heading (DOI and retraction checks: verify_references_live).")] : [];
  // numbered style
  const numbered = refs.filter(r => r.num).length >= Math.max(2, refs.length * 0.6);
  if (numbered) {
    const cited = new Set();
    for (const s of doc.sentences) for (const m of s.text.matchAll(/\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g)) for (const part of m[1].split(/\s*,\s*/)) { const r = part.split(/\s*[–-]\s*/).map(Number); for (let k = r[0]; k <= (r[1] || r[0]) && k - r[0] < 50; k++) cited.add(k); }
    for (const r of refs) if (r.num && !cited.has(+r.num)) out.push(f("PRD-04", "Reference integrity", "minor", "medium", REF, `Reference [${r.num}] is listed but never cited.`, "Cite it in the text or remove it from the list.", paraSpan(r.para), { reference: r.text.slice(0, 120) }));
    const max = Math.max(...refs.map(r => +r.num || 0));
    for (const k of cited) if (k > max) out.push(f("PRD-04", "Reference integrity", "minor", "medium", REF, `Citation [${k}] has no entry in the reference list.`, "Add the reference or correct the number.", null, { number: k }));
    return out;
  }
  const keyOf = (k, y) => k + "|" + String(y).toLowerCase();
  const refKeys = new Set(refs.map(r => keyOf(r.key, r.year))), refNoSuffix = new Set(refs.map(r => keyOf(r.key, String(r.year).replace(/[a-z]$/, ""))));
  const seen = new Set();
  for (const c of cites) {
    const k = keyOf(c.key, c.year); if (seen.has(k)) continue; seen.add(k);
    if (refKeys.has(k) || refNoSuffix.has(keyOf(c.key, c.year.replace(/[a-z]$/, "")))) continue;
    const other = refs.filter(r => r.key === c.key).map(r => r.year);
    out.push(f("PRD-04", "Reference integrity", "minor", "medium", REF,
      other.length ? `${c.surname} (${c.year}) is cited, but the reference list has ${c.surname} with ${other.join(", ")}.` : `${c.surname} (${c.year}) is cited but not in the reference list.`,
      other.length ? "Correct the year in the text or in the list." : "Add the reference to the list or remove the citation.", spanOf(c.sentence), { cited: c.raw, issue: other.length ? "year mismatch" : "missing from list" }));
  }
  const citedKeys = new Set(cites.map(c => keyOf(c.key, c.year))), citedNoSuffix = new Set(cites.map(c => keyOf(c.key, c.year.replace(/[a-z]$/, ""))));
  for (const r of refs) {
    if (!r.key || !r.year || r.from) continue;
    if (citedKeys.has(keyOf(r.key, r.year)) || citedNoSuffix.has(keyOf(r.key, String(r.year).replace(/[a-z]$/, "")))) continue;
    if (cites.some(c => c.key === r.key && c.year !== r.year && !refKeys.has(keyOf(c.key, c.year)))) continue; // already reported as a year mismatch
    out.push(f("PRD-04", "Reference integrity", "minor", "medium", REF, `${r.surname} (${r.year}) is in the reference list but never cited.`, "Cite it in the text or remove it from the list.", paraSpan(r.para), { reference: r.text.slice(0, 120), issue: "not cited" }));
  }
  return out;
}

// ---- PRD-05 citation policy ----
const jnorm = t => (t || "").toLowerCase().replace(/&amp;/g, "and").replace(/&/g, "and").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
const CONF = /\b(proceedings|conference|symposium|workshop|annual meeting|congress)\b/i;
const WORK = /\b(working papers?|discussion papers?|NBER|SSRN|mimeo|unpublished|preprint|arXiv|RePEc|technical report|CEPR|policy research working)\b/i;
export function journalOf(refText) {
  const after = refText.replace(/^.*?\((?:19|20)\d{2}[a-z]?\)\.?\s*/, "");
  for (const seg of after.split(/(?<=[.?!])\s+/).slice(1)) { const m = seg.match(/^([^,]{3,120}?),\s*\d+\s*(\(|,|$)/); if (m) return m[1].trim(); }
  return null;
}
export function classifyReference(text) {
  if (CONF.test(text)) return { type: "conference" };
  if (WORK.test(text)) return { type: "working paper" };
  const j = journalOf(text); if (!j) return { type: "other" };
  L.loadBank && !classifyReference._bank && (L.loadBank(), classifyReference._bank = true);
  const hit = L.journalLookup(j).find(x => jnorm(x.title) === jnorm(j));
  return { type: "journal", journal: j, quartile: hit ? hit.quartile : null };
}
export function citationPolicy(doc, opts = {}) {
  const pol = opts.citation_policy || {}, refs = doc.citations.references;
  if (!refs.length) return [];
  const rows = refs.map(r => ({ id: r.id, text: r.text, ...classifyReference(r.text) }));
  const q12 = rows.filter(r => r.type === "journal" && ["Q1", "Q2"].includes(r.quartile));
  const detail = { references: rows.length, q1q2: q12.length, q1q2_share: +(q12.length / rows.length).toFixed(3), conference: rows.filter(r => r.type === "conference").length, working_papers: rows.filter(r => r.type === "working paper").length, journal_not_in_bank: rows.filter(r => r.type === "journal" && !r.quartile).length, other: rows.filter(r => r.type === "other").length };
  const out = [], REF = "Specification Section 9 (PRD-05) and Section 20.6 (owner's citation policy); journal bank from SCImago 2024";
  const grey = rows.filter(r => r.type === "conference" || r.type === "working paper");
  if (grey.length && pol.flag_conference !== false) out.push(f("PRD-05", "Citation policy", "note", "low", REF,
    `${grey.length} reference(s) are conference papers or working papers: ${grey.map(r => r.text.slice(0, 50)).join(" | ")}.`, "Check whether a published journal version exists and cite that instead, if your policy or the journal asks for it.", paraSpan(doc.paragraphs.find(p => p.id === grey[0].id)), { ...detail, items: grey.map(r => ({ type: r.type, reference: r.text.slice(0, 120) })) }));
  if (typeof pol.min_q1q2_share === "number" && detail.q1q2_share < pol.min_q1q2_share) out.push(f("PRD-05", "Citation policy", "minor", "high", REF,
    `Q1/Q2 journal share is ${(detail.q1q2_share * 100).toFixed(0)}% (${q12.length} of ${rows.length}); your policy asks for at least ${(pol.min_q1q2_share * 100).toFixed(0)}%.`, "Replace weaker sources with Q1/Q2 journal articles where they exist.", null, detail));
  if (pol.q1q2_only) {
    const bad = rows.filter(r => r.type === "journal" && r.quartile && !["Q1", "Q2"].includes(r.quartile));
    if (bad.length) out.push(f("PRD-05", "Citation policy", "minor", "high", REF, `${bad.length} journal reference(s) are below Q2: ${bad.map(r => `${r.journal} (${r.quartile})`).join("; ")}.`, "Your policy allows Q1/Q2 journals only; replace or justify these.", null, { ...detail, items: bad.map(r => ({ journal: r.journal, quartile: r.quartile })) }));
  }
  return out;
}

// ---- PRD-06 terminology drift ----
export function loadGlossary(input) {
  if (!input) return [];
  let g = input;
  if (typeof input === "string") { const raw = fs.readFileSync(input, "utf8"); g = /\.json$/i.test(input) ? JSON.parse(raw) : YAML.parse(raw); }
  const groups = Array.isArray(g) ? g : g.groups || g.terms || [];
  return groups.map(x => Array.isArray(x) ? { preferred: null, terms: x } : { preferred: x.preferred || null, terms: [...(x.preferred ? [x.preferred] : []), ...(x.variants || x.synonyms || x.terms || [])] })
    .map(x => ({ ...x, terms: [...new Set(x.terms.map(String).filter(Boolean))] })).filter(x => x.terms.length > 1);
}
const termRx = t => new RegExp(`(?<![\\p{L}\\d])${esc(t).replace(/\\-|-|\s+/g, "[\\s-]+")}(?![\\p{L}\\d])`, "giu");
export function terminologyDrift(doc, groups) {
  const out = [], sents = doc.sentences.filter(s => s.section !== "references");
  for (const g of groups) {
    const terms = [...g.terms].sort((a, b) => b.length - a.length), used = new Map(terms.map(t => [t, { n: 0, first: null }]));
    for (const s of sents) {
      let text = s.text;
      for (const t of terms) for (const m of text.matchAll(termRx(t))) { const u = used.get(t); u.n++; u.first ||= s; text = text.slice(0, m.index) + " ".repeat(m[0].length) + text.slice(m.index + m[0].length); }
    }
    const hit = g.terms.filter(t => used.get(t).n > 0);
    if (hit.length < 2) continue;
    const pick = g.preferred || hit.reduce((a, b) => (used.get(b).n > used.get(a).n ? b : a));
    const odd = hit.filter(t => t !== pick).sort((a, b) => used.get(a).first.start - used.get(b).first.start)[0];
    out.push(f("PRD-06", "One term per concept", "minor", "high", "Specification Section 9 (PRD-06); terms from the author's glossary",
      `Several terms for one concept: ${hit.map(t => `${t} (${used.get(t).n})`).join(", ")}.`, `Choose one term${g.preferred ? ` ("${g.preferred}", your glossary's preferred term)` : ""} and use it everywhere.`, spanOf(used.get(odd).first), { group: g.terms, counts: Object.fromEntries(hit.map(t => [t, used.get(t).n])), preferred: g.preferred }));
  }
  return out;
}

// ---- PRD-07 recency and self-citation ----
export function recencySelf(doc, opts = {}) {
  const refs = doc.citations.references.map(r => ({ ...r, year: Number((r.text.match(/\(((?:19|20)\d{2})[a-z]?\)/) || r.text.match(/\b((?:19|20)\d{2})\b/) || [])[1]) || null }));
  const dated = refs.filter(r => r.year), out = [];
  if (!dated.length) return [];
  const Y = Number(opts.reference_year) || new Date().getFullYear(), minShare = opts.recency_min_share ?? 0.2, maxSelf = opts.self_citation_max_share ?? 0.25;
  const recent = dated.filter(r => r.year >= Y - 4 && r.year <= Y).length, share = recent / dated.length;
  const REF = "Specification Section 9 (PRD-07); thresholds are Quartile defaults, set them for your journal";
  if (dated.length >= 10 && share < minShare) out.push(f("PRD-07", "Reference recency and self-citation", "note", "low", REF,
    `Only ${recent} of ${dated.length} dated references (${(share * 100).toFixed(0)}%) are from the last five years (${Y - 4}-${Y}).`, "Check that the recent literature is covered; reviewers often ask for work from the last five years.", null, { recent, dated: dated.length, share: +share.toFixed(3), window: [Y - 4, Y] }));
  const names = [].concat(opts.authors || opts.author || []).map(n => String(n).split(",")[0].trim().split(/\s+/).pop()).filter(Boolean);
  if (names.length) {
    const own = refs.filter(r => { const authorsPart = r.text.split(/\((?:19|20)\d{2}|n\.d\./)[0]; return names.some(n => new RegExp(`(?<![\\p{L}])${esc(fold(n))}(?![\\p{L}])`, "u").test(fold(authorsPart))); });
    const s = own.length / refs.length;
    const detail = { self: own.length, references: refs.length, share: +s.toFixed(3), authors: names };
    if (s > maxSelf) out.push(f("PRD-07", "Reference recency and self-citation", "note", "low", REF,
      `Self-citation share is ${(s * 100).toFixed(0)}% (${own.length} of ${refs.length} references).`, "Keep self-citations to those the argument needs; editors look at this share.", null, detail));
  }
  return out;
}

const CHECKS = { "PRD-01": d => numberConsistency(d), "PRD-02": d => tablesFigures(d), "PRD-03": d => abbreviations(d), "PRD-04": (d, o) => referenceIntegrity(d, o),
  "PRD-05": (d, o) => citationPolicy(d, o), "PRD-06": (d, o) => terminologyDrift(d, loadGlossary(o.glossary || o.glossary_path)), "PRD-07": (d, o) => recencySelf(d, o) };

export async function run(doc, opts = {}) {
  const design = doc.design?.primary || "unknown", out = [];
  for (const [id, fn] of Object.entries(CHECKS)) {
    if (!APPLIES[id].includes(design)) continue;
    if (opts.only_rules && !opts.only_rules.includes(id)) continue;
    out.push(...fn(doc, opts));
  }
  return out;
}
export default { ROLE, run, APPLIES };
