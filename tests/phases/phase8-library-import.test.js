// Phase 8 (Quartile Library): storage, import, export round trip (500 items), RIS/CSL-JSON/Zotero RDF, search,
// verification log, PDF attach, backup, and the licence rule (no citeproc / plugin-csl).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "q8-import-"));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIX = path.join(ROOT, "tests", "fixtures");
const L = await import("../../core/library/index.js");
const { parseBibtex } = await import("../../core/library/importers.js");
const { yearOf } = await import("../../core/library/normalize.js");
const Lib = (await import("../../core/lib.js")).default;
Lib.setBank([{ t: "Journal of Finance", i: ["00221082", "15406261"], q: "Q1" }, { t: "Small Biz", i: ["0921898X"], q: "Q3" }]);

const canon = v => JSON.stringify(v, (k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x);
const strip = c => { const { id, "citation-key": _k, ...r } = c; if (r.custom) { const { bibtex_type, quartile_library, ...cu } = r.custom; r.custom = Object.keys(cu).length ? cu : undefined; if (!r.custom) delete r.custom; } return r; };

// ---------- 500-item BibTeX: import -> export -> import ----------
const lib = await L.openLibrary();
const bibText = fs.readFileSync(path.join(FIX, "library-500.bib"), "utf8");
const expected = JSON.parse(fs.readFileSync(path.join(FIX, "library-500.expected.json"), "utf8"));
const t0 = Date.now();
const r1 = await L.importText(lib, bibText, { filename: "library-500.bib", collection: "Synthetic" });
assert.equal(r1.read, 500); assert.equal(r1.added, 500, "all 500 added"); assert.equal(r1.duplicates.length, 0);
assert.equal(lib.count(), 500);
const items1 = lib.all();
// 1) import keeps every field of the source (checked against the decoded values written by the generator)
const byKey = new Map(items1.map(it => [it.csl["citation-key"], it]));
let fieldChecks = 0;
for (const e of expected) {
  const it = byKey.get(e.key); assert.ok(it, "imported " + e.key); const c = it.csl;
  assert.equal(c.type, e.type, e.key + " type"); assert.equal(c.title, e.title, e.key + " title"); assert.equal(yearOf(c), e.year, e.key + " year");
  assert.equal(c.author.length, e.author.length, e.key + " authors");
  e.author.forEach((a, k) => { for (const f of Object.keys(a)) { assert.equal(c.author[k][f], a[f], `${e.key} author ${k} ${f}`); fieldChecks++; } });
  for (const f of ["container-title", "volume", "issue", "page", "publisher", "publisher-place", "edition", "number", "genre", "version", "DOI", "URL", "abstract", "keyword"]) if (e[f] != null) { assert.equal(c[f], e[f], `${e.key} ${f}`); fieldChecks++; }
  if (e.custom_bibtex) assert.deepEqual(c.custom.bibtex, e.custom_bibtex, e.key + " unmapped fields kept");
  fieldChecks += 3;
}
// 2) export -> re-import gives the same CSL records
const exp = L.exportItems(items1, "bibtex");
assert.equal(new Set(exp.keys).size, 500, "cite keys unique");
assert.ok(exp.keys.every(k => /^[A-Z][A-Za-z]*(\d{4}|nd)[A-Z][a-z0-9]*[a-z]*$/.test(k)), "AuthorYearWord keys");
const again = (await parseBibtex(exp.text)).items;
assert.equal(again.length, 500);
let diffs = 0;
items1.forEach((it, i) => { const a = canon(strip(it.csl)), b = canon(strip(again[i])); if (a !== b) { diffs++; if (diffs < 4) console.error("round-trip diff", it.csl["citation-key"], a, b); } });
assert.equal(diffs, 0, "BibTeX round trip without data loss");
// keys are stable: same library -> same keys
assert.deepEqual(L.exportItems(lib.all(), "bibtex").keys, exp.keys);
// second library from the export: same count and same columns
process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "q8-import2-"));
const lib2 = await L.openLibrary();
const r2 = await L.importText(lib2, exp.text, { format: "bibtex" });
assert.equal(r2.added, 500);
const cols = x => x.all().map(i => [i.doi, i.title_norm, i.year, i.type]).sort((a, b) => a[1].localeCompare(b[1]) || String(a[0]).localeCompare(String(b[0])));
assert.deepEqual(cols(lib2), cols(lib));
console.log(`phase8 import: 500 BibTeX items, ${fieldChecks} field checks, round-trip differences 0 (${Date.now() - t0} ms)`);

// pandoc .bib parses and keeps the main fields
const pd = (await parseBibtex(L.exportItems(items1, "pandoc-bib").text)).items;
assert.equal(pd.length, 500); assert.equal(pd.filter((c, i) => c.title === items1[i].csl.title && c.DOI === items1[i].csl.DOI).length, 500);

// ---------- RIS and CSL-JSON round trips (main types) ----------
const sample = items1.filter((it, i) => i < 30);
const risBack = (await L.parseAny(L.exportItems(sample, "ris").text, { format: "ris" })).items;
assert.equal(risBack.length, 30);
const nm = p => [p["non-dropping-particle"], p.family || p.literal].filter(Boolean).join(" ");
sample.forEach((it, i) => { const a = it.csl, b = risBack[i]; assert.equal(b.title, a.title); assert.equal(yearOf(b), yearOf(a)); assert.equal(b.DOI || null, a.DOI || null); assert.deepEqual(b.author.map(nm), a.author.map(nm)); assert.equal(b["container-title"], a["container-title"]); });
const cslBack = (await L.parseAny(L.exportItems(sample, "csl-json").text)).items;
sample.forEach((it, i) => assert.equal(canon(strip(cslBack[i])), canon(strip(it.csl))));

// ---------- library.json backup restores tags and collections ----------
const bk = lib.backup();
assert.ok(fs.existsSync(bk.file)); assert.equal(bk.items, 500);
process.env.QUARTILE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "q8-import3-"));
const lib3 = await L.openLibrary();
await L.importText(lib3, fs.readFileSync(bk.file, "utf8"), { filename: "library.json" });
assert.equal(lib3.count(), 500); assert.equal(lib3.idsIn("Synthetic").length, 500, "collection restored from backup");

// ---------- Zotero RDF with nested collections ----------
const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:z="http://www.zotero.org/namespaces/export#" xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:bib="http://purl.org/net/biblio#" xmlns:foaf="http://xmlns.com/foaf/0.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:prism="http://prismstandard.org/namespaces/1.2/basic/">
  <bib:Article rdf:about="http://zotero.org/users/local/abc/items/AAA">
    <z:itemType>journalArticle</z:itemType>
    <dcterms:isPartOf rdf:resource="urn:issn:0022-1082"/>
    <bib:authors><rdf:Seq><rdf:li><foaf:Person><foaf:surname>Kovács</foaf:surname><foaf:givenName>Péter</foaf:givenName></foaf:Person></rdf:li>
      <rdf:li><foaf:Person><foaf:surname>Lee</foaf:surname><foaf:givenName>Ann</foaf:givenName></foaf:Person></rdf:li></rdf:Seq></bib:authors>
    <dc:title>Leasing &amp; growth in SMEs</dc:title>
    <dc:date>2021-05</dc:date><bib:pages>10-30</bib:pages>
    <dc:identifier>DOI 10.5555/RDF.1</dc:identifier>
  </bib:Article>
  <bib:Journal rdf:about="urn:issn:0022-1082"><dc:title>Journal of Finance</dc:title><prism:volume>76</prism:volume><prism:number>3</prism:number><dc:identifier>ISSN 0022-1082</dc:identifier></bib:Journal>
  <bib:Book rdf:about="#item_2"><z:itemType>book</z:itemType><dc:title>Small firms</dc:title>
    <bib:authors><rdf:Seq><rdf:li><foaf:Person><foaf:surname>Nagy</foaf:surname><foaf:givenName>Anna</foaf:givenName></foaf:Person></rdf:li></rdf:Seq></bib:authors>
    <dc:publisher><foaf:Organization><foaf:name>Routledge</foaf:name></foaf:Organization></dc:publisher><dc:date>2019</dc:date></bib:Book>
  <z:Collection rdf:about="#collection_1"><dc:title>PhD</dc:title><dcterms:hasPart rdf:resource="#collection_2"/><dcterms:hasPart rdf:resource="#item_2"/></z:Collection>
  <z:Collection rdf:about="#collection_2"><dc:title>SLR2</dc:title><dcterms:hasPart rdf:resource="http://zotero.org/users/local/abc/items/AAA"/></z:Collection>
</rdf:RDF>`;
const pr = await L.parseAny(rdf, { filename: "export.rdf" });
assert.equal(pr.format, "zotero-rdf"); assert.equal(pr.items.length, 2);
const art = pr.items.find(x => x.type === "article-journal");
assert.equal(art.title, "Leasing & growth in SMEs"); assert.equal(art["container-title"], "Journal of Finance"); assert.equal(art.volume, "76"); assert.equal(art.issue, "3");
assert.equal(art.DOI, "10.5555/RDF.1"); assert.equal(art.ISSN, "0022-1082"); assert.equal(art.author[0].family, "Kovács"); assert.deepEqual(art.issued["date-parts"][0], [2021, 5]);
const rr = await L.importText(lib3, rdf, { filename: "export.rdf" });
assert.equal(rr.added, 2);
assert.equal(lib3.idsIn("SLR2").length, 1); assert.equal(lib3.idsIn("PhD").length, 1, "only the book is directly in PhD");
const slr2 = lib3.collections().find(c => c.name === "SLR2"), phd = lib3.collections().find(c => c.name === "PhD");
assert.equal(slr2.parent_id, phd.id, "nested collection kept");
const artItem = lib3.byDoi("10.5555/rdf.1");
assert.equal(artItem.quartile, "Q1", "quartile from the SCImago bank by ISSN"); assert.ok(artItem.tags.includes("Q1"));

// same DOI = duplicate, not added
const dupR = await L.importText(lib3, rdf, { filename: "export.rdf" });
assert.equal(dupR.added, 1); assert.equal(dupR.duplicates.length, 1);
assert.equal(dupR.suggested_merges.length, 1, "same book again: suggested merge, not automatic");

// ---------- search (FTS4, diacritics folded) ----------
const s1 = L.search(lib3, { query: "kovacs leasing" }); assert.equal(s1.length, 1); assert.equal(s1[0].doi, "10.5555/rdf.1");
assert.equal(L.search(lib3, { query: "leas" }).length, 1, "prefix search");
assert.ok(L.search(lib3, { quartile: "Q1" }).every(x => x.quartile === "Q1"));
assert.equal(L.search(lib3, { collection: "PhD", type: "book" }).length, 2, "book imported twice (suggested merge, not merged)");
assert.ok(L.search(lib3, { year_from: 2021, year_to: 2021 }).every(x => x.year === 2021));
assert.equal(L.search(lib3, { query: "\"unbalanced OR (" }).length, 0, "odd query does not throw");

// ---------- verification log ----------
L.recordVerification(lib3, artItem.id, { source: "manual", status: "verified", note: "checked on the publisher site", checked_at: "2026-11-20T10:00:00Z" });
L.recordVerification(lib3, artItem.id, { source: "scite", status: "corrected", checked_at: "2026-11-21T10:00:00Z" });
const log = L.verificationLog(lib3, artItem.id); assert.equal(log.length, 2, "history kept"); assert.equal(log[1].status, "corrected");
assert.ok(lib3.get(artItem.id).tags.includes("verified-2026-11-20"));
assert.throws(() => L.recordVerification(lib3, artItem.id, { source: "manual", status: "fine" }));

// ---------- PDF attach ----------
const src = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "q8-pdf-")), "paper.pdf");
fs.writeFileSync(src, "%PDF-1.4\n% synthetic\n");
const before = fs.readFileSync(src);
const at = L.attachFile(lib3, artItem.id, src, "aam");
assert.equal(at.status, "attached"); assert.match(at.sha256, /^[0-9a-f]{64}$/);
assert.ok(at.path.startsWith(path.join(process.env.QUARTILE_HOME, "library", "files", artItem.id)));
assert.deepEqual(fs.readFileSync(src), before, "source file unchanged");
assert.equal(L.attachFile(lib3, artItem.id, src, "aam").status, "already_attached");
assert.throws(() => L.attachFile(lib3, artItem.id, src, "other"));
assert.equal(lib3.h.all("SELECT * FROM items WHERE csl LIKE '%PDF-1.4%'").length, 0, "PDF not in the database");

// ---------- licence rule: no citeproc or plugin-csl ----------
const lock = fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8");
assert.ok(!/"node_modules\/citeproc"|@citation-js\/plugin-csl/.test(lock), "citeproc / plugin-csl not installed");
for (const f of fs.readdirSync(path.join(ROOT, "core", "library"))) assert.ok(!/(?:from\s+|import\s*\(\s*)["'][^"']*(?:citeproc|plugin-csl)/.test(fs.readFileSync(path.join(ROOT, "core", "library", f), "utf8")), f + " has no citeproc import");
console.log("phase8 import: RIS, CSL-JSON, Zotero RDF, search, verification, PDF attach, licence checks passed");
