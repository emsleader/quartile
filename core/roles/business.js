// Role 4: business-administration committee (specification Section 8). Checks BUS-01 to BUS-07.
// run(doc, opts) returns findings: { rule, role, title, severity, confidence, source, source_ref, message, fix,
// span: { section, start, end, text } | null, detail }. Every check runs only on the designs it applies to.
import { loadTheories, findTheories } from "../theories.js";
import { declarations, basis, verdicts, CITE_ANY } from "../hypotheses.js";

export const ROLE = "business";
const SOURCE = "QUARTILE_BUSINESS";
const ALL_BUT_SLR = ["regression", "bounds", "sem", "experiment", "qualitative", "survey", "conceptual", "simulation", "unknown"];
export const APPLIES = {
  "BUS-01": ALL_BUT_SLR,
  "BUS-02": ["regression", "survey", "conceptual"],
  "BUS-03": ["regression", "survey", "experiment"],
  "BUS-04": ["sem", "survey"],
  "BUS-05": ["regression", "bounds", "sem", "experiment", "survey", "qualitative"],
  "BUS-06": ["regression", "bounds", "sem", "experiment", "slr", "qualitative", "survey", "conceptual", "simulation", "unknown"],
  "BUS-07": ["regression", "bounds", "sem", "survey", "experiment"],
};

const BODY_SKIP = new Set(["references", "abstract", "opening", "disclosure", "ethics", "data_avail", "funding"]);
const spanOf = s => s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null;
const sentenceAt = (doc, pos) => doc.sentences.find(s => s.start <= pos && pos < s.end) || null;
const paraSpan = p => p ? { section: p.section, start: p.start, end: p.end, text: p.text } : null;

function f(rule, title, severity, confidence, source_ref, message, fix, span = null, detail = null) {
  return { rule, role: ROLE, title, severity, confidence, source: SOURCE, source_ref, message, fix, span, detail };
}

// ---- BUS-01 named theory ----
export function namedTheory(doc, theories = loadTheories()) {
  const paras = doc.paragraphs.filter(p => !p.isRef && !p.isTable && !BODY_SKIP.has(p.section));
  const mentions = [];
  for (const p of paras) for (const m of findTheories(p.text, theories)) mentions.push({ ...m, start: p.start + m.start, end: p.start + m.end, heading: p.isHeading });
  const ids = [...new Set(mentions.map(m => m.id))];
  const cited = new Set();
  for (const m of mentions) {
    if (m.heading) continue;
    const s = sentenceAt(doc, m.start);
    if (s && CITE_ANY.test(doc.window(s.id, 1))) cited.add(m.id);
  }
  const detail = { theories: ids.map(id => ({ id, name: mentions.find(m => m.id === id).name, mentions: mentions.filter(m => m.id === id).length, cited: cited.has(id) })), dictionary_size: theories.length };
  if (!ids.length) return [f("BUS-01", "Named theory", "major", "medium", "Specification Section 8 (BUS-01); Whetten (1989), What constitutes a theoretical contribution?, Academy of Management Review 14(4)",
    "No named theory or mechanism was found in the body of the paper.", "Name the theory or mechanism the argument rests on (for example agency theory, real options, economies of scope), cite its source, and use it to derive the hypotheses or propositions.", null, detail)];
  if (!cited.size) {
    const first = mentions.find(m => !m.heading) || mentions[0];
    return [f("BUS-01", "Named theory", "minor", "medium", "Specification Section 8 (BUS-01)",
      `A theory is named (${detail.theories.map(t => t.name).join(", ")}) but no citation stands next to it.`, "Cite the source of the theory where it is first introduced.", spanOf(sentenceAt(doc, first.start)), detail)];
  }
  return [];
}

// ---- BUS-02 theory -> hypothesis chain ----
export function hypothesisChain(doc, theories = loadTheories()) {
  const out = [];
  for (const d of declarations(doc)) {
    const b = basis(doc, d, theories);
    if (b.kind === "none") out.push(f("BUS-02", "Theory before each hypothesis", "major", "medium", "Specification Section 8 (BUS-02)",
      `${d.label} is not preceded by a theory or a cited finding.`, `Give the argument for ${d.label} in the paragraph before it: name the theory or cite the prior finding it rests on.`,
      { section: d.section, start: d.start, end: d.end, text: doc.text.slice(d.start, d.end) }, { label: d.label, paragraphs_checked: b.paragraphs }));
  }
  return out;
}

// ---- BUS-03 hypotheses tested ----
export function hypothesesTested(doc) {
  const decls = declarations(doc); if (!decls.length) return [];
  const out = [];
  for (const v of verdicts(doc, decls.map(d => d.label))) {
    const d = decls.find(x => x.label === v.label);
    const span = { section: d.section, start: d.start, end: d.end, text: doc.text.slice(d.start, d.end) };
    if (!v.mentioned) out.push(f("BUS-03", "Each hypothesis tested", "major", "medium", "Specification Section 8 (BUS-03)",
      `${v.label} is declared but not mentioned in the results, discussion or conclusion.`, `Report the test of ${v.label} and say whether it is supported, not supported or mixed.`, span, { label: v.label }));
    else if (v.verdict === "not found") out.push(f("BUS-03", "Each hypothesis tested", "minor", "low", "Specification Section 8 (BUS-03)",
      `${v.label} is mentioned in the results but no verdict (supported, not supported, mixed) was found.`, `State the verdict for ${v.label} in words.`, span, { label: v.label, evidence: v.evidence.map(e => e.sentence) }));
  }
  return out;
}

// ---- BUS-04 construct validity ----
const SCALE = /\b((\d+|two|three|four|five|six|seven|eight)[- ]items?\b|multi-?item|Likert|scale items|measurement model|reflective(ly)? measured|reflective constructs?|latent constructs?)\b/i;
const METRIC = [
  { key: "reliability", rx: /\b(cronbach'?s?|alpha|α|omega|ω|composite reliability|rho_?a|ρ)\b|\bCR\b/i },
  { key: "ave", rx: /\b(AVE|average variance extracted)\b/i },
  { key: "discriminant", rx: /\b(HTMT|heterotrait|Fornell[- ]Larcker|discriminant validity)\b/i },
  { key: "cmv", rx: /\b(common[- ]method (bias|variance)|CMV|CMB|Harman'?s?|marker variable|unmeasured latent method|common latent factor|full collinearity)\b/i },
];
const KW = /\b(AVE|average variance extracted|HTMT|heterotrait-monotrait( ratio)?|alpha|α|omega|ω|composite reliability|CR)\b/gi;
const kwKey = k => /^(ave|average)/i.test(k) ? "ave" : /^(htmt|heterotrait)/i.test(k) ? "htmt" : /^(alpha|α|cr|composite)/i.test(k) ? "alpha" : "omega";

/** Values reported for AVE, HTMT and reliability, each with the keyword it follows. Comparator-led numbers are thresholds, not values. */
export function reportedValues(text) {
  const t = text.replace(/(95\s?%\s*)?(CI|confidence interval)\s*[[(][^\])]*[\])]/gi, m => " ".repeat(m.length));
  const kws = [...t.matchAll(KW)].map(m => ({ key: kwKey(m[0]), at: m.index, end: m.index + m[0].length }));
  const out = [];
  for (const m of t.matchAll(/(?<![\d.])(0?\.\d{2,3}|1\.00?)(?![\d])/g)) {
    const prev = kws.filter(k => k.end <= m.index && m.index - k.end <= 60).pop(); if (!prev) continue;
    const before = t.slice(Math.max(0, m.index - 28), m.index);
    const comparator = /(above|exceed\w*|greater than|more than|over|at least|below|less than|under|lower than|higher than|threshold( of)?|cut-?off( of)?|criterion( of)?|[<>≤≥]=?)\s*(the\s*)?$/i.test(before);
    out.push({ key: prev.key, value: Number(m[1]), comparator, at: m.index });
  }
  return out;
}

export function constructValidity(doc, opts = {}) {
  const methods = doc.sectionText(["methods", "results", "other"]) || doc.text;
  if (doc.design?.primary === "survey" && !SCALE.test(methods)) return []; // survey without multi-item scales
  const body = doc.sentences.filter(s => !BODY_SKIP.has(s.section)).map(s => s.text).join(" ")
    + " " + doc.paragraphs.filter(p => p.isTable).map(p => p.text).join(" ");
  const missing = METRIC.filter(m => !m.rx.test(body)).map(m => m.key);
  const out = [];
  const REF = "Fornell & Larcker (1981) JMR 18(1); Henseler, Ringle & Sarstedt (2015) JAMS 43(1); Podsakoff et al. (2003) JAP 88(5)";
  const names = { reliability: "reliability (Cronbach's alpha, omega or composite reliability)", ave: "average variance extracted (AVE)", discriminant: "discriminant validity (HTMT or Fornell-Larcker)", cmv: "a common-method-variance test" };
  if (missing.length) out.push(f("BUS-04", "Construct validity for multi-item scales", "major", "medium", REF,
    `Multi-item scales are used, but the paper does not report ${missing.map(k => names[k]).join("; ")}.`, "Report alpha or omega and composite reliability, AVE (at least 0.50), HTMT (below 0.85, or 0.90 for similar constructs) and a common-method-variance test with its procedural remedies.", null, { missing }));
  const htmtMax = Number(opts.htmt_threshold) || 0.90;
  for (const s of doc.sentences.filter(x => !BODY_SKIP.has(x.section))) {
    const vals = reportedValues(s.text).filter(v => !v.comparator);
    const bad = [];
    for (const v of vals) {
      if (v.key === "ave" && v.value < 0.5) bad.push({ ...v, sev: "major", why: `AVE ${v.value} is below 0.50` });
      if (v.key === "htmt" && v.value >= htmtMax) bad.push({ ...v, sev: "major", why: `HTMT ${v.value} is at or above ${htmtMax.toFixed(2)}` });
      else if (v.key === "htmt" && v.value >= 0.85) bad.push({ ...v, sev: "note", why: `HTMT ${v.value} passes ${htmtMax.toFixed(2)} but not the stricter 0.85` });
      if (v.key === "alpha" && v.value < 0.7) bad.push({ ...v, sev: "minor", why: `reliability ${v.value} is below 0.70` });
    }
    if (bad.length) {
      const sev = bad.some(b => b.sev === "major") ? "major" : bad.some(b => b.sev === "minor") ? "minor" : "note";
      out.push(f("BUS-04", "Construct validity for multi-item scales", sev, "medium", REF,
        `Reported value outside the usual threshold: ${bad.map(b => b.why).join("; ")}.`, "Explain the value, drop or revise weak items, or show that the construct is still valid (for example with an HTMT confidence interval below 1).", spanOf(s), { values: bad.map(({ key, value, why }) => ({ key, value, why })) }));
    }
  }
  return out;
}

// ---- BUS-05 managerial implications ----
const IMPL = /\b((managerial|practical|policy) (implications?|recommendations?|relevance)|implications for (managers|practice|practitioners|owners|lenders|policy|policymakers|policy makers|banks|regulators|entrepreneurs|investors|firms)|for practitioners)\b/i;
const ACTORS = "managers|owners|vendors|providers|platforms|associations|trainers|employers|marketers|retailers|lenders|banks|policy ?makers|policy-makers|regulators|practitioners|firms|companies|entrepreneurs|investors|founders|franchisors|franchisees|boards|CFOs|CEOs|governments?|studios|operators|advisers|advisors|suppliers|creditors|SMEs";
const ACTION = new RegExp(`\\b(${ACTORS})\\b(?:\\s+[\\w-]+){0,5}?\\s+(should|could|can|may wish to|might|need to|must|ought to|would benefit from)\\b|\\bwe (recommend|advise|suggest that)\\b`, "i");

export function managerialImplications(doc) {
  const paras = doc.paragraphs.filter(p => !p.isRef && !p.isTable && !p.isHeading && !["references", "abstract", "opening"].includes(p.section));
  const inSection = paras.filter(p => p.section === "implications");
  const phrased = paras.filter(p => p.section !== "implications" && (IMPL.test(p.text) || (["discussion", "conclusion"].includes(p.section) && ACTION.test(p.text))));
  const pool = [...inSection, ...phrased];
  const REF = "Specification Section 8 (BUS-05)";
  if (!pool.length && !doc.hasSection("implications")) return [f("BUS-05", "Managerial implications", "major", "medium", REF,
    "No managerial, practical or policy implications were found (no section and no paragraph that names them).", "Add a short section on what owners, managers, lenders or policymakers could do differently, tied to the findings.")];
  if (pool.some(p => ACTION.test(p.text))) return [];
  const anchor = pool[0] || doc.paragraphs.find(p => p.isHeading && p.section === "implications");
  return [f("BUS-05", "Managerial implications", "minor", "low", REF,
    "Implications are discussed but no concrete action is stated (for example 'owners should ...' or 'lenders could ...').", "Turn at least one implication into an action: who should do what, under which condition.", paraSpan(anchor))];
}

// ---- BUS-06 boundary conditions ----
export const BOUNDARY = /\b(boundary|scope) conditions?\b|\b(do|does|did|may|might|would|could|will|can|need|should)( not|n['’]t) (necessarily )?(generali[sz]e|apply|hold|extend|transfer|carry over|be generali[sz]ed|be extrapolated)\b|\bnot (be )?(directly )?(generali[sz]able|transferable)\b|\bgenerali[sz]\w*[^.]{0,60}\b(limited|caution|restricted|constrained|uncertain)\b|\b(limit\w*|caution\w*)\b[^.]{0,60}\bgenerali[sz]\w*|\bexternal validity\b|\b(apply|applies|hold|holds|valid) only (to|for|in|when|where)\b|\b(limited|restricted|confined) to (firms|SMEs|small|large|companies|the|one|a single|this|[A-Z])|\bshould not be (extrapolated|generali[sz]ed)\b|\bcaution\w* (is needed |is warranted )?(when|in) (generali[sz]|extrapolat|apply|transfer)/i;

export function boundaryConditions(doc) {
  const hit = doc.sentences.find(s => !["references", "abstract", "opening"].includes(s.section) && BOUNDARY.test(s.text));
  if (hit) return [];
  return [f("BUS-06", "Boundary conditions stated", "minor", "medium", "Specification Section 8 (BUS-06); Busse, Kach & Wagner (2017), Boundary conditions, Organizational Research Methods 20(4)",
    "The paper does not say where its findings do not apply (sector, country, firm size or period).", "Add one or two sentences on the boundary conditions: for which firms, sectors, countries and periods the findings hold, and where they may not.")];
}

// ---- BUS-07 unit of analysis ----
const UNITS = {
  firm: "firms?|compan(?:y|ies)|enterprises?|SMEs|businesses|firm-years?",
  person: "owners?|owner-managers?|entrepreneurs?|founders?|managers?|CEOs?|employees?|individuals?",
  establishment: "establishments?|plants?|sites?|outlets?|stores?|branch(?:es)?|studios?|locations?|units",
};
const NUMW = "(\\d{1,3}(?:,\\d{3})+|\\d+)";
const SAMPLE = new RegExp(`\\b(sample|panel|data|dataset|survey(?:ed)?|interview(?:ed)?|questionnaire|sent|respond\\w*|observ\\w+|consist\\w*|compris\\w*|includ\\w*|cover\\w*|study|studies|analy[sz]\\w*|use|uses|N\\s*=|n\\s*=)\\b[^.]{0,60}?\\b${NUMW}\\s+(?:[a-z-]+\\s+){0,2}?(${Object.values(UNITS).join("|")})\\b`, "gi");
const MULTILEVEL = /\b(multi-?level|nested|hierarchical linear|HLM|two-level|cross-level|(establishments?|plants?|sites?|outlets?|studios?) (within|per|of each) (firms?|compan\w+)|(firms?|compan\w+) and their (owners?|establishments?|plants?|sites?)|per firm)\b/i;
const groupOf = u => Object.entries(UNITS).find(([, rx]) => new RegExp(`^(${rx})$`, "i").test(u))?.[0];

export function unitOfAnalysis(doc) {
  const stmts = [];
  for (const s of doc.sentencesIn(["abstract", "opening", "methods", "results", "conclusion"])) {
    for (const m of s.text.matchAll(SAMPLE)) { const g = groupOf(m[3]); if (g) stmts.push({ group: g, n: m[2], unit: m[3], sentence: s }); }
  }
  const groups = [...new Set(stmts.map(x => x.group))];
  if (groups.length < 2 || MULTILEVEL.test(doc.text)) return [];
  const second = stmts.find(x => x.group !== stmts[0].group);
  return [f("BUS-07", "Unit of analysis is consistent", "minor", "low", "Specification Section 8 (BUS-07); Rousseau (1985), Issues of level in organizational research, Research in Organizational Behavior 7",
    `The sample is described in different units: ${[...new Map(stmts.map(x => [x.group + x.n, `${x.n} ${x.unit} (${x.sentence.section})`])).values()].join("; ")}.`,
    "State one unit of analysis (firm, owner or establishment) and use it everywhere; if the data are multi-level, say so and explain how levels are linked.", spanOf(second.sentence), { units: stmts.map(x => ({ group: x.group, n: x.n, unit: x.unit, section: x.sentence.section })) })];
}

const CHECKS = { "BUS-01": namedTheory, "BUS-02": hypothesisChain, "BUS-03": hypothesesTested, "BUS-04": constructValidity, "BUS-05": managerialImplications, "BUS-06": boundaryConditions, "BUS-07": unitOfAnalysis };

export async function run(doc, opts = {}) {
  const design = doc.design?.primary || "unknown";
  const out = [];
  for (const [id, fn] of Object.entries(CHECKS)) {
    if (!APPLIES[id].includes(design)) continue;
    if (opts.only_rules && !opts.only_rules.includes(id)) continue;
    out.push(...fn(doc, id === "BUS-04" ? opts : undefined));
  }
  return out;
}
export default { ROLE, run, APPLIES };
