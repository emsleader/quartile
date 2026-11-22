// Item 6: plain-text headings with a colon, a period, capitals, "Section 3:" or many words are sections.
import { assert, L, parseText } from "./_lib.js";
const doc = h => "Abstract\nThis paper studies firms and their costs in a long sentence.\n" + h + "\nWe use filed accounts and advertised prices to build the bounds here.\nConclusion\nEnd of the paper here.";
for (const h of ["Data and Methods:", "3. Data and methods.", "DATA AND METHODS:", "Section 3: Data and Methods"]) {
  assert.equal(L.parse(doc(h)).sections.map(x => x.role).join(","), "abstract,methods,conclusion", h);
  assert.deepEqual(parseText(doc(h)).sections.map(s => s.key), ["abstract", "methods", "conclusion"], h);
}
assert.equal(L.parse("Introduction\nPrior work (Jones, 2020) shows X.\nData matter here.").paras.filter(p => p.isHeading).length, 1, "short sentences are not headings");
