// Items 11-12: EGBA figures recycle line types and shades for any number of cells, and warn above 8 cells.
import { assert, RS } from "./_lib.js";
if (await RS.available()) {
  const cells = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"];
  const csv = "param,form,country,sector,low,high,evidence_class,related_party\n" + cells.map(c => `rho,S,${c},all,0.08,0.10,B,0\np,S,${c},all,50,100,D,0\nF,S,${c},all,20000,40000,C,0\nF,I,${c},all,5000,10000,C,0\no,I,${c},all,2,8,E,0`).join("\n") + "\n";
  const r = await RS.run({ data: csv, analyses: [{ procedure: "egba", cells: cells.map(c => c + ":all"), q_grid: [1000, 10000], q_star: 1000 }] });
  assert.ok(!r.error, r.error);
  assert.equal(r.figures.filter(f => /EGBA/.test(f.title)).length, 2 + cells.length, "all figures drawn for 9 cells");
  assert.ok(r.apa.some(l => /EGBA warning: 9 cells/.test(l)), "warning above 8 cells");
} else console.log("R not installed: bug 11-12 skipped");
