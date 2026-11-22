// Timeline export (specification 21.6 and 21.7): the full history of one paper in date order, as Markdown or
// DOCX. The export holds only the owner's own record: events, decisions and documents (file names and SHA-256).
// Full letter texts written by others (editors, reviewers, co-authors) stay in the record and are not exported.
import fs from "node:fs";
import path from "node:path";
import { exportsDir, nowIso } from "./store.js";
import { listEvents } from "./events.js";
import { getPaper } from "./papers.js";
import { listRequests } from "./requests.js";

const OWN = a => !a || a === "self";
const esc = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export async function timelineRows(paper_id) {
  const paper = await getPaper(paper_id);
  if (!paper) throw new Error(`no paper with id ${paper_id}`);
  const events = await listEvents(paper_id);
  const reqs = await listRequests({ paper_id });
  const rows = events.map(e => {
    const n = reqs.filter(q => q.event_id === e.id);
    const decision = e.type === "decision" || e.type === "desk_decision" ? e.data?.decision || null : null;
    const notes = [];
    if (e.type === "correction") notes.push(`corrects ${e.corrects}`);
    if (e.voided) notes.push("withdrawn by a correction");
    else if (e.corrected_by.length) notes.push(`corrected by ${e.corrected_by.join(", ")}`);
    if (n.length) notes.push(`${n.length} requests: ${["open", "addressed", "partly", "declined"].map(s => `${n.filter(q => q.status === s).length} ${s}`).join(", ")}`);
    return { id: e.id, date: e.occurred_at, type: e.type, journal: e.journal, actor: e.actor, summary: e.summary, decision,
      body: OWN(e.actor) && e.body ? e.body : null, files: e.files.map(f => ({ name: path.basename(f.path), sha256: f.sha256, kind: f.kind })), notes };
  });
  return { paper, rows };
}

export async function timelineMarkdown(paper_id) {
  const { paper, rows } = await timelineRows(paper_id);
  const L = [`# Timeline: ${paper.title}`, "", `Paper id: ${paper.id}${paper.short_name ? ` (${paper.short_name})` : ""}. Status now: ${paper.status || "none"}. Exported ${nowIso().slice(0, 10)}.`, "",
    "Only the owner's own record is listed: events, decisions and documents. Letters written by others are kept in the local record and summarised here.", "",
    "| Date | Event | Journal | From | Summary | Documents | Notes |", "|---|---|---|---|---|---|---|"];
  for (const r of rows) L.push(`| ${r.date.slice(0, 10)} | ${r.type}${r.decision ? ` (${r.decision})` : ""} | ${esc(r.journal)} | ${esc(r.actor)} | ${esc(r.summary)} | ${esc(r.files.map(f => `${f.name} (SHA-256 ${f.sha256.slice(0, 12)}…)`).join("; "))} | ${esc(r.notes.join("; "))} |`);
  const own = rows.filter(r => r.body);
  if (own.length) { L.push("", "## Owner's notes and decisions", ""); for (const r of own) L.push(`### ${r.date.slice(0, 10)} — ${r.type}`, "", r.body, ""); }
  return { paper, rows, markdown: L.join("\n") + "\n" };
}

/** Write the timeline as DOCX (docx package). Returns the file path. */
export async function timelineDocx(paper_id, out = null) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import("docx");
  const { paper, rows } = await timelineRows(paper_id);
  const cell = t => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ""), size: 18 })] })] });
  const head = ["Date", "Event", "Journal", "From", "Summary", "Documents", "Notes"];
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ tableHeader: true, children: head.map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })] })) }),
    ...rows.map(r => new TableRow({ children: [r.date.slice(0, 10), r.type + (r.decision ? ` (${r.decision})` : ""), r.journal, r.actor, r.summary,
      r.files.map(f => `${f.name} (SHA-256 ${f.sha256})`).join("; "), r.notes.join("; ")].map(cell) })),
  ] });
  const own = rows.filter(r => r.body).flatMap(r => [new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(`${r.date.slice(0, 10)} — ${r.type}`)] }),
    ...r.body.split(/\n+/).map(t => new Paragraph({ children: [new TextRun(t)] }))]);
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`Timeline: ${paper.title}`)] }),
    new Paragraph({ children: [new TextRun(`Paper id: ${paper.id}. Status now: ${paper.status || "none"}. Exported ${nowIso().slice(0, 10)}.`)] }),
    new Paragraph({ children: [new TextRun("Only the owner's own record is listed: events, decisions and documents.")] }),
    table,
    ...(own.length ? [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Owner's notes and decisions")] }), ...own] : []),
  ] }] });
  const file = out || path.join(exportsDir(), `${paper.id}-timeline-${nowIso().slice(0, 10)}.docx`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
  return file;
}

export default { timelineRows, timelineMarkdown, timelineDocx };
