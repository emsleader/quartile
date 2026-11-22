// record_event (specification 21.6): add an append-only event with optional files, or list a paper's events.
import { z } from "zod";
import { addEvent, listEvents, replay, EVENT_TYPES, FILE_KINDS } from "../core/record/index.js";

export default {
  name: "record_event",
  title: "Quartile Record: event",
  description: "Add one event to a paper's history (action add), with optional local files copied into the record with SHA-256. Events are append-only: they cannot be edited or deleted. To fix a mistake add a 'correction' event with corrects = the old event id and data.set (fields to replace) or data.void: true. Action list returns the history in date order with corrections applied; action replay gives the paper status after each event.",
  inputSchema: {
    action: z.enum(["add", "list", "replay"]).default("add"),
    paper_id: z.string().max(64),
    type: z.enum(EVENT_TYPES).optional(),
    occurred_at: z.string().max(40).optional().describe("When it happened: YYYY-MM-DD or ISO date-time"),
    journal: z.string().max(100).optional().describe("ISSN or journal-bank id"),
    actor: z.string().max(60).optional().describe("editor | reviewer-1 | co-author | supervisor | library | self"),
    summary: z.string().max(500).optional(),
    body: z.string().max(400000).optional(),
    corrects: z.string().max(40).optional(),
    data: z.record(z.string(), z.any()).optional(),
    files: z.array(z.object({ path: z.string().max(1000), kind: z.enum(FILE_KINDS).optional() })).max(50).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler(a) {
    const action = a.action || "add";
    if (action === "list") return { paper_id: a.paper_id, events: await listEvents(a.paper_id) };
    if (action === "replay") return { paper_id: a.paper_id, steps: await replay(a.paper_id) };
    if (!a.type) throw new Error("type is required");
    return { event: await addEvent(a) };
  },
};
