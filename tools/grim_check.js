// grim_check: GRIM (and GRIMMER when an SD is given) for a list of reported means, or for the means found in a text.
import { z } from "zod";
import { grim, grimTestable, decimalsOf } from "../core/stats/grim.js";
import { grimmer, grimmerExact } from "../core/stats/grimmer.js";
import { parseText } from "../core/text/parse.js";
import { scanMeans } from "../core/roles/finance.js";

const NOTE = "Consistency check for integer data (Likert items, counts). It shows whether numbers fit together, not who produced them or why. Not valid for continuous or weighted data.";

function one({ mean, n, items = 1, dp, sd, min, max }) {
  const meanStr = String(mean), d = dp ?? decimalsOf(meanStr);
  const row = { mean: meanStr, n, items, dp: d };
  if (!grimTestable(n, d, items)) return { ...row, verdict: "not testable", reason: `n × items = ${n * items} is not below 10^${d}, so every mean is possible at ${d} decimals.` };
  const g = grim(meanStr, n, { dp: d, items });
  const out = { ...row, verdict: g.possible ? "possible" : "not possible", granularity: g.granularity, nearest: g.nearest,
    reason: g.possible ? `${g.candidates[0]} / ${n * items} rounds to ${meanStr}.` : `No integer total divided by ${n * items} rounds to ${meanStr}.` };
  if (sd != null && g.possible) {
    let r = min != null && max != null ? grimmerExact(meanStr, String(sd), n, { min, max, items }) : null;
    if (!r || r.possible == null) r = grimmer(meanStr, String(sd), n, { items });
    out.sd = String(sd);
    out.sd_verdict = r.possible ? "possible" : "not possible";
    out.sd_method = r.exact ? "GRIMMER exact search on the scale" : "GRIMMER necessary conditions (possible means not ruled out)";
  }
  return out;
}

export default {
  name: "grim_check",
  title: "GRIM check of reported means",
  description: "GRIM test (Brown & Heathers 2017) for means of integer data: give a table of means with n (and optionally items, decimals, SD and scale bounds), or a text. Returns possible / not possible / not testable per mean; with an SD it also runs GRIMMER. Runs locally.",
  inputSchema: {
    means: z.array(z.object({
      mean: z.union([z.string(), z.number()]).describe("Mean as printed, e.g. \"3.40\" (a string keeps trailing zeros)."),
      n: z.number().int().positive(),
      items: z.number().int().positive().optional(),
      dp: z.number().int().min(0).max(6).optional(),
      sd: z.union([z.string(), z.number()]).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })).max(2000).optional(),
    text: z.string().min(1).max(400000).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler({ means, text }) {
    if (!means && !text) return { error: "Give means (a list of { mean, n }) or text." };
    const res = { note: NOTE };
    if (means) res.results = means.map(one);
    if (text) {
      const doc = parseText(text);
      res.text_results = scanMeans(doc).map(({ finding, ...r }) => ({ ...r, message: finding ? finding.message : undefined }));
      res.text_note = "From text, only means with n that are marked as integer data (Likert, k-point scale, counts) and have a known item count are tested; others are skipped as not testable.";
    }
    return res;
  },
};
