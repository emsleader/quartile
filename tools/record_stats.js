// record_stats (specification 21.6): descriptive statistics over the owner's own history. Never predictions.
import { z } from "zod";
import { outcomeStats } from "../core/record/index.js";

export default {
  name: "record_stats",
  title: "Quartile Record: outcome statistics",
  description: "Descriptive counts and dates from the owner's own record: time from submission to first decision per journal, decisions by journal, most frequent request categories, requests still open. Counts and dates only; never a prediction.",
  inputSchema: { paper_id: z.string().max(64).optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: a => outcomeStats(a),
};
