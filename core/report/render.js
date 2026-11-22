// Renders the committee report (specification Section 13): one page (header, overall, one row per role, human
// checklist), then the details (every finding with rule ID, text span, source and fix).
// Formats: JSON, Markdown, HTML and DOCX. Headings are black. Each light shows an icon AND a word, never colour alone;
// the colours are the Okabe-Ito colour-blind-safe set.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, PageBreak, BorderStyle } from "docx";
import { LIGHTS, ROLE_NAMES, LABEL } from "./committee.js";

const STATE_ICON = { "ready to submit": "✔", "revise first": "▲", "not ready": "✖" };
const STATE_LIGHT = { "ready to submit": "green", "revise first": "amber", "not ready": "red" };
const lightText = l => `${LIGHTS[l].icon} ${LIGHTS[l].word}`;
const issue = f => `${f.rule} (${f.severity}): ${f.title}`;
const where = f => f.span ? `${f.span.section || "?"} [${f.span.start}–${f.span.end}]` : "whole document";
const clip = (s, n = 240) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const src = f => [f.source, f.source_ref].filter(Boolean).join(", ") || "—";

export function renderJSON(report) { return JSON.stringify(report, null, 2); }

// ---------- Markdown ----------
const mdCell = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
export function renderMarkdown(r) {
  const h = r.header, out = [];
  out.push(`# Committee report${h.title ? ": " + h.title : ""}`, "", `**${r.label}**`, "");
  out.push(`- Design: ${h.design} (${h.design_source})`, `- Target journal: ${h.journal || "not given"}`, `- Date: ${h.date}`, `- Quartile version: ${h.quartile_version}`, "");
  out.push("## Overall", "", `${STATE_ICON[r.overall]} **${r.overall}** — readiness ${r.readiness} / 100`, "", r.readiness_note, "");
  out.push("## Roles", "", "| Role | Light | Blockers | Majors | Top 3 issues |", "|---|---|---|---|---|");
  for (const x of [...r.roles, ...r.other_roles]) out.push(`| ${mdCell(x.name)} | ${lightText(x.light)} | ${x.blockers} | ${x.majors} | ${mdCell(x.top3.map(issue).join("; ") || "—")} |`);
  if (r.other_roles.length) out.push("", "Rows after the six committee roles are shown for information; they do not set the overall state.");
  out.push("", "## Human checklist", "");
  if (r.needsHuman.length) for (const f of r.needsHuman) out.push(`- [ ] ${f.rule}: ${f.title}${f.source_ref ? " (" + f.source_ref + ")" : ""}`);
  else out.push("No items to check by hand.");
  if (r.downgraded.length) out.push("", "Downgraded by local feedback: " + r.downgraded.map(d => `${d.rule} (${d.false_positives} false positives)`).join(", "));
  out.push("", "## Details", "");
  const fs = r.findings.filter(f => f.status !== "needs_human");
  if (!fs.length) out.push("No findings.");
  for (const f of fs) {
    out.push(`### ${f.rule} — ${f.title}`, "", `- Role: ${ROLE_NAMES[f.role] || f.role}; severity: ${f.severity}; confidence: ${f.confidence}${f.downgraded ? ` (was ${f.downgraded.from})` : ""}`,
      `- Where: ${where(f)}`, ...(f.span?.text ? [`- Text: "${clip(f.span.text)}"`] : []), `- Message: ${f.message}`, `- Source: ${src(f)}`, `- Fix: ${f.fix || "—"}`, "");
  }
  return out.join("\n");
}

// ---------- HTML ----------
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const badge = l => `<span class="light ${l}" style="background:${LIGHTS[l].color}"><span aria-hidden="true">${LIGHTS[l].icon}</span> ${LIGHTS[l].word}</span>`;
export function renderHTML(r) {
  const h = r.header;
  const rows = [...r.roles, ...r.other_roles].map(x => `<tr><td>${esc(x.name)}</td><td>${badge(x.light)}</td><td>${x.blockers}</td><td>${x.majors}</td><td>${x.top3.length ? "<ul>" + x.top3.map(f => `<li>${esc(issue(f))}</li>`).join("") + "</ul>" : "—"}</td></tr>`).join("\n");
  const human = r.needsHuman.length ? "<ul>" + r.needsHuman.map(f => `<li>☐ ${esc(f.rule)}: ${esc(f.title)}</li>`).join("") + "</ul>" : "<p>No items to check by hand.</p>";
  const det = r.findings.filter(f => f.status !== "needs_human").map(f => `<section class="finding"><h3>${esc(f.rule)} — ${esc(f.title)}</h3>
<p><b>Role:</b> ${esc(ROLE_NAMES[f.role] || f.role)}; <b>severity:</b> ${esc(f.severity)}; <b>confidence:</b> ${esc(f.confidence)}${f.downgraded ? ` (was ${esc(f.downgraded.from)})` : ""}</p>
<p><b>Where:</b> ${esc(where(f))}</p>${f.span?.text ? `<blockquote>${esc(clip(f.span.text, 400))}</blockquote>` : ""}
<p><b>Message:</b> ${esc(f.message)}</p><p><b>Source:</b> ${esc(src(f))}</p><p><b>Fix:</b> ${esc(f.fix || "—")}</p></section>`).join("\n") || "<p>No findings.</p>";
  const st = STATE_LIGHT[r.overall];
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Committee report${h.title ? ": " + esc(h.title) : ""}</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#000;max-width:60rem;margin:2rem auto;padding:0 1rem;line-height:1.45}
h1,h2,h3{color:#000}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:.35rem .5rem;text-align:left;vertical-align:top}
.light{display:inline-block;padding:.1rem .5rem;border-radius:.3rem;color:#000;font-weight:700;white-space:nowrap}
.label{font-weight:700;border:2px solid #000;padding:.4rem .6rem;display:inline-block}
.page1{page-break-after:always}
blockquote{border-left:4px solid #555;margin:.3rem 0;padding:.2rem .6rem;color:#222}
</style></head><body>
<div class="page1">
<h1>Committee report${h.title ? ": " + esc(h.title) : ""}</h1>
<p class="label">${esc(r.label)}</p>
<ul><li>Design: ${esc(h.design)} (${esc(h.design_source)})</li><li>Target journal: ${esc(h.journal || "not given")}</li><li>Date: ${esc(h.date)}</li><li>Quartile version: ${esc(h.quartile_version)}</li></ul>
<h2>Overall</h2>
<p>${badge(st)} <b>${esc(r.overall)}</b> — readiness ${r.readiness} / 100</p>
<p>${esc(r.readiness_note)}</p>
<h2>Roles</h2>
<table><thead><tr><th>Role</th><th>Light</th><th>Blockers</th><th>Majors</th><th>Top 3 issues</th></tr></thead><tbody>
${rows}
</tbody></table>
<h2>Human checklist</h2>
${human}
</div>
<h2>Details</h2>
${det}
</body></html>`;
}

// ---------- DOCX ----------
const BLACK = "000000";
const hex = c => c.replace("#", "").toUpperCase();
const p = (text, o = {}) => new Paragraph({ children: [new TextRun({ text: String(text ?? ""), bold: o.bold, color: BLACK })], ...(o.heading ? { heading: o.heading } : {}) });
const cell = (content, o = {}) => new TableCell({
  children: (Array.isArray(content) ? content : [content]).map(t => t instanceof Paragraph ? t : p(t, { bold: o.bold })),
  ...(o.fill ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: o.fill } } : {}),
  ...(o.width ? { width: { size: o.width, type: WidthType.PERCENTAGE } } : {}),
});
/** A plain table: headers (strings) and rows (arrays of strings or { text, fill }). Shared with the response tracker. */
export function docxTable(headers, rows, widths = []) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "444444" };
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [new TableRow({ tableHeader: true, children: headers.map((t, i) => cell(t, { bold: true, width: widths[i] })) }),
      ...rows.map(r => new TableRow({ children: r.map((c, i) => c && typeof c === "object" && !Array.isArray(c) && !(c instanceof Paragraph) ? cell(c.text, { fill: c.fill, bold: c.bold, width: widths[i] }) : cell(c, { width: widths[i] })) }))] });
}
export const DOCX_STYLES = { paragraphStyles: [
  { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 32, color: BLACK }, paragraph: { spacing: { before: 240, after: 120 } } },
  { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 26, color: BLACK }, paragraph: { spacing: { before: 200, after: 80 } } },
  { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { bold: true, size: 22, color: BLACK }, paragraph: { spacing: { before: 160, after: 60 } } },
] };

export function docxDocument(r) {
  const h = r.header;
  const lightCell = l => ({ text: lightText(l), fill: hex(LIGHTS[l].color), bold: true });
  const page1 = [
    p(`Committee report${h.title ? ": " + h.title : ""}`, { heading: HeadingLevel.HEADING_1 }),
    p(r.label, { bold: true }),
    p(`Design: ${h.design} (${h.design_source})`), p(`Target journal: ${h.journal || "not given"}`), p(`Date: ${h.date}`), p(`Quartile version: ${h.quartile_version}`),
    p("Overall", { heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [new TextRun({ text: `${STATE_ICON[r.overall]} ${r.overall}`, bold: true, color: BLACK }), new TextRun({ text: ` — readiness ${r.readiness} / 100`, color: BLACK })] }),
    p(r.readiness_note),
    p("Roles", { heading: HeadingLevel.HEADING_2 }),
    docxTable(["Role", "Light", "Blockers", "Majors", "Top 3 issues"],
      [...r.roles, ...r.other_roles].map(x => [x.name, lightCell(x.light), String(x.blockers), String(x.majors), x.top3.length ? x.top3.map(f => p("• " + issue(f))) : "—"]), [24, 14, 10, 10, 42]),
    p("Human checklist", { heading: HeadingLevel.HEADING_2 }),
    ...(r.needsHuman.length ? r.needsHuman.map(f => p(`☐ ${f.rule}: ${f.title}`)) : [p("No items to check by hand.")]),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  const fs = r.findings.filter(f => f.status !== "needs_human");
  const details = [p("Details", { heading: HeadingLevel.HEADING_2 }), ...(fs.length ? fs.flatMap(f => [
    p(`${f.rule} — ${f.title}`, { heading: HeadingLevel.HEADING_3 }),
    p(`Role: ${ROLE_NAMES[f.role] || f.role}; severity: ${f.severity}; confidence: ${f.confidence}${f.downgraded ? ` (was ${f.downgraded.from})` : ""}`),
    p(`Where: ${where(f)}`), ...(f.span?.text ? [p(`Text: "${clip(f.span.text, 400)}"`)] : []),
    p(`Message: ${f.message}`), p(`Source: ${src(f)}`), p(`Fix: ${f.fix || "—"}`)]) : [p("No findings.")])];
  return new Document({ creator: "Quartile", title: `Committee report${h.title ? ": " + h.title : ""}`, description: LABEL, styles: DOCX_STYLES,
    sections: [{ children: [...page1, ...details] }] });
}
/** DOCX as a Buffer. */
export async function renderDocx(report) { return Packer.toBuffer(docxDocument(report)); }

export function render(report, format = "json") {
  if (format === "json") return renderJSON(report);
  if (format === "markdown" || format === "md") return renderMarkdown(report);
  if (format === "html") return renderHTML(report);
  if (format === "docx") return renderDocx(report);
  throw new Error(`Unknown format: ${format}`);
}

export default { render, renderJSON, renderMarkdown, renderHTML, renderDocx, docxDocument, docxTable, DOCX_STYLES };
