// Item 13: the APA sentence for an assumption-sensitive cell says the sign is not identified at any rung.
import { assert, RS } from "./_lib.js";
if (await RS.available()) {
  const csv = "param,form,country,sector,low,high,evidence_class,related_party\nrho,S,ZZ,all,0.08,0.10,B,0\np,S,ZZ,all,50,100,D,0\nF,S,ZZ,all,20000,40000,C,0\nF,I,ZZ,all,5000,10000,C,0\no,I,ZZ,all,2,60,E,0\n";
  const r = await RS.run({ data: csv, analyses: [{ procedure: "egba", cells: ["ZZ:all"], q_grid: [1000], q_star: 1000 }] });
  assert.ok(r.apa.some(l => /\(assumption-sensitive\) \(sign not identified at any rung\)/.test(l)), r.apa.join("\n"));
} else console.log("R not installed: bug 13 skipped");
