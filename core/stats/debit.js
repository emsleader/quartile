// DEBIT (Heathers & Brown, 2019, OSF Preprints, doi:10.17605/osf.io/pm825): for binary (0/1) data the SD follows
// from the mean and n, so a reported mean and SD can be checked together. Method notes:
// docs/methods/grim-grimmer-debit.md.
import { decimalsOf } from "./grim.js";

const TOL = 1e-9;
const toNum = v => Number(String(v).trim().replace(/[−–]/g, "-").replace(/^(-?)\./, "$10."));

/** SD of binary data with k ones out of n: sample (n - 1) or population (n) formula. */
export function binarySd(k, n, type = "sample") {
  const p = k / n, v = p * (1 - p);
  return Math.sqrt(type === "population" ? v : v * n / (n - 1));
}

/**
 * Is a reported mean (a proportion) and SD possible for n binary values?
 * sdType: "sample" (R's sd()), "population", or "either" (passes when one of the two fits).
 * Returns { possible, matches: [{ k, mean, sd, type }], testable, reason }.
 */
export function debit(mean, sd, n, { dpMean, dpSd, sdType = "sample" } = {}) {
  const dM = dpMean ?? (typeof mean === "string" ? decimalsOf(mean) : 2), dS = dpSd ?? (typeof sd === "string" ? decimalsOf(sd) : 2);
  const M = toNum(mean), S = toNum(sd), N = Number(n);
  if (!(N >= 2) || !(M >= 0 && M <= 1) || !(S >= 0)) return { possible: null, testable: false, matches: [], reason: "Needs n >= 2, a mean between 0 and 1 and an SD that is not negative." };
  const hM = 0.5 * Math.pow(10, -dM), hS = 0.5 * Math.pow(10, -dS);
  const types = sdType === "either" ? ["sample", "population"] : [sdType];
  const matches = [];
  for (let k = 0; k <= N; k++) {
    const m = k / N;
    if (Math.abs(m - M) > hM + TOL) continue;
    for (const t of types) { const s = binarySd(k, N, t); if (Math.abs(s - S) <= hS + TOL) matches.push({ k, mean: m, sd: s, type: t }); }
  }
  return { possible: matches.length > 0, testable: true, matches,
    reason: matches.length ? `${matches[0].k} of ${N} ones give this mean and SD.` : "No count of ones out of n gives both the reported mean and the reported SD." };
}

export default { debit, binarySd };
