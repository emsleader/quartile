// record_timeline (specification 21.6): full history of a paper in date order, as Markdown or DOCX.
import { z } from "zod";
import { timelineMarkdown, timelineDocx } from "../core/record/index.js";

export default {
  name: "record_timeline",
  title: "Quartile Record: timeline",
  description: "Export the full history of one paper in date order as Markdown (format md) or DOCX (format docx, written to a local file). The export holds only the owner's own record: events, decisions and documents (file names with SHA-256). Letters written by others are summarised, not copied.",
  inputSchema: {
    paper_id: z.string().max(64),
    format: z.enum(["md", "docx"]).default("md"),
    out: z.string().max(1000).optional().describe("Path for the DOCX file (default $QUARTILE_HOME/record/exports/)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler(a) {
    const md = await timelineMarkdown(a.paper_id);
    const out = { paper_id: a.paper_id, events: md.rows.length, markdown: md.markdown };
    if ((a.format || "md") === "docx") out.docx = await timelineDocx(a.paper_id, a.out || null);
    return out;
  },
};
