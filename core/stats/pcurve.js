// p-value clustering (STA-03; specification 7.3): a simple caliper test, reported as a note only.
// Compares the count of p in (0.04, 0.05] with the count in (0.03, 0.04]. Clustering is a signal to check,
// never proof of anything.
import { pbinom } from "./dist.js";

/** Exact one-sided binomial test of a (just below .05) vs b under p = 0.5. */
export function caliper(pvalues) {
  const ps = (pvalues || []).map(Number).filter(p => Number.isFinite(p));
  const a = ps.filter(p => p > 0.040 && p <= 0.050).length;
  const b = ps.filter(p => p > 0.030 && p <= 0.040).length;
  if (a + b < 10) return { testable: false, justBelow: a, below: b };
  const N = a + b;
  const tail = a === 0 ? 1 : pbinom(a - 1, N, 0.5, false); // P(X >= a)
  return { testable: true, justBelow: a, below: b, pOneSided: tail, severity: tail < 0.05 ? "note" : null };
}

export default { caliper };
