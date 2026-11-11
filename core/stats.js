// Statistical reporting checks for the Q1 engine.
// statcheck-style recomputation of p-values (t, F, r, chi-square, z), regression-table consistency
// (coefficient / SE / t / p / stars), impossible values, and software-output fingerprints.
// These are consistency and plausibility checks. They cannot prove who or what produced a number.
const Stats = (() => {
  // ---- special functions ----
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularized incomplete beta I_x(a,b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function gammaP(a, x) { // regularized lower incomplete gamma
    if (x <= 0) return 0;
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const normSF = z => { // upper tail of the standard normal
    const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? p : 1 - p;
  };
  const pT = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);           // two-sided
  const pF = (F, d1, d2) => ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);     // upper tail
  const pChi = (x, df) => 1 - gammaP(df / 2, x / 2);
  const pZ = z => 2 * normSF(Math.abs(z));
  const pR = (r, df) => { const t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r)); return pT(t, df); };

  // ---- helpers ----
  const num = s => parseFloat(String(s).replace(/[−–]/g, "-").replace(/^(-?)\./, "$10."));
  const decimals = s => { const m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; };
  function range(valStr) { const v = num(valStr), h = 0.5 * Math.pow(10, -decimals(valStr)); return [v - h, v + h]; }
  function pOk(op, reported, pLo, pHi) {
    // pLo..pHi is the range of recomputed p given rounding of the test statistic
    const rp = num(reported), dec = Math.max(decimals(reported), 1), half = 0.5 * Math.pow(10, -dec);
    if (op === "<") return pLo < rp;
    if (op === ">") return pHi > rp;
    return pHi >= rp - half && pLo <= rp + half;
  }
  const sig = (op, p, a = 0.05) => op === "<" ? p <= a : op === ">" ? false : p < a;

  // ---- 1. statcheck-style APA results ----
  function apaResults(text) {
    const out = [], T = text.replace(/\s+/g, " ");
    const P = "p\\s*([<>=≤≥])\\s*(\\d?\\.\\d+|1(?:\\.0+)?|0)";
    const pats = [
      { k: "t", re: new RegExp("\\bt\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*([−–-]?\\d*\\.?\\d+)\\s*,\\s*" + P, "gi"), p: m => { const [lo, hi] = range(Math.abs(num(m[2])).toString().length ? m[2].replace(/[−–-]/, "") : m[2]); return [pT(hi, +m[1]), pT(lo, +m[1])]; } },
      { k: "F", re: new RegExp("\\bF\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*\\)\\s*=\\s*(\\d*\\.?\\d+)\\s*,\\s*" + P, "gi"), p: m => { const [lo, hi] = range(m[3]); return [pF(hi, +m[1], +m[2]), pF(Math.max(lo, 0), +m[1], +m[2])]; }, off: 1 },
      { k: "r", re: new RegExp("\\br\\s*\\(\\s*(\\d+)\\s*\\)\\s*=\\s*([−–-]?\\d*\\.\\d+)\\s*,\\s*" + P, "gi"), p: m => { const [lo, hi] = range(m[2].replace(/[−–-]/, "")); return [pR(Math.min(hi, 0.99999), +m[1]), pR(Math.max(lo, 0), +m[1])]; } },
      { k: "χ²", re: new RegExp("(?:χ2|χ²|chi-?square|chi2|x2)\\s*\\(\\s*(\\d+)(?:\\s*,\\s*N\\s*=\\s*\\d+)?\\s*\\)\\s*=\\s*(\\d*\\.?\\d+)\\s*,\\s*" + P, "gi"), p: m => { const [lo, hi] = range(m[2]); return [pChi(hi, +m[1]), pChi(Math.max(lo, 0), +m[1])]; } },
      { k: "z", re: new RegExp("\\bz\\s*=\\s*([−–-]?\\d*\\.?\\d+)\\s*,\\s*" + P, "gi"), p: m => { const [lo, hi] = range(m[1].replace(/[−–-]/, "")); return [pZ(hi), pZ(Math.max(lo, 0))]; }, nodf: true }
    ];
    for (const pt of pats) {
      let m; while ((m = pt.re.exec(T))) {
        const opI = pt.nodf ? 2 : pt.k === "F" ? 4 : 3, op = m[opI].replace("≤", "<").replace("≥", ">"), rp = m[opI + 1];
        const [pLo, pHi] = pt.p(m);
        const ok = pOk(op, rp, pLo, pHi), rNum = num(rp);
        const repSig = op === "<" ? rNum <= 0.05 : op === "=" ? rNum < 0.05 : false, recSig = (pLo + pHi) / 2 < 0.05;
        const item = { test: pt.k, text: m[0], reported: op + " " + rp, recomputed: fmtP((pLo + pHi) / 2), ok };
        if (!ok) { item.severity = repSig !== recSig && op !== ">" ? "high" : "med"; item.problem = repSig !== recSig && op !== ">" ? "Decision error: the reported p-value and the recomputed one fall on different sides of .05." : "The reported p-value does not match the test statistic and degrees of freedom."; }
        if (op === "=" && rNum === 0) { item.ok = false; item.severity = "low"; item.problem = "p = .000 is impossible; report p < .001."; }
        out.push(item);
      }
    }
    return out;
  }
  const fmtP = p => p < 0.001 ? "< .001" : "= " + p.toFixed(3).replace(/^0/, "");

  // ---- 2. coefficient / SE / t / p consistency in text ----
  function coefChecks(text) {
    const out = [], T = text.replace(/\s+/g, " ");
    const re = /(?<![A-Za-z])(?:β|b|B|coef(?:ficient)?|estimate)\s*=\s*([−–-]?\d*\.\d+)\s*,\s*(?:SE|s\.e\.|std\.? err(?:or)?)\s*=\s*(\d*\.\d+)(?:\s*,\s*t\s*=\s*([−–-]?\d*\.?\d+))?(?:\s*,\s*p\s*([<>=])\s*(\d?\.\d+))?/gi;
    let m; while ((m = re.exec(T))) {
      const b = num(m[1]), se = num(m[2]); if (se <= 0) { out.push({ text: m[0], ok: false, severity: "high", problem: "A standard error cannot be zero or negative." }); continue; }
      const z = Math.abs(b / se), p = pZ(z), item = { text: m[0], computedT: z.toFixed(2), computedP: fmtP(p), ok: true };
      if (m[3]) { const t = Math.abs(num(m[3])), [lo, hi] = range(m[3].replace(/[−–-]/, "")), zl = Math.abs(range(m[1].replace(/[−–-]/, ""))[0] / range(m[2])[1]), zh = Math.abs(range(m[1].replace(/[−–-]/, ""))[1] / range(m[2])[0]); if (hi < zl - 0.01 || lo > zh + 0.01) { item.ok = false; item.severity = "high"; item.problem = `t = ${m[3]} does not equal coefficient / SE (about ${z.toFixed(2)}).`; } void t; }
      if (m[4] && m[5]) { const plo = pZ(Math.abs(range(m[1].replace(/[−–-]/, ""))[1] / range(m[2])[0])), phi = pZ(Math.abs(range(m[1].replace(/[−–-]/, ""))[0] / range(m[2])[1])); if (!pOk(m[4], m[5], plo, phi)) { item.ok = false; item.severity = item.severity || "med"; item.problem = (item.problem ? item.problem + " " : "") + `Reported p ${m[4]} ${m[5]} but coefficient / SE gives p ${fmtP(p)} (large-sample).`; } }
      out.push(item);
    }
    return out;
  }

  // ---- 3. regression tables: "0.214*** (0.051)" cells ----
  function tableCells(text) {
    const out = [], re = /([−–-]?\d*\.\d+)\s*(\*{0,3})\s*[\[(]\s*(\d*\.\d+)\s*[\])]/g; let m; const T = text.replace(/\s+/g, " ");
    while ((m = re.exec(T))) {
      const b = Math.abs(num(m[1])), se = num(m[3]); if (!se) continue;
      const z = b / se, p = pZ(z), stars = m[2].length;
      const exp = conv => conv.filter(c => p < c).length; // number of stars a convention would give
      const econ = exp([0.1, 0.05, 0.01]), psych = exp([0.05, 0.01, 0.001]);
      const ok = stars === econ || stars === psych || (stars === 0 && m[2] === "" && econ === 0);
      const item = { text: m[0], z: z.toFixed(2), p: fmtP(p), stars, ok };
      if (!ok && m[2] !== "") { item.severity = "med"; item.problem = `${stars} star(s), but coefficient / SE = ${z.toFixed(2)} (p ${fmtP(p)}) would give ${econ} under the 10/5/1% convention and ${psych} under 5/1/0.1%.`; }
      if (m[2] === "") item.ok = true; // no stars to check
      out.push(item);
    }
    return out;
  }

  // ---- 4. impossible or implausible values ----
  function impossible(text) {
    const out = [], T = text.replace(/\s+/g, " "); let m;
    const add = (t, sev, problem) => out.push({ text: t, ok: false, severity: sev, problem });
    const r2 = /\b(adj(?:usted)?\.?\s*)?R(?:2|²|-squared)\s*=\s*([−–-]?\d*\.?\d+)/gi; const r2v = [];
    while ((m = r2.exec(T))) { const v = num(m[2]); r2v.push({ adj: !!m[1], v, t: m[0] }); if (v > 1 || (v < 0 && !m[1])) add(m[0], "high", "R² must lie between 0 and 1."); }
    for (let i = 1; i < r2v.length; i++) if (r2v[i].adj && !r2v[i - 1].adj && r2v[i].v > r2v[i - 1].v + 1e-9) add(r2v[i].t, "high", "Adjusted R² is larger than R²; that is impossible with positive predictors.");
    const pv = /\bp\s*=\s*(\d*\.?\d+)/gi; while ((m = pv.exec(T))) { const v = num(m[1]); if (v > 1) add(m[0], "high", "A p-value cannot exceed 1."); else if (v === 0) add(m[0], "low", "p = .000 is not a real value; report p < .001."); }
    const rr = /\br\s*=\s*([−–-]?\d*\.?\d+)/g; while ((m = rr.exec(T))) { const v = Math.abs(num(m[1])); if (v > 1) add(m[0], "high", "A correlation cannot exceed 1 in absolute value."); }
    const al = /(?:cronbach'?s?\s*)?(?:alpha|α)\s*=\s*(\d*\.?\d+)/gi; while ((m = al.exec(T))) { const v = num(m[1]); if (v > 1) add(m[0], "high", "Cronbach's alpha cannot exceed 1."); }
    const ave = /\bAVE\s*=\s*(\d*\.?\d+)/g; while ((m = ave.exec(T))) { const v = num(m[1]); if (v > 1) add(m[0], "high", "AVE cannot exceed 1."); else if (v < 0.5) add(m[0], "low", "AVE below 0.50: convergent validity is usually considered inadequate."); }
    const ns = [...new Set((T.match(/\b[Nn]\s*=\s*(\d[\d,]*)/g) || []).map(x => x.replace(/\D/g, "")))];
    if (ns.length > 3) out.push({ text: "N = " + ns.slice(0, 6).join(", "), ok: false, info: true, severity: "info", problem: `${ns.length} different sample sizes are reported. Check that each table states which sample it uses and why N changes.` });
    return out;
  }

  // ---- 5. distribution signals across all reported p-values ----
  function pSignals(text) {
    const ps = (text.match(/\bp\s*=\s*(\d?\.\d+)/gi) || []).map(x => num(x.split("=")[1])).filter(v => v > 0 && v < 1);
    const out = []; if (ps.length < 8) return { n: ps.length, out };
    const justBelow = ps.filter(p => p >= 0.04 && p < 0.05).length, below = ps.filter(p => p < 0.05).length;
    if (below >= 6 && justBelow / below > 0.4) out.push({ ok: false, severity: "med", text: `${justBelow} of ${below} significant p-values lie between .04 and .05`, problem: "An unusual cluster just below .05. Reviewers read this as a sign of selective reporting; report exact values and robustness checks." });
    return { n: ps.length, out };
  }
  function lastDigits(text) {
    // terminal-digit uniformity over many reported decimals (fabricated numbers often fail it)
    const ds = [...new Set(text.match(/\d\.\d{2,}/g) || [])].map(x => +x[x.length - 1]); // unique values: a number repeated in text and table counts once
    if (ds.length < 60) return null;
    const f = Array(10).fill(0); ds.forEach(d => f[d]++); const e = ds.length / 10;
    const chi = f.reduce((a, o) => a + (o - e) ** 2 / e, 0), p = pChi(chi, 9);
    return { n: ds.length, chi: +chi.toFixed(2), p: +p.toFixed(4), ok: p >= 0.01, problem: p < 0.01 ? `Last digits of ${ds.length} reported decimals are not uniform (χ²(9) = ${chi.toFixed(2)}, p = ${p.toFixed(4)}). Genuine software output usually passes this test; check that numbers were copied from the output, not typed or generated.` : "" };
  }

  // ---- 6. software fingerprints ----
  const FP = [
    { sw: "Stata", re: /Number of obs\s*=|Prob\s*>\s*F\s*=|_cons\b|Robust Std\. Err\.|Root MSE|xtreg|reghdfe|\[95% Conf\. Interval\]/i },
    { sw: "R", re: /Residual standard error:|Multiple R-squared|Signif\. codes|\(Intercept\)|Pr\(>\|t\|\)|Estimate\s+Std\. Error\s+t value/i },
    { sw: "SPSS", re: /Unstandardized Coefficients|Standardized Coefficients|Model Summary|\bSig\.\b|Collinearity Statistics/i },
    { sw: "EViews", re: /Method: Least Squares|Included observations:|Prob\(F-statistic\)|Durbin-Watson stat/i },
    { sw: "Python statsmodels", re: /OLS Regression Results|Dep\. Variable:|No\. Observations:|Omnibus:|Jarque-Bera \(JB\):/i },
    { sw: "SmartPLS", re: /Original Sample \(O\)|T Statistics \(\|O\/STDEV\|\)|Sample Mean \(M\)/i },
    { sw: "AMOS / Mplus", re: /Estimate\s+S\.E\.\s+C\.R\.|Est\.\/S\.E\.|MODEL FIT INFORMATION/i }
  ];
  function software(text) { return FP.filter(f => f.re.test(text)).map(f => f.sw); }


  // ---- 7. percentages written as "x of y (z%)" ----
  function shares(text) {
    const out = [], T = text.replace(/\s+/g, " "), n = v => parseFloat(String(v).replace(/,/g, ""));
    const re = /\b(\d[\d,]*)\s+(?:of|out of)\s+(?:the\s+)?(\d[\d,]*)\b[^().%]{0,60}?\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/g; let m;
    while ((m = re.exec(T))) {
      const a = n(m[1]), b = n(m[2]), rep = +m[3]; if (!b || a > b) continue;
      const calc = 100 * a / b, d = decimals(m[3]), tol = 0.5 * Math.pow(10, -d) + 1e-9;
      const item = { text: m[0], computed: calc.toFixed(Math.max(d, 1)) + "%", ok: Math.abs(calc - rep) <= tol };
      if (!item.ok) { item.severity = Math.abs(calc - rep) > 1 ? "high" : "med"; item.problem = `${m[1]} of ${m[2]} is ${calc.toFixed(Math.max(d, 1))}%, not ${m[3]}%.`; }
      out.push(item);
    }
    return out;
  }
  // ---- 8. estimate with a 95% CI and a reported p ----
  function ciP(text) {
    const out = [], T = text.replace(/\s+/g, " ").replace(/[−–]/g, "-");
    const re = /([+-]?\d*\.?\d+)\s*(?:pp|percentage points)?\s*\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\][^.;]{0,40}?\(\s*p\s*([<=>])\s*(\d?\.\d+)\s*[;)]/g; let m;
    while ((m = re.exec(T))) {
      const est = +m[1], lo = +m[2], hi = +m[3]; if (!(hi > lo)) continue;
      const se = (hi - lo) / 3.92, z = Math.abs(est) / se, p = pZ(z), mid = (lo + hi) / 2;
      const item = { text: m[0], computedP: fmtP(p), ok: true };
      const rp = +m[5], half = 0.5 * Math.pow(10, -Math.max(decimals(m[5]), 1));
      const tolP = Math.max(half, 0.15 * p); // CI bounds are rounded, so allow some slack
      if (m[4] === "=" && Math.abs(p - rp) > tolP + half) { item.ok = false; item.severity = (p < 0.05) !== (rp < 0.05) ? "high" : "med"; item.problem = `The 95% CI [${m[2]}, ${m[3]}] implies p ≈ ${p.toFixed(3)}, but p = ${m[5]} is reported.`; }
      if (m[4] === "<" && p > rp * 1.2) { item.ok = false; item.severity = "med"; item.problem = `The 95% CI implies p ≈ ${p.toFixed(3)}, not p < ${m[5]}.`; }
      if (Math.abs(mid - est) > Math.max(0.15 * (hi - lo), 0.02)) { item.note = "Interval is not centred on the estimate (asymmetric CI): p check is approximate."; if (!item.ok) item.severity = "low"; }
      out.push(item);
    }
    return out;
  }
  function checkAll(text, opts = {}) {
    const sh = shares(text), cip = ciP(text), apa = apaResults(text), coef = coefChecks(text), cells = tableCells(text), imp = impossible(text), ps = pSignals(text), ld = opts.rawData ? lastDigits(text) : null, sw = software(text);
    const info = imp.filter(x => x.info); const problems = [...apa, ...coef, ...cells, ...imp.filter(x => !x.info), ...sh, ...cip, ...ps.out].filter(x => !x.ok);
    if (ld && !ld.ok) problems.push({ text: "last-digit test", ok: false, severity: "low", problem: ld.problem + " This is a screening signal only: rounding conventions and derived numbers (CIs, shares) can also break uniformity." });
    return {
      summary: { shares: sh.length, ciPairs: cip.length, apaResults: apa.length, coefficientStatements: coef.length, tableCells: cells.length, pValues: ps.n, problems: problems.length, software: sw },
      apa, coef, cells, shares: sh, ciP: cip, impossible: imp.filter(x => !x.info), info, lastDigitsNote: opts.rawData ? undefined : "Last-digit test not applied: it is meaningful only for raw data or long output columns, not for rounded reported results.", lastDigits: ld, problems,
      note: "These checks test internal consistency and plausibility. They can show that numbers do not fit together or look atypical for software output; they cannot prove whether a number came from R, Stata, a person or an AI. Recomputed p-values assume two-sided tests and, for coefficient/SE, a large-sample normal approximation."
    };
  }
  return { checkAll, shares, ciP, apaResults, coefChecks, tableCells, impossible, software, lastDigits, pT, pF, pChi, pZ, pR };
})();
if (typeof module !== "undefined") module.exports = Stats;
