// Planted-error generator. Inserts known errors into a clean text and writes a gold case with the expected
// findings. Rule IDs follow the specification: MTH-03 sample flow, STA-01 GRIM, MTH-CAUSAL-01 causal wording,
// ETH-01 ethics approval number, STA-05 n consistency. The negated sentence must not flag MTH-CAUSAL-01.
import fs from "node:fs";
import { parseText } from "../../core/text/parse.js";

export const PLANTS = [
  { rule: "MTH-03", where: "methods", text: "Of 8,159 records, 412 were duplicates and were removed, leaving 7,700 for screening." },
  { rule: "STA-01", where: "results", text: "Mean satisfaction on the five-point item was 3.47 (n = 25)." },
  { rule: "MTH-CAUSAL-01", where: "discussion", text: "Owner experience causes higher survival among the surveyed firms." },
  { rule: "ETH-01", where: "methods", text: "The study was approved by the university ethics committee." },
  { rule: "STA-05", where: "results", text: "The final sample has 412 firms (n = 418 in Table 2)." },
  { rule: null, negative_of: "MTH-CAUSAL-01", where: "discussion", text: "The survey does not show that owner experience causes higher survival." },
];

export function plant(clean, plants = PLANTS) {
  const paras = clean.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const p of plants) {
    const i = paras.findIndex(x => new RegExp("^#*\\s*(\\d+\\.?\\s*)?" + ({ methods: "(data|method)", results: "(results|findings)", discussion: "discussion" })[p.where], "i").test(x.trim()));
    paras.splice(i >= 0 ? i + 1 : paras.length, 0, p.text);
  }
  const text = paras.join("\n\n"), doc = parseText(text);
  const expected = plants.filter(p => p.rule).map(p => { const s = doc.sentences.find(x => x.text === p.text) || {}; return { rule: p.rule, section: s.section, start: s.start, end: s.end, note: "planted" }; });
  return { text, expected, planted: true };
}

if (process.argv[1] && process.argv[1].endsWith("plant.js") && process.argv[2]) {
  const out = plant(fs.readFileSync(process.argv[2], "utf8"));
  fs.writeFileSync(process.argv[3] || "planted.json", JSON.stringify({ id: "planted-" + Date.now(), licence: "synthetic", ...out }, null, 2));
}
export default { plant, PLANTS };
