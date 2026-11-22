// Shared detectors for the ethics and data office (specification Section 10).
// Used by the structural tests in core/rules/tests/phase5.js (ETH-01, 02, 03, 05, 06) and by the role module
// core/roles/ethics.js (ETH-04, ETH-04-DUAL, ETH-07). All matching is local; nothing leaves the machine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { isNegated } from "../text/negation.js";

export const HUMAN_DESIGNS = ["survey", "experiment", "qualitative"];
export const EMPIRICAL_DESIGNS = ["regression", "bounds", "sem", "experiment", "slr", "qualitative", "survey", "simulation"];
// sections that hold statements about the paper rather than its subject
const STATEMENT_KEYS = ["disclosure", "ethics", "data_avail", "funding"];

const first = (doc, rx, { negatable = false, keys = null } = {}) => {
  for (const s of keys ? doc.sentencesIn(keys) : doc.sentences) {
    const m = s.text.match(rx);
    if (m && !(negatable && isNegated(s.text, m.index))) return s;
  }
  return null;
};
const sectionHasText = (doc, key) => doc.hasSection(key) && doc.sectionText(key).trim().length > 2;

// ---- "no human participants" waiver: the negation-aware exit for ETH-01 to ETH-03 ----
export const NO_HUMANS = /\b(no (human )?(participants|subjects|respondents|interviewees)|(did|does) not involve (any )?(human|people|participants)|no human (participants|subjects|data)|only (publicly available|secondary|archival|aggregate|published) (data|records|sources|accounts|statistics))\b/i;
export const WAIVER = /\b((ethic(s|al)|IRB) (approval|review|clearance)|approval|review|consent)\b[^.]{0,40}\b((was|were|is|are) not (required|needed|necessary|sought|applicable)|(was|were) waived|not applicable|exempt(ed)?)\b|\b(exempt(ed)? from|did not require|does not require|no need for)\b[^.]{0,30}\b(ethic\w*|review|approval)\b/i;
export const WAIVER_REASON = /\b(because|since|as (the|it|this|no|only|all)|given that|due to|under|according to|in line with|in accordance with|per)\b|\bno (human|personal|identifiable)\b/i;

/** Sentence stating that no human participants are involved (e.g. "No ethics approval was required because no human participants were involved"). */
export function noHumanParticipants(doc) { return doc.sentences.find(s => NO_HUMANS.test(s.text)) || null; }
/** A waiver of ethics review or consent stated anywhere. */
export function waiverSentence(doc) { return doc.sentences.find(s => WAIVER.test(s.text)) || null; }

// ---- ETH-01 ethics approval ----
const ETH_BODY = /\b(ethic(s|al)[- ](committee|board|review|approval|clearance|panel|commission|council|office)|institutional review board|IRB|research ethics|review board|bioethic\w*)\b/i;
const APPROVE = /\b(approv\w+|clearance|cleared|granted|authori[sz]\w+|reviewed and (approved|accepted)|favourable opinion|favorable opinion)\b/i;
// named body: capitalised name before "Ethics Committee", "Committee of <Name>", "IRB of <Name>", or a named university/institute
const NAMED_BODY = /\b(\p{Lu}[\p{L}\p{N}'’&.-]+\s+){1,8}(Ethics|Ethical|Research Ethics|Review|Bioethics)\s+(Committee|Board|Panel|Commission|Council|Office)\b|\b(\p{Lu}[\p{L}'’.-]+\s+){2,8}(Committee|Board|Council|Commission)\b|\b(committee|board|IRB|council|commission)\s+(of|at)\s+(the\s+)?\p{Lu}|\b(University|Institute|Faculty|School|College|Hospital|Academy|Ministry)\s+of\s+\p{Lu}|\p{Lu}[\p{L}'’.-]+\s+(University|Institute)\b/u;
const REF_NO = /\b(ref(erence)?\.?|approval|protocol|permit|decision|file|case|project)\s*(no\.?|nr\.?|number|code|id|#)?\s*[:#]?\s*[A-Z0-9][A-Z0-9/._-]*\d[A-Z0-9/._-]*|\b(no\.|nr\.|number)\s*[:#]?\s*[A-Z0-9/._-]*\d|\b[A-Z]{2,}[-/_][A-Z0-9/_-]*\d+|\b\d{2,}[/-]\d{2,}([/-]\d+)*\b/i;

export function approvalStatus(doc) {
  const s = doc.sentences.find(x => { const m = ETH_BODY.test(x.text) || (/\b(committee|council|board|commission)\b/i.test(x.text) && /\bethic|\bapproval\b/i.test(x.text)); return m && APPROVE.test(x.text) && !isNegated(x.text, x.text.search(APPROVE)); });
  if (!s) return { found: false, sentence: null, body: false, reference: false };
  return { found: true, sentence: s, body: NAMED_BODY.test(s.text), reference: hasRefNo(doc.window(s.id, 1)) };
}
/** A reference number: a token with a digit after a "No."/"Ref."/"approval" cue, or a code like ABC-123 or 12/2024. Year ranges do not count. */
export function hasRefNo(text) {
  const rx = new RegExp(REF_NO.source, "gi");
  for (const m of String(text).matchAll(rx)) { const tok = m[0].trim().split(/\s+/).pop(); if (!yearish(tok)) return true; }
  return false;
}
// "2024", "2019-2021", "2019/20" are dates, not reference numbers
function yearish(tok) {
  if (/^(19|20)\d\d$/.test(tok)) return true;
  const m = tok.match(/^((?:19|20)\d\d)[-/](\d{2}|\d{4})$/); if (!m) return false;
  const a = +m[1], b = m[2].length === 4 ? +m[2] : Math.floor(a / 100) * 100 + +m[2];
  return b > a && b - a <= 10;
}

// ---- ETH-02 informed consent ----
const CONSENT = /\b(informed consent|(written|verbal|oral|electronic|online) consent|consent (was|were|had been) (obtained|given|provided|sought|recorded|collected)|(gave|give|provided|signed) (their |his or her |written |informed |verbal |oral )*consent|consented to|agreed to (take part|participate)|participation was (voluntary|anonymous and voluntary)|participated voluntarily|voluntar(y|ily) (participation|participated)|consent form)\b/i;
export function consentSentence(doc) { return first(doc, CONSENT, { negatable: true }); }

// ---- ETH-03 data protection for participants in the EU/EEA ----
export const EU_COUNTRIES = ["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "Iceland", "Liechtenstein", "Norway"];
const EU_RX = new RegExp("\\b(" + EU_COUNTRIES.join("|").replace(/ /g, "\\s+") + "|European Union|EU member states?|EU countries|EU-27|EU27|EEA)\\b");
const LEGAL_BASIS = /\b(legal|lawful) basis\b|\bArt(icle|\.)\s*6\s*\(1\)|\blegitimate interests?\b|\btask (carried out )?in the public interest\b|\bon the basis of (the participants'? |their )?(explicit )?consent\b|\bGDPR\b[^.]{0,60}\b(consent|basis|Article)\b/i;
const PSEUDO = /\b(pseudonymi[sz]\w*|anonymi[sz]\w*|de-?identifi\w*|coded (identifiers|ids?)|identifiers were (removed|replaced|deleted)|anonymous(ly)?)\b/i;
const STORAGE = /\b(stored|retained|kept|deleted|destroyed|erased|archived|held)\b[^.]{0,80}\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(years?|months?)\b|\b(retention period|data retention|storage period|until the end of the (project|study))\b/i;
const NO_PERSONAL = /\bno (personal|identifiable|personally identifiable) (data|information)\b|\b(fully|completely) anonymous\b/i;

export function euParticipants(doc) {
  const keys = doc.hasSection("methods") ? ["methods", "abstract", "opening"] : null;
  return first(doc, EU_RX, { keys });
}
export function dataProtection(doc) {
  const t = doc.sentences.filter(s => !["references"].includes(s.section)).map(s => s.text).join(" ");
  return { no_personal_data: NO_PERSONAL.test(t), legal_basis: LEGAL_BASIS.test(t), pseudonymisation: PSEUDO.test(t), storage_period: STORAGE.test(t) };
}

// ---- ETH-05 data and code availability ----
const AVAIL = /\b(data (availability|access) statement|(data|dataset|datasets|code|scripts?|materials|replication (package|files|materials|code)|analysis code)( and (code|data|scripts?|materials))? (are|is|will be|have been|has been) (openly |publicly |freely |also )?(available|deposited|archived|shared|accessible|provided)|available (from|at|in|on|via|upon|through) (the )?(corresponding )?(authors?|request|reasonable request|Zenodo|OSF|GitHub|figshare|Dataverse|Mendeley|repository|supplementary)|deposited (in|at|with)|(cannot|can ?not|could not|may not) be (shared|made (publicly )?available|released)|not (publicly|openly) available|restrictions apply|replication (package|files|materials))\b/i;
export function availabilitySentence(doc) { return sectionHasText(doc, "data_avail") ? (doc.sentencesIn("data_avail")[0] || { id: null }) : first(doc, AVAIL); }

// ---- ETH-06 funding ----
const FUND = /\b((this|the|our) (research|study|work|paper|article|project|publication) (was|is|has been) (partly |partially |jointly |financially )?(funded|supported|financed|sponsored)|(funded|financed|sponsored) by (the )?[A-Z]|received no (specific |external |dedicated )?(funding|grant|financial support)|no (specific |external )?(funding|grant)s? (was|were)? ?(received|obtained)|(grant|project|contract) (no\.|number|agreement)\s*[:#]?\s*[A-Z0-9]|funding (statement|information|sources?)|financial support (from|of) (the )?[A-Z]|supported by (the |a )?(grant|project|programme|program|fellowship|scholarship|[A-Z]))/;
export function fundingSentence(doc) {
  if (sectionHasText(doc, "funding")) return doc.sentencesIn("funding")[0] || { id: null };
  return first(doc, new RegExp(FUND.source, "i"));
}

// ---- ETH-04 conflict of interest (heading-aware) ----
export const COI_HEADING = /\b(conflicts? of interests?|competing (financial )?interests?|declaration of (competing )?interests?|interest declaration|related part(y|ies)|disclosure( statement)?|duality of interest|declarations?)\b/i;
export const COI_SENTENCE = /\b(conflicts? of interests?|competing (financial |personal )?interests?|declaration of (competing )?interests?|related[- ]part(y|ies)|nothing to disclose|duality of interest|no (financial|commercial|personal) (interests?|relationships?|ties)|(financial|commercial|business) interests? (in|with))\b/i;

/** Conflict-of-interest statement: COI sections by heading and COI sentences anywhere. */
export function coiStatement(doc) {
  const secs = doc.sections.filter(s => s.key === "disclosure" && COI_HEADING.test(s.heading));
  const paras = doc.paragraphs.filter(p => !p.isHeading && secs.some(s => p.index > s.paraStart && p.index < s.paraEnd));
  const sents = doc.sentences.filter(s => COI_SENTENCE.test(s.text) || paras.some(p => p.id === s.paragraph));
  return { present: secs.length > 0 || sents.length > 0, headings: secs.map(s => s.heading), sentences: sents, text: sents.map(s => s.text).join(" ") };
}

// ---- Sector table (documented in docs/methods/dual-role.md) ----
// terms: exact names a profile may use for the sector (normalised: lower case, single spaces, hyphens as spaces).
// patterns: what counts as a mention of the sector in a manuscript. related: sectors close enough to raise the
// flag with medium confidence.
export const SECTORS = {
  "wb-ems": {
    label: "Whole-body electromyostimulation (WB-EMS) training, studios and equipment",
    terms: ["ems", "wb ems", "wbems", "whole body ems", "whole body electromyostimulation", "electromyostimulation", "electro myostimulation", "electrical muscle stimulation", "ems training", "ems studio", "ems studios", "ems equipment", "ems devices", "ems distribution"],
    patterns: [/\bwhole[- ]body (EMS|electro-?myo-?stimulation)\b/gi, /\bWB-?EMS\b/gi, /\belectro-?myo-?stimulation\b/gi, /\belectrical muscle stimulation\b/gi, /\bEMS[- ](training|studios?|devices?|equipment|suits?|sessions?|market|sector|industry|businesses|providers?|operators?|franchis\w+|distribut\w+)\b/g],
    // bare "EMS" counts only when a pattern above also matched and the text does not use EMS for another field
    bare: /\bEMS\b/g,
    bare_exclude: /\b(environmental management systems?|emergency medical services?|energy management systems?|electronic manufacturing services?)\b/i,
    related: ["fitness"],
  },
  fitness: {
    label: "Fitness studios, gyms and personal training",
    terms: ["fitness", "fitness studio", "fitness studios", "fitness centre", "fitness center", "fitness centres", "fitness centers", "gym", "gyms", "health club", "health clubs", "personal training", "fitness industry", "sport and fitness", "boutique fitness", "fitness services"],
    patterns: [/\bfitness (studios?|cent(re|er)s?|clubs?|industry|sector|market|facilities|businesses|operators?|services|chains?)\b/gi, /\bgyms?\b/gi, /\bhealth clubs?\b/gi, /\bpersonal train(ing|ers?)\b/gi, /\bboutique fitness\b/gi],
    related: ["wb-ems"],
  },
  hospitality: {
    label: "Hotels, restaurants and hospitality",
    terms: ["hospitality", "hotels", "hotel", "restaurants", "restaurant", "tourism and hospitality", "catering"],
    patterns: [/\bhotels?\b/gi, /\brestaurants?\b/gi, /\bhospitality (firms|businesses|industry|sector)\b/gi],
    related: [],
  },
  agriculture: {
    label: "Agriculture and farming",
    terms: ["agriculture", "agricultural", "farming", "farms", "agribusiness", "agri food"],
    patterns: [/\bfarms?\b/gi, /\bfarmers?\b/gi, /\bagricultur(e|al)\b/gi, /\bagribusiness\w*\b/gi],
    related: [],
  },
  printing: {
    label: "Printing and print services",
    terms: ["printing", "print", "print services", "printing industry", "commercial printing"],
    patterns: [/\bprint(ing)? (firms|companies|shops?|houses?|industry|sector|services)\b/gi, /\bprinters\b/gi],
    related: [],
  },
};

export const norm = s => String(s || "").toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
const LEGAL_SUFFIX = /\b(kft|zrt|nyrt|bt|srl|s\.r\.l|ltd|limited|llc|inc|gmbh|ag|sa|sas|bv|nv|plc|oy|ab|as|sp z o o|co)\.?$/i;
export const orgCore = s => String(s || "").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().replace(LEGAL_SUFFIX, "").trim();

/** Map a profile sector string to the table: { key, exact } or null. */
export function sectorOf(str) {
  const n = norm(str);
  for (const [key, s] of Object.entries(SECTORS)) if (n === key || n === norm(s.label) || s.terms.includes(n)) return { key, exact: true };
  for (const [key, s] of Object.entries(SECTORS)) if (s.patterns.some(rx => new RegExp(rx.source, "i").test(str))) return { key, exact: false };
  return null;
}

/** Sectors the manuscript studies: mentions outside the statement sections and the reference list. */
export function studiedSectors(doc, min = 3) {
  const t = doc.sentences.filter(s => !STATEMENT_KEYS.includes(s.section) && s.section !== "references").map(s => s.text).join(" ");
  const top = doc.sentences.filter(s => ["opening", "abstract", "other"].includes(s.section) && doc.sentences.indexOf(s) < 15).map(s => s.text).join(" ");
  const out = [];
  for (const [key, s] of Object.entries(SECTORS)) {
    let n = s.patterns.reduce((a, rx) => a + (t.match(rx) || []).length, 0);
    const lead = s.patterns.some(rx => new RegExp(rx.source, rx.flags.replace("g", "")).test(top));
    if (s.bare && n > 0 && !s.bare_exclude.test(t)) n = Math.max(n, (t.match(s.bare) || []).length);
    if (n >= min || (lead && n >= 1)) out.push({ key, label: s.label, mentions: n });
  }
  return { sectors: out, text: t };
}

// ---- Author profile ----
export function profilePath(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.QUARTILE_AUTHOR_PROFILE) return path.resolve(process.env.QUARTILE_AUTHOR_PROFILE);
  return path.join(process.env.QUARTILE_HOME || path.join(os.homedir(), ".quartile"), "author.yaml");
}

/** Load the local author profile. Returns { status: "loaded" | "not_found" | "invalid", profile, path, problems }. */
export function loadProfile(explicit) {
  if (explicit && typeof explicit === "object") return { status: "loaded", profile: cleanProfile(explicit), path: null, problems: [] };
  const p = profilePath(explicit);
  if (!fs.existsSync(p)) return { status: "not_found", profile: null, path: p, problems: [] };
  try {
    const raw = YAML.parse(fs.readFileSync(p, "utf8")) || {};
    const problems = [];
    if (typeof raw !== "object" || Array.isArray(raw)) return { status: "invalid", profile: null, path: p, problems: ["profile is not a mapping"] };
    for (const k of ["affiliations", "business_interests"]) if (raw[k] != null && !Array.isArray(raw[k])) problems.push(`${k} must be a list`);
    if (problems.length) return { status: "invalid", profile: null, path: p, problems };
    return { status: "loaded", profile: cleanProfile(raw), path: p, problems };
  } catch (e) { return { status: "invalid", profile: null, path: p, problems: [e.message] }; }
}
function cleanProfile(raw) {
  const ent = (x, kind) => ({ kind, organisation: String(x?.organisation || x?.organization || "").trim(), role: String(x?.role || "").trim(), sectors: [].concat(x?.sectors || []).map(String) });
  return { name: String(raw.name || ""), entries: [...(raw.affiliations || []).map(x => ent(x, "affiliation")), ...(raw.business_interests || []).map(x => ent(x, "business_interest"))] };
}

/** Compare the profile's sectors with the studied sectors. Returns the matches, strongest first. */
export function matchProfile(profile, studied, text) {
  const out = [];
  for (const e of profile?.entries || []) for (const sec of e.sectors) {
    const m = sectorOf(sec);
    if (m) {
      for (const st of studied) {
        if (st.key === m.key) out.push({ entry: e, profile_sector: sec, studied: st.key, match: m.exact ? "exact" : "pattern", confidence: m.exact ? "high" : "medium" });
        else if (SECTORS[m.key].related.includes(st.key)) out.push({ entry: e, profile_sector: sec, studied: st.key, match: "related", confidence: "medium" });
      }
    } else {
      // sector not in the table: its own words must appear at least 3 times in the paper
      const n = norm(sec); if (n.length < 4) continue;
      const k = (norm(text).match(new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g")) || []).length;
      if (k >= 3) out.push({ entry: e, profile_sector: sec, studied: n, match: "literal", confidence: "medium" });
    }
  }
  const rank = { exact: 0, pattern: 1, literal: 2, related: 3 };
  return out.sort((a, b) => rank[a.match] - rank[b.match]);
}

const ROLE_WORDS = /\b(director|managing director|owner|co-?owner|owns|own(s|ed)? (a|an|the|shares)|runs (a|an|the)|distribut\w+|sells?|supplies|founder|co-?founder|shareholder|stakeholder|partner|employ\w+|consult\w*|board member|advis[eo]r|distributor|franchis\w+|business interests?|commercial interests?|financial interests?|holds? (a )?(stake|shares?|position)|works? (for|at)|CEO|chief executive|manager)\b/i;

/** Does the disclosure name the author's role in the matched organisation or sector? Negated mentions do not count. */
export function disclosureNamesRole(coi, match) {
  const org = orgCore(match.entry.organisation);
  const sec = SECTORS[match.studied];
  for (const s of coi.sentences) {
    const t = s.text;
    if (org.length >= 3) { const i = t.toLowerCase().indexOf(org.toLowerCase()); if (i >= 0 && !isNegated(t, i)) return { named: true, by: "organisation", sentence: s }; }
    const r = t.match(ROLE_WORDS);
    const hasSector = sec ? sec.patterns.some(rx => new RegExp(rx.source, "i").test(t)) || (sec.bare && /\bEMS\b/.test(t)) || sec.terms.some(x => x.length > 3 && norm(t).includes(x))
      : norm(t).includes(match.studied);
    if (r && hasSector && !isNegated(t, r.index)) return { named: true, by: "role and sector", sentence: s };
  }
  return { named: false };
}

export default { HUMAN_DESIGNS, EMPIRICAL_DESIGNS, SECTORS, approvalStatus, consentSentence, euParticipants, dataProtection, availabilitySentence, fundingSentence, coiStatement, studiedSectors, loadProfile, matchProfile, disclosureNamesRole, noHumanParticipants, waiverSentence, sectorOf };
