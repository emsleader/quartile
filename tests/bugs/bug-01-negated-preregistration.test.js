// Item 1: "never a prospective preregistration" is a denial and must not trigger the preregistration rule.
import { assert, EV, parseText } from "./_lib.js";
import { loadRules } from "../../core/rules/loader.js";
import { runRules } from "../../core/rules/engine.js";
const s = "The data were explored first, so it was never a prospective preregistration; it is a time-stamped analysis protocol.";
assert.equal(EV.claimAudit("# 3. Design\n\n" + s).findings.length, 0);
const r = loadRules().filter(x => x.id === "QC-CLAIM-PREREG");
assert.equal(runRules(parseText("# Methods\n\n" + s), r).length, 0, "rulebook version agrees");
assert.equal(EV.claimAudit("# Methods\n\nThe protocol was preregistered on Zenodo after an initial look at the data.").findings.length, 1, "affirmative still flagged");
