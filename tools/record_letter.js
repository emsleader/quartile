// record_letter (specification 21.6): store an editor or reviewer letter, split it into numbered requests,
// propose categories and lessons.
import { z } from "zod";
import { recordLetter, LETTER_TYPES, FILE_KINDS } from "../core/record/index.js";

export default {
  name: "record_letter",
  title: "Quartile Record: editor or reviewer letter",
  description: "Add an editor or reviewer letter to a paper's record: stores it as a decision, review_received or desk_decision event, splits it into numbered requests (E1, R1.3 ...), proposes a category for each request and a lesson (a check: manual rule for this journal). Categories and lessons are proposals: the owner confirms them with record_requests and record_lessons. Give the letter as body text or a local .docx/.pdf/.txt path. Stored locally only.",
  inputSchema: {
    paper_id: z.string().max(64),
    type: z.enum(LETTER_TYPES).default("decision"),
    occurred_at: z.string().max(40).describe("Date of the letter: YYYY-MM-DD"),
    journal: z.string().max(100).optional().describe("ISSN or journal-bank id; defaults to the journal of the latest journal event"),
    actor: z.string().max(60).optional().describe("Who sent it (default editor)"),
    summary: z.string().max(500).optional(),
    body: z.string().max(400000).optional(),
    path: z.string().max(1000).optional(),
    data: z.record(z.string(), z.any()).optional().describe("For a decision: { decision: accept|minor|major|reject|transfer, deadline? }"),
    files: z.array(z.object({ path: z.string().max(1000), kind: z.enum(FILE_KINDS).optional() })).max(50).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: a => recordLetter(a),
};
