// record_requests (specification 21.6): list requests and update their status, category, response and location.
import { z } from "zod";
import { listRequests, updateRequest, openRequests, REQUEST_STATUSES, CATEGORIES } from "../core/record/index.js";

export default {
  name: "record_requests",
  title: "Quartile Record: requests",
  description: "List the requests found in a paper's letters (action list), list the open requests of one revision round (open), or update one request (update): status open | addressed | partly | declined, the location of the change in the revised version (needed for addressed and partly), the response or reason (needed for declined), and the confirmed category. The letter itself never changes.",
  inputSchema: {
    action: z.enum(["list", "open", "update"]).default("list"),
    paper_id: z.string().max(64).optional(),
    revision: z.string().max(40).optional().describe("Round number (1 = first revision), 'latest', or a letter event id"),
    status: z.enum(REQUEST_STATUSES).optional(),
    request_id: z.string().max(40).optional(),
    category: z.enum(CATEGORIES).optional(),
    response: z.string().max(20000).optional(),
    location: z.string().max(500).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async handler(a) {
    const action = a.action || "list";
    if (action === "update") { if (!a.request_id) throw new Error("request_id is required"); return { request: await updateRequest(a.request_id, a) }; }
    if (action === "open") return openRequests({ paper_id: a.paper_id, revision: a.revision ?? null });
    return { requests: await listRequests({ paper_id: a.paper_id, status: a.status }) };
  },
};
