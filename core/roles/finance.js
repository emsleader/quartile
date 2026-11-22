// Role module: finance and statistics reviewer (specification Section 7).
// FIN-01 to FIN-08 are text rules in rulebook/finance.yaml, run by the rule engine with their design gates.
// This module adds the code checks STA-01 to STA-05. run(doc) returns only the code checks, because the committee
// and the gold runner already run the whole rulebook; pass { includeRulebook: true } (or call review()) to get the
// FIN rules as well. Findings use the engine's shape.
import { loadRules } from "../rules/loader.js";
import { runRules } from "../rules/engine.js";
import { isNegated } from "../text/negation.js";
import { grim, grimTestable, decimalsOf } from "../stats/grim.js";
import { grimmer, grimmerExact } from "../stats/grimmer.js";
import { debit } from "../stats/debit.js";
import { caliper } from "../stats/pcurve.js";
import { extractResults, checkResult, ONE_TAILED } from "../stats/recompute.js";

export const ROLE = "finance";
const SOURCE = "QUARTILE_FINANCE";
const REF = {
  "STA-01": "Brown & Heathers (2017) SPPS 8(4), 363-369 (GRIM); Anaya (2016) PeerJ Preprints 4:e2400v1 (GRIMMER); Heathers & Brown (2019) OSF Preprints doi:10.17605/osf.io/pm825 (DEBIT); specification 7.2",
  "STA-02": "Nuijten et al. (2016) Behavior Research Methods 48(4), 1205-1226 (method only); specification 7.1",
  "STA-03": "Specification 7.3 (caliper test, note only)",
  "STA-04": "Specification 7.1 (percentages add to 100 within rounding)",
  "STA-05": "Specification 7.1 (one sample size everywhere it is reported)",
};
const TITLE = {
  "STA-01": "Mean or SD not possible for n and scale",
  "STA-02": "Reported p does not match the test statistic",
  "STA-03": "Many p-values just below .05",
  "STA-04": "Percentages do not add to 100",
  "STA-05": "Sample size reported differently",
};

function finding(rule, { severity, confidence, message, fix, span, detail }) {
  return { rule, role: ROLE, title: TITLE[rule], severity, confidence, source: SOURCE, source_ref: REF[rule], message, fix, span: span || null, detail: detail || null };
}
const spanOf = s => (s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null);
const prevOf = (doc, s) => { const i = doc.sentences.indexOf(s); return i > 0 ? doc.sentences[i - 1] : null; };
const WORDNUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const toInt = s => (WORDNUM[String(s).toLowerCase()] ?? Number(String(s).replace(/,/g, "")));

// ---------------- STA-01: GRIM / GRIMMER / DEBIT on reported means ----------------
const MEAN = /\b(?:M|[Mm]ean|[Aa]verage)(?:\s+[A-Za-z-]+){0,6}?\s*(?:=|was|is|of|:)\s*(\d*\.\d+)\b/g;
const N_RX = /\b[nN]\s*=\s*(\d[\d,]*)\b/g;
const SD_RX = /\bSD\s*=\s*(\d*\.\d+)\b/;
const INTEGER_CUE = /\b(Likert|\d+-point|(two|three|four|five|six|seven|eight|nine|ten|eleven)-point|rating scale|single[- ]item|integer|whole numbers?|count of|number of)\b/i;
const BINARY_CUE = /\b(binary|dummy|dichotomous|0\/1|yes\/no|coded (0|1) (and|or) (0|1))\b/i;
const ITEMS_N = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ]items?\b/i;
const MULTI_ITEM = /\b(items|composite|averaged|index|scale scores?|summated)\b/i;
const POINTS = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|eleven)-point\b/i;
const RANGE = /\b(?:from|ranging from|scale of|scored)\s+(\d+)\s*(?:to|–|-)\s*(\d+)\b/i;

function scaleOf(t) {
  const r = t.match(RANGE); if (r) return { min: +r[1], max: +r[2] };
  const p = t.match(POINTS); if (p) { const k = toInt(p[1]); return { min: 1, max: k }; }
  return null;
}

/** Every mean with n found in the text, with a verdict: possible / not possible / not testable (and why). */
export function scanMeans(doc) {
  const out = [];
  for (const s of doc.sentences) {
    const ctx = [prevOf(doc, s)?.text || "", s.text].join(" ");
    const ns = [...s.text.matchAll(N_RX)].map(m => ({ n: toInt(m[1]), at: m.index }));
    if (!ns.length) continue;
    for (const m of s.text.matchAll(MEAN)) {
      const meanStr = m[1], dp = decimalsOf(meanStr), at = m.index;
      const n = ns.reduce((b, x) => (Math.abs(x.at - at) < Math.abs(b.at - at) ? x : b)).n;
      const sdM = s.text.slice(at, at + m[0].length + 30).match(SD_RX);
      const sdStr = sdM ? sdM[1] : null;
      const rec = { mean: meanStr, n, sd: sdStr, span: spanOf(s) };
      const skip = reason => out.push({ ...rec, verdict: "not testable", reason });
      if (BINARY_CUE.test(ctx) && Number(meanStr) <= 1) {
        if (!sdStr) { skip("Binary variable without an SD: DEBIT needs both."); continue; }
        const r = debit(meanStr, sdStr, n, { sdType: "either" });
        const f = r.possible === false ? finding("STA-01", { severity: "minor", confidence: "medium", span: spanOf(s),
          message: `DEBIT: for ${n} binary (0/1) values, a mean of ${meanStr} and an SD of ${sdStr} cannot both be right.`,
          fix: "Check the mean, the SD and n of this binary variable; for 0/1 data the SD follows from the mean and n.",
          detail: { test: "DEBIT", mean: meanStr, sd: sdStr, n } }) : null;
        out.push({ ...rec, test: "DEBIT", verdict: r.possible ? "possible" : "not possible", reason: r.reason, finding: f });
        continue;
      }
      if (!INTEGER_CUE.test(ctx)) { skip("The text does not say the data are integers (Likert, k-point scale, counts)."); continue; }
      const scale = scaleOf(ctx);
      if (scale && (Number(meanStr) < scale.min || Number(meanStr) > scale.max)) { skip("The mean lies outside the scale named nearby, so it is probably another variable."); continue; }
      const itemsM = ctx.match(ITEMS_N);
      let items = itemsM ? toInt(itemsM[1]) : null;
      if (items == null) {
        if (MULTI_ITEM.test(ctx) && !/\bsingle[- ]item\b/i.test(ctx)) { skip("A multi-item scale without a stated number of items."); continue; }
        items = 1;
      }
      if (!grimTestable(n, dp, items)) { skip(`n × items = ${n * items} is not below 10^${dp}.`); continue; }
      const g = grim(meanStr, n, { dp, items });
      if (!g.possible) {
        out.push({ ...rec, items, test: "GRIM", verdict: "not possible", reason: `No integer total divided by ${n * items} rounds to ${meanStr}.`,
          finding: finding("STA-01", { severity: "major", confidence: "medium", span: spanOf(s),
            message: `GRIM: a mean of ${meanStr} is not possible for n = ${n}${items > 1 ? ` with ${items} items` : ""} on an integer scale (possible means are multiples of 1/${n * items}; the nearest is ${g.nearest.toFixed(dp + 2)}).`,
            fix: "Check n, the mean and the number of items. If the measure is not integer data (e.g. a weighted or continuous score), say so.",
            detail: { test: "GRIM", mean: meanStr, n, items, dp, nearest: g.nearest } }) });
        continue;
      }
      if (!sdStr) { out.push({ ...rec, items, test: "GRIM", verdict: "possible", reason: `${g.candidates[0]} / ${n * items} rounds to ${meanStr}.` }); continue; }
      let r = null;
      if (scale) r = grimmerExact(meanStr, sdStr, n, { min: scale.min, max: scale.max, items });
      if (!r || r.possible == null) r = grimmer(meanStr, sdStr, n, { items });
      const f = r.possible === false ? finding("STA-01", { severity: "minor", confidence: "low", span: spanOf(s),
        message: `GRIMMER: an SD of ${sdStr} is not possible with a mean of ${meanStr} and n = ${n} for integer data${scale ? ` on a ${scale.min}-${scale.max} scale` : ""} (sample SD, n - 1).`,
        fix: "Check the SD, the mean and n; say whether the SD uses n or n - 1.",
        detail: { test: r.exact ? "GRIMMER (exact search)" : "GRIMMER", mean: meanStr, sd: sdStr, n, items, scale } }) : null;
      out.push({ ...rec, items, test: "GRIM+GRIMMER", verdict: r.possible === false ? "not possible" : "possible", reason: r.reason, finding: f });
    }
  }
  return out;
}

export const sta01 = doc => scanMeans(doc).filter(r => r.finding).map(r => r.finding);

// ---------------- STA-02: p-value recomputation ----------------
export function sta02(doc) {
  const out = [];
  for (const s of doc.sentences) {
    const res = extractResults(s.text);
    if (!res.length) continue;
    const win = doc.window(s.id, 1);
    const ot = win.match(ONE_TAILED);
    const oneTailed = !!ot && !isNegated(win, ot.index);
    for (const r of res) {
      const c = checkResult({ ...r, oneTailed });
      if (c.consistent) continue;
      const shown = c.recomputed < 0.001 ? "< .001" : c.recomputed.toFixed(4);
      const hint = c.oneTailedFits ? " The reported p fits a one-tailed test; if that was intended, say so." : "";
      out.push(finding("STA-02", { severity: c.decisionError ? "major" : "minor", confidence: "medium", span: spanOf(s),
        message: c.decisionError
          ? `Decision inconsistency: '${r.raw}' — the recomputed p (${shown}) is on the other side of .05.${hint}`
          : `'${r.raw}' — recomputed p is ${shown}${["t", "z", "r"].includes(r.test) ? " (two-tailed)" : ""}, which does not round to the reported value.${hint}`,
        fix: "Recompute the test from the output and correct the statistic, the degrees of freedom or the p-value.",
        detail: { test: r.test, stat: r.stat, df1: r.df1 ?? null, df2: r.df2 ?? null, reported: `${r.op} ${r.p}`, recomputed: c.recomputed, range: c.range, tails: c.tails, decisionError: c.decisionError } }));
    }
  }
  return out;
}

// ---------------- STA-03: caliper test on reported p-values ----------------
const P_EXACT = /(?<![\w.])p\s*=\s*(\d?\.\d+)\b/g;
export function sta03(doc) {
  const ps = doc.sentences.flatMap(s => [...s.text.matchAll(P_EXACT)].map(m => Number("0" + m[1].replace(/^0/, ""))));
  if (ps.length < 15) return [];
  const c = caliper(ps);
  if (!c.testable || c.severity !== "note") return [];
  return [finding("STA-03", { severity: "note", confidence: "low", span: null,
    message: `${c.justBelow} reported p-values lie in (.04, .05] against ${c.below} in (.03, .04] (one-sided binomial p = ${c.pOneSided.toFixed(3)}). This is a signal to look at, not evidence of a problem.`,
    fix: "Check that analysis choices were fixed before the results were seen, and report exact p-values for every test.",
    detail: { pValues: ps.length, ...c } })];
}

// ---------------- STA-04: percentage columns add to 100 ----------------
const TOTAL_ROW = /^(total|all|sum|overall)\b/i;
export function sta04(doc) {
  const out = [];
  for (const t of doc.tables) {
    const ti = t.rows.findIndex((r, i) => i > 0 && TOTAL_ROW.test(r[0] || ""));
    if (ti < 2) continue;
    const width = Math.max(...t.rows.map(r => r.length));
    for (let j = 1; j < width; j++) {
      const tot = t.numbers[ti][j];
      if (tot == null || Math.abs(tot - 100) > 0.5) continue;
      const cells = t.rows.slice(1, ti).map(r => r[j]), vals = t.numbers.slice(1, ti).map(r => r[j]);
      if (vals.some(v => v == null) || vals.length < 2) continue;
      const dp = Math.max(0, ...cells.map(c => decimalsOf(String(c).replace("%", ""))));
      const sum = vals.reduce((a, b) => a + b, 0), tol = vals.length * 0.5 * Math.pow(10, -dp) + 1e-9;
      if (Math.abs(sum - 100) <= tol) continue;
      const p = doc.paragraphs.find(x => x.id === t.paragraph);
      out.push(finding("STA-04", { severity: "minor", confidence: "medium",
        span: p ? { section: p.section, start: p.start, end: p.end, text: p.text } : null,
        message: `In table ${t.id}, column '${t.rows[0][j] || j + 1}' adds to ${sum.toFixed(dp)}, not 100 (rounding allows ±${tol.toFixed(dp + 1)}).`,
        fix: "Check the cells of this column; percentages of one variable should add to 100 apart from rounding.",
        detail: { table: t.id, column: j, sum, tolerance: tol } }));
    }
  }
  return out;
}

// ---------------- STA-05: the same sample size everywhere ----------------
const UNITS = { firms: "firms", companies: "firms", enterprises: "firms", businesses: "firms", smes: "firms", establishments: "firms",
  respondents: "respondents", participants: "respondents", interviewees: "respondents", observations: "observations", "firm-years": "observations", "firm-year observations": "observations" };
const COUNT = /(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d{2,7})\s+(firm-year observations|firm-years|firms|companies|enterprises|businesses|SMEs|establishments|respondents|participants|interviewees|observations)\b/gi;
const TOTAL_CUE = /\b(final|total|full|whole|analytic(al)?|estimation|overall) sample\b|\bsample (of|comprises|consists of|includes|contains|has|covers)\b|\b(survey|data) (of|on|from)\b/i;
const FLOW = /\b(reduc\w*|remov\w*|drop\w*|exclud\w*|left|leaving|after|before|initial(ly)?|original(ly)?|contacted|invited|approached|eligible|screened|of which|of whom|among|subsample|sub-sample|subgroup|group|wave|cohort|split|treat\w*|control|only|each|per|average|mean|median)\b/i;
const N_TABLE = /\(\s*[nN]\s*=\s*(\d[\d,]*)\s+(?:in|see)\s+Table\s+\d+\s*\)/;
const isYear = s => /^\d{4}$/.test(s) && +s >= 1900 && +s <= 2100;

export function sta05(doc) {
  const claims = [];
  for (const s of doc.sentences) {
    if (FLOW.test(s.text)) continue;
    const inAbstract = s.section === "abstract";
    if (!inAbstract && !TOTAL_CUE.test(s.text)) continue;
    for (const m of s.text.matchAll(COUNT)) {
      if (isYear(m[1])) continue;
      const unit = UNITS[m[2].toLowerCase()];
      claims.push({ n: toInt(m[1]), unit, s, raw: m[0] });
      const nt = s.text.match(N_TABLE);
      if (nt) claims.push({ n: toInt(nt[1]), unit, s, raw: nt[0] });
    }
  }
  const out = [], seen = new Set();
  const byUnit = {};
  for (const c of claims) (byUnit[c.unit] ||= []).push(c);
  for (const [unit, cs] of Object.entries(byUnit)) {
    const first = cs[0];
    for (const c of cs.slice(1)) {
      if (c.n === first.n) continue;
      const k = `${unit}|${c.n}|${c.s.start}`; if (seen.has(k)) continue; seen.add(k);
      out.push(finding("STA-05", { severity: "minor", confidence: "medium", span: spanOf(c.s),
        message: `The sample is given as ${first.n.toLocaleString("en-US")} ${unit} ('${first.raw}', ${first.s.section}) and as ${c.n.toLocaleString("en-US")} ('${c.raw}', ${c.s.section}).`,
        fix: "Use one sample size throughout, or explain the difference (a sample flow or a subsample).",
        detail: { unit, values: [first.n, c.n], first: { section: first.s.section, start: first.s.start } } }));
    }
  }
  return out;
}

let financeRules = null;
/** The FIN rules of rulebook/finance.yaml. */
export function rules() { return (financeRules ||= loadRules().filter(r => r.file === "finance.yaml")); }

export async function run(doc, opts = {}) {
  const out = [...sta01(doc), ...sta02(doc), ...sta03(doc), ...sta04(doc), ...sta05(doc)];
  return opts.includeRulebook ? [...runRules(doc, rules()), ...out] : out;
}
/** Everything the finance and statistics reviewer checks: FIN rules plus STA code checks. */
export const review = (doc, opts = {}) => run(doc, { ...opts, includeRulebook: true });

export default { ROLE, run, review, rules, scanMeans, sta01, sta02, sta03, sta04, sta05 };
