// p-value recomputation (STA-02). Clean-room implementation from the method described in Nuijten et al. (2016),
// Behavior Research Methods 48(4), 1205-1226; no statcheck source code consulted or copied.
// Method notes: docs/methods/p-value-recomputation.md.
// The reported test statistic is rounded, so we recompute p over the whole rounding interval of the statistic and
// compare that p interval with the reported p (also rounded, or given as < / > a bound).
import { pt, pf, pchisq, pnorm } from "./dist.js";
import { decimalsOf } from "./grim.js";

export const ALPHA = 0.05;
const num = s => Number(String(s).replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/^(-?)\./, "$10."));

/** p-value for a test statistic. test: t | F | chi2 | z | r. tails: 2 (default) or 1 (t, z, r only). */
export function pValue(test, stat, df1, df2, tails = 2) {
  const x = Number(stat);
  switch (test) {
    case "t": { const one = pt(-Math.abs(x), df1); return tails === 1 ? one : Math.min(1, 2 * one); }
    case "z": { const one = pnorm(-Math.abs(x)); return tails === 1 ? one : Math.min(1, 2 * one); }
    case "r": {
      const r = Math.min(Math.abs(x), 1 - 1e-15), t = r * Math.sqrt(df1 / (1 - r * r));
      const one = pt(-t, df1); return tails === 1 ? one : Math.min(1, 2 * one);
    }
    case "F": return pf(x, df1, df2, false);
    case "chi2": return pchisq(x, df1, false);
    default: throw new Error(`unknown test ${test}`);
  }
}

/** Range of p for a statistic reported as a string (rounding interval of the statistic). Returns [pLo, pHi]. */
export function pRange(test, statStr, df1, df2, tails = 2) {
  const v = Math.abs(num(statStr)), h = 0.5 * Math.pow(10, -decimalsOf(String(statStr).replace(/\s+/g, "")));
  let lo = Math.max(0, v - h), hi = v + h;
  if (test === "r") hi = Math.min(hi, 1);
  return [pValue(test, hi, df1, df2, tails), pValue(test, lo, df1, df2, tails)];
}

const normOp = op => ({ "≤": "<=", "≥": ">=", "=<": "<=", "=>": ">=" })[op] || op;

/** Is a reported p (op + value string) consistent with the interval [pLo, pHi]? */
export function pConsistent(op, pStr, pLo, pHi) {
  op = normOp(op);
  const rp = num(pStr);
  if (op === "=" && rp === 0) return pLo < 0.5 * Math.pow(10, -Math.max(1, decimalsOf(pStr))); // "p = .000" read as p < .0005
  if (op === "<") return pLo < rp;
  if (op === "<=") return pLo <= rp;
  if (op === ">") return pHi > rp;
  if (op === ">=") return pHi >= rp;
  const h = 0.5 * Math.pow(10, -Math.max(1, decimalsOf(pStr)));
  return pLo <= rp + h + 1e-12 && pHi >= rp - h - 1e-12;
}

/** Significance the authors report: "sig", "ns" or null (cannot tell, e.g. p = .05 or p < .10). */
export function reportedDecision(op, pStr, alpha = ALPHA) {
  op = normOp(op); const rp = num(pStr);
  if (op === "<" || op === "<=") return rp <= alpha ? "sig" : null;
  if (op === ">" || op === ">=") return rp >= alpha ? "ns" : null;
  if (rp < alpha) return "sig";
  if (rp > alpha) return "ns";
  return null;
}

/**
 * Check one reported result. r = { test, stat, df1, df2, op, p, oneTailed }. stat and p are strings as printed.
 * Returns { recomputed, range, consistent, decisionError, tails, oneTailedFits }.
 */
export function checkResult({ test, stat, df1, df2, op, p, oneTailed = false }, alpha = ALPHA) {
  const can1 = ["t", "z", "r"].includes(test);
  const two = pRange(test, stat, df1, df2, 2);
  const one = can1 ? pRange(test, stat, df1, df2, 1) : null;
  const ok2 = pConsistent(op, p, ...two), ok1 = one ? pConsistent(op, p, ...one) : false;
  const useOne = oneTailed && can1 && ok1 && !ok2;
  const range = useOne ? one : two;
  const consistent = ok2 || (oneTailed && ok1);
  const rep = reportedDecision(op, p, alpha);
  const recSig = range[1] < alpha, recNs = range[0] >= alpha;
  const decisionError = !consistent && ((rep === "sig" && recNs) || (rep === "ns" && recSig));
  const exact = pValue(test, Math.abs(num(stat)), df1, df2, useOne ? 1 : 2);
  return { recomputed: exact, range, consistent, decisionError, tails: useOne ? 1 : 2, oneTailedFits: !ok2 && ok1 };
}

// Reported results in APA style. Each pattern captures df, statistic, comparison and p.
const P = String.raw`\s*[,;]\s*p\s*(<=|>=|=<|=>|=|<|>|≤|≥)\s*(\d?\.\d+|0|1(?:\.0+)?)\b`;
const STAT = String.raw`([-−–]?\s?\d*\.?\d+)`;
const DF = String.raw`(\d+(?:\.\d+)?)`;
export const PATTERNS = [
  { test: "t", re: new RegExp(String.raw`(?<![\w.])t\s*\(\s*${DF}\s*\)\s*=\s*${STAT}${P}`, "g"), map: m => ({ df1: +m[1], stat: m[2], op: m[3], p: m[4] }) },
  { test: "F", re: new RegExp(String.raw`(?<![\w.])F\s*\(\s*${DF}\s*,\s*${DF}\s*\)\s*=\s*${STAT}${P}`, "g"), map: m => ({ df1: +m[1], df2: +m[2], stat: m[3], op: m[4], p: m[5] }) },
  { test: "chi2", re: new RegExp(String.raw`(?:χ\s?2|χ²|χ\^2|[Cc]hi-?squared?|[Cc]hi2|X2)\s*\(\s*(\d+)(?:\s*,\s*[Nn]\s*=\s*[\d,]+)?\s*\)\s*=\s*${STAT}${P}`, "g"), map: m => ({ df1: +m[1], stat: m[2], op: m[3], p: m[4] }) },
  { test: "z", re: new RegExp(String.raw`(?<![\w.])[zZ]\s*=\s*${STAT}${P}`, "g"), map: m => ({ stat: m[1], op: m[2], p: m[3] }) },
  { test: "r", re: new RegExp(String.raw`(?<![\w.])r\s*\(\s*(\d+)\s*\)\s*=\s*${STAT}${P}`, "g"), map: m => ({ df1: +m[1], stat: m[2], op: m[3], p: m[4] }) },
];

/** Find reported results in a text. Returns [{ test, df1, df2, stat, op, p, index, length, raw }]. */
export function extractResults(text) {
  const out = [];
  for (const pt_ of PATTERNS) for (const m of String(text).matchAll(pt_.re)) out.push({ test: pt_.test, df2: null, ...pt_.map(m), index: m.index, length: m[0].length, raw: m[0] });
  return out.sort((a, b) => a.index - b.index);
}

export const ONE_TAILED = /\b(one[- ](tailed|sided)|directional (test|hypothes[ie]s))\b/i;

/** Recompute every result in a text. opts.oneTailed forces the one-tailed reading for all results. */
export function recompute(text, opts = {}) {
  const oneTailed = opts.oneTailed ?? ONE_TAILED.test(String(text));
  return extractResults(text).map(r => ({ ...r, ...checkResult({ ...r, oneTailed }, opts.alpha ?? ALPHA) }));
}

export default { pValue, pRange, pConsistent, reportedDecision, checkResult, extractResults, recompute, PATTERNS, ONE_TAILED, ALPHA };
