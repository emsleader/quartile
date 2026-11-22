// Item 9: numbers in a table whose output was not supplied are reported apart and carry no penalty.
import { assert, REG, RD } from "./_lib.js";
const ms = "# Results\n\nThe slope is 0.70 (r = 0.97).\n\n| Variable | Mean | SD |\n|---|---|---|\n| Cost | 118.42 | 31.07 |\n| Price | 245.90 | 12.66 |\n";
const reg = REG.registry(ms, [{ name: "model.txt", text: "estimate 0.70 r 0.97" }]);
assert.equal(reg.untraced.outputNotSupplied, 4, "the table's four numbers: output not supplied");
assert.equal(reg.untraced.notFoundInSuppliedOutput, 0);
assert.ok(reg.rows.filter(r => r.table).every(r => r.untracedReason === "output not supplied"));
const rd = RD.readiness(ms, { outputs: [{ name: "model.txt", text: "estimate 0.70 r 0.97" }] });
const pen = rd.penalties.find(p => p.area === "Number registry");
assert.ok(!pen || pen.points === 0 || pen.penalty === 0, "no penalty for the table");
