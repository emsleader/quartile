// committee_review (specification Sections 13 and 15): simulated pre-submission review by six roles.
import { z } from "zod";
import { parseText, parseFile } from "../core/text/parse.js";
import { classifyDesign, DESIGNS } from "../core/text/design.js";
import { loadRules } from "../core/rules/loader.js";
import { runRules } from "../core/rules/engine.js";
import { runAll } from "../core/roles/index.js";
import { committeeReport, ROLES } from "../core/report/committee.js";
import { renderMarkdown, renderDocx } from "../core/report/render.js";
import fs from "node:fs";
import { dbPath } from "../core/store/db.js";
import { readApprovedLessonsFile } from "../core/record/index.js";

// Old claim-audit rules that a role now checks more precisely: when both flag the same sentence, keep the role's finding.
const SUPERSEDED = { "QC-CLAIM-CAUSAL": /^MTH-CAUSAL-/, "QC-CLAIM-PREREG": /^MTH-05$/ };
export function dedupeAcross(findings) {
  const over = (a, b) => a.span && b.span && a.span.start < b.span.end && b.span.start < a.span.end;
  return findings.filter(f => !(SUPERSEDED[f.rule] && findings.some(g => g !== f && SUPERSEDED[f.rule].test(g.rule) && over(f, g))));
}

/** Title: the first paragraph when it is short and not the abstract. */
export function docTitle(doc) {
  const p = doc.paragraphs.find(x => x.text.trim());
  if (!p) return null;
  const t = p.text.replace(/^#+\s*/, "").trim();
  return t.length <= 250 && t.split(/\s+/).length <= 30 && !/^(abstract|introduction|1\.?\s)/i.test(t) && !/\.$/.test(t) ? t : null;
}

export async function committeeReview({ text, path, journal, design, roles: only, docx = false, feedback = true, glossary, citation_policy, author, author_profile, library, writing } = {}) {
  if (!text && !path) throw new Error("committee_review: give the manuscript as `text` or as a local `path` (.docx, .pdf, .txt)");
  const doc = path ? await parseFile(path, { design: design || null }) : parseText(text, { design: design || null });
  doc.design = classifyDesign(doc, design ?? null);
  const roleList = only && only.length ? only : null;
  // lessons from earlier editor and reviewer letters, approved by the owner (Quartile Record, spec 21.7)
  const lessons = readApprovedLessonsFile({ journal: journal || null, design: doc.design.primary });
  const opts = { journal, glossary, citation_policy, author, author_profile, writing };
  let findings = [
    ...runRules(doc, [...loadRules(), ...lessons], { roles: roleList || undefined }),
    ...(await runAll(doc, { ...opts, only: roleList || [...ROLES, ...(writing === false ? [] : ["writing"])] })),
  ];
  // the owner's reference library (Quartile Library, spec 20.3 LIB-07), when one exists on this machine
  let libraryUsed = false;
  if (library !== false && (!roleList || roleList.includes("production")) && fs.existsSync(dbPath())) {
    const { openLibrary, matchManuscript } = await import("../core/library/index.js");
    const lib = await openLibrary();
    if (lib.all().length) { const m = matchManuscript(lib, { doc }); findings.push(...(m.findings || [])); libraryUsed = true; }
  }
  if (writing === false) findings = findings.filter(f => f.role !== "writing");
  findings = dedupeAcross(findings);
  const report = committeeReport(findings, doc.design, { title: docTitle(doc), journal, feedback });
  report.lessons = lessons.map(l => ({ rule: l.id, title: l.title, scope: l.scope, message: l.message }));
  report.library_used = libraryUsed;
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
    glossary: z.any().optional().describe("Term groups for terminology drift (PRD-06), or a path to glossary.yaml"),
    citation_policy: z.any().optional().describe("Citation policy for PRD-05, e.g. { min_q1q2_share: 0.8 }"),
    author: z.string().max(200).optional().describe("Author surname, for the self-citation share (PRD-07)"),
    author_profile: z.string().optional().describe("Path to author.yaml for the dual-role check (default $QUARTILE_HOME/author.yaml)"),
    library: z.boolean().optional().describe("Match citations against the local Quartile Library (default: when one exists)"),
    writing: z.boolean().optional().describe("Include the writing-style checks (default true)"),
  },
  async handler(args) { return committeeReview(args); },
};
