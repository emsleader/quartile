// committee_review (specification Sections 13 and 15): simulated pre-submission review by six roles.
import { z } from "zod";
import { parseText, parseFile } from "../core/text/parse.js";
import { classifyDesign, DESIGNS } from "../core/text/design.js";
import { loadRules } from "../core/rules/loader.js";
import { runRules } from "../core/rules/engine.js";
import { runAll } from "../core/roles/index.js";
import { committeeReport, ROLES } from "../core/report/committee.js";
import { renderMarkdown, renderDocx } from "../core/report/render.js";

/** Title: the first paragraph when it is short and not the abstract. */
export function docTitle(doc) {
  const p = doc.paragraphs.find(x => x.text.trim());
  if (!p) return null;
  const t = p.text.replace(/^#+\s*/, "").trim();
  return t.length <= 250 && t.split(/\s+/).length <= 30 && !/^(abstract|introduction|1\.?\s)/i.test(t) && !/\.$/.test(t) ? t : null;
}

export async function committeeReview({ text, path, journal, design, roles: only, docx = false, feedback = true } = {}) {
  if (!text && !path) throw new Error("committee_review: give the manuscript as `text` or as a local `path` (.docx, .pdf, .txt)");
  const doc = path ? await parseFile(path, { design: design || null }) : parseText(text, { design: design || null });
  doc.design = classifyDesign(doc, design ?? null);
  const roleList = only && only.length ? only : null;
  const findings = [
    ...runRules(doc, loadRules(), { roles: roleList || undefined }),
    ...(await runAll(doc, { journal, only: roleList || ROLES })),
  ];
  const report = committeeReport(findings, doc.design, { title: docTitle(doc), journal, feedback });
  if (roleList) report.roles_run = roleList;
  const out = { ...report, markdown: renderMarkdown(report) };
  if (docx) out.docx_base64 = (await renderDocx(report)).toString("base64");
  return out;
}

export default {
  name: "committee_review",
  title: "Committee review (simulated pre-submission review)",
  description: "Simulated pre-submission review by six roles (editor-in-chief, methods, finance and statistics, business, production, ethics). Runs the rulebook and the role checks for the detected or declared design and returns one light per role (icon and word), a readiness score, the overall readiness state (ready to submit / revise first / not ready), a human checklist and every finding with rule ID, span, source and fix, plus Markdown and optional DOCX. Not a journal decision. Runs locally; no manuscript text leaves the machine.",
  inputSchema: {
    text: z.string().min(1).max(400000).optional().describe("Manuscript text (or give path)"),
    path: z.string().optional().describe("Local .docx, .pdf or .txt file"),
    journal: z.string().max(300).optional().describe("Target journal"),
    design: z.enum(DESIGNS).optional().describe("Declared design; overrides detection"),
    roles: z.array(z.enum(ROLES)).optional().describe("Run only these roles"),
    docx: z.boolean().optional().describe("Also return the report as DOCX (base64)"),
  },
  async handler(args) { return committeeReview(args); },
};
