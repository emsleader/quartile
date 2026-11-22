// Phase 1: methods reviewer (checklists, sample flow, measurement, pre-specification, tool).
import assert from "node:assert/strict";
import { parseText } from "../../core/text/parse.js";
import { loadChecklists, checkChecklist, checklistsFor, evaluateChecklist } from "../../core/roles/checklists.js";
import methods, { checkFlow, measurementDefined, preSpecification } from "../../core/roles/methods.js";
import tool from "../../tools/reporting_checklist.js";

// --- checklists: schema, official item numbers
const cl = loadChecklists();
assert.deepEqual(Object.keys(cl).sort(), ["AAPOR_STUB", "CHERRIES", "CONJOINT", "COREQ", "PRISMA2020", "STROBE"]);
const mains = c => [...new Set(c.items.map(i => i.number.replace(/[a-z]$/, "")))];
assert.deepEqual(mains(cl.PRISMA2020), Array.from({ length: 27 }, (_, i) => String(i + 1)), "PRISMA 2020 items 1-27");
assert.deepEqual(mains(cl.STROBE), Array.from({ length: 22 }, (_, i) => String(i + 1)), "STROBE items 1-22");
assert.deepEqual(mains(cl.COREQ), Array.from({ length: 32 }, (_, i) => String(i + 1)), "COREQ items 1-32");
assert.ok(cl.AAPOR_STUB.items.every(i => i.check === "manual"), "AAPOR is a manual stub");
assert.ok(checkChecklist({ checklist: { id: "X", name: "x", citation: "c", designs: ["all"], numbering: "official" }, items: [{ number: "1", topic: "t", item: "an item text", check: "auto" }] }).length > 0, "auto item without detect refused");
assert.ok(checkChecklist({ checklist: { id: "X", name: "x", citation: "c", designs: ["all"], numbering: "official" }, items: [{ number: "1", topic: "t", item: "an item text", check: "manual", detect: "(" }] }).length > 0, "bad regex refused");

// --- checklist selection by design
const web = parseText("# Methods\n\nWe ran an online survey with Qualtrics among 400 respondents.", { design: "survey" });
assert.deepEqual(checklistsFor("survey", web).map(c => c.id).sort(), ["AAPOR_STUB", "CHERRIES", "STROBE"]);
const paper = parseText("# Methods\n\nWe mailed a paper questionnaire to 400 owners.", { design: "survey" });
assert.ok(!checklistsFor("survey", paper).some(c => c.id === "CHERRIES"), "CHERRIES only for web surveys");
assert.deepEqual(checklistsFor("slr", null).map(c => c.id), ["PRISMA2020"]);
assert.equal(checklistsFor("conceptual", null).length, 0);
const slr = parseText("A systematic review of leasing\n\n# Methods\n\nWe searched Scopus and Web of Science. Two reviewers screened titles and abstracts independently.\n\n# Results\n\nWe included 40 studies.", { design: "slr" });
const ev = evaluateChecklist(slr, cl.PRISMA2020);
const st = n => ev.items.find(i => i.number === n).status;
assert.equal(st("1"), "found"); assert.equal(st("6"), "found"); assert.equal(st("8"), "found");
assert.equal(st("11"), "not_found"); assert.equal(st("19"), "needs_human");
assert.ok(ev.items.find(i => i.number === "6").evidence.text.includes("Scopus"));

// --- MTH-03 sample flow: wrong sums flag, correct ones do not
const flows = [
  ["Of 8,159 records, 412 were duplicates and were removed, leaving 7,700 for screening.", 1],
  ["Of 8,159 records, 412 were duplicates and were removed, leaving 7,747 for screening.", 0],
  ["We identified 1,234 records. After removing 234 duplicates, 1,010 remained.", 1],
  ["We identified 1,000 records in Scopus and 234 in Web of Science. After removing 234 duplicates, 1,000 remained.", 0],
  ["We started with 1,000 firms. We then removed 35 firms with missing values and 12 firms in the financial sector, which left 953 firms.", 0],
  ["We started with 1,000 firms. We then removed 35 firms with missing values and 12 firms in the financial sector, which left 943 firms.", 1],
  ["Of these 1,000 firms, 200 were excluded because they had fewer than 10 employees, and 50 because of missing data, leaving 750.", 0],
  ["Of 5,000 firms, we excluded 2 countries, leaving 4,300 firms.", 0],
  ["Records identified from databases (n = 1,234); duplicates removed (n = 234); records screened (n = 1,000); records excluded (n = 800); full-text articles assessed for eligibility (n = 210); reports excluded (n = 150); studies included (n = 50).", 1],
  ["Records identified: 1,234; duplicates removed: 234; records screened: 990; records excluded: 800; studies included: 190.", 1],
  ["The search returned 2,310 records. After deduplication, 1,950 remained. Of these, 1,700 were excluded on title and abstract, leaving 250 full texts. A further 190 were excluded at full text, and 60 studies were included.", 0],
  ["In 2019, we surveyed 600 managers; 120 did not respond, leaving 470 respondents.", 1],
  ["Studies were excluded if they were not peer-reviewed. Of 1,234 records, 234 were removed, leaving 1,000.", 0],
  ["Table 2 reports 1,500 observations; 2019 data were dropped, leaving 1,200.", 0],
  ["The sample of 3,000 firms excludes 120 firms with fewer than 5 employees, leaving 2,880 firms.", 0],
];
for (const [t, n] of flows) assert.equal(checkFlow([{ text: t }]).length, n, t);
const f = checkFlow([{ text: flows[0][0] }])[0];
assert.equal(f.expected, 7747); assert.equal(f.stated, 7700);

// --- design gates and role output
const flowText = "# Methods\n\nOf 8,159 records, 412 were duplicates and were removed, leaving 7,700 for screening.";
const onReg = await methods.run(parseText(flowText, { design: "regression" }));
const m3 = onReg.find(x => x.rule === "MTH-03");
assert.ok(m3 && m3.severity === "major" && m3.span && m3.span.text.includes("7,700"));
for (const k of ["rule", "role", "title", "severity", "confidence", "source", "source_ref", "message", "fix", "span"]) assert.ok(k in m3, "finding has " + k);
assert.ok(!(await methods.run(parseText(flowText, { design: "qualitative" }))).some(x => x.rule === "MTH-03"), "MTH-03 not on qualitative");
assert.ok(onReg.some(x => x.rule === "MTH-02" && x.status === "needs_human" && x.severity === "note"));

// --- MTH-04
const mdoc = (extra = "") => parseText(`# Methods\n\nLeverage is debt over assets.${extra}\n\n# Results\n\nThe coefficient on CashBuffer is positive. Leverage is negative. OLS gives the same sign.\n\n| Variable | Model 1 |\n|---|---|\n| Leverage | -0.12 |\n| Board independence | 0.30 |\n| Constant | 1.10 |\n| Observations | 500 |`, { design: "regression" });
const undef = measurementDefined(mdoc()).map(x => x.detail.variable);
assert.deepEqual(undef.sort(), ["Board independence", "CashBuffer"]);
assert.equal(measurementDefined(mdoc(" CashBuffer is cash over assets. Board independence is the share of outside directors.")).length, 0);

// --- MTH-05
const p = t => preSpecification(parseText("# Methods\n\n" + t, { design: "survey" }));
assert.equal(p("Our hypotheses were preregistered before data collection.").length, 1);
assert.equal(p("Our hypotheses were not preregistered.").length, 0);
assert.equal(p("This protocol is not a preregistration.").length, 0);
assert.equal(p("Our hypotheses were preregistered at https://osf.io/abcd1.").length, 0);
assert.equal(p("Preregistration improves credibility (Nosek et al., 2018).").length, 0);

// --- tool
const out = await tool.handler({ text: slr.text, design: "slr" });
assert.equal(out.label, "Simulated pre-submission review — not a journal decision");
assert.equal(out.checklists[0].id, "PRISMA2020");
assert.ok(out.checklists[0].table.every(r => ["found", "not_found", "needs_human"].includes(r.status)));
assert.equal((await tool.handler({ text: slr.text, checklist: "coreq" })).checklists[0].id, "COREQ");
await assert.rejects(() => tool.handler({ text: "x", checklist: "nope" }));
assert.match(JSON.stringify(await tool.handler({ text: slr.text })), /not a journal decision/);
assert.doesNotMatch(JSON.stringify(out), /\b(will be (accepted|rejected)|likely (accept|reject))/i);
console.log("phase1-methods: ok");
