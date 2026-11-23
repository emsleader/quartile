// Paper cards (paper_card, library_card_search, library_cards_export).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "qcards-")); const prev = process.env.QUARTILE_HOME; process.env.QUARTILE_HOME = home;
const { buildCard, evidenceLabel } = await import("../../core/library/cards.js");
const paper = `Owner cash reserves and equipment replacement in European SMEs

Abstract
This paper examines how small firms finance the replacement of equipment. Using survey data on 4,120 firms in Hungary, Poland and Romania from 2016 to 2021, we find that firms with a rejected loan delay replacement by 14 months. We contribute to the pecking order literature. https://doi.org/10.1234/example.2026.001

1. Introduction
Firms need equipment to grow (Myers & Majluf, 1984). The aim of this paper is to explain replacement delays.

2. Theory
H1: Credit rejection is associated with longer replacement delays.

3. Data and Methods
We use firm-level data from the World Bank Enterprise Surveys and estimate probit models with country fixed effects.

4. Results
Credit rejection is positively associated with delay (b = 0.31, p < .01). H1 is supported. Under the assumed interest-rate scenario, the delay would double.

5. Limitations
The survey cannot rule out reverse causality.

Funding
This work was supported by grant 123 of the national research office.
`;
const c = buildCard(paper);
assert.equal(c.doi, "10.1234/example.2026.001");
assert.equal(c.design.detected, "regression");
assert.deepEqual(c.data.countries, ["Hungary", "Poland", "Romania"]); assert.deepEqual(c.data.periods, ["2016–2021"]);
assert.ok(c.theory.some(t => /pecking order/i.test(t)));
assert.equal(c.hypotheses[0].label, "H1"); assert.equal(c.hypotheses[0].verdict, "supported");
assert.ok(c.question.length >= 1 && c.contribution.length >= 1 && c.limitations.length === 1 && c.declarations.funding.length === 1);
// every entry is copied from the text, at its offsets
const { parseText } = await import("../../core/text/parse.js"); const d = parseText(paper);
for (const e of [...c.question, ...c.findings, ...c.methods, ...c.data.sample, ...c.limitations]) assert.equal(d.text.slice(e.start, e.end), e.text, "extractive");
assert.equal(evidenceLabel("Credit rejection is positively associated with delay (b = 0.31, p < .01)."), "DERIVED");
assert.equal(evidenceLabel("Under the assumed interest-rate scenario, the delay would double."), "CONDITIONAL MODEL RESULT");
assert.equal(evidenceLabel("Market share is not identified from the snapshot."), "NOT IDENTIFIED");
assert.equal(evidenceLabel("Forty firms answered the survey."), "FACT/OBSERVED");
// SLR emphasis finds the search and screening
const slr = buildCard("Financing in service SMEs: a scoping review\n\nAbstract\nThis review maps how service SMEs finance equipment. We searched Scopus and Web of Science in 2025. After screening 1,731 records, 83 full texts were assessed and 61 studies were included.\n\nMethods\nInclusion criteria were peer-reviewed journal articles on SMEs. Two reviewers screened titles and abstracts following PRISMA 2020.\n\nResults\nMost studies use survey data from Europe.\n\nLimitations\nWe searched only English sources.", { purpose: "slr" });
assert.equal(slr.design.detected, "slr"); assert.ok(slr.search_and_screening.length >= 2); assert.equal(slr.contribution.length, 0, "slr emphasis skips contribution");
// tools: save, link to a library item by DOI, search, export
const card = (await import("../../tools/paper_card.js")).default, search = (await import("../../tools/library_card_search.js")).default, exp = (await import("../../tools/library_cards_export.js")).default;
const L = await import("../../core/library/index.js"); const lib = await L.openLibrary();
await L.importText(lib, "@article{alavi, author={Example, Ann}, title={Owner cash reserves and equipment replacement in European SMEs}, journal={Small Business Economics}, year={2026}, doi={10.1234/example.2026.001}}", { format: "bibtex" });
const r = await card.handler({ text: paper, purpose: "both" });
assert.ok(r.saved && r.saved.linked, "linked to the library item with the same DOI");
const r2 = await card.handler({ text: paper }); assert.equal(r2.saved.id, r.saved.id, "same paper, same card (no duplicate)");
await card.handler({ text: "Leasing and growth\n\nAbstract\nThis study examines leasing in Spanish firms. Using 900 firms from 2010 to 2019, we find that leasing is associated with faster growth.\n\nMethods\nWe estimate panel regressions with firm fixed effects.\n\nResults\nLeasing is positively associated with growth.\n\nLimitations\nThe sample covers one country." });
const s = await search.handler({ query: "leasing" }); assert.equal(s.count, 1); assert.match(s.results[0].title, /Leasing/);
assert.equal((await search.handler({ query: "probit", field: "design" })).count, 1);
assert.equal((await search.handler({})).count, 2);
const full = await search.handler({ id: r.saved.id }); assert.equal(full.card.doi, "10.1234/example.2026.001");
const x = await exp.handler({ format: "xlsx" }); assert.equal(x.rows, 2); assert.ok(Buffer.from(x.xlsx_base64, "base64").slice(0, 2).toString() === "PK");
const csv = Buffer.from((await exp.handler({ format: "csv" })).csv_base64, "base64").toString(); assert.match(csv, /^card_id,title,doi,design/); assert.match(csv, /\[DERIVED\]/);
// a DOCX passed as base64 (as a client does after downloading from Google Drive)
const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
const paras = paper.split("\n\n").flatMap(b => b.split("\n")).filter(Boolean).map(l => /^(Abstract|\d\. |Funding)/.test(l) ? new Paragraph({ text: l.replace(/^\d\. /, ""), heading: HeadingLevel.HEADING_1 }) : new Paragraph(l));
const b64 = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: paras }] }))).toString("base64");
const rd = await card.handler({ docx_base64: b64, save: false }); assert.equal(rd.saved, null); assert.deepEqual(rd.data.countries, ["Hungary", "Poland", "Romania"]);
await assert.rejects(card.handler({ text: "Too short." }), /Too little text/);
if (prev === undefined) delete process.env.QUARTILE_HOME; else process.env.QUARTILE_HOME = prev;
console.log("phase10 paper cards: ok");
