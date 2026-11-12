// Excel in and out for the statistics tool (exceljs 4.4.0, MIT).
// xlsxToCsv: first sheet (or a named sheet) to CSV text. workbook: results, figures and the reproducibility
// record as one .xlsx file. Everything in the workbook comes from the R run; nothing is written by hand.
let ExcelJS = null;
const lib = () => ExcelJS || (ExcelJS = require(require.resolve("exceljs", { paths: [__dirname, require("path").join(__dirname, "..", "mcp")] })));

async function xlsxToCsv(buf, sheetName) {
  const wb = new (lib().Workbook)(); await wb.xlsx.load(buf);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error(sheetName ? `No sheet named '${sheetName}' (sheets: ${wb.worksheets.map(w => w.name).join(", ")})` : "The workbook has no sheets.");
  const cell = v => { if (v == null) return ""; if (typeof v === "object") { if (v instanceof Date) return v.toISOString().slice(0, 10); if ("result" in v) return cell(v.result); if ("text" in v) return cell(v.text); if (v.richText) return v.richText.map(t => t.text).join(""); if ("error" in v) return ""; } return String(v); };
  const q = s => /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const width = ws.actualColumnCount || ws.columnCount, rows = [];
  ws.eachRow({ includeEmpty: false }, row => { const vals = []; for (let c = 1; c <= width; c++) vals.push(q(cell(row.getCell(c).value))); rows.push(vals.join(",")); });
  return { csv: rows.join("\n"), sheet: ws.name, sheets: wb.worksheets.map(w => w.name) };
}

// a result object to rows: arrays of objects become tables, scalars become name/value rows
function tables(result) {
  const out = [], scalars = [];
  const walk = (o, pre) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (k === "procedure") continue; const name = pre ? pre + "." + k : k;
      if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null) out.push({ name, rows: v });
      else if (Array.isArray(v)) scalars.push([name, v.join(", ")]);
      else if (v && typeof v === "object") { const vals = Object.values(v); if (vals.length && vals.every(x => x && typeof x === "object" && !Array.isArray(x))) out.push({ name, rows: Object.entries(v).map(([kk, vv]) => ({ variable: kk, ...vv })) }); else walk(v, name); }
      else scalars.push([name, v]);
    }
  };
  walk(result, ""); return { scalars, tables: out };
}
async function workbook(res, title = "Quartile statistics") {
  const wb = new (lib().Workbook)(); wb.creator = "Quartile"; wb.created = new Date(res.record.created);
  const head = r => { r.font = { bold: true }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEFF3" } }; };
  const sum = wb.addWorksheet("Summary"); sum.columns = [{ width: 140 }];
  sum.addRow([title]).font = { bold: true, size: 14 }; sum.addRow([`Computed in ${res.record.r_version}, ${res.record.created}`]); sum.addRow([]);
  res.apa.forEach(l => sum.addRow([l]));
  res.results.forEach((r, i) => {
    const ws = wb.addWorksheet(`${i + 1} ${r.procedure}`.slice(0, 31)); const { scalars, tables: tb } = tables(r.result || {});
    ws.addRow([`${r.procedure}: ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !["result", "procedure"].includes(k))))}`]).font = { bold: true };
    if (scalars.length) { ws.addRow([]); head(ws.addRow(["Statistic", "Value"])); scalars.forEach(s => ws.addRow(s)); }
    tb.forEach(t => { ws.addRow([]); ws.addRow([t.name]).font = { italic: true }; const cols = [...new Set(t.rows.flatMap(x => Object.keys(x)))]; head(ws.addRow(cols)); t.rows.forEach(x => ws.addRow(cols.map(c => { const v = x[c]; return v && typeof v === "object" ? JSON.stringify(v) : v; }))); });
    ws.columns.forEach(c => { c.width = 18; }); ws.getColumn(1).width = 34;
    ws.eachRow(row => row.eachCell(c => { if (typeof c.value === "number") c.numFmt = Math.abs(c.value) < 0.001 && c.value !== 0 ? "0.00E+00" : "0.0000"; }));
  });
  if (res.figures && res.figures.length) {
    const fw = wb.addWorksheet("Figures"); let row = 1;
    res.figures.forEach(f => { fw.getCell(row, 1).value = `Figure ${f.analysis}.${row}: ${f.title}`; fw.getCell(row, 1).font = { bold: true };
      const id = wb.addImage({ base64: "data:image/png;base64," + f.png_base64, extension: "png" }); fw.addImage(id, { tl: { col: 0, row }, ext: { width: 720, height: 495 } }); row += 28; });
  }
  const rp = wb.addWorksheet("Reproducibility"); rp.columns = [{ width: 24 }, { width: 100 }];
  head(rp.addRow(["Field", "Value"])); Object.entries(res.record).forEach(([k, v]) => rp.addRow([k, String(v)]));
  (res.figures || []).forEach(f => rp.addRow([`figure ${f.file}`, f.sha256]));
  rp.addRow([]); rp.addRow(["R script"]).font = { bold: true }; res.script.split("\n").forEach(l => rp.addRow(["", l]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
module.exports = { xlsxToCsv, workbook, tables };
