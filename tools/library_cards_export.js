// library_cards_export: paper cards as an extraction table (one row per paper), Excel or CSV.
import { z } from "zod";
import ExcelJS from "exceljs";
import { cardRows } from "../core/library/cards.js";
import { lib, writeOut } from "./_library.js";
const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
export default {
  name: "library_cards_export",
  title: "Export paper cards as a table",
  description: "Exports saved paper cards as one row per paper (title, DOI, design, countries, period, sample, methods, search and screening, theory, question, contribution, findings with evidence labels, limitations, funding, conflicts, missing fields) for an SLR extraction table or a literature matrix. Excel (.xlsx) or CSV; returned as base64 or written to a local path. The table holds sentences from the papers: keep it private.",
  inputSchema: {
    format: z.enum(["xlsx", "csv"]).optional(),
    ids: z.array(z.string()).optional().describe("Only these cards (default: all)"),
    out_path: z.string().optional().describe("Write the file here (it is not overwritten unless overwrite is true)"),
    overwrite: z.boolean().optional(),
  },
  async handler({ format = "xlsx", ids, out_path, overwrite }) {
    const rows = cardRows(await lib(), { ids });
    if (!rows.length) return { rows: 0, note: "No cards yet. Make one with paper_card." };
    const cols = Object.keys(rows[0]);
    let buf;
    if (format === "csv") buf = Buffer.from([cols.join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\n"), "utf8");
    else {
      const wb = new ExcelJS.Workbook(); wb.creator = "Quartile"; const ws = wb.addWorksheet("Paper cards");
      ws.columns = cols.map(c => ({ header: c, key: c, width: ["findings", "sample", "methods", "question", "contribution", "limitations", "search_and_screening"].includes(c) ? 60 : 22 }));
      rows.forEach(r => ws.addRow(r)); ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.eachRow(r => r.eachCell(c => { c.alignment = { wrapText: true, vertical: "top" }; }));
      buf = Buffer.from(await wb.xlsx.writeBuffer());
    }
    if (out_path) return { rows: rows.length, file: writeOut(out_path, buf, overwrite) };
    return { rows: rows.length, format, [format + "_base64"]: buf.toString("base64") };
  },
};
