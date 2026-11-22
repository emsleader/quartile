// Phase 8: manuscript matching (LIB-07) and citation policy (LIB-06) on synthetic manuscripts.
// Every in-text citation must be found and either matched or flagged; nothing else may be taken as a citation.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "q8-match-"));
const L = await import("../../core/library/index.js");
const Lib = (await import("../../core/lib.js")).default;
Lib.setBank([{ t: "Journal of Finance", i: ["00221082"], q: "Q1" }, { t: "Small Biz Review", i: ["11112222"], q: "Q3" }, { t: "Strategy Journal", i: ["33334444"], q: "Q2" }]);
const lib = await L.openLibrary();
const bib = String.raw`
@article{a, author={Smith, John and Kov{\'a}cs, P{\'e}ter}, title={Financial flexibility and growth}, journal={Journal of Finance}, issn={0022-1082}, year={2020}, doi={10.1111/jofi.0001}}
@article{b, author={Lee, Ann and Wu, Bo and Kim, Su}, title={Credit constraints in service firms}, journal={Strategy Journal}, issn={3333-4444}, year={2019}}
@article{c, author={Lee, Ann}, title={Leasing as a buffer}, journal={Small Biz Review}, issn={1111-2222}, year={2021}}
@article{d, author={Lee, Ann}, title={Trade credit and exit}, journal={Small Biz Review}, issn={1111-2222}, year={2021}}
@misc{e, author={Brown, Ruth}, title={A preprint on studios}, year={2022}, publisher={SSRN}, pubstate={preprint}}
@article{f, author={Example, Erin}, title={Our own earlier paper}, journal={Unknown Journal}, year={2024}}
@inproceedings{g, author={Nagy, Anna}, title={Closest idea at a conference}, booktitle={Proc}, year={2023}}
@article{h, author={Weiß, Otto and Tanaka, Kenji}, title={A retracted study}, journal={Journal of Finance}, issn={0022-1082}, year={2018}}
@article{i, author={{World Bank}}, title={Enterprise surveys report}, journal={Strategy Journal}, issn={3333-4444}, year={2021}}
@article{j, author={van der Berg, Anna}, title={Exit decisions of studios}, journal={Strategy Journal}, issn={3333-4444}, year={2017}}
@article{k, author={Garc{\'i}a, Mar{\'i}a}, title={Payment delays}, journal={Strategy Journal}, issn={3333-4444}, year={2016}}`;
await L.importText(lib, bib);
const id = t => lib.all().find(x => x.csl.title === t).id;
lib.tag(id("Our own earlier paper"), "own-work"); lib.tag(id("Closest idea at a conference"), "close-idea");
L.recordVerification(lib, id("A retracted study"), { source: "crossref", status: "retracted", note: "synthetic retraction notice" });

const text = `# Introduction

Flexible firms grow faster (Smith & Kovács, 2020; Lee et al., 2019). Lee (2021a) and Lee (2021b) study buffers, see also (e.g., Brown, 2022, p. 4). In 2020 the market changed (N = 2020) and Table 3 (2019) shows this.

# Theory

Our earlier work (Example, 2024) and the closest idea (Nagy, 2023) matter. Weiß and Tanaka's (2018) result is cited. The World Bank (2021) agrees, as does van der Berg (2017). García (2015) is cited with the wrong year. Lee (2021) is ambiguous. Smith et al. (2020) misuse et al. Unknown (2011) is not in the library.

# References

Example, E. (2024). Our own earlier paper. Unknown Journal, 1, 1–2.

Brown, R. (2022). A preprint on studios [Preprint]. SSRN.

García, M. (2016). Payment delays. Strategy Journal, 3, 1–9.

Lee, A. (2021a). Leasing as a buffer. Small Biz Review, 2, 1–10.

Lee, A. (2021b). Trade credit and exit. Small Biz Review, 2, 11–20.

Lee, A., Wu, B., & Kim, S. (2019). Credit constraints in service firms. Strategy Journal, 9, 1–9.

Nagy, A. (2023). Closest idea at a conference. In Proc (pp. 1–2).

Smith, J., & Kovács, P. (2020). Financial flexibility and growth. Journal of Finance, 75, 1–20. https://doi.org/10.1111/jofi.0001

van der Berg, A. (2017). Exit decisions of studios. Strategy Journal, 5, 1–5.

Weiß, O., & Tanaka, K. (2018). A retracted study. Journal of Finance, 70, 1–9.

World Bank. (2021). Enterprise surveys report. Strategy Journal, 4, 1–3.

Zeta, Z. (2010). Listed but never cited. Strategy Journal, 1, 1–2.`;

// ground truth: every citation in the text with the expected status
const truth = [["Smith & Kovács, 2020", "matched"], ["Lee et al., 2019", "matched"], ["Lee (2021a)", "matched"], ["Lee (2021b)", "matched"], ["Brown, 2022, p. 4", "matched"],
  ["Example, 2024", "matched"], ["Nagy, 2023", "matched"], ["Weiß and Tanaka's (2018)", "matched"], ["World Bank (2021)", "matched"], ["van der Berg (2017)", "matched"],
  ["García (2015)", "year_mismatch"], ["Lee (2021)", "ambiguous"], ["Smith et al. (2020)", "author_mismatch"], ["Unknown (2011)", "not_in_library"]];
const m = L.matchManuscript(lib, { text });
const got = m.citations.map(c => [c.raw.replace(/^e\.g\.,\s*/, ""), c.status]);
for (const [raw, st] of truth) { const g = got.find(x => x[0] === raw); assert.ok(g, "found citation " + raw); assert.equal(g[1], st, raw + " status"); }
assert.equal(m.citations.length, truth.length, "no extra citations (In 2020, N = 2020, Table 3 (2019) are not citations): " + JSON.stringify(got));
assert.ok(m.citations.every(c => ["matched", "not_in_library", "ambiguous", "year_mismatch", "author_mismatch"].includes(c.status)), "every citation matched or flagged");
for (const c of m.citations) assert.equal(text.includes(c.raw) || c.raw.includes("("), true);
const span = m.findings.find(f => f.rule === "LIB-MAT-01").span; assert.ok(span.text.includes("Unknown"), "span points at the citation");

const rules = m.findings.map(f => f.rule); if (process.env.DBG) console.log(JSON.stringify(m.references.map(r => [r.first, r.year, r.status, r.cited_by])), m.findings.map(f => f.rule + " " + f.message));
const has = (r, t) => m.findings.some(f => f.rule === r && (!t || (f.detail?.title || f.message).includes(t)));
assert.ok(m.findings.some(f => f.rule === "LIB-MAT-02" && f.message.includes("Zeta")), "in list, not cited");
assert.ok(has("LIB-MAT-06"), "Unknown (2011) not in the reference list");
assert.ok(has("LIB-POL-01", "A retracted study"), "retracted -> blocker");
assert.equal(m.findings.find(f => f.rule === "LIB-POL-01").severity, "blocker");
assert.ok(has("LIB-POL-05", "Leasing as a buffer") && has("LIB-POL-05", "Trade credit and exit"), "Q3 journal");
assert.ok(has("LIB-POL-03", "A preprint on studios"), "preprint not allowed in empirical paper");
assert.ok(!has("LIB-POL-03", "Closest idea") && !has("LIB-POL-04", "Our own"), "own-work and close-idea exceptions");
assert.ok(!has("LIB-POL-05", "Financial flexibility") && !has("LIB-POL-05", "Credit constraints"), "Q1/Q2 pass");
for (const f of m.findings) for (const k of ["rule", "role", "title", "severity", "confidence", "source", "source_ref", "message", "fix", "span", "detail"]) assert.ok(k in f, f.rule + " has " + k);
assert.equal(m.label, "Simulated pre-submission review — not a journal decision");
console.log(`phase8 match: ${truth.length}/${truth.length} citations found, each matched or flagged; ${m.references.length} references; findings ${[...new Set(rules)].join(", ")}`);

// SLR rules: books/chapters/journals Q1-Q4 allowed; conference paper and preprint excluded
const s = L.matchManuscript(lib, { text, paperType: "slr" });
const sh = (r, t) => s.findings.some(f => f.rule === r && f.detail?.title?.includes(t));
assert.ok(sh("LIB-POL-02", "A preprint on studios")); assert.ok(!sh("LIB-POL-05", "Leasing as a buffer"), "Q3 allowed in SLR");
assert.ok(!sh("LIB-POL-02", "Closest idea"), "close-idea exception also in SLR");

// numbered style
const num = `# Introduction

Growth follows flexibility [1]. Others disagree [2-3], see [5].

# References

[1] J. Smith and P. Kovács, "Financial flexibility and growth," Journal of Finance, vol. 75, 2020, doi:10.1111/jofi.0001.

[2] A. Lee, "Leasing as a buffer," Small Biz Review, 2021.

[3] R. Brown, "A preprint on studios," SSRN, 2022.

[4] Z. Zeta, "Listed but never cited," 2010.`;
const n = L.matchManuscript(lib, { text: num });
assert.equal(n.style, "numbered");
assert.deepEqual(n.citations.map(c => [c.number, c.status]), [[1, "matched"], [2, "matched"], [3, "matched"], [5, "not_in_library"]]);
assert.ok(n.findings.some(f => f.rule === "LIB-MAT-06" && f.message.includes("[5]")), "[5] has no list entry");
assert.ok(n.findings.some(f => f.rule === "LIB-MAT-02" && f.message.includes("Zeta")));
assert.ok(n.findings.some(f => f.rule === "LIB-POL-03" && f.detail.title.includes("preprint")));
console.log("phase8 match: SLR policy and numbered style passed");
