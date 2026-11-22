// Item 2: "is never read as if it showed the profit" is a denial and must not trigger the entity-profit rule.
import { assert, EV } from "./_lib.js";
assert.equal(EV.claimAudit("# Design\n\nThe accounts of a diversified business are never read as if they showed the profit of its EMS corner.").findings.length, 0);
assert.equal(EV.claimAudit("# Results\n\nUsing annual accounts, integrated EMS services are more profitable.").findings.length, 1, "affirmative still flagged");
