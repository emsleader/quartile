// Item 3: a "Conflict of interest" heading is evidence of a disclosure, even when the section body is short.
import { assert, EV, parseText } from "./_lib.js";
const t = "# 3. Design\n\nWe use filings.\n\n# 10. Conflict of interest, related parties and funding\n\nSee the register.";
assert.ok(EV.claimAudit(t).checks.find(c => /Conflict/.test(c.t)).ok);
assert.ok(parseText(t).hasSection("disclosure"), "document model names the section");
