import { z } from "zod";
import F from "../core/factory/index.js";
import { parseFile } from "../core/text/parse.js";
import AI from "../core/aistyle.js";
import REG from "../core/registry.js";
import EV from "../core/evidence.js";
import NET from "../core/net.js";
import L from "../core/lib.js";
import FC from "../core/filecheck.js";
import { committeeReview } from "./committee_review.js";

const files = z.object({
  novelty_report: z.string().max(1000).optional(), search_results: z.array(z.string().max(1000)).max(20).optional(),
  screening_register: z.string().max(1000).optional(), extraction: z.string().max(1000).optional(),
  ledger: z.string().max(1000).optional().describe("Evidence ledger CSV (see evidence_ledger)"),
  outputs: z.array(z.string().max(1000)).max(30).optional().describe("Raw statistical output files (R, Stata, SPSS logs or CSV of estimates)"),
  manuscript: z.string().max(1000).optional().describe(".docx, .pdf, .md or .txt"),
  docx: z.string().max(1000).optional().describe("The .docx you will submit (read only)"),
}).partial();

export default {
  name: "factory_run",
  title: "Research Factory (idea to submission, with human gates)",
  description: "Runs one paper through the Research Factory in order: 0 brief, 1 novelty scan, 2 evidence base, 3 ledger and numbers, 4 draft, 5 verification, 6 voice and pattern control, 7 internal committee, 8 submission pack, 9 memory. Each stage runs its Quartile checks and then stops at its human gate until a named person approves it (action approve); Stage 6 has no human gate and passes when its targets are met. Stage 8 enforces the hard gates: every number found in the attached statistical output, every reference verified in Crossref, pattern score in the low band, ledger unchanged since it was locked, no FAIL in file_check. Quartile never approves a gate, never writes the draft and never changes a file: it records each input file's path and SHA-256 and keeps one status file per paper in the local Quartile folder. live: true sends the reference list to Crossref.",
  inputSchema: {
    action: z.enum(["start", "run", "approve", "status", "reopen", "list", "stages"]).default("status"),
    paper_id: z.string().max(61).optional().describe("Lowercase id, e.g. sme-flex-2027"),
    author: z.string().max(200).optional(),
    brief: z.object({ question: z.string().max(2000), population: z.string().max(2000), contribution: z.string().max(2000), target_tier: z.string().max(40) }).partial().optional(),
    files: files.optional(),
    live: z.boolean().optional(), anonymised: z.boolean().optional(),
    stage: z.number().int().min(0).max(9).optional(),
    approver: z.string().max(200).optional(), decision: z.enum(["go", "reframe", "stop"]).optional(), second_reviewer: z.string().max(200).optional(),
    note: z.string().max(2000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(a) {
    try {
      const { action = "status", paper_id } = a;
      if (action === "stages") return { stages: F.STAGES, targets: F.TARGETS };
      if (action === "list") return { papers: F.list() };
      if (action === "start") return F.status(F.start({ paper_id, brief: a.brief, author: a.author }));
      if (action === "status") return F.status(paper_id);
      if (action === "approve") return F.approve(paper_id, a);
      if (action === "reopen") return F.reopen(paper_id, { stage: a.stage, reason: a.note });
      return await F.run(paper_id, {
        files: a.files || {}, live: !!a.live, anonymised: !!a.anonymised,
        readText: async p => (await parseFile(p)).text,
        checkLedger: EV.checkLedger, registry: REG.registry, claimAudit: EV.claimAudit, aiStyle: AI.check,
        checkStatistics: t => L.Stats.checkAll(t), verifyReferences: t => NET.verifyReferences(t, { max: 200 }),
        committee: text => committeeReview({ text }),
        fileCheck: async (p, anonymised) => { const r = await FC.checkFile(p, { anonymised, label: p }); delete r._cmp; return { ...r, summary: FC.summarise(r) }; },
      });
    } catch (e) { return { error: e.message }; }
  },
};
