// File check: reports the technical traces a .docx file carries (document properties, generator defaults,
// hidden content, blinding leaks) that editors and publisher systems can see.
// It only READS the file. It never writes, edits or "fixes" timestamps, edit time, word counts or author fields,
// and it never rewrites text. The author fixes a problem by saving their own revised version in Word.
import fs from "node:fs";
import crypto from "node:crypto";
import JSZip from "jszip";

export const CLOSING = "Save the final version yourself in Word after your own revision. Quartile does not change file metadata. Add the journal's required statement on generative-AI use.";
const DEFAULT_AUTHORS = ["un-named", "python-docx", "docx", "pandoc", "author", "user", "unknown", "administrator", "microsoft office user"];
const ZERO_WIDTH = /[​‌‍⁠﻿]/g;
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const tag = (xml, name) => { const m = xml && xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : null; };
const decode = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const texts = xml => [...String(xml || "").matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => decode(m[1]));
/** Words as Word counts them: runs of non-space characters in the body text, paragraph by paragraph. */
export function countWords(documentXml) {
  const paras = String(documentXml || "").split(/<\/w:p>/).map(p => texts(p).join(""));
  return paras.reduce((n, p) => n + (p.trim() ? p.trim().split(/\s+/).length : 0), 0);
}
const item = (id, status, values, explain) => ({ check: id, status, values, explain });

/** Read a .docx (path or bytes) without changing it. */
export async function readDocx(input) {
  const bytes = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const zip = await JSZip.loadAsync(bytes);
  const get = async n => (zip.file(n) ? zip.file(n).async("string") : null);
  const names = Object.keys(zip.files);
  const parts = {
    core: await get("docProps/core.xml"), app: await get("docProps/app.xml"), document: await get("word/document.xml"),
    comments: await get("word/comments.xml"), footnotes: await get("word/footnotes.xml"), endnotes: await get("word/endnotes.xml"),
    headers: await Promise.all(names.filter(n => /^word\/(header|footer)\d*\.xml$/.test(n)).map(get)),
    media: await Promise.all(names.filter(n => /^word\/media\//.test(n)).map(async n => ({ name: n, bytes: await zip.file(n).async("nodebuffer") }))),
    // Word adds an (often empty) bibliography-sources part to most files: that one is not reported
    customXml: (await Promise.all(names.filter(n => /^customXml\/item\d+\.xml$/.test(n)).map(async n => ({ n, x: await get(n) }))))
      .filter(p => !/<b:Sources\b[^>]*\/>\s*$/.test(p.x.trim()) && !/^<\?xml[^>]*\?>\s*<b:Sources\b[^>]*>\s*<\/b:Sources>\s*$/.test(p.x.trim())).map(p => p.n),
  };
  if (!parts.document) throw new Error("Not a Word .docx file (word/document.xml missing)");
  return { bytes, sha256: sha(bytes), names, parts };
}

function meta(d) {
  const c = d.parts.core, a = d.parts.app;
  const num = v => (v == null || v === "" ? null : Number(v));
  return {
    created: tag(c, "dcterms:created"), modified: tag(c, "dcterms:modified"), creator: tag(c, "dc:creator"), lastModifiedBy: tag(c, "cp:lastModifiedBy"),
    description: tag(c, "dc:description"), revision: num(tag(c, "cp:revision")),
    appPresent: !!a, appEmpty: !a || !/<(TotalTime|Words|Application)>/.test(a),
    totalTime: num(tag(a, "TotalTime")), words: num(tag(a, "Words")), application: tag(a, "Application"), appVersion: tag(a, "AppVersion"), company: tag(a, "Company"),
  };
}

/** Newest four-digit year in the reference list of the document (after a References heading). */
function newestReferenceYear(documentXml) {
  const paras = String(documentXml).split(/<\/w:p>/).map(p => texts(p).join("").trim()).filter(Boolean);
  const i = paras.findIndex(p => /^(\d+\.?\s*)?(references|bibliography|reference list|works cited)\s*:?$/i.test(p));
  if (i < 0) return null;
  const ys = paras.slice(i + 1).flatMap(p => [...p.matchAll(/\((19|20)(\d{2})[a-z]?\)|\b(19|20)(\d{2})[a-z]?\./g)].map(m => Number((m[1] || m[3]) + (m[2] || m[4]))));
  return ys.length ? Math.max(...ys) : null;
}

/** Names, e-mails, ORCIDs and organisations to look for when the file must be anonymised. */
export function identifiers({ names = [], profile = null, creator = null } = {}) {
  const out = new Set(names.filter(Boolean).map(s => s.trim()).filter(s => s.length >= 3));
  if (profile) {
    if (profile.name) out.add(profile.name);
    for (const a of [...(profile.entries || []), ...(profile.affiliations || []), ...(profile.business_interests || [])]) if (a.organisation) out.add(a.organisation);
    if (profile.orcid) out.add(String(profile.orcid).replace(/^https?:\/\/orcid\.org\//, ""));
    if (profile.email) out.add(profile.email);
  }
  if (creator && !DEFAULT_AUTHORS.includes(creator.toLowerCase())) out.add(creator);
  // a full name also matches its family name alone (e.g. "Dr. Ann Example" -> "Example")
  for (const n of [...out]) { const w = n.replace(/^(dr|prof)\.?\s+/i, "").split(/\s+/); if (w.length >= 2 && w[w.length - 1].length >= 4 && !/\b(university|ltd|kft|gmbh|inc|srl)\b/i.test(n)) out.add(w[w.length - 1]); }
  return [...out];
}

/**
 * Run the checks on one file. opts: { anonymised, names, profile, now }.
 * Returns { file, sha256, metadata, real_words, checks: [...], summary }.
 */
export async function checkFile(input, opts = {}) {
  const d = typeof input === "object" && input.parts ? input : await readDocx(input);
  const m = meta(d), real = countWords(d.parts.document), now = opts.now ? new Date(opts.now) : new Date();
  const checks = [];

  // 1. edit time
  if (!m.totalTime) checks.push(item("edit_time", "WARN", { total_time_min: m.totalTime, real_words: real }, "Total editing time is 0 or missing, which happens when a file was produced by a converter rather than edited in Word."));
  else if (m.totalTime < real / 100) checks.push(item("edit_time", "FAIL", { total_time_min: m.totalTime, real_words: real, min_expected: Math.ceil(real / 100) }, `Word records ${m.totalTime} minutes of editing for ${real} words (less than 1 minute per 100 words).`));
  else checks.push(item("edit_time", "OK", { total_time_min: m.totalTime, real_words: real }, "Editing time is plausible for the length."));

  // 2. stale word count
  if (m.words == null) checks.push(item("stale_word_count", "WARN", { app_words: null, real_words: real }, "The file has no stored word count."));
  else { const diff = real ? Math.abs(m.words - real) / real : (m.words ? 1 : 0);
    checks.push(item("stale_word_count", diff > 0.10 ? "FAIL" : "OK", { app_words: m.words, real_words: real, difference_pct: +(100 * diff).toFixed(1) },
      diff > 0.10 ? `The stored word count (${m.words}) differs from the real count (${real}) by more than 10%: it was inherited from another file.` : "Stored word count matches the text.")); }

  // 3. same timestamps
  const tc = m.created ? Date.parse(m.created) : NaN, tm = m.modified ? Date.parse(m.modified) : NaN;
  if (isNaN(tc) || isNaN(tm)) checks.push(item("same_timestamps", "WARN", { created: m.created, modified: m.modified }, "Created or modified date is missing."));
  else { const gap = Math.abs(tm - tc) / 60000;
    checks.push(item("same_timestamps", gap < 5 ? "WARN" : "OK", { created: m.created, modified: m.modified, gap_min: +gap.toFixed(2) },
      gap < 5 ? "Created and modified are the same or less than 5 minutes apart: the file was generated in one go, not revised." : "Created and modified dates differ.")); }

  // 4. impossible dates
  const refYear = newestReferenceYear(d.parts.document), cy = isNaN(tc) ? null : new Date(tc).getUTCFullYear(), bad = [];
  if (!isNaN(tc) && tc < Date.UTC(2015, 0, 1)) bad.push("created before 2015");
  if (!isNaN(tc) && tc > now.getTime() + 86400000) bad.push("created in the future");
  if (cy && refYear && cy < refYear) bad.push(`created in ${cy}, before the newest reference (${refYear})`);
  checks.push(item("impossible_dates", bad.length ? "FAIL" : "OK", { created: m.created, newest_reference_year: refYear }, bad.length ? "Impossible creation date: " + bad.join("; ") + "." : "Dates are possible."));

  // 5. author fields
  const ids = identifiers({ names: opts.names, profile: opts.profile, creator: null });
  const isDefault = v => !v || DEFAULT_AUTHORS.includes(v.trim().toLowerCase());
  const realName = v => v && !isDefault(v);
  if (opts.anonymised && (realName(m.creator) || realName(m.lastModifiedBy))) checks.push(item("author_fields", "FAIL", { creator: m.creator, lastModifiedBy: m.lastModifiedBy }, "The file is meant to be anonymised, but its properties name a person (blinding leak)."));
  else if (isDefault(m.creator) || isDefault(m.lastModifiedBy)) checks.push(item("author_fields", opts.anonymised && !m.creator && !m.lastModifiedBy ? "OK" : "WARN", { creator: m.creator, lastModifiedBy: m.lastModifiedBy },
    opts.anonymised && !m.creator && !m.lastModifiedBy ? "Author fields are empty, as an anonymised file should be." : "Author fields are empty or carry a generator default (for example 'Un-named' or 'python-docx')."));
  else checks.push(item("author_fields", "OK", { creator: m.creator, lastModifiedBy: m.lastModifiedBy }, "Author fields are set."));

  // 6. generator fingerprint
  const gen = [];
  if (m.totalTime === 6 && m.words === 83 && /12\.0/.test((m.application || "") + " " + (m.appVersion || ""))) gen.push("pandoc (its default reference.docx: TotalTime 6, Words 83, Microsoft Word 12.0.0)");
  if (/^2013-12-23T23:15:00/.test(m.created || "") || /generated by python-docx/i.test(m.description || "") || (m.creator || "").toLowerCase() === "python-docx") gen.push("python-docx (its default template: created 2013-12-23T23:15:00Z)");
  if ((m.creator || "") === "Un-named" || (!m.appPresent || m.appEmpty) && /\.\d{3}Z$/.test(m.created || "")) gen.push("docx (docx-js: creator 'Un-named', empty app.xml)");
  if (!gen.length && (!m.appPresent || m.appEmpty)) gen.push("an unknown generator (no application properties)");
  checks.push(item("generator_fingerprint", gen.length ? "FAIL" : "OK", { application: m.application, app_version: m.appVersion, total_time: m.totalTime, words: m.words, created: m.created, likely_generator: gen },
    gen.length ? "The file carries the default properties of " + gen.join(" and ") + "." : "No known generator defaults found."));

  // 7. blinding leak
  if (opts.anonymised) {
    const where = [];
    const look = (label, s) => { if (!s) return; for (const id of ids) if (s.toLowerCase().includes(id.toLowerCase())) where.push({ where: label, found: id }); };
    look("body", texts(d.parts.document).join(" ")); d.parts.headers.forEach((h, i) => look("header/footer " + (i + 1), texts(h).join(" ")));
    look("comments", texts(d.parts.comments).join(" ") + " " + [...String(d.parts.comments || "").matchAll(/w:author="([^"]*)"/g)].map(x => x[1]).join(" "));
    look("tracked changes", [...String(d.parts.document).matchAll(/<w:(?:ins|del)\b[^>]*w:author="([^"]*)"/g)].map(x => x[1]).join(" "));
    look("footnotes", texts(d.parts.footnotes).join(" ")); look("properties", [m.creator, m.lastModifiedBy, m.company].filter(Boolean).join(" "));
    for (const md of d.parts.media) { const s = md.bytes.toString("latin1"); if (/Exif/.test(s)) look("image metadata " + md.name, s); }
    const generic = [];
    const body = texts(d.parts.document).join(" ") + " " + d.parts.headers.map(h => texts(h).join(" ")).join(" ");
    if (/\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/.test(body)) generic.push("an ORCID iD");
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(body)) generic.push("an e-mail address");
    checks.push(item("blinding_leak", where.length || generic.length ? "FAIL" : "OK", { found: where, generic, identifiers_checked: ids.length },
      where.length || generic.length ? "The anonymised file still identifies the author: " + [...where.map(w => `${w.found} in ${w.where}`), ...generic].join("; ") + "." : ids.length ? "No author identifiers found." : "No author identifiers were given (names or author.yaml); only ORCID and e-mail patterns were checked."));
  }

  // 8. hidden content
  const doc = d.parts.document;
  const hidden = {
    comments: (String(d.parts.comments || "").match(/<w:comment\b/g) || []).length,
    tracked_insertions: (doc.match(/<w:ins\b/g) || []).length, tracked_deletions: (doc.match(/<w:del\b/g) || []).length,
    hidden_text_runs: (doc.match(/<w:vanish\/>|<w:vanish w:val="(1|true)"\/>/g) || []).length,
    white_text_runs: (doc.match(/<w:color w:val="(FFFFFF|ffffff)"\/>/g) || []).length,
    zero_width_chars: (texts(doc).join("").match(ZERO_WIDTH) || []).length,
    custom_xml_parts: d.parts.customXml.length,
  };
  const anyHidden = Object.values(hidden).some(Boolean);
  checks.push(item("hidden_content", anyHidden ? "WARN" : "OK", hidden, anyHidden ? "The file contains " + Object.entries(hidden).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ") + ". Accept or remove them before submission." : "No comments, tracked changes, hidden or white text, zero-width characters or custom XML."));

  return { file: opts.label || null, sha256: d.sha256, document_sha256: sha(d.parts.document), metadata: m, real_words: real, checks, _cmp: { created: m.created, modified: m.modified, totalTime: m.totalTime, words: m.words, doc: sha(d.parts.document) } };
}

/** 9. Files that share identical properties or identical text. */
export function crossFileIdentity(results) {
  const pairs = [];
  for (let i = 0; i < results.length; i++) for (let j = i + 1; j < results.length; j++) {
    const a = results[i]._cmp, b = results[j]._cmp, same = [];
    if (a.doc === b.doc) same.push("identical document text (document.xml hash)");
    if (a.created && a.created === b.created && a.modified === b.modified) same.push("identical created and modified dates");
    if (a.totalTime != null && a.totalTime === b.totalTime && a.words === b.words && a.created === b.created) same.push("identical edit time and word count");
    if (same.length) pairs.push({ a: results[i].file || i, b: results[j].file || j, same });
  }
  return item("cross_file_identity", pairs.length ? "WARN" : "OK", { files: results.length, pairs },
    pairs.length ? "Some files are identical in their properties or text; journals compare submissions." : "No two files share identical properties or text.");
}

export function summarise(main, extra = []) {
  const rows = [...main.checks, ...extra].map(c => `| ${c.check} | ${c.status} | ${c.explain} |`);
  return ["| Check | Status | What it means |", "|---|---|---|", ...rows, "", CLOSING].join("\n");
}

export default { checkFile, crossFileIdentity, summarise, readDocx, countWords, identifiers, CLOSING };
