// Item 8: regression checks never run on a bounds paper; the design classifier detects bounds, and a declared design wins.
import { assert, L, parseText, BOUNDS_PAPER } from "./_lib.js";
const probs = L.analyze(BOUNDS_PAPER).businessResearchIssues.map(i => i.problem).join(" | ");
assert.ok(!/Endogeneity/.test(probs) && !/Standard errors: clustering/.test(probs));
assert.equal(parseText(BOUNDS_PAPER).design.primary, "bounds");
assert.equal(parseText(BOUNDS_PAPER, { design: "qualitative" }).design.primary, "qualitative", "declared design overrides detection");
