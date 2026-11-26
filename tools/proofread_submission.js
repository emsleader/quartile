// proofread_submission: full proofreading pass over every submission file (plan, then apply).
import { z } from "zod";
import { plan, apply } from "../core/proofread/index.js";

const file = z.union([z.string().describe("Local .docx, .pdf, .txt or .md path"),
  z.object({ name: z.string(), text: z.string().max(2000000) }), z.object({ name: z.string(), docx_base64: z.string().max(40000000) })]);

export default {
  name: "proofread_submission",
  title: "Proofread a submission (all files, in your own voice)",
  description: "Professional proofreading pass over every submission file of a paper (manuscript, abstract, cover letter, title page, supplements, captions), in the order given. Step 1 (mode 'plan'): builds your voice profile from your own approved papers (author_voice) and returns every paragraph with issues (stock words, forced triads, uniform rhythm, empty transitions, causal claims beyond the design, dash chains, generic openings and closings, term drift, wordiness), with the hard constraints for each (numbers, citations, locked terms, claim strength). Quartile writes no prose itself: the revisions are written next, by you or by the assistant at your request. Step 2 (mode 'apply', with revisions): keeps a revision only if verify_rewrite passes (identical numbers, citations, locked terms and claim strength) and no eight-word phrase is copied from your voice samples or the Q1 corpus, otherwise keeps the original; applies safe grammar fixes (live: true, sends text to LanguageTool); then runs claim_audit, references (live: true for Crossref), suggestions for unsupported claims from your local library (DOI and quartile required; Q1-Q2, or Q1-Q4 plus books for systematic reviews; never inserted), number consistency across files, file_check and readiness. A disclosure statement is never changed; the journal's policy is reported if you pass its text. Returns revised text per file (or writes .revised.md files to out_dir, never over the originals), the full log, number mismatches, the reference report, the readiness report and what was not processed within time_budget_minutes. It never writes file properties.",
  inputSchema: {
    files: z.array(file).min(1).max(20),
    mode: z.enum(["plan", "apply"]).optional().describe("Default: apply when revisions are given, otherwise plan"),
    revisions: z.array(z.object({ file: z.string(), paragraph: z.string(), text: z.string().max(20000) })).max(2000).optional(),
    author_voice: z.array(z.string()).max(10).optional().describe("Paths (or texts) of your own approved papers"),
    paper_type: z.enum(["empirical", "systematic_review", "conceptual"]).optional(),
    language_variant: z.enum(["en-GB", "en-US"]).optional(),
    target_journal: z.string().max(300).optional(),
    time_budget_minutes: z.number().positive().max(1440).optional(),
    locked_terms: z.array(z.string().max(120)).max(100).optional(),
    seed: z.number().int().optional(),
    live: z.boolean().optional().describe("Allow grammar (LanguageTool) and reference (Crossref) lookups; they send text out"),
    word_limit: z.number().int().positive().optional(),
    anonymised: z.boolean().optional(),
    journal_policy_text: z.string().max(100000).optional().describe("The journal's policy on generative AI and writing support"),
    out_dir: z.string().optional().describe("Write .revised.md files here (never over existing files)"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler(args) { const mode = args.mode || (args.revisions && args.revisions.length ? "apply" : "plan"); return mode === "plan" ? plan(args) : apply(args); },
};
