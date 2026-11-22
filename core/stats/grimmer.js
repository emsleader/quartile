// GRIMMER test (Anaya, 2016, PeerJ Preprints 4:e2400v1): is a reported SD possible for integer data, given the
// mean and n? Method notes: docs/methods/grim-grimmer-debit.md. Two versions:
//   grimmer()       quick necessary conditions (GRIM on the mean, a whole-number sum of squares, and the parity
//                   rule: for integers, the sum of squares and the sum are both even or both odd). "possible"
//                   means "not ruled out"; "not possible" is certain.
//   grimmerExact()  exact search over every data set on a bounded integer scale (min..max). Slower; used when the
//                   scale is known and n is small enough.
import { grim, decimalsOf } from "./grim.js";

const TOL = 1e-9;
const toNum = v => Number(String(v).trim().replace(/[−–]/g, "-").replace(/^(-?)\./, "$10."));
function setup(mean, sd, n, o) {
  const dpMean = o.dpMean ?? (typeof mean === "string" ? decimalsOf(mean) : 2);
  const dpSd = o.dpSd ?? (typeof sd === "string" ? decimalsOf(sd) : 2);
  const k = Number(o.items ?? 1);
  // work on case totals y = k * x, which are integers
  const M = toNum(mean) * k, S = toNum(sd) * k, hM = 0.5 * Math.pow(10, -dpMean) * k, hS = 0.5 * Math.pow(10, -dpSd) * k;
  return { dpMean, dpSd, k, M, S, hM, hS, n: Number(n) };
}

/** Necessary-condition GRIMMER test. Returns { possible, reason, sums, testable }. */
export function grimmer(mean, sd, n, opts = {}) {
  const { dpMean, k, S, hS, n: N } = setup(mean, sd, n, opts);
  if (!(N >= 2) || !(S >= 0)) return { possible: null, testable: false, reason: "n must be at least 2 and SD not negative." };
  const g = grim(mean, N, { dp: dpMean, items: k });
  if (!g.possible) return { possible: false, testable: true, reason: "The mean fails GRIM, so no SD can be consistent.", sums: [] };
  const sdLo = Math.max(0, S - hS), sdHi = S + hS, sums = [];
  for (const sum of g.candidates) {
    // sum of squares Q = (n - 1) * sd^2 + sum^2 / n must be a whole number with the same parity as the sum
    const qLo = (N - 1) * sdLo * sdLo + sum * sum / N, qHi = (N - 1) * sdHi * sdHi + sum * sum / N;
    let q = Math.ceil(qLo - TOL);
    if (((q - sum) % 2 + 2) % 2 !== 0) q += 1;
    if (q <= qHi + TOL) sums.push({ sum, sumSq: q });
  }
  return { possible: sums.length > 0, testable: true, sums,
    reason: sums.length ? "A whole-number sum of squares with the right parity exists (necessary conditions met)." : "No whole-number sum of squares with the parity of the sum fits the reported SD." };
}

/**
 * Exact test on a bounded integer scale: does any data set of n values in min..max (per item total k*min..k*max)
 * give a mean and SD that round to the reported ones? Returns { possible, exact, reason }.
 * maxWork caps the search (cells x steps); above it the result is { possible: null, exact: false }.
 */
export function grimmerExact(mean, sd, n, opts = {}) {
  const { k, M, S, hM, hS, n: N } = setup(mean, sd, n, opts);
  const lo = Math.round(Number(opts.min) * k), hi = Math.round(Number(opts.max) * k);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return { possible: null, exact: false, reason: "Scale bounds min < max are needed." };
  if (!(N >= 2)) return { possible: null, exact: false, reason: "n must be at least 2." };
  const K = hi - lo; // shifted values 0..K; SD is shift invariant, mean shifts by lo
  const sMax = N * K, qMax = N * K * K, cells = (sMax + 1) * (qMax + 1);
  const maxWork = opts.maxWork ?? 3e8;
  if (cells * N * (K + 1) > maxWork) return { possible: null, exact: false, reason: "Too many possible data sets for the exact search; use grimmer()." };
  const W = qMax + 1;
  let cur = new Uint8Array(cells); cur[0] = 1;
  for (let m = 1; m <= N; m++) {
    const nxt = new Uint8Array(cells), sLim = (m - 1) * K, qLim = (m - 1) * K * K;
    for (let s = 0; s <= sLim; s++) {
      const row = s * W;
      for (let q = 0; q <= qLim; q++) {
        if (!cur[row + q]) continue;
        for (let v = 0; v <= K; v++) nxt[(s + v) * W + q + v * v] = 1;
      }
    }
    cur = nxt;
  }
  const mShift = M - lo;
  for (let s = 0; s <= sMax; s++) {
    const m = s / N;
    if (Math.abs(m - mShift) > hM + TOL) continue;
    const row = s * W;
    for (let q = 0; q <= qMax; q++) {
      if (!cur[row + q]) continue;
      const v = (q - s * s / N) / (N - 1), sdv = Math.sqrt(Math.max(0, v));
      if (Math.abs(sdv - S) <= hS + TOL) return { possible: true, exact: true, reason: `At least one data set on this scale (total ${s + N * lo}) gives this mean and SD.` };
    }
  }
  return { possible: false, exact: true, reason: "No data set on this scale gives this mean and SD." };
}

export default { grimmer, grimmerExact };
