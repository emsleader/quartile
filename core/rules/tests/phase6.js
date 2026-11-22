// Structural tests for the Q1 corpus rules (rulebook/q1corpus.yaml). They compare one section of the manuscript
// with the measured profile in data/style-profile.json, using the same measurement code that built the profile
// (core/stylemetrics.js), so the numbers are comparable. Only numbers are read from the profile.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "../../stylemetrics.js";

const PROFILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "style-profile.json");
let P = null;
export function profile() { if (!P) P = JSON.parse(fs.readFileSync(PROFILE, "utf8")); return P; }

/** Limit for a metric: "fence" = p75 + 1.5 x (p75 - p25) (Tukey upper fence), or a named quantile (p25, median, p75). */
export function limitOf(metric, which = "fence", field = "overall") {
  const pr = profile(), grp = field === "overall" ? pr.overall : pr.fields?.[field];
  const q = grp?.metrics?.[metric];
  if (!q) throw new Error(`style profile has no metric ${metric} for ${field}`);
  if (which === "fence") return +(q.p75 + 1.5 * (q.p75 - q.p25)).toFixed(3);
  if (q[which] == null) throw new Error(`style profile has no ${which} for ${metric}`);
  return q[which];
}

export default {
  /** The section's metric is at most the profile limit. Not applicable (ok) when the section is missing or has
   *  fewer sentences than the profile's 25th percentile of sentences per abstract. */
  profile_metric_at_most: (doc, section, metric, which = "fence", field = "overall") => {
    const text = doc.sectionText(section);
    const minSent = profile().overall.metrics.sentences.p25;
    if (!text) return { ok: true, detail: { applicable: false, reason: `no ${section} section` } };
    const m = measure(text);
    if (m.sentences < minSent) return { ok: true, detail: { applicable: false, reason: `fewer than ${minSent} sentences` } };
    const limit = limitOf(metric, which, field), value = m[metric];
    return { ok: !(value > limit), anchor: doc.sentencesIn(section)[0] || null,
      detail: { metric, value, limit, limit_kind: which, field, profile_n: profile().overall.n, profile_built: profile().built, sentences: m.sentences } };
  },
};
