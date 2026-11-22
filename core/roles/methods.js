// Role module: methods reviewer (specification Section 6).
// Code checks here: MTH-02 reporting checklist, MTH-03 sample-flow arithmetic, MTH-04 measurement defined before
// use, MTH-05 pre-specification honesty. MTH-01 (claim-design match) and MTH-06 (specific limitations) are text
// rules in rulebook/methods.yaml, run by the rule engine.
import { isNegated } from "../text/negation.js";
import { checklistsFor, evaluateChecklist } from "./checklists.js";

export const ROLE = "methods";
const SRC = "QUARTILE_METHODS";

export const DESIGNS = {
  "MTH-02": "all",
  "MTH-03": ["survey", "slr", "regression"],
  "MTH-04": ["regression", "sem", "survey", "experiment", "bounds", "simulation"],
  "MTH-05": "all",
};
const applies = (rule, design) => DESIGNS[rule] === "all" || DESIGNS[rule].includes(design);
const span = s => s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null;

// ---------------------------------------------------------------------------------------------------------------
// MTH-03 sample flow. Method in docs/methods/sample-flow.md.
const UNIT_CLASS = [
  ["doc", /^(records?|articles?|papers?|studies|study|documents?|publications?|hits?|reports?|full[- ]texts?|titles?|abstracts?|citations?|entries|sources?)$/i],
  ["firm", /^(firms?|compan(y|ies)|SMEs?|business(es)?|enterprises?|establishments?|organi[sz]ations?|studios?|plants?|banks?)$/i],
  ["obs", /^(observations?|firm-years?|rows?|cases?|data points?)$/i],
  ["resp", /^(respondents?|responses?|participants?|questionnaires?|surveys?|individuals?|people|persons?|managers?|owners?|employees?|students?|customers?|households?|interviewees?|answers?|completes?)$/i],
];
const NON_UNIT = /^(years?|months?|days?|weeks?|hours?|minutes?|countries|country|industr(y|ies)|sectors?|regions?|journals?|databases?|items?|questions?|waves?|reviewers?|coders?|authors?|pages?|words?|points?|euros?|EUR|USD|HUF|GBP|dollars?|million|billion|thousand|times|variables?|categories|attributes?|levels?|tasks?|profiles?|rounds?|cities|municipalities|percent|per|languages?|stages?|steps?|criteria|themes?|codes?)$/i;
const unitClass = w => { if (!w) return null; for (const [k, rx] of UNIT_CLASS) if (rx.test(w)) return k; return null; };

const NUM = /(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(?![\w]|[.,]\d)/g;
const toN = s => Number(s.replace(/,/g, ""));
const PREFIX_SKIP = /\b(Tables?|Figures?|Fig\.|Sections?|Steps?|Stages?|Waves?|Models?|Columns?|Appendix|Panels?|Study|Round|Phase|Items?|Question|Q|H|Hypothesis|No\.|Chapter|pp?\.|version|v|Equation|Eq\.)\s*$/i;
const COMPARATOR = /((fewer|less|more|greater|lower|higher|older|younger) than|at least|at most|over|under|above|below|up to|exceeding|minimum of|maximum of|[<>≤≥])\s*$/i;
const REMAIN_BEFORE = /(\bleaving|\bleft(?: us)?(?: with)?|\bresulting in|\bwhich left|\bgiving|\byielding|\bto (?:obtain|arrive at|reach|retain|keep)|\breduc(?:ed|ing)\b[^.]{0,25}?\bto|\bdown to|\b(?:final|analytic(?:al)?|estimation|net|working|usable|effective) (?:sample|dataset|data set|set)(?: size)?(?: of| comprises| comprised| consists of| consisted of| includes| included| contains| contained| is| was| has| had)?|\bremain(?:ed|ing|s)?:?|\bretain(?:ed|ing)|\bfor a (?:final|total|net) (?:sample|set) of)\s+(?:a total of\s+|the\s+|only\s+|just\s+|n\s*=\s*)?$/i;
const REMOVE_BEFORE = /\b(removing|excluding|dropping|deleting|discarding|eliminating|omitting|removed|excluded|dropped|deleted|discarded|eliminated|omitted)\s+(?:a further\s+|another\s+|an additional\s+|the\s+|a total of\s+)?$/i;
const TOTAL_BEFORE = /(\bof(?: the| these| those| all)?|\bidentified|\bretrieved|\breturned|\byielded|\bfound|\bobtained|\bcollected|\breceived|\bdownloaded|\bextracted|\binitially|\ba total of|\bin total|\btotal of|\bstart(?:ed|ing) with|\bbeg(?:in|an) with|\bcontain(?:s|ed)?|\bcompris(?:es|ed)|\bpopulation of|\b(?:initial|original|full|raw|starting|gross) (?:sample|dataset|data set|set|pool|population)(?: size)?(?: of| is| was| comprises| comprised| contains| contained)?|\bsent (?:to|out(?: to)?)|\binvited|\bcontacted|\bdistributed(?: to)?|\bapproached|\bsurveyed)\s+(?:the\s+|a total of\s+|all\s+|approximately\s+|about\s+|some\s+|n\s*=\s*)?$/i;
const MID = "((?:[A-Za-z-]+\\s+){0,3}?)";
const REMOVE_AFTER = new RegExp("^\\s+" + MID + "(?:(?:were|was|had been|are|is)\\s+(?:then\\s+|further\\s+|subsequently\\s+|also\\s+|later\\s+|thus\\s+)?(?:excluded|removed|dropped|deleted|discarded|eliminated|omitted|duplicates?|ineligible|irrelevant|incomplete|unusable|invalid|outliers|off-topic)|duplicates?\\b|duplicate (?:records|entries)|did not (?:meet|respond|complete|qualify|pass|satisfy|report)|failed (?:to|the)|lacked|had missing)\\b", "i");
const REMAIN_AFTER = new RegExp("^\\s+" + MID + "(?:remained|remain|were\\s+(?:then\\s+|finally\\s+|thus\\s+)?(?:retained|kept|left|screened|assessed|included|eligible|analy[sz]ed|used|reviewed|retrieved|returned|usable|valid|complete)|was\\s+(?:retained|kept|left|used)|met (?:the |all )?(?:inclusion|eligibility) criteria|(?:were|was) (?:deemed |found )?eligible|responded|agreed(?: to (?:participate|take part))?|accepted|consented|participated|took part|completed (?:the )?(?:survey|questionnaire))\\b", "i");
const TOTAL_AFTER = new RegExp("^\\s+" + MID + "(?:were|was)\\s+(?:initially\\s+)?(?:identified|retrieved|found|returned|obtained|collected|downloaded|extracted|received|invited|contacted)\\b", "i");
const UNIT_AFTER = /^\s+((?:[A-Za-z-]+\s+){0,2}?)([A-Za-z-]+)\b/;
const REMOVE_VERB = /\b(remov\w*|exclud\w*|dropp\w*|delet\w*|discard\w*|eliminat\w*|omitt\w*|dedupl\w*)\b/gi;
const NOT_A_STEP = /^(exclusion|inclusion)|(?:if|when|where|because)\s*$/i;
const STOP_MID = /\b(were|was|of|and|from|in|to|for|with|by|that|which|the)\b/i;

function labelRole(label) {
  const t = label.toLowerCase();
  if (/duplicat|\bremoved\b|\bexcluded\b|not retrieved|ineligible|\bdropped\b|discarded|eliminated/.test(t)) return "remove";
  if (/screened|sought|assessed|eligib|\bincluded\b|remain|retained|final|analy[sz]ed/.test(t)) return "remain";
  if (/identified|retrieved|\bfound\b|returned|yielded|initial|\btotal\b|search|database|register/.test(t)) return "total";
  return null;
}

/** Events (total / remove / remain / unknown / plain) in one sentence, in text order. */
export function flowEvents(text) {
  const ev = [];
  const depthAt = []; let d = 0;
  for (let i = 0; i < text.length; i++) { if (text[i] === "(") d++; depthAt[i] = d; if (text[i] === ")") d = Math.max(0, d - 1); }
  for (const m of text.matchAll(NUM)) {
    const idx = m.index, end = idx + m[0].length, value = toN(m[0]);
    const before = text.slice(Math.max(0, idx - 70), idx), after = text.slice(end, end + 90);
    if (/^\s*(%|percent|per cent)/i.test(after)) continue;
    if (depthAt[idx] > 0) {
      // only "(n = 1,234)" style labels inside parentheses
      if (!/\(\s*n\s*=\s*$/i.test(text.slice(Math.max(0, idx - 8), idx))) continue;
      const open = text.lastIndexOf("(", idx);
      const lab = text.slice(0, open).split(/[;.:()]|,\s(?=[A-Za-z])/).pop();
      const role = labelRole(lab);
      if (role) ev.push({ type: role, value, pos: idx, label: true, unit: null });
      continue;
    }
    if (PREFIX_SKIP.test(before)) continue;
    if (!/,/.test(m[0]) && value >= 1900 && value <= 2099 && !UNIT_AFTER.test(after)) continue;
    if (!/,/.test(m[0]) && value >= 1900 && value <= 2099 && !unitClass((after.match(UNIT_AFTER) || [])[2])) continue;
    if (COMPARATOR.test(before)) continue;
    const um = after.match(UNIT_AFTER);
    let unitWord = null;
    if (um && !STOP_MID.test(um[1] || "")) { if (unitClass(um[2])) unitWord = um[2]; else if (!um[1] && NON_UNIT.test(um[2])) continue; }
    if (um && um[1] && NON_UNIT.test(um[1].trim().split(/\s+/)[0])) continue;
    const unit = unitClass(unitWord);
    // colon label: "Duplicates removed: 234"
    const colon = before.match(/([A-Za-z][A-Za-z -]{2,50}):\s*$/);
    if (colon && labelRole(colon[1])) { ev.push({ type: labelRole(colon[1]), value, pos: idx, label: true, unit }); continue; }
    let type = "plain", strong = false;
    if (REMAIN_BEFORE.test(before)) type = "remain";
    else if (REMOVE_BEFORE.test(before)) type = "remove";
    else if (TOTAL_BEFORE.test(before)) { type = "total"; strong = !/\b(from|surveyed)\s*$/i.test(before); }
    else if (REMOVE_AFTER.test(after)) type = "remove";
    else if (REMAIN_AFTER.test(after)) type = "remain";
    else if (TOTAL_AFTER.test(after)) { type = "total"; strong = true; }
    else if (unit) type = "unit";
    ev.push({ type, value, pos: idx, unit, strong });
  }
  // removal verbs with no number attached: the step size is unknown
  for (const m of text.matchAll(REMOVE_VERB)) {
    const p = m.index;
    if (NOT_A_STEP.test(m[0]) || /^\s*(if|when|because)\b/i.test(text.slice(p + m[0].length, p + m[0].length + 8))) { ev.push({ type: "unknown", pos: p, soft: true }); continue; }
    const covered = ev.some(e => e.type === "remove" && e.pos >= p - 90 && e.pos <= p + 60);
    if (!covered) ev.push({ type: "unknown", pos: p });
  }
  return ev.sort((a, b) => a.pos - b.pos);
}

/** Check the arithmetic of every flow in a paragraph's sentences. Returns problems with the sentence they sit in. */
export function checkFlow(sentences) {
  const out = [];
  let anchor = null, aunit = null, removals = [], unknown = false, open = false, lastTotal = false;
  for (const s of sentences) {
    for (const e of flowEvents(s.text)) {
      if (e.type === "unknown") { if (!e.soft || open) unknown = true; continue; }
      if (e.type === "total" || (e.type === "unit" && anchor == null)) {
        if (anchor == null || e.strong || e.label) {
          if (lastTotal && e.label && anchor) anchor = [e.value, ...anchor, anchor[0] + e.value];
          else { anchor = [e.value]; aunit = e.unit; }
          removals = []; unknown = false; open = false; lastTotal = true;
        }
        continue;
      }
      if (e.type === "plain" || e.type === "unit") {
        if (open) removals.push({ n: e.value, verb: false });
        else if (lastTotal && anchor) anchor = [...anchor, anchor[anchor.length - 1] + e.value];
        continue;
      }
      lastTotal = false;
      if (e.type === "remove") {
        if (e.unit && aunit && e.unit !== aunit) unknown = true; else removals.push({ n: e.value, verb: true });
        open = true; continue;
      }
      if (e.type === "remain") {
        const verb = removals.filter(r => r.verb);
        if (anchor && verb.length && !unknown && !(e.unit && aunit && e.unit !== aunit)) {
          const sums = new Set([verb.reduce((a, r) => a + r.n, 0), removals.reduce((a, r) => a + r.n, 0), verb[0].n]);
          const ok = anchor.some(c => [...sums].some(x => c - x === e.value));
          if (!ok) {
            const removed = verb.reduce((a, r) => a + r.n, 0);
            out.push({ sentence: s, start: anchor[0], removed, expected: anchor[0] - removed, stated: e.value, steps: verb.map(r => r.n) });
          }
        }
        anchor = [e.value]; if (e.unit) aunit = e.unit;
        // after a mismatch, either the stated or the computed value may be the true one: do not cascade
        if (out.length && out[out.length - 1].stated === e.value && out[out.length - 1].sentence === s) anchor.push(out[out.length - 1].expected); removals = []; unknown = false; open = false;
      }
    }
  }
  return out;
}

const fmt = n => n.toLocaleString("en-US");
export function sampleFlow(doc) {
  const byPara = new Map();
  for (const s of doc.sentences) { if (!byPara.has(s.paragraph)) byPara.set(s.paragraph, []); byPara.get(s.paragraph).push(s); }
  const out = [];
  for (const sents of byPara.values()) for (const p of checkFlow(sents)) out.push({
    rule: "MTH-03", role: ROLE, title: "Sample flow does not add up", severity: "major", confidence: "high", source: SRC,
    source_ref: "PRISMA 2020 item 16a (Page et al. 2021); STROBE item 13a (von Elm et al. 2007)",
    message: `Sample flow does not add up: ${fmt(p.start)} − ${p.steps.map(fmt).join(" − ")} = ${fmt(p.expected)}, but the text says ${fmt(p.stated)}.`,
    fix: "Recompute each step from the start count and correct the number, or report the missing exclusion step with its count.",
    span: span(p.sentence), detail: { start: p.start, removed: p.steps, expected: p.expected, stated: p.stated },
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// MTH-04 measurement defined before use.
const KNOWN = new Set(("OLS GLS FGLS WLS FE RE IV SE SD SEs CI CIs AMCE AME ACME VIF AIC BIC RMSEA CFI TLI SRMR AVE HTMT CR ANOVA MANOVA ANCOVA SEM PLS CFA EFA GMM DID RDD LPM ML MLE KMO NFI GFI AGFI ICC OR HR RR IRR " +
  "USD EUR HUF GBP EU US USA UK OECD GDP CPI SME SMEs CEO CFO CEOs CFOs IT AI HR NA II III IV VI VII VIII IX XI XII PRISMA STROBE COREQ CHERRIES DOI URL ID IDs ISO NACE ISIC NUTS UN WHO IMF ECB R2 PhD MBA " +
  "WBES BEEPS ORBIS FDI ROA ROE").split(/\s+/).filter(w => !/^(ROA|ROE)$/.test(w)));
const CODE = /\b(?:[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Za-z]+_[A-Za-z0-9_]+)\b/g;
const ROW_SKIP = /^(constant|intercept|n|obs\.?|observations|number of (obs\w*|firms|groups)|r2|r²|r-?squared|adj\.? ?r2|adj\.? ?r²|adjusted r-?squared|pseudo r2|f|f-stat\w*|wald\b.*|chi2|χ2|log ?likelihood|aic|bic|.*\b(fe|fixed effects|dummies|effects)$|controls?|standard errors?.*|clusters?|variables?|model ?\d*|\(\d+\)|mean|sd|min|max|median|total|year|industry|country|notes?:?.*|dependent variable.*)$/i;
const STOPW = new Set("the and of in on for with to a an by from as at log ln ratio total per".split(" "));

function definedIn(methodsLow, label) {
  const l = label.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!l) return true;
  if (methodsLow.includes(l)) return true;
  const words = l.split(" ").filter(w => w.length >= 4 && !STOPW.has(w));
  if (!words.length) return true;
  return words.every(w => new RegExp("\\b" + w.slice(0, 5)).test(methodsLow));
}

export function measurementDefined(doc) {
  if (!doc.hasSection("methods") || !doc.hasSection("results")) return [];
  const methods = doc.sectionText(["methods", "literature", "introduction", "abstract"]);
  const methodsLow = methods.toLowerCase();
  const out = [], seen = new Set();
  const push = (name, s, kind) => {
    if (seen.has(name.toLowerCase()) || out.length >= 8) return; seen.add(name.toLowerCase());
    out.push({ rule: "MTH-04", role: ROLE, title: "Variable used in the results is not defined in the methods", severity: "minor", confidence: "low", source: SRC,
      source_ref: "STROBE item 7 (von Elm et al. 2007); JARS-Quant, measures (Appelbaum et al. 2018)",
      message: `'${name}' appears in the results but is not defined in the methods.`,
      fix: `Define '${name}' in the methods (what it measures, its source and its unit) before the results use it.`,
      span: s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null, detail: { variable: name, from: kind } });
  };
  // coded names in results sentences
  for (const s of doc.sentencesIn(["results"])) {
    for (const m of s.text.matchAll(CODE)) {
      const w = m[0]; if (KNOWN.has(w) || KNOWN.has(w.replace(/s$/, "")) || /^[A-Z]\d+$/.test(w) || /^H\d/.test(w)) continue;
      if (new RegExp("\\b" + w.replace(/[^\w]/g, "") + "\\b").test(methods)) continue;
      // defined at first use: "return on assets (ROA)"
      if (new RegExp("\\(" + w + "\\)").test(doc.text.slice(0, s.end))) continue;
      push(w, s, "name");
    }
  }
  // row labels of results tables
  for (const t of doc.tables.filter(t => t.section === "results")) {
    const p = doc.paragraphs.find(x => x.id === t.paragraph);
    for (let r = 1; r < t.rows.length; r++) {
      const label = (t.rows[r][0] || "").trim();
      if (!label || ROW_SKIP.test(label) || !t.numbers[r].slice(1).some(v => v != null)) continue;
      if (/^[\d.\-−\s]+$/.test(label)) continue;
      if ((label.match(CODE) || []).some(w => KNOWN.has(w))) continue;
      if (definedIn(methodsLow, label)) continue;
      push(label, p ? { section: "results", start: p.start, end: p.end, text: p.text } : null, "table");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// MTH-05 pre-specification honesty.
const PREREG = /\b(pre-?regist(?:ered|ration)|registered (?:in advance|before (?:the )?data (?:collection|were collected))|registered report)\b/gi;
const OWN = /\b(we|our|this (?:study|paper|article|analysis|survey|experiment|review|protocol)|the (?:study|analysis|hypotheses|protocol|design|plan|analysis plan|review|experiment))\b/i;
export const REGISTRY = /(osf\.io|aspredicted\.org|clinicaltrials\.gov|socialscienceregistry\.org|AEARCTR-\d+|egap\.org|ridie|CRD\d{6,}|researchregistry|10\.17605\/OSF|zenodo\.org|10\.5281\/zenodo|isrctn|drks\.de|anzctr|chictr|inplasy)/i;

export function preSpecification(doc) {
  if (REGISTRY.test(doc.text)) return [];
  const out = [];
  for (const s of doc.sentences) {
    if (s.section === "references") continue;
    for (const m of s.text.matchAll(PREREG)) {
      if (isNegated(s.text, m.index)) continue;
      if (!OWN.test(s.text)) continue;
      if (/\(([A-Z][A-Za-z-]+)[^()]*(19|20)\d{2}\)/.test(s.text) && !/\b(we|our)\b/i.test(s.text)) continue;
      out.push({ rule: "MTH-05", role: ROLE, title: "Preregistration claimed without a registry link", severity: "major", confidence: "medium", source: SRC,
        source_ref: "Nosek et al. (2018) PNAS 115(11): a preregistration is a time-stamped, public plan made before the data are seen",
        message: `The paper says '${m[0]}' but gives no registry link or registration number.`,
        fix: "Add the registry link and ID (for example OSF Registries or AsPredicted), or call the plan an analysis protocol and say when it was written.",
        span: span(s), detail: { match: m[0] } });
      break;
    }
    if (out.length >= 3) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// MTH-02 reporting checklist: one summary finding per checklist; status needs_human because keyword evidence
// cannot confirm that an item is fully reported.
export function reportingChecklists(doc, { checklist } = {}) {
  const design = doc.design?.primary || "unknown";
  return checklistsFor(design, doc).filter(c => !checklist || c.id === checklist).map(c => evaluateChecklist(doc, c));
}

export async function run(doc, opts = {}) {
  const design = doc.design?.primary || "unknown";
  const out = [];
  if (applies("MTH-02", design)) for (const r of reportingChecklists(doc)) out.push({
    rule: "MTH-02", role: ROLE, title: `Reporting checklist: ${r.name}`, severity: "note", confidence: "low", status: "needs_human", source: r.id,
    source_ref: r.citation, message: `${r.name}: ${r.counts.found} items with evidence, ${r.counts.not_found} not found, ${r.counts.needs_human} to check by hand.`,
    fix: "Use the reporting_checklist tool for the item table; add the missing items or say why they do not apply.", span: null, detail: r });
  if (applies("MTH-03", design)) out.push(...sampleFlow(doc));
  if (applies("MTH-04", design)) out.push(...measurementDefined(doc));
  if (applies("MTH-05", design)) out.push(...preSpecification(doc));
  return out;
}

export default { ROLE, run, sampleFlow, checkFlow, flowEvents, measurementDefined, preSpecification, reportingChecklists, DESIGNS };
