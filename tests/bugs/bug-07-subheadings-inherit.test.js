// Item 7: unnumbered sub-headings take the role of the section above them (author's export, 13 Nov 2026).
import { assert, L, parseText } from "./_lib.js";
const H = ["Abstract", "Introduction", "Literature Review", "Diversification and New Services", "Gap", "Theory and Propositions", "Scope and Opportunity Cost", "Data and Methods", "Design and Evidence", "Related Parties", "Results", "Discussion", "What the Bounds Say", "Limitations", "Conclusion"], EMPTY = ["Literature Review", "Theory and Propositions", "Data and Methods", "Discussion"];
const t = H.map(h => h + "  \n  \n" + (EMPTY.includes(h) ? "" : "Small firms add services to rooms they already have (Panzar & Willig, 1981). We contribute bounds.  \n  \n")).join("");
const roles = Object.fromEntries(L.analyze(t).sections.map(s => [s.title.trim(), s.role]));
assert.equal(roles["Design and Evidence"], "methods"); assert.equal(roles["Gap"], "literature");
assert.equal(roles["What the Bounds Say"], "discussion"); assert.equal(roles["Related Parties"], "declarations");
const d = parseText(t), keyOf = h => d.sections.find(s => s.heading === h)?.key;
assert.equal(keyOf("Design and Evidence"), "methods"); assert.equal(keyOf("Gap"), "literature"); assert.equal(keyOf("Related Parties"), "disclosure");
