// Paper cards: an extractive summary of a published paper, kept in the local Quartile Library.
// Every entry is a sentence copied from the paper, with its section and character offsets, so it can be checked
// against the source. Nothing is written in Quartile's own words and nothing is generated: the card selects, it
// does not paraphrase. Two emphases: "slr" (data, design, sample, search and screening) and "citing" (question,
// contribution, findings, limitations); "both" fills every field.
// The card holds text from someone else's paper: it stays in the user's local library and is never published.
import crypto from "node:crypto";
import { parseText } from "../text/parse.js";
import { findTheories } from "../theories.js";
import { hypothesisMap } from "../hypotheses.js";

export const CARD_SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, item_id TEXT, doi TEXT, title TEXT, purpose TEXT NOT NULL,
  card TEXT NOT NULL, source_sha256 TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_doi ON cards(doi);
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts4(card_id, title, question, design, findings, theory, data, notindexed=card_id, tokenize=unicode61 "remove_diacritics=1");
`;

const Q = /\b(research questions?|we (ask|examine|investigate|study|explore|analy[sz]e|test) (whether|how|why|what|the)|this (paper|study|article|review) (examines|investigates|asks|studies|explores|analy[sz]es|maps|tests)|the (aim|purpose|objective|goal) of (this|the) (paper|study|article|review))\b/i;
const CONTRIB = /\b(we contribute|our contribution|contributes? to|this (paper|study|article) (is the first|contributes|extends|adds)|unlike (prior|previous|existing) (work|studies|research)|to our knowledge|no (prior )?stud(y|ies) ha(s|ve))\b/i;
const SAMPLE = /\b(n\s*=\s*[\d,]+|[\d,]{2,}\s+(firms|companies|enterprises|SMEs|respondents|owners|managers|observations|firm-years|establishments|households|interviews|records|studies|articles|papers|countries))\b/i;
const PERIOD = /\b((19|20)\d{2})\s*(–|-|to|and)\s*((19|20)\d{2})\b/;
const UNIT = /\b(firm|company|enterprise|establishment|owner|manager|household|country|region|site|studio|bank|loan|article|study)[- ]level\b|\bunit of analysis\b/i;
const METHOD = /\b(regress\w*|OLS|logit|probit|panel|fixed effects?|instrumental|difference-in-differences|survival|hazard|Cox|Kaplan|structural equation|SEM|PLS|factor analysis|survey|questionnaire|interviews?|case stud(y|ies)|thematic|systematic (literature )?review|scoping review|meta-analysis|PRISMA|bibliometric|bounds|partial[- ]identification|simulation|Monte Carlo|conjoint|experiment|randomi[sz]ed|matching|propensity)\b/i;
const SEARCH = /\b(Scopus|Web of Science|WoS|EBSCO|ProQuest|Google Scholar|ScienceDirect|JSTOR|search string|search terms|databases? (were|was) searched|inclusion criteria|exclusion criteria|screen(ed|ing)|full[- ]text)\b/i;
const FINDING = /\b(we find|we show|we document|results? (show|indicate|suggest|reveal|confirm)|findings? (show|indicate|suggest|reveal)|(is|are|was|were) (positively|negatively|significantly|not significantly)? ?(associated|related|correlated)|significant(ly)?|increas\w+|decreas\w+|reduc\w+|rais\w+|higher|lower|more likely|less likely|supported|not supported)\b/i;
const LIMIT = /\b(limitations?|caveat|cannot (be )?(rule|identify|establish|generali)|should be (read|interpreted) with caution|future research)\b/i;
const FUND = /\b(fund(ed|ing)|grant|financial support|supported by)\b/i;
const COI = /\b(conflicts? of interest|competing interests?|declarations? of interest|no (known )?competing)\b/i;
const COUNTRIES = ["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "United Kingdom", "UK", "Norway", "Switzerland", "Turkey", "Türkiye", "Serbia", "Ukraine", "Russia", "United States", "USA", "Canada", "Mexico", "Brazil", "Chile", "China", "India", "Japan", "Korea", "Indonesia", "Vietnam", "Malaysia", "Australia", "New Zealand", "South Africa", "Nigeria", "Kenya", "Ghana", "Egypt", "Iran", "Pakistan", "Bangladesh", "Europe", "European Union", "EU"];
const COUNTRY_RX = new RegExp("\\b(" + COUNTRIES.map(c => c.replace(/ /g, "\\s+")).join("|") + ")\\b", "g");

const entry = s => ({ text: s.text, section: s.section, start: s.start, end: s.end });
const pick = (doc, keys, rx, n) => doc.sentencesIn(keys).filter(s => rx.test(s.text)).slice(0, n).map(entry);

/** Evidence label of a finding sentence (heuristic; confidence low): the owner's four labels. */
export function evidenceLabel(t) {
  if (/\bnot identified|cannot be identified|unidentified\b/i.test(t)) return "NOT IDENTIFIED";
  if (/\b(assum\w+|scenario|simulat\w+|calibrat\w+|if .{0,40} then|under the .{0,30} (model|assumption))\b/i.test(t)) return "CONDITIONAL MODEL RESULT";
  if (/\b(estimat\w+|coefficient|regression|model|bounds?|predict\w*|effect of|odds ratio|hazard ratio|elasticit\w+|associated with|correlated with|significant\w*|(not )?supported)\b/i.test(t) || /(\b[bβ]|\bbeta|\bOR|\bHR)\s*=|\bp\s*[<=>]\s*\.?\d/i.test(t)) return "DERIVED";
  return "FACT/OBSERVED";
}

/**
 * Build a card from a parsed document (core/text/parse.js) or from text.
 * purpose: "slr" | "citing" | "both" (default).
 */
export function buildCard(input, { purpose = "both" } = {}) {
  const doc = typeof input === "string" ? parseText(input) : input;
  const slr = purpose !== "citing", cite = purpose !== "slr";
  const head = doc.text.slice(0, 4000);
  const doi = ((head.match(/\b10\.\d{4,9}\/[^\s"<>]+/) || [])[0] || "").replace(/[.,;)]+$/, "") || null;
  const first = doc.paragraphs.find(p => p.text.trim());
  const title = first && first.text.split(/\s+/).length <= 30 && !/\.$/.test(first.text.trim()) ? first.text.replace(/^#+\s*/, "").trim() : null;
  const abstractS = doc.sentencesIn(["abstract", "opening"]);
  const countries = [...new Set([...doc.text.matchAll(COUNTRY_RX)].map(m => m[1].replace(/\s+/g, " ")))];
  const periods = [...new Set(doc.sentences.flatMap(s => { const m = s.text.match(PERIOD); return m ? [m[1] + "–" + m[4]] : []; }))].slice(0, 5);
  const card = {
    kind: "paper_card", purpose, title, doi,
    method_note: "Extractive: every entry is a sentence copied from the paper, with its section and character offsets. Quartile adds no words of its own. Evidence labels are a heuristic (low confidence) for you to confirm.",
    design: { detected: doc.design.primary, signals: doc.design.signals },
    abstract: abstractS.slice(0, 8).map(entry),
    question: pick(doc, ["abstract", "opening", "introduction"], Q, 3),
    contribution: cite ? pick(doc, ["abstract", "opening", "introduction", "conclusion"], CONTRIB, 4) : [],
    theory: [...new Set(findTheories(doc.text).map(t => t.name))].slice(0, 12),
    hypotheses: cite || slr ? safeHyp(doc) : [],
    data: {
      sample: pick(doc, ["abstract", "opening", "methods", "results"], SAMPLE, slr ? 6 : 3),
      countries, periods,
      unit_of_analysis: pick(doc, "all", UNIT, 2),
    },
    methods: pick(doc, ["methods", "abstract", "opening"], METHOD, slr ? 6 : 3),
    search_and_screening: slr && ["slr"].includes(doc.design.primary) || slr && doc.sentences.some(s => SEARCH.test(s.text)) ? pick(doc, ["methods", "abstract", "opening", "results"], SEARCH, 6) : [],
    findings: (cite ? pick(doc, ["results", "abstract", "opening", "discussion", "conclusion"], FINDING, 8) : pick(doc, ["results", "abstract", "opening"], FINDING, 4))
      .map(e => ({ ...e, evidence: evidenceLabel(e.text), evidence_confidence: "low" })),
    limitations: pick(doc, ["limitations", "discussion", "conclusion"], LIMIT, 4),
    declarations: { funding: pick(doc, "all", FUND, 2), conflicts: pick(doc, "all", COI, 2) },
    stats: { sentences: doc.sentences.length, sections: doc.sections.map(s => s.key) },
  };
  card.missing = Object.entries({ question: card.question, findings: card.findings, methods: card.methods, sample: card.data.sample, limitations: card.limitations })
    .filter(([, v]) => !v.length).map(([k]) => k);
  return card;
}
function safeHyp(doc) { try { return hypothesisMap(doc).slice(0, 12).map(h => ({ label: h.label, text: h.statement, section: h.section, verdict: h.result ? h.result.verdict || h.result.status || null : null })); } catch (e) { return []; } }

const sha = t => crypto.createHash("sha256").update(t).digest("hex");
const joinT = a => (a || []).map(x => x.text || x).join(" ");

/** Save a card in the library database, linked to a library item by id or DOI when one exists. */
export function saveCard(lib, card, sourceText, { item_id = null, id } = {}) {
  lib.h.ensure(CARD_SCHEMA);
  const item = item_id ? lib.get(item_id) : card.doi ? lib.byDoi(card.doi) : null;
  const cid = id || "card_" + sha(sourceText + card.purpose).slice(0, 16);
  const row = [cid, item ? item.id : null, card.doi, card.title || (item && item.csl.title) || null, card.purpose, JSON.stringify(card), sha(sourceText), new Date().toISOString()];
  lib.h.tx(r => {
    r.run("DELETE FROM cards_fts WHERE card_id = ?", [cid]);
    r.run("INSERT OR REPLACE INTO cards (id, item_id, doi, title, purpose, card, source_sha256, created_at) VALUES (?,?,?,?,?,?,?,?)", row);
    r.run("INSERT INTO cards_fts (card_id, title, question, design, findings, theory, data) VALUES (?,?,?,?,?,?,?)",
      [cid, row[3] || "", joinT(card.question) + " " + joinT(card.contribution), card.design.detected + " " + joinT(card.methods) + " " + joinT(card.search_and_screening), joinT(card.findings), card.theory.join("; "), joinT(card.data.sample) + " " + card.data.countries.join(" ") + " " + card.data.periods.join(" ")]);
  });
  return { id: cid, item_id: row[1], linked: !!item };
}

export function getCard(lib, id) { lib.h.ensure(CARD_SCHEMA); const r = lib.h.get("SELECT * FROM cards WHERE id = ?", [id]); return r ? { ...r, card: JSON.parse(r.card) } : null; }

/** Full-text search over cards (FTS4); `field` limits the search to one part (question, design, findings, theory, data, title). */
export function searchCards(lib, { query, field, design, limit = 25 } = {}) {
  lib.h.ensure(CARD_SCHEMA);
  const q = String(query || "").trim();
  const col = ["title", "question", "design", "findings", "theory", "data"].includes(field) ? field : "cards_fts";
  let rows = q ? lib.h.all(`SELECT card_id FROM cards_fts WHERE ${col} MATCH ? LIMIT ?`, [q.replace(/["']/g, " "), limit * 4]).map(r => r.card_id) : lib.h.all("SELECT id AS card_id FROM cards ORDER BY created_at DESC LIMIT ?", [limit * 4]).map(r => r.card_id);
  let cards = rows.map(id => getCard(lib, id)).filter(Boolean);
  if (design) cards = cards.filter(c => c.card.design.detected === design);
  return cards.slice(0, limit).map(c => ({ id: c.id, item_id: c.item_id, doi: c.doi, title: c.title, purpose: c.purpose, design: c.card.design.detected,
    countries: c.card.data.countries, periods: c.card.data.periods, question: c.card.question[0]?.text || null, finding: c.card.findings[0]?.text || null }));
}

/** All cards as table rows (one row per paper) for an SLR extraction table. */
export function cardRows(lib, { ids } = {}) {
  lib.h.ensure(CARD_SCHEMA);
  const rows = (ids && ids.length ? ids.map(id => lib.h.get("SELECT * FROM cards WHERE id = ?", [id])).filter(Boolean) : lib.h.all("SELECT * FROM cards ORDER BY title"));
  return rows.map(r => { const c = JSON.parse(r.card); return {
    card_id: r.id, title: r.title || "", doi: r.doi || "", design: c.design.detected, countries: c.data.countries.join("; "), periods: c.data.periods.join("; "),
    sample: joinT(c.data.sample), methods: joinT(c.methods), search_and_screening: joinT(c.search_and_screening), theory: c.theory.join("; "),
    question: joinT(c.question), contribution: joinT(c.contribution),
    findings: c.findings.map(f => `[${f.evidence}] ${f.text}`).join(" | "), limitations: joinT(c.limitations),
    funding: joinT(c.declarations.funding), conflicts: joinT(c.declarations.conflicts), missing: (c.missing || []).join("; "), source_sha256: r.source_sha256 }; });
}

export default { buildCard, saveCard, getCard, searchCards, cardRows, evidenceLabel, CARD_SCHEMA };
