// proofread_submission: the six acceptance tests of the request of 26 November 2026, plus voice copying and determinism.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "qproof-")); const prev = process.env.QUARTILE_HOME; process.env.QUARTILE_HOME = home;
const prevCorpus = process.env.QUARTILE_CORPUS; delete process.env.QUARTILE_CORPUS;
const tool = (await import("../../tools/proofread_submission.js")).default;
const here = path.dirname(fileURLToPath(import.meta.url));
const DISC = "The author used a language model to check grammar and takes full responsibility for the text.";
const ms = `Leasing and replacement

Abstract
We study 412 firms in Hungary from 2016 to 2021. Moreover, this study delves into a pivotal and crucial topic.

1. Introduction
Studies show that leasing helps small firms. Firms that lease replace machines 14 months sooner (Smith, 2020). It is important to note that firms vary.

Declaration of generative AI use
${DISC}

References
Smith, J. (2020). Leasing. Journal of Small Business Management, 58(2), 1-20.`;
const files = [{ name: "manuscript.txt", text: ms }];
const voice = ["We find that firms delay replacement when credit is scarce, and the delay is longest for young firms. Our estimates use filed accounts from nine countries. We compare leasing and buying firms over five years and report the differences in detail."];
const plan = await tool.handler({ files, author_voice: voice });
const pOf = re => plan.tasks.find(t => re.test(t.text));
assert.ok(plan.voice_profile && plan.voice_profile.sentences >= 3, "voice profile built");
assert.ok(pOf(/delves/).issues.some(i => i.issue === "stock words"));
assert.ok(pOf(/language model/).locked, "disclosure paragraph is locked in the plan");
const abs = pOf(/delves/).paragraph, intro = pOf(/important to note/).paragraph, disc = pOf(/language model/).paragraph;
assert.ok(pOf(/important to note/).constraints.numbers.includes("14") && pOf(/important to note/).constraints.citations.includes("(Smith, 2020)"));

// 1. a changed number is rejected; 2. a removed citation is rejected; 6. the disclosure is identical
const res = await tool.handler({ files, author_voice: voice, revisions: [
  { file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. The topic matters for owners and lenders." },
  { file: "manuscript.txt", paragraph: intro, text: "Studies show that leasing helps small firms. Firms that lease replace machines 15 months sooner (Smith, 2020). Firms vary." },
  { file: "manuscript.txt", paragraph: disc, text: "No AI was used." },
] });
const out = res.files[0].text;
const L = p => res.log.find(e => e.paragraph === p);
assert.equal(L(abs).action, "rewritten"); assert.ok(out.includes("The topic matters for owners and lenders."));
assert.equal(L(intro).action, "kept original"); assert.match(L(intro).verify_rewrite, /^fail: .*Numbers/); assert.ok(out.includes("14 months sooner (Smith, 2020)"));
const r2 = await tool.handler({ files, revisions: [{ file: "manuscript.txt", paragraph: intro, text: "Studies show that leasing helps small firms. Firms that lease replace machines 14 months sooner. Firms vary." }] });
assert.equal(r2.log.find(e => e.paragraph === intro).action, "kept original"); assert.match(r2.log.find(e => e.paragraph === intro).verify_rewrite, /Citations/);
assert.equal(L(disc).action, "kept original"); assert.ok(out.includes(DISC), "disclosure identical"); assert.deepEqual(res.disclosure.statements[0].statement_in_input, [DISC]);

// a revision that copies eight words from the voice samples is rejected
const r3 = await tool.handler({ files, author_voice: voice, revisions: [{ file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. We compare leasing and buying firms over five years and report the differences." }] });
assert.equal(r3.log.find(e => e.paragraph === abs).action, "kept original"); assert.match(r3.log.find(e => e.paragraph === abs).originality, /voice samples/);

// 3. a file with a leftover template value is flagged
const docx = fs.readFileSync(path.join(here, "..", "file_check", "fixtures", "pandoc.docx")).toString("base64");
const r4 = await tool.handler({ files: [{ name: "manuscript.docx", docx_base64: docx }], revisions: [{ file: "x", paragraph: "p1", text: "x" }] });
assert.equal(r4.readiness[0].file_check.find(c => c.check === "edit_time").status, "FAIL");
assert.equal(r4.readiness[0].file_check.find(c => c.check === "generator_fingerprint").status, "FAIL");

// 4. a one-minute budget stops cleanly and lists what was not processed (clock advanced by the test)
const { plan: planF, apply: applyF } = await import("../../core/proofread/index.js");
let t = 0; const clock = () => (t += 20000);
const many = [1, 2, 3, 4].map(k => ({ name: `f${k}.txt`, text: ms }));
const pb = await planF({ files: many, time_budget_minutes: 1, _clock: clock });
assert.ok(pb.not_processed.length >= 1, "plan stops and lists the rest"); assert.ok(pb.files.length < 4);
t = 0; const ab = await applyF({ files: many, revisions: [], time_budget_minutes: 1, _clock: clock });
assert.ok(ab.not_processed.length >= 1 && ab.files.length < 4, "apply stops and lists the rest");

// 5. suggested references need a DOI and a quartile (Q1-Q2 for empirical papers)
const Lib = await import("../../core/library/index.js"); const lib = await Lib.openLibrary();
lib.insert({ type: "article-journal", title: "Leasing helps small firms replace machines", DOI: "10.1000/q1", "container-title": "Journal A", issued: { "date-parts": [[2021]] } }, { quartile: { quartile: "Q1", year: 2024 } });
lib.insert({ type: "article-journal", title: "Leasing helps small firms grow", "container-title": "Journal B", issued: { "date-parts": [[2022]] } }, { quartile: { quartile: "Q1", year: 2024 } });
lib.insert({ type: "article-journal", title: "Leasing and small firms in Europe", DOI: "10.1000/noq", "container-title": "Journal C", issued: { "date-parts": [[2023]] } });
lib.insert({ type: "article-journal", title: "Leasing helps small firms everywhere", DOI: "10.1000/q3", "container-title": "Journal D", issued: { "date-parts": [[2023]] } }, { quartile: { quartile: "Q3", year: 2024 } });
const r5 = await tool.handler({ files, revisions: [{ file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. The topic matters." }] });
const cands = r5.references[0].unsupported_claims.flatMap(c => c.candidates);
assert.ok(r5.references[0].unsupported_claims.length >= 1, "'Studies show' without a citation is an unsupported claim");
assert.deepEqual(cands.map(c => c.doi), ["10.1000/q1"], "only the Q1 item with a DOI is suggested");
assert.ok(cands.every(c => c.doi && c.quartile));
const r6 = await tool.handler({ files, paper_type: "systematic_review", revisions: [{ file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. The topic matters." }] });
assert.deepEqual(r6.references[0].unsupported_claims.flatMap(c => c.candidates).map(c => c.doi).sort(), ["10.1000/q1", "10.1000/q3"], "Q1-Q4 for systematic reviews");
assert.ok(!r5.files[0].text.includes("10.1000/q1"), "suggestions are never inserted");

// determinism and out_dir: same input gives the same output; originals are never overwritten
const a1 = await tool.handler({ files, author_voice: voice, revisions: [{ file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. The topic matters." }], seed: 7 });
const a2 = await tool.handler({ files, author_voice: voice, revisions: [{ file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. The topic matters." }], seed: 7 });
assert.equal(a1.files[0].sha256_revised, a2.files[0].sha256_revised); assert.deepEqual(a1.log, a2.log);
const od = fs.mkdtempSync(path.join(os.tmpdir(), "qprout-"));
const w = await tool.handler({ files, revisions: [{ file: "manuscript.txt", paragraph: abs, text: "We study 412 firms in Hungary from 2016 to 2021. The topic matters." }], out_dir: od });
assert.ok(fs.existsSync(w.files[0].written_to)); await assert.rejects(tool.handler({ files, revisions: [{ file: "manuscript.txt", paragraph: abs, text: "x" }], out_dir: od }), /overwrite/);
if (prev === undefined) delete process.env.QUARTILE_HOME; else process.env.QUARTILE_HOME = prev;
if (prevCorpus !== undefined) process.env.QUARTILE_CORPUS = prevCorpus;
console.log("phase12 proofread_submission: ok");
