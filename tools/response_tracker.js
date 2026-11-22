// response_tracker (specification Sections 11 and 15): reviewer comments matched to the changes between versions.
import { z } from "zod";
import { buildTracker, exportTracker } from "../core/roles/response.js";

const Status = z.union([z.string().max(2000), z.object({ status: z.string(), reason: z.string().max(2000).optional(), response: z.string().max(5000).optional() })]);

export async function responseTracker({ letter, old_text, new_text, statuses = {}, export: format } = {}) {
  const t = buildTracker(letter, old_text, new_text, statuses || {});
  if (!format) return t;
  try {
    const out = await exportTracker(t, format);
    return format === "docx" ? { ...t, exported: "docx", docx_base64: out.toString("base64") } : { ...t, exported: "markdown", markdown: out };
  } catch (e) {
    if (!e.open) throw e;
    return { ...t, exported: null, refused: true, reason: e.message };
  }
}

export default {
  name: "response_tracker",
  title: "Response-to-reviewers tracker",
  description: "Splits a reviewer letter into numbered comments (Reviewer 1, R1.3, Comment 2:, 1. / 1) / (1)), finds the changed paragraphs between the old and new manuscript (jsdiff) and suggests which change answers each comment. Rows: comment | change (old → new) | location (section, paragraph) | status (addressed / partly / declined with reason / open). The author sets each status in `statuses` ({ \"R1.1\": \"addressed\", \"R1.2\": \"declined: reason\" }). Export to Markdown or DOCX is refused while any comment is open. Runs locally.",
  inputSchema: {
    letter: z.string().min(1).max(200000).describe("Reviewer letter"),
    old_text: z.string().min(1).max(400000).describe("Manuscript as submitted"),
    new_text: z.string().min(1).max(400000).describe("Revised manuscript"),
    statuses: z.record(z.string(), Status).optional().describe("Status per comment ID: addressed | partly | declined (with reason) | open"),
    export: z.enum(["docx", "markdown"]).optional().describe("Export the table; refused while any comment is open"),
  },
  async handler(args) { return responseTracker(args); },
};
