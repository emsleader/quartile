// record_lessons (specification 21.6): list lessons; the owner approves, edits, rejects or retires them.
import { z } from "zod";
import { listLessons, decideLesson, proposeRepeated, LESSON_STATUSES, lessonsFile } from "../core/record/index.js";

export default {
  name: "record_lessons",
  title: "Quartile Record: lessons",
  description: "List proposed and approved lessons (action list), propose scope 'all' for categories asked by two or more journals (propose_repeated), or record the owner's decision on one lesson: approve, edit (rule_yaml and/or scope), reject or retire. Decisions need owner_confirm: true and must only be sent on the owner's explicit instruction. Approved lessons are written to $QUARTILE_HOME/record/lessons.yaml (rulebook format, check: manual), never into the repository rulebook.",
  inputSchema: {
    action: z.enum(["list", "approve", "edit", "reject", "retire", "propose_repeated"]).default("list"),
    lesson_id: z.string().max(40).optional(),
    status: z.enum(LESSON_STATUSES).optional(),
    paper_id: z.string().max(64).optional(),
    rule_yaml: z.string().max(20000).optional(),
    scope: z.string().max(120).optional().describe("all | journal:<issn> | design:<design>"),
    note: z.string().max(2000).optional(),
    owner_confirm: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async handler(a) {
    const action = a.action || "list";
    if (action === "list") return { lessons: await listLessons({ status: a.status, paper_id: a.paper_id }), file: lessonsFile() };
    if (action === "propose_repeated") return { proposed: await proposeRepeated() };
    if (!a.lesson_id) throw new Error("lesson_id is required");
    return { lesson: await decideLesson(a.lesson_id, action, a), file: lessonsFile() };
  },
};
