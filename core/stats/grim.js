// GRIM test (Brown & Heathers, 2017; specification 7.2). Method notes: docs/methods/grim-grimmer-debit.md.
// A mean of integer data from n cases (each the sum or mean of `items` integer items) must equal k / (n * items)
// for some integer k. The reported mean is rounded to `dp` decimals, so we accept every k whose exact mean lies
// within half a unit of the last reported digit (both ends included, so either rounding rule at a tie passes).

/** Number of decimals in a reported value given as a string ("3.40" -> 2). */
export function decimalsOf(v) {
  const m = String(v).trim().match(/\.(\d+)/);
  return m ? m[1].length : 0;
}
const toNum = v => Number(String(v).trim().replace(/[−–]/g, "-").replace(/^(-?)\./, "$10."));
const TOL = 1e-9;

/**
 * Is a mean reported to `dp` decimals possible with n cases answering `items` integer items?
 * Returns { possible, nearest, testable, granularity, candidates }.
 * Valid for integer responses only (Likert items, counts). Not for continuous data.
 */
export function grim(mean, n, { dp, items = 1 } = {}) {
  const d = dp ?? (typeof mean === "string" ? decimalsOf(mean) : 2);
  const target = toNum(mean), denom = Number(n) * Number(items);
  if (!(denom > 0) || !Number.isFinite(target)) return { possible: null, nearest: null, testable: false, granularity: null, candidates: [] };
  const half = 0.5 * Math.pow(10, -d);
  const lo = Math.ceil((target - half) * denom - TOL), hi = Math.floor((target + half) * denom + TOL);
  const candidates = [];
  for (let sum = lo; sum <= hi; sum++) {
    const m = sum / denom;
    if (Math.abs(m - target) <= half + TOL) candidates.push(sum);
  }
  const possible = candidates.length > 0;
  const nearestSum = Math.round(target * denom);
  return { possible, nearest: possible ? candidates[0] / denom : nearestSum / denom, testable: grimTestable(n, d, items),
    granularity: 1 / denom, candidates };
}

// GRIM only has power when n * items < 10^dp; report "not testable" otherwise.
export const grimTestable = (n, dp = 2, items = 1) => Number(n) * Number(items) < Math.pow(10, dp);

/** Verdict in words for tools: "possible", "not possible" or "not testable". */
export function grimVerdict(mean, n, opts = {}) {
  const d = opts.dp ?? (typeof mean === "string" ? decimalsOf(mean) : 2), items = opts.items ?? 1;
  if (!grimTestable(n, d, items)) return { verdict: "not testable", reason: `n × items = ${n * items} is not below 10^${d}; every mean is possible at ${d} decimals.` };
  const r = grim(mean, n, { dp: d, items });
  return { verdict: r.possible ? "possible" : "not possible", nearest: r.nearest, granularity: r.granularity,
    reason: r.possible ? `${r.candidates[0]} / ${n * items} rounds to ${mean}.` : `No integer total divided by ${n * items} rounds to ${mean}; the nearest possible mean is ${r.nearest.toFixed(d + 2)}.` };
}

export default { grim, grimTestable, grimVerdict, decimalsOf };
