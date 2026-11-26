// Research Factory (factory_run): order, human gates, ledger lock, hard quality gates.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "qfactory-")); process.env.QUARTILE_HOME = home;
const F = (await import("../../core/factory/index.js")).default;
const tool = (await import("../../tools/factory_run.js")).default;
const EV = (await import("../../core/evidence.js")).default;
const REG = (await import("../../core/registry.js")).default;
const AI = (await import("../../core/aistyle.js")).default;

const w = (name, text) => { const p = path.join(home, name); fs.writeFileSync(p, text); return p; };
const sentence = i => `Firms with larger cash reserves in sample group ${i} replaced their equipment sooner than firms that relied on bank credit in the same period of observation.`;
const body = Array.from({ length: 40 }, (_, i) => sentence(i + 1)).join(" ");
const ms = w("paper.md", `Cash reserves and equipment replacement\n\nAbstract\n${body}\n\n1. Results\nThe coefficient is 0.31 (SE 0.08). ${body}\n\nReferences\nMyers, S. C., & Majluf, N. S. (1984). Corporate financing and investment decisions. Journal of Financial Economics, 13(2), 187-221. https://doi.org/10.1016/0304-405X(84)90023-0\n`);
const out = w("model.log", "coef 0.3100  se 0.0800\n");
const ledger = w("ledger.csv", EV.template().split("\n").slice(0, 2).join("\n") + "\n");
const docx = path.join(path.dirname(new URL(import.meta.url).pathname), "../file_check/fixtures/clean.docx");
const verified = async () => ({ checked: 1, verified: 1, problems: 0, results: [{ reference: "Myers & Majluf 1984", status: "verified" }] });
const ctx = { readText: async p => fs.readFileSync(p, "utf8"), checkLedger: EV.checkLedger, registry: REG.registry, claimAudit: EV.claimAudit, aiStyle: AI.check,
  checkStatistics: () => ({ problems: [] }), verifyReferences: verified, committee: async () => ({ readiness: 90, overall: "ready to submit", findings: [], label: "Simulated" }),
  fileCheck: async () => ({ checks: [{ check: "edit_time", status: "OK" }], summary: "ok" }) };

// start needs a full brief and a named author
assert.throws(() => F.start({ paper_id: "p1", brief: { question: "q" }, author: "A" }), /brief needs/);
assert.throws(() => F.start({ paper_id: "Bad Id", brief: {}, author: "A" }), /paper_id/);
const brief = { question: "Do cash reserves shorten replacement delays?", population: "SMEs in CEE", contribution: "Owner cash as a substitute for credit", target_tier: "Q1" };
F.start({ paper_id: "p1", brief, author: "S. M. Alavi" });
assert.throws(() => F.start({ paper_id: "p1", brief, author: "S. M. Alavi" }), /already exists/);
// approvals in order, by a named person
assert.throws(() => F.approve("p1", { stage: 1, approver: "x" }), /current stage/);
assert.throws(() => F.approve("p1", { stage: 0, approver: "" }), /name of the person/);
F.approve("p1", { stage: 0, approver: "S. M. Alavi" });
// Stage 1 needs its report and a decision
let r = await F.run("p1", { ...ctx });
assert.equal(r.status.stages[1].state, "failed checks");
r = await F.run("p1", { ...ctx, files: { novelty_report: w("novelty.md", "closest works") } });
assert.equal(r.status.stages[1].state, "awaiting approval");
assert.throws(() => F.approve("p1", { stage: 1, approver: "S. M. Alavi" }), /go, reframe or stop/);
// reframe sends the paper back to the brief
F.approve("p1", { stage: 1, approver: "S. M. Alavi", decision: "reframe" });
assert.equal(F.status("p1").current_stage, 0);
F.approve("p1", { stage: 0, approver: "S. M. Alavi" });
await F.run("p1", { ...ctx }); F.approve("p1", { stage: 1, approver: "S. M. Alavi", decision: "go" });
// Stage 2 needs a second reviewer who is another person
await F.run("p1", { ...ctx, files: { screening_register: w("screen.csv", "id,decision\n1,include\n") } });
assert.throws(() => F.approve("p1", { stage: 2, approver: "S. M. Alavi" }), /second reviewer/);
assert.throws(() => F.approve("p1", { stage: 2, approver: "S. M. Alavi", second_reviewer: "s. m. alavi" }), /different person/);
F.approve("p1", { stage: 2, approver: "S. M. Alavi", second_reviewer: "Reviewer B" });
// Stage 3 locks the ledger
await F.run("p1", { ...ctx, files: { ledger, manuscript: ms, outputs: [out] } });
F.approve("p1", { stage: 3, approver: "S. M. Alavi" });
assert.ok(F.status("p1").stages[3].ledger_locked);
await F.run("p1", { ...ctx }); F.approve("p1", { stage: 4, approver: "S. M. Alavi" });
// Stage 5 without live: no reference check recorded
r = await F.run("p1", { ...ctx });
assert.match(F.load("p1").stages[5].summary.note, /live: true/);
r = await F.run("p1", { ...ctx, live: true });
assert.equal(F.load("p1").stages[5].summary.references.verified, 1);
F.approve("p1", { stage: 5, approver: "S. M. Alavi" });
// Stage 6 is mechanical: the run continues to Stage 7 when the targets are met, else it stops
const s6 = await F.run("p1", { ...ctx });
const st6 = F.load("p1").stages[6];
if (st6.state === "passed") assert.equal(F.status("p1").current_stage, 7);
else { assert.equal(st6.state, "failed checks"); assert.ok(st6.summary.fails.length); assert.throws(() => F.approve("p1", { stage: 6, approver: "S. M. Alavi" }), /no human gate/); }
// The hard gates are tested directly
const s = F.load("p1"); s.artefacts.docx = { path: docx, sha256: F.sha256(docx) };
const text = fs.readFileSync(ms, "utf8"), outputs = [{ name: "model.log", text: fs.readFileSync(out, "utf8") }];
let g = await F.gates(s, text, outputs, { ...ctx, live: true });
const by = k => g.gates.find(x => x.gate === k);
assert.equal(by("references verified").pass, true);
assert.equal(by("ledger locked and unchanged").pass, true);
assert.equal(by("file_check without FAIL").pass, true);
g = await F.gates(s, text, [], { ...ctx, live: true });
assert.equal(g.gates.find(x => x.gate === "numbers in registry").pass, false, "no output = gate fails");
g = await F.gates(s, text.replace("(SE 0.08).", "(SE 0.08). The marginal effect is 0.77."), outputs, { ...ctx, live: true });
assert.equal(g.gates.find(x => x.gate === "numbers in registry").pass, false, "a number not in the output fails");
g = await F.gates(s, text, outputs, { ...ctx, live: true, verifyReferences: async () => ({ checked: 1, verified: 0, results: [{ reference: "x", status: "DOI not found" }] }) });
assert.equal(g.gates.find(x => x.gate === "references verified").pass, false);
g = await F.gates(s, text, outputs, { ...ctx, live: false });
assert.equal(g.gates.find(x => x.gate === "references verified").pass, true, "Stage 5 check on the same manuscript counts");
g = await F.gates(s, text, outputs, { ...ctx, fileCheck: async () => ({ checks: [{ check: "author_fields", status: "FAIL" }] }) });
assert.equal(g.gates.find(x => x.gate === "file_check without FAIL").pass, false);
fs.appendFileSync(ledger, "C002,changed,,,,,,,,,,,,,,,,,,,,,,,,,\n");
g = await F.gates(s, text, outputs, { ...ctx, live: true });
assert.equal(g.gates.find(x => x.gate === "ledger locked and unchanged").pass, false, "a changed ledger fails");
assert.equal(g.ok, false);
assert.match(g.note, /Save the final version yourself in Word/);
// reopen resets the later stages
F.reopen("p1", { stage: 3, reason: "ledger changed" });
const st = F.status("p1"); assert.equal(st.current_stage, 3); assert.ok(st.stages.slice(4).every(x => x.state === "pending"));
// the tool layer
const t = await tool.handler({ action: "start", paper_id: "p2", author: "S. M. Alavi", brief });
assert.equal(t.current_stage, 0);
assert.ok((await tool.handler({ action: "list" })).papers.length === 2);
assert.match((await tool.handler({ action: "approve", paper_id: "p2", stage: 4, approver: "x" })).error, /current stage/);
assert.equal((await tool.handler({ action: "stages" })).stages.length, 10);
assert.ok(fs.existsSync(path.join(home, "factory", "p1.json")) && fs.existsSync(path.join(home, "factory", "p1", "stage-3.json")));
console.log("phase14 factory: ok");
