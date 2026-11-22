// Phase 8: the library_* tools, add by DOI with an offline fetcher (Crossref, OpenAlex fallback, retraction
// notices), confirm rules for merge/delete, screening with PRISMA counts and Cohen's kappa in R.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "q8-tools-"));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const Lib = (await import("../../core/lib.js")).default;
Lib.setBank([{ t: "Journal of Finance", i: ["00221082"], q: "Q1" }]);
const L = await import("../../core/library/index.js");
const { TOOLS } = await import("../../tools/index.js");
const tool = n => TOOLS.find(t => t.name === n);
const names = ["library_add", "library_import", "library_export", "library_search", "library_verify", "library_match_manuscript", "library_bibliography", "library_dedupe", "library_screening"];
for (const n of names) { const t = tool(n); assert.ok(t, n); assert.equal(typeof t.handler, "function"); assert.ok(t.inputSchema && t.description); }

// ---------- add by DOI, offline ----------
const urls = [];
const CR = { status: "ok", message: { DOI: "10.5555/Q8.1", type: "journal-article", title: ["Leasing <i>and</i> growth"], author: [{ family: "Kovács", given: "Péter" }, { name: "SME Finance Group" }],
  issued: { "date-parts": [[2021, 4]] }, "container-title": ["Journal of Finance"], ISSN: ["0022-1082"], volume: "76", issue: "2", page: "100-120", publisher: "Wiley", "updated-by": [{ type: "correction", DOI: "10.5555/q8.1.corr" }] } };
const fake = async url => {
  urls.push(url);
  if (url.includes("filter=updates:10.5555%2Fq8.2")) return { message: { items: [{ DOI: "10.5555/notice", "update-to": [{ DOI: "10.5555/Q8.2", type: "retraction" }] }] } };
  if (url.includes("filter=updates")) return { message: { items: [] } };
  if (url.startsWith("https://api.crossref.org/works/10.5555%2Fq8.1")) return CR;
  if (url.startsWith("https://api.crossref.org/works/10.5555%2Fq8.2")) return { message: { ...CR.message, DOI: "10.5555/Q8.2", title: ["Second study"], "updated-by": [] } };
  if (url.startsWith("https://api.crossref.org/")) return { __notFound: true };
  if (url.startsWith("https://api.openalex.org/works/doi:10.5555%2Foa.1")) return { id: "https://openalex.org/W1", type: "preprint", title: "Open preprint", doi: "https://doi.org/10.5555/oa.1", publication_year: 2023,
    authorships: [{ author: { display_name: "Anna Nagy" } }], primary_location: { source: { display_name: "SSRN" } } };
  return { __notFound: true };
};
const lib = await L.openLibrary();
const a1 = await L.addByDoi(lib, "https://doi.org/10.5555/Q8.1", { fetchJson: fake, collection: "Paper 1" });
assert.equal(a1.status, "added"); assert.equal(a1.source, "crossref"); assert.equal(a1.quartile, "Q1");
const it1 = lib.get(a1.id);
assert.equal(it1.csl.title, "Leasing and growth"); assert.equal(it1.csl.author[1].literal, "SME Finance Group"); assert.equal(it1.type, "article-journal");
assert.equal(a1.verification.status, "corrected"); assert.ok(it1.tags.includes("Q1"));
const a2 = await L.addByDoi(lib, "10.5555/q8.2", { fetchJson: fake });
assert.equal(a2.verification.status, "retracted"); assert.ok(lib.get(a2.id).tags.includes("retracted"));
const a3 = await L.addByDoi(lib, "10.5555/oa.1", { fetchJson: fake, tags: ["close-idea"] });
assert.equal(a3.source, "openalex"); assert.equal(lib.get(a3.id).type, "preprint"); assert.ok(lib.get(a3.id).tags.includes("preprint") && lib.get(a3.id).tags.includes("close-idea"));
assert.equal((await L.addByDoi(lib, "10.5555/Q8.1", { fetchJson: fake })).status, "duplicate");
assert.equal((await L.addByDoi(lib, "10.5555/none", { fetchJson: fake })).status, "error");
assert.ok(urls.every(u => /^https:\/\/api\.(crossref|openalex)\.org\/works/.test(u) && /10\.5555/.test(u)), "only DOIs are sent");
// crossref verification again: log keeps history
const v = await L.verifyCrossref(lib, a1.id, { fetchJson: fake }); assert.equal(v.status, "corrected");
assert.equal(L.verificationLog(lib, a1.id).length, 2);

// ---------- tools (no network: offline inputs only) ----------
const add = await tool("library_add").handler({ bibtex: "@book{x, author={Porter, Michael E.}, title={Competitive strategy}, year={1980}, publisher={Free Press}}", collection: "Paper 1" });
assert.equal(add.added, 1); const bookId = add.items[0].id;
const add2 = await tool("library_add").handler({ ris: "TY  - BOOK\nAU  - Porter, Michael E.\nTI  - Competitive strategy.\nPY  - 1981\nPB  - Free Press\nER  - \n" });
assert.equal(add2.added, 1); assert.equal(add2.suggested_merges.length, 1, "similar book: suggested, not merged");
const tagged = await tool("library_add").handler({ item_id: bookId, tags: ["own-work"], collection: "SLR2" });
assert.ok(tagged.item.tags.includes("own-work")); assert.ok(tagged.item.collections.includes("SLR2"));
const pdf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "q8-p-")), "book.pdf"); fs.writeFileSync(pdf, "%PDF-1.7 synthetic");
const att = await tool("library_add").handler({ item_id: bookId, pdf_path: pdf, file_kind: "vor" }); assert.equal(att.file.status, "attached");

const dd = await tool("library_dedupe").handler({}); assert.equal(dd.count, 1);
const pv = await tool("library_dedupe").handler({ action: "merge", keep: bookId, remove: dd.suggested_merges[0].other === bookId ? dd.suggested_merges[0].keep : dd.suggested_merges[0].other });
assert.equal(pv.status, "preview"); const before = lib.count();
const mg = await tool("library_dedupe").handler({ action: "merge", keep: pv.would_do.keep, remove: pv.would_do.remove, confirm: true });
assert.equal(mg.status, "merged"); assert.equal(lib.count(), before - 1);

const se = await tool("library_search").handler({ query: "competitive" }); assert.equal(se.count, 1);
assert.ok((await tool("library_search").handler({ list: "collections" })).collections.some(c => c.name === "Paper 1"));
const vr = await tool("library_verify").handler({ item_id: bookId, source: "manual", status: "verified", note: "checked" }); assert.equal(vr.log.length, 1);
assert.ok((await tool("library_verify").handler({ item_id: bookId, source: "manual" })).error, "manual needs a status");

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "q8-e-")), "lib.bib");
const ex = await tool("library_export").handler({ format: "bibtex", path: out }); assert.ok(fs.existsSync(out)); assert.equal(ex.items, lib.count());
await assert.rejects(tool("library_export").handler({ format: "bibtex", path: out }), /exists/, "no overwrite without overwrite: true");
const exc = await tool("library_export").handler({ format: "csl-json", collection: "SLR2" }); assert.equal(JSON.parse(exc.text).length, 1);
assert.ok(fs.existsSync((await tool("library_export").handler({ backup: true })).file));

const text = "# Introduction\n\nLeasing matters (Kovács & SME Finance Group, 2021; Porter, 1980).\n\n# References\n\nKovács, P., & SME Finance Group. (2021). Leasing and growth. Journal of Finance, 76(2), 100–120. https://doi.org/10.5555/Q8.1\n\nPorter, M. E. (1980). Competitive strategy. Free Press.";
const mm = await tool("library_match_manuscript").handler({ text }); assert.equal(mm.summary.citation_status.matched, 2);
assert.ok(!mm.findings.some(f => f.rule.startsWith("LIB-POL")), "Q1 article and own-work book pass");
const bi = await tool("library_bibliography").handler({ text });
assert.equal(bi.count, 2); assert.equal(bi.references[0].reference, "Kovács, P., & SME Finance Group. (2021). Leasing and growth. *Journal of Finance*, *76*(2), 100–120. https://doi.org/10.5555/Q8.1");
assert.equal(bi.references[1].reference, "Porter, M. E. (1980). *Competitive strategy*. Free Press.");
const imp = await tool("library_import").handler({ text: "@article{z, author={Zeta, Z.}, title={T}, journal={J}, year=2000}", dry_run: true }); assert.equal(imp.dry_run, true);

// ---------- screening, PRISMA counts and kappa in R ----------
const sc = tool("library_screening");
const ids = [];
for (let i = 0; i < 10; i++) ids.push(lib.add({ type: "article-journal", title: "Screening record " + i, author: [{ family: "Rec", given: "R." }], issued: { "date-parts": [[2000 + i]] } }, { collection: "SLR9" }).id);
// reviewer A and B on title/abstract: 2x2 table [[4,1],[2,3]] -> po 0.7, pe 0.5, kappa 0.4
const A = ["include", "include", "include", "include", "include", "exclude", "exclude", "exclude", "exclude", "exclude"];
const Bv = ["include", "include", "include", "include", "exclude", "include", "include", "exclude", "exclude", "exclude"];
for (let i = 0; i < 10; i++) {
  await sc.handler({ action: "record", review: "SLR9", item_id: ids[i], stage: "title_abstract", reviewer: "A", decision: A[i], reason: A[i] === "exclude" ? "wrong population" : undefined });
  await sc.handler({ action: "record", review: "SLR9", item_id: ids[i], stage: "title_abstract", reviewer: "B", decision: Bv[i], reason: Bv[i] === "exclude" ? "wrong population" : undefined });
}
for (const i of [4, 5, 6]) await sc.handler({ action: "record", review: "SLR9", item_id: ids[i], stage: "title_abstract", reviewer: "consensus", decision: i === 4 ? "include" : "exclude", reason: i === 4 ? undefined : "wrong design" });
for (const i of [0, 1, 2, 3, 4]) await sc.handler({ action: "record", review: "SLR9", item_id: ids[i], stage: "full_text", reviewer: "consensus", decision: i < 3 ? "include" : "exclude", reason: i < 3 ? undefined : "no outcome data" });
await assert.rejects(sc.handler({ action: "record", review: "SLR9", item_id: ids[0], stage: "full_text", reviewer: "A", decision: "exclude" }), /reason/);
const pr = await sc.handler({ action: "prisma", review: "SLR9", duplicates_removed: 0 });
assert.deepEqual([pr.records_identified, pr.records_screened, pr.records_excluded_title_abstract, pr.reports_assessed_full_text, pr.reports_excluded_full_text, pr.studies_included], [10, 10, 5, 5, 2, 3]);
assert.deepEqual(pr.full_text_exclusion_reasons, { "no outcome data": 2 });
const del = await sc.handler({ action: "delete", review: "SLR9", item_id: ids[9], stage: "title_abstract", reviewer: "B" }); assert.equal(del.status, "preview");
const csvPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "q8-s-")), "screening.csv");
const csv = await sc.handler({ action: "export", review: "SLR9", stage: "title_abstract", path: csvPath }); assert.equal(csv.rows, 23);
let rOk = false;
try { execFileSync("Rscript", ["--version"], { stdio: "ignore" }); rOk = true; } catch { console.log("phase8 tools: Rscript not found, kappa check skipped"); }
if (rOk) {
  const res = JSON.parse(execFileSync("Rscript", [path.join(ROOT, "scripts", "screening-agreement.R"), csvPath, "A", "B"], { encoding: "utf8" }));
  assert.equal(res[0].n, 10); assert.ok(Math.abs(res[0].observed_agreement - 0.7) < 1e-9); assert.ok(Math.abs(res[0].expected_agreement - 0.5) < 1e-9);
  assert.ok(Math.abs(res[0].kappa - 0.4) < 1e-9, "Cohen's kappa 0.4 for the table [[4,1],[2,3]]");
  console.log(`phase8 tools: Cohen's kappa from R = ${res[0].kappa} (${res[0].r_version})`);
}
console.log("phase8 tools: 9 tools, DOI add (offline), merge/delete confirm, screening and PRISMA passed");
