// SPSS-style statistics run in R. Node writes the data and a generated script to a private temporary folder,
// runs Rscript, and returns the results, APA-style sentences, the exact script and a reproducibility record
// (SHA-256 of the data and the script, R and package versions). Only fixed procedures are offered: no
// user-supplied R code runs unless QUARTILE_ALLOW_R_CODE=1 (local installs).
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const { execFile } = require("child_process");
const LIB = path.join(__dirname, "rstats.R");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const rs = s => JSON.stringify(String(s)); // a JSON string literal is a valid R string literal
const rv = a => "c(" + a.map(rs).join(", ") + ")";

const PROCS = {
  descriptives: { need: ["variables"], call: a => `q_descriptives(d, ${rv(a.variables)})` },
  frequencies: { need: ["variable"], call: a => `q_frequencies(d, ${rs(a.variable)})` },
  crosstab: { need: ["row", "column"], call: a => `q_crosstab(d, ${rs(a.row)}, ${rs(a.column)})` },
  ttest: { need: ["variable"], call: a => `q_ttest(d, ${rs(a.variable)}, ${a.group ? rs(a.group) : "NULL"}, ${a.paired_with ? rs(a.paired_with) : "NULL"}, ${Number(a.mu) || 0})` },
  anova: { need: ["variable", "group"], call: a => `q_anova(d, ${rs(a.variable)}, ${rs(a.group)})` },
  correlation: { need: ["variables"], call: a => `q_correlation(d, ${rv(a.variables)}, ${rs(a.method === "spearman" ? "spearman" : a.method === "kendall" ? "kendall" : "pearson")})` },
  regression: { need: ["dependent", "independents"], call: a => `q_regression(d, ${rs(a.dependent)}, ${rv(a.independents)}, ${a.robust ? "TRUE" : "FALSE"}, ${a.cluster ? rs(a.cluster) : "NULL"}, ${a.fixed_effects && a.fixed_effects.length ? rv(a.fixed_effects) : "NULL"}, ${a.weights ? rs(a.weights) : "NULL"}, ${a.factors && a.factors.length ? rv(a.factors) : "NULL"})` },
  logistic: { need: ["dependent", "independents"], call: a => `q_logistic(d, ${rs(a.dependent)}, ${rv(a.independents)})` },
  reliability: { need: ["variables"], call: a => `q_reliability(d, ${rv(a.variables)})` },
  efa: { need: ["variables"], call: a => `q_efa(d, ${rv(a.variables)}, ${Math.max(1, parseInt(a.factors) || 1)}, ${rs(["varimax", "promax", "none"].includes(a.rotation) ? a.rotation : "varimax")})` },
  normality: { need: ["variables"], call: a => `q_normality(d, ${rv(a.variables)})` },
  survival: { need: ["time", "event"], call: a => `q_survival(d, ${rs(a.time)}, ${rs(a.event)}, ${a.group ? rs(a.group) : "NULL"}, ${a.covariates && a.covariates.length ? rv(a.covariates) : "NULL"})` },
  chart: { need: ["type"], call: a => `list(type = ${rs(a.type)})` },
};
// an analysis as an R list literal, for the figure code
function rList(a) { const parts = []; for (const [k, v] of Object.entries(a)) { if (v == null || k === "procedure") continue; if (Array.isArray(v)) parts.push(`${k} = ${rv(v)}`); else if (typeof v === "boolean") parts.push(`${k} = ${v ? "TRUE" : "FALSE"}`); else if (typeof v === "number") parts.push(`${k} = ${v}`); else parts.push(`${k} = ${rs(v)}`); } return "list(" + parts.join(", ") + ")"; }
const varsOf = a => [a.variable, a.group, a.paired_with, a.row, a.column, a.dependent, a.x, a.y, a.size, a.moderator, a.time, a.event, a.cluster, a.weights, ...(a.fixed_effects || []), ...(a.factors || []), ...(a.variables || []), ...(a.independents || []), ...(a.covariates || [])].filter(Boolean);
const CHART_NEEDS = { bar: ["x"], stacked100: ["x", "group"], line: ["x", "y"], scatter: ["x", "y"], violin: ["y"], density: ["y"], coefficient: ["y", "independents"], interaction: ["x", "y", "moderator"], km: ["time", "event"], waterfall: ["x", "y"] };

function rscript() { return process.env.QUARTILE_RSCRIPT || "Rscript"; }
function available() { return new Promise(res => execFile(rscript(), ["--version"], { timeout: 10000 }, e => res(!e))); }
function exec(file, cwd) { return new Promise(res => execFile(rscript(), ["--vanilla", file], { cwd, env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" }, timeout: +process.env.QUARTILE_R_TIMEOUT || 120000, maxBuffer: 64 << 20 }, (e, out, err) => res({ e, out, err }))); }

// header of a CSV, to validate variable names before R runs
function csvHeader(text) { const line = String(text).replace(/^﻿/, "").split(/\r?\n/)[0] || ""; const sep = (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ","; return { sep, cols: line.split(sep).map(c => c.trim().replace(/^"|"$/g, "")) }; }

async function run({ data, format = "csv", analyses = [], r_code = null, charts = true, sheet = null, excel = false }) {
  if (!(await available())) return { kind: "rstats", error: "R is not installed where Quartile runs. Install R (r-project.org) or set QUARTILE_RSCRIPT to Rscript's path." };
  if (r_code && process.env.QUARTILE_ALLOW_R_CODE !== "1") return { kind: "rstats", error: "Custom R code runs only in a local install with QUARTILE_ALLOW_R_CODE=1. Use the built-in procedures." };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quartile-r-")); let xinfo = null;
  try {
    const isSav = format === "sav", isX = format === "xlsx", bytes = isSav || isX ? Buffer.from(String(data), "base64") : Buffer.from(String(data), "utf8");
    if (isX) { const X = await require("./excel.js").xlsxToCsv(bytes, sheet); data = X.csv; xinfo = { sheet: X.sheet, sheets: X.sheets }; }
    const dataFile = path.join(dir, isSav ? "data.sav" : "data.csv"); fs.writeFileSync(dataFile, isX ? Buffer.from(data, "utf8") : bytes);
    let cols = null, sep = ",";
    if (!isSav) { const h = csvHeader(data); cols = h.cols; sep = h.sep; }
    const problems = [];
    analyses.forEach((a, i) => { const p = PROCS[a.procedure]; if (!p) return problems.push(`analysis ${i + 1}: unknown procedure '${a.procedure}'`);
      if (a.procedure === "chart") { if (!CHART_NEEDS[a.type]) problems.push(`analysis ${i + 1}: chart type must be one of ${Object.keys(CHART_NEEDS).join(", ")}`); else CHART_NEEDS[a.type].forEach(k => { if (a[k] == null || (Array.isArray(a[k]) && !a[k].length)) problems.push(`analysis ${i + 1} (chart ${a.type}): '${k}' is required`); }); }
      p.need.forEach(k => { if (a[k] == null || (Array.isArray(a[k]) && !a[k].length)) problems.push(`analysis ${i + 1} (${a.procedure}): '${k}' is required`); });
      if (cols) varsOf(a).forEach(v => { if (!cols.includes(v)) problems.push(`analysis ${i + 1} (${a.procedure}): no column '${v}' (columns: ${cols.slice(0, 30).join(", ")})`); }); });
    if (problems.length) return { kind: "rstats", error: "Check the request.", problems };
    const read = isSav ? `suppressWarnings(foreign::read.spss("data.sav", to.data.frame = TRUE, use.value.labels = TRUE))` : `read.csv("data.csv", sep = ${rs(sep)}, check.names = FALSE, stringsAsFactors = FALSE, na.strings = c("", "NA", "."))`;
    const calls = analyses.map((a, i) => `  a${i + 1} = q_run(${rs(a.procedure)}, ${PROCS[a.procedure].call(a)})`);
    const script = [
      "# Quartile analysis script. Re-run with: Rscript --vanilla analysis.R (data file in the same folder)",
      "# Procedures: core/rstats.R in https://github.com/emsleader/quartile",
      `source(${rs(LIB)})`, "options(warn = 1)", 'invisible(Sys.setlocale("LC_CTYPE", "C.UTF-8"))', `d <- ${read}`,
      ...(r_code ? ["# custom code (local install)", String(r_code)] : []),
      "results <- list(", calls.join(",\n") || "  none = NULL", ")",
      ...(charts ? ["figures <- list(", analyses.map((a, i) => `  a${i + 1} = tryCatch(q_plots(${rs(a.procedure)}, d, ${rList(a)}), error = function(e) list())`).join(",\n"), ")"] : ["figures <- list()"]),
      'meta <- list(r_version = R.version.string, foreign_version = as.character(packageVersion("foreign")), platform = R.version$platform, rows = nrow(d), columns = ncol(d))',
      'cat("<<<QUARTILE_JSON>>>", qj(list(meta = meta, results = results, figures = figures)), "<<<END>>>", sep = "")',
    ].join("\n");
    const sf = path.join(dir, "analysis.R"); fs.writeFileSync(sf, script);
    const { e, out, err } = await exec(sf, dir);
    const m = String(out).match(/<<<QUARTILE_JSON>>>([\s\S]*)<<<END>>>/);
    if (!m) return { kind: "rstats", error: "R did not finish: " + String(err || (e && e.message) || "no output").slice(-800) };
    const parsed = JSON.parse(m[1]);
    const results = analyses.map((a, i) => ({ ...a, result: parsed.results["a" + (i + 1)] }));
    const figures = []; analyses.forEach((a, i) => { const fs_ = (parsed.figures || {})["a" + (i + 1)] || []; (Array.isArray(fs_) ? fs_ : [fs_]).forEach(f => { try { const b = fs.readFileSync(path.join(dir, f.file)); figures.push({ analysis: i + 1, procedure: a.procedure, title: f.title, file: f.file, png_base64: b.toString("base64"), sha256: sha(b) }); } catch (e) {} }); });
    const libText = fs.readFileSync(LIB, "utf8");
    const record = { created: new Date().toISOString(), data_format: format, ...(xinfo ? { excel_sheet: xinfo.sheet } : {}), data_sha256: sha(bytes), data_bytes: bytes.length, script_sha256: sha(script), procedures_sha256: sha(libText), ...parsed.meta,
      note: "Anyone with the same data file and this script gets the same numbers: check the data hash first, then run Rscript --vanilla analysis.R." };
    const warnings = String(err || "").split("\n").filter(l => /^Warning/.test(l)).slice(0, 20);
    const res = { kind: "rstats", figures, results, apa: results.map(apa).flat().filter(Boolean), record, script: script.replace(rs(LIB), '"rstats.R"'), warnings, output_text: flatten(results),
      note: "Computed in R with fixed, open procedures (core/rstats.R); figures drawn by R. Pass output_text to number_registry as an output to trace every reported number to this run." };
    if (excel) res.xlsx_base64 = (await require("./excel.js").workbook(res)).toString("base64");
    return res;
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
}

// ---- APA-style sentences (numbers only from the R result) ----
const f2 = x => x == null ? "–" : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("en-US") : (+x).toFixed(2);
const nz = s => s.replace(/^(-?)0\./, "$1.");
const fp = p => p == null ? "–" : p < .001 ? "p < .001" : "p = " + nz((+p).toFixed(3));
const fr = r => nz((+r).toFixed(2));
function apa(x) {
  const r = x.result || {}; if (r.error) return [`${x.procedure}: ${r.error}`];
  switch (x.procedure) {
    case "ttest": if (r.type === "independent") return [`${x.variable} by ${x.group}: ${r.groups[0]} M = ${f2(r.means[0])}, SD = ${f2(r.sds[0])} (n = ${r.n[0]}); ${r.groups[1]} M = ${f2(r.means[1])}, SD = ${f2(r.sds[1])} (n = ${r.n[1]}); Welch t(${f2(r.welch.df)}) = ${f2(r.welch.t)}, ${fp(r.welch.p)}, 95% CI [${f2(r.welch.ci_low)}, ${f2(r.welch.ci_high)}], d = ${f2(r.cohens_d)}.`];
      if (r.type === "paired") return [`${x.variable} vs ${x.paired_with}: mean difference = ${f2(r.mean_difference)}, t(${r.df}) = ${f2(r.t)}, ${fp(r.p)}, 95% CI [${f2(r.ci_low)}, ${f2(r.ci_high)}], dz = ${f2(r.cohens_dz)}.`];
      return [`${x.variable}: M = ${f2(r.mean)} vs ${r.mu}, t(${r.df}) = ${f2(r.t)}, ${fp(r.p)}, d = ${f2(r.cohens_d)}.`];
    case "anova": return [`${x.variable} by ${x.group}: F(${r.df1}, ${r.df2}) = ${f2(r.F)}, ${fp(r.p)}, η² = ${fr(r.eta_squared)}; Welch F(${f2(r.welch.df1)}, ${f2(r.welch.df2)}) = ${f2(r.welch.F)}, ${fp(r.welch.p)}.`];
    case "crosstab": return [`${x.row} × ${x.column}: χ²(${r.df}, N = ${r.n}) = ${f2(r.chisq)}, ${fp(r.p)}, Cramér's V = ${fr(r.cramers_v)}${r.cells_expected_below_5 > 20 ? ` (${f2(r.cells_expected_below_5)}% of cells expected < 5${r.fisher_p != null ? `; Fisher's exact ${fp(r.fisher_p)}` : ""})` : ""}.`];
    case "correlation": return (r.pairs || []).map(q => `${q.x} and ${q.y}: ${r.method === "pearson" ? "r" : r.method === "spearman" ? "rs" : "τ"}(${q.n - 2}) = ${fr(q.r)}, ${fp(q.p)}${q.ci_low != null ? `, 95% CI [${fr(q.ci_low)}, ${fr(q.ci_high)}]` : ""}.`);
    case "regression": return [`${r.dv} (n = ${r.n}, ${r.se_type}${r.weighted ? ", weighted" : ""}${r.fixed_effects ? ", fixed effects: " + r.fixed_effects.map(f => `${f.variable} (${f.levels})`).join(", ") : ""}): R² = ${fr(r.r_squared)}, adjusted R² = ${fr(r.adj_r_squared)}, F(${r.df1}, ${r.df2}) = ${f2(r.F)}, ${fp(r.p)}.`, ...(r.coefficients || []).filter(c => c.term !== "(Intercept)").map(c => `  ${c.term}: b = ${f2(c.b)}, SE = ${f2(c.se)}, t = ${f2(c.t)}, ${fp(c.p)}, 95% CI [${f2(c.ci_low)}, ${f2(c.ci_high)}], β = ${f2(c.beta)}, VIF = ${f2(c.vif)}.`)];
    case "logistic": return [`${r.dv} (n = ${r.n}, ${r.events} events): χ²(${r.df}) = ${f2(r.lr_chisq)}, ${fp(r.p)}, Nagelkerke R² = ${fr(r.nagelkerke_r2)}, ${f2(r.classification_correct)}% correctly classified.`, ...(r.coefficients || []).filter(c => c.term !== "(Intercept)").map(c => `  ${c.term}: OR = ${f2(c.odds_ratio)}, 95% CI [${f2(c.or_ci_low)}, ${f2(c.or_ci_high)}], ${fp(c.p)}.`)];
    case "reliability": return [`${r.items} items (n = ${r.n}): Cronbach's α = ${fr(r.cronbach_alpha)}.`];
    case "efa": return [`EFA, ${r.factors} factor(s), ${r.rotation} (n = ${r.n}): KMO = ${fr(r.kmo)}, Bartlett χ²(${r.bartlett.df}) = ${f2(r.bartlett.chisq)}, ${fp(r.bartlett.p)}.`];
    case "survival": return [`Survival of ${x.time} (event ${x.event}; n = ${r.n}, ${r.events} events)${r.log_rank ? `: log-rank χ²(${r.log_rank.df}) = ${f2(r.log_rank.chisq)}, ${fp(r.log_rank.p)}` : ""}.`, ...(r.groups || []).map(g => `  ${g.group}: n = ${g.n}, events = ${g.events}, median = ${g.median_time == null ? "not reached" : f2(g.median_time)}.`), ...((r.cox && r.cox.coefficients) || []).map(c => `  Cox ${c.term}: HR = ${f2(c.hazard_ratio)}, 95% CI [${f2(c.hr_ci_low)}, ${f2(c.hr_ci_high)}], ${fp(c.p)}.`), ...(r.cox ? [`  Cox model: concordance = ${fr(r.cox.concordance)}, proportional-hazards test ${r.cox.ph_test_global_p == null ? "–" : fp(r.cox.ph_test_global_p)}.`] : [])];
    case "chart": return [];
    case "descriptives": return Object.entries(r).filter(([k]) => k !== "procedure").map(([v, s]) => `${v}: M = ${f2(s.mean)}, SD = ${f2(s.sd)}, Mdn = ${f2(s.median)}, n = ${s.n}.`);
    case "normality": return Object.entries(r).filter(([k]) => k !== "procedure").map(([v, s]) => s.W != null ? `${v}: Shapiro-Wilk W = ${nz((+s.W).toFixed(3))}, ${fp(s.p)}.` : `${v}: ${s.note}`);
    default: return [];
  }
}
// every number in the results as "path = value" lines, for the number registry
function flatten(results) {
  const out = []; const walk = (o, p) => { if (o == null) return; if (typeof o === "number") out.push(`${p} = ${o}`); else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${p}[${i}]`)); else if (typeof o === "object") Object.entries(o).forEach(([k, v]) => walk(v, p ? `${p}.${k}` : k)); };
  results.forEach((r, i) => walk(r.result, `${i + 1}.${r.procedure}`)); return out.join("\n");
}
module.exports = { run, available, PROCS, apa };
