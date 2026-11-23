// file_check: each generator fingerprint, blinding leak, cross-file identity, a clean file, and read-only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { fileCheck } from "../../tools/file_check.js";
import { CLOSING } from "../../core/filecheck.js";
const F = n => path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", n + ".docx");
const st = (r, id) => r.checks.find(c => c.check === id)?.status;
const hash = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const NOW = "2026-11-23T12:00:00Z";
const before = Object.fromEntries(["pandoc", "python-docx", "docx-js", "clean", "clean-copy", "anon-footer"].map(n => [n, hash(F(n))]));

let r = await fileCheck({ path: F("pandoc") });
assert.equal(st(r, "edit_time"), "FAIL"); assert.equal(st(r, "stale_word_count"), "FAIL"); assert.equal(st(r, "generator_fingerprint"), "FAIL"); assert.equal(st(r, "same_timestamps"), "WARN");
assert.match(r.checks.find(c => c.check === "generator_fingerprint").explain, /pandoc/);

r = await fileCheck({ path: F("python-docx") });
assert.equal(st(r, "impossible_dates"), "FAIL"); assert.equal(st(r, "generator_fingerprint"), "FAIL");
assert.match(r.checks.find(c => c.check === "generator_fingerprint").explain, /python-docx/);
assert.equal(st(r, "edit_time"), "WARN", "TotalTime 0 is WARN");

r = await fileCheck({ path: F("docx-js") });
assert.equal(st(r, "author_fields"), "WARN"); assert.match(r.checks.find(c => c.check === "generator_fingerprint").explain, /docx-js/);

r = await fileCheck({ path: F("anon-footer"), anonymised: true, names: ["Ann Example"] });
assert.equal(st(r, "blinding_leak"), "FAIL"); assert.ok(r.checks.find(c => c.check === "blinding_leak").values.found.some(f => /footer/.test(f.where)));
assert.equal(st(r, "author_fields"), "OK", "empty author fields are right for a blinded file");
r = await fileCheck({ path: F("clean"), anonymised: true, names: ["Ann Example"] });
assert.equal(st(r, "author_fields"), "FAIL", "a real name in the properties of a blinded file is a leak");

r = await fileCheck({ path: F("clean"), compare: [F("clean-copy")] });
assert.equal(st(r, "cross_file_identity"), "WARN");
for (const c of r.checks.filter(c => c.check !== "cross_file_identity")) assert.equal(c.status, "OK", `clean file: ${c.check} ${c.explain}`);
assert.ok(r.summary.trim().endsWith(CLOSING));
r = await fileCheck({ path: F("clean"), compare: [F("pandoc")] }); assert.equal(st(r, "cross_file_identity"), "OK");

// hidden content: a zero-width space and a comment inside a copy made in memory
const JSZip = (await import("jszip")).default, z = await JSZip.loadAsync(fs.readFileSync(F("clean")));
const doc = await z.file("word/document.xml").async("string");
z.file("word/document.xml", doc.replace(">Small", ">Small\u200B").replace("</w:body>", '<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>hidden</w:t></w:r></w:p></w:body>'));
r = await fileCheck({ docx_base64: (await z.generateAsync({ type: "nodebuffer" })).toString("base64") });
assert.equal(st(r, "hidden_content"), "WARN"); assert.ok(r.checks.find(c => c.check === "hidden_content").values.zero_width_chars >= 1);
assert.ok(r.checks.find(c => c.check === "hidden_content").values.hidden_text_runs >= 1);
// impossible date: created before the newest reference
const z2 = await JSZip.loadAsync(fs.readFileSync(F("clean")));
z2.file("docProps/core.xml", (await z2.file("docProps/core.xml").async("string")).replace("2026-09-01T08:12:00Z", "2024-03-01T08:12:00Z"));
r = await fileCheck({ docx_base64: (await z2.generateAsync({ type: "nodebuffer" })).toString("base64") });
assert.equal(st(r, "impossible_dates"), "FAIL"); assert.match(r.checks.find(c => c.check === "impossible_dates").explain, /newest reference \(2025\)/);

// read only: no fixture changed
for (const [n, h] of Object.entries(before)) assert.equal(hash(F(n)), h, `${n} unchanged`);
await assert.rejects(fileCheck({}), /path/);
console.log("file_check: all checks passed (6 fixtures, read-only confirmed)");
