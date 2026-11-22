// Item 4: a "Limitations" heading counts as a limitations section.
import { assert, EV, parseText } from "./_lib.js";
const t = "# 3. Design\n\nWe use filings.\n\n# 9. Limitations known in advance\n\nNone listed here.";
assert.ok(EV.claimAudit(t).checks.find(c => /Limitations/.test(c.t)).ok);
assert.ok(parseText(t).hasSection("limitations"));
