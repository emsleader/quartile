// Probability distributions for the statistics checks, written from the standard formulas
// (Lanczos log-gamma, continued fractions for the incomplete beta and gamma functions).
// Function names and arguments follow base R (pt, pf, pchisq, pnorm, pbinom) so the validation scripts in
// tests/validation/ can compare them one to one.

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** log Gamma(x) for x > 0 (Lanczos, g = 7). */
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const TINY = 1e-300, EPS = 1e-16, MAXIT = 2000;

// continued fraction for the incomplete beta function (modified Lentz)
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return Math.exp(lbt) * betacf(a, b, x) / a;
  return 1 - Math.exp(lbt) * betacf(b, a, 1 - x) / b;
}
/** Upper tail 1 - I_x(a, b), computed without cancellation where possible. */
export function ibetac(x, a, b) {
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return 1 - Math.exp(lbt) * betacf(a, b, x) / a;
  return Math.exp(lbt) * betacf(b, a, 1 - x) / b;
}

/** Regularised lower and upper incomplete gamma P(a, x), Q(a, x). */
export function gammainc(a, x) {
  if (x <= 0) return { P: 0, Q: 1 };
  const lpre = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < MAXIT; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * EPS) break; }
    const P = sum * Math.exp(lpre);
    return { P, Q: 1 - P };
  }
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i <= MAXIT; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  const Q = Math.exp(lpre) * h;
  return { P: 1 - Q, Q };
}

/** Student t distribution function, as R's pt(q, df, lower.tail). */
export function pt(q, df, lowerTail = true) {
  if (!(df > 0)) return NaN;
  if (q === Infinity) return lowerTail ? 1 : 0;
  if (q === -Infinity) return lowerTail ? 0 : 1;
  const tail = 0.5 * ibeta(df / (df + q * q), df / 2, 0.5); // P(T > |q|)
  if (q >= 0) return lowerTail ? 1 - tail : tail;
  return lowerTail ? tail : 1 - tail;
}
/** F distribution function, as R's pf(q, df1, df2, lower.tail). */
export function pf(q, df1, df2, lowerTail = true) {
  if (q <= 0) return lowerTail ? 0 : 1;
  const x = df1 * q / (df1 * q + df2);
  return lowerTail ? ibeta(x, df1 / 2, df2 / 2) : ibetac(x, df1 / 2, df2 / 2);
}
/** Chi-square distribution function, as R's pchisq(q, df, lower.tail). */
export function pchisq(q, df, lowerTail = true) {
  if (q <= 0) return lowerTail ? 0 : 1;
  const g = gammainc(df / 2, q / 2);
  return lowerTail ? g.P : g.Q;
}
/** Standard normal distribution function, as R's pnorm(q, 0, 1, lower.tail). */
export function pnorm(q, lowerTail = true) {
  if (q === 0) return 0.5;
  const g = gammainc(0.5, q * q / 2); // P(|Z| > |q|) = Q(1/2, q^2/2)
  const small = 0.5 * g.Q;
  if (q > 0) return lowerTail ? 1 - small : small;
  return lowerTail ? small : 1 - small;
}
/** Binomial distribution function P(X <= k), as R's pbinom(k, n, p, lower.tail). */
export function pbinom(k, n, p, lowerTail = true) {
  k = Math.floor(k);
  if (k < 0) return lowerTail ? 0 : 1;
  if (k >= n) return lowerTail ? 1 : 0;
  // P(X <= k) = I_{1-p}(n - k, k + 1)
  return lowerTail ? ibeta(1 - p, n - k, k + 1) : ibeta(p, k + 1, n - k);
}

export default { lgamma, ibeta, ibetac, gammainc, pt, pf, pchisq, pnorm, pbinom };
