// Survey planner: sample size per planned analysis, completes per group, invitations, survey length and an
// anonymity check. The calculation runs in R (core/surveyplan.R, base R only); this file turns the JSON plan
// into an R list, runs Rscript and returns the result with the exact script and a reproducibility record.
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
const { execFile } = require("child_process");
const R_LIB = path.join(__dirname, "rstats.R"), R_PLAN = path.join(__dirname, "surveyplan.R"), R_EGBA = path.join(__dirname, "egba.R"), R_EGT = path.join(__dirname, "egba_time.R");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const rscript = () => process.env.QUARTILE_RSCRIPT || "Rscript";

// JSON value -> R literal (objects become named lists, arrays become unnamed lists)
function toR(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("numbers must be finite"); return String(v); }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "list(" + v.map(toR).join(", ") + ")";
  return "list(" + Object.entries(v).filter(([, x]) => x !== undefined && x !== null).map(([k, x]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(k)) throw new Error(`invalid field name '${k}'`);
    return `${k} = ${toR(x)}`; }).join(", ") + ")";
}

function runR(kind, call, procFile, spec) {
  return new Promise(resolve => {
    let lit; try { lit = toR(spec); } catch (e) { return resolve({ kind, error: e.message }); }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quartile-" + kind + "-"));
    const script = [`# Quartile ${kind}. Re-run with: Rscript --vanilla ${kind}.R`, `source(${JSON.stringify(R_LIB)})`, `source(${JSON.stringify(procFile)})`, `spec <- ${lit}`, `res <- ${call}(spec)`, "meta <- list(r_version = R.version.string, platform = R.version$platform)", 'cat("<<<QUARTILE_JSON>>>", qj(list(meta = meta, result = res)), "<<<END>>>", sep = "")'].join("\n");
    const file = path.join(dir, kind + ".R"); fs.writeFileSync(file, script);
    execFile(rscript(), ["--vanilla", file], { cwd: dir, timeout: 60000, maxBuffer: 16 << 20 }, (e, out, err) => {
      const m = String(out).match(/<<<QUARTILE_JSON>>>([\s\S]*)<<<END>>>/);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
      if (!m) return resolve({ kind, error: "R did not finish: " + String(err || (e && e.message) || "no output").slice(-600) });
      const p = JSON.parse(m[1]);
      resolve({ kind, ...p.result, script, reproducibility: { r_version: p.meta.r_version, platform: p.meta.platform, script_sha256: sha(script), procedures_sha256: sha(fs.readFileSync(procFile)) } });
    });
  });
}
function egba(spec) { if (!spec || !spec.expression || !spec.parameters) return Promise.resolve({ kind: "egba", error: "give 'expression' and 'parameters'" }); return runR("egba", "q_egba", R_EGBA, spec); }

function egbaTime(spec) { if (!spec || !Array.isArray(spec.routes) || !spec.routes.length) return Promise.resolve({ kind: "egba_time", error: "give 'routes'" }); return runR("egba_time", "q_egba_time", R_EGT, spec); }

function plan(spec) {
  return new Promise(resolve => {
    let lit;
    try {
      if (!spec || !Array.isArray(spec.groups) || !spec.groups.length) throw new Error("give at least one group in 'groups'");
      if (!Array.isArray(spec.papers) || !spec.papers.length) throw new Error("give at least one paper in 'papers'");
      lit = toR(spec);
    } catch (e) { return resolve({ kind: "survey_plan", error: e.message }); }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quartile-sp-"));
    const script = [
      "# Quartile survey plan. Re-run with: Rscript --vanilla survey_plan.R",
      `source(${JSON.stringify(R_LIB)})`, `source(${JSON.stringify(R_PLAN)})`,
      `spec <- ${lit}`,
      "res <- q_survey_plan(spec)",
      "meta <- list(r_version = R.version.string, platform = R.version$platform)",
      'cat("<<<QUARTILE_JSON>>>", qj(list(meta = meta, result = res)), "<<<END>>>", sep = "")'].join("\n");
    const file = path.join(dir, "survey_plan.R"); fs.writeFileSync(file, script);
    execFile(rscript(), ["--vanilla", file], { cwd: dir, timeout: 60000, maxBuffer: 16 << 20 }, (e, out, err) => {
      const m = String(out).match(/<<<QUARTILE_JSON>>>([\s\S]*)<<<END>>>/);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
      if (!m) return resolve({ kind: "survey_plan", error: "R did not finish: " + String(err || (e && e.message) || "no output").slice(-600) });
      const p = JSON.parse(m[1]);
      resolve({ kind: "survey_plan", ...p.result, script, reproducibility: { r_version: p.meta.r_version, platform: p.meta.platform, script_sha256: sha(script), procedures_sha256: sha(fs.readFileSync(R_PLAN)) } });
    });
  });
}
module.exports = { plan, egba, egbaTime, toR };
