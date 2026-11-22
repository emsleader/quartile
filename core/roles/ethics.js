// Role module: ethics and data office (specification Section 10).
// Code checks here: ETH-04 conflict-of-interest statement (heading-aware), ETH-04-DUAL dual-role flag from the
// local author profile, ETH-07 small cells in firm-level tables. The text checks ETH-01, 02, 03, 05, 06 and their
// wording rules are in rulebook/ethics.yaml (run by the rule engine), so nothing is reported twice.
// run(doc, opts) returns findings in the engine's shape.
import E from "./ethics_lib.js";

export const ROLE = "ethics";
export const SOURCE = "QUARTILE_ETHICS";
const REF = {
  coi: "ICMJE Recommendations, Section II.B (disclosure of relationships and conflicts of interest); COPE Core Practice: Conflicts of interest / competing interests",
  dual: "ICMJE Recommendations, Section II.B; COPE Core Practice: Conflicts of interest / competing interests; owner's rule: an author with business interests in the studied sector discloses the role",
  cells: "Hundepool et al. (2012), Statistical Disclosure Control, Wiley, ch. 5 (threshold rule for frequency tables); threshold 5 set by specification Section 10",
};
const SMALL = 5;

const finding = (o) => ({ role: ROLE, source: SOURCE, confidence: "medium", span: null, detail: null, fix: null, ...o });
const spanOf = s => s ? { section: s.section, start: s.start, end: s.end, text: s.text } : null;

/** All ethics code checks plus the context the tool reports (profile status, studied sectors). */
export function checkEthics(doc, opts = {}) {
  const findings = [];
  const design = doc.design?.primary || "unknown";
  const coi = E.coiStatement(doc);
  const { sectors: studied, text } = E.studiedSectors(doc);
  const prof = E.loadProfile(opts.authorProfile ?? opts.author_profile ?? null);
  const matches = prof.status === "loaded" ? E.matchProfile(prof.profile, studied, text) : [];

  // ETH-04-DUAL: the author's own affiliations or business interests include a company in the studied sector
  if (matches.length) {
    const m = matches[0];
    const named = coi.present ? E.disclosureNamesRole(coi, m) : { named: false };
    const who = `${m.entry.kind === "business_interest" ? "business interest" : "affiliation"} "${m.entry.organisation || "(unnamed)"}"${m.entry.role ? " (" + m.entry.role + ")" : ""}`;
    const detail = { profile_sector: m.profile_sector, studied_sector: m.studied, match: m.match, entry: who, coi_statement: coi.present, named_by: named.by || null, other_matches: matches.length - 1 };
    if (named.named) {
      findings.push(finding({ rule: "ETH-04-DUAL", title: "Dual role: author works in the studied sector", severity: "note", confidence: "medium", source_ref: REF.dual,
        message: `Disclosure present; check it names the role. Your profile lists ${who} in the sector this paper studies (${m.studied}).`,
        fix: "Make sure the statement names the organisation, your role in it, and how the paper's topic touches its business.", span: spanOf(named.sentence), detail }));
    } else {
      findings.push(finding({ rule: "ETH-04-DUAL", title: "Dual role: author works in the studied sector", severity: "major", confidence: m.confidence, source_ref: REF.dual,
        message: coi.present
          ? `Your profile lists ${who} in the sector this paper studies (${m.studied}), but the conflict-of-interest statement does not name this role.`
          : `Your profile lists ${who} in the sector this paper studies (${m.studied}), and the paper has no conflict-of-interest statement.`,
        fix: "Add a declaration of competing interests that names the organisation, your role (e.g. director, owner, shareholder) and its business in the studied sector, and say how you kept the analysis independent.",
        span: spanOf(coi.sentences[0]), detail }));
    }
  } else if (!coi.present) {
    // ETH-04: no conflict-of-interest statement and no heading for one
    findings.push(finding({ rule: "ETH-04", title: "Conflict-of-interest statement", severity: "minor", confidence: "medium", source_ref: REF.coi,
      message: "No conflict-of-interest statement found (looked for a 'Conflict of interest', 'Declaration of competing interests' or 'Related parties' heading and for a statement in the text).",
      fix: "Add a 'Declaration of competing interests' section, even if it says that there are none.", detail: { headings: [] } }));
  }

  // ETH-07: small cells in firm-level tables (survey designs)
  if (design === "survey") findings.push(...smallCells(doc));
  return { findings, profile: { status: prof.status, path: prof.path, problems: prof.problems, entries: prof.profile ? prof.profile.entries.length : 0 }, studied_sectors: studied, coi: { present: coi.present, headings: coi.headings }, design };
}

const FIRM = /\b(firms?|compan(y|ies)|enterprises?|SMEs?|businesses|studios?|establishments?|organi[sz]ations?|clinics?|hotels?|farms?)\b/i;
const COUNT_COL = /^(n|N|no\.?)$|\(n\)|\bn\s*=|^n\b|\bcount\b|\bnumber( of)?\b|\bno\. of\b|\bfrequenc|\bfreq\b|\bobs\b|\bfirms?\b|\bcompanies\b|\bbusinesses\b|\bstudios\b|\brespondents\b/i;
const NOT_COUNT = /%|percent|\bshare|\bmean|average|\bsd\b|\bstd|median|ratio|\brates?\b|score|\byears?\b|\bage\b|coef|beta|\bse\b|p-?value|\bmin\b|\bmax\b|range|\beur\b|\bhuf\b|\busd\b|€|\$/i;

/** ETH-07: tables of firms with counts 1 to 4 in a count column. */
export function smallCells(doc) {
  const out = [];
  for (const t of doc.tables) {
    if (t.rows.length < 2) continue;
    const p = doc.paragraphs.find(x => x.id === t.paragraph);
    const prev = p ? doc.paragraphs[p.index - 1] : null;
    const caption = prev && /^table\b/i.test(prev.text) ? prev.text : "";
    const header = t.rows[0];
    if (!FIRM.test(header.join(" ") + " " + caption)) continue;
    const cols = header.map((h, j) => j).filter(j => j > 0 && COUNT_COL.test(header[j]) && !NOT_COUNT.test(header[j]));
    const small = [];
    for (let i = 1; i < t.rows.length; i++) {
      if (/^\s*total\b/i.test(t.rows[i][0] || "")) continue;
      for (const j of cols) { const v = t.numbers[i]?.[j]; const raw = t.rows[i][j] || ""; if (Number.isInteger(v) && v >= 1 && v < SMALL && !/[%.]/.test(raw)) small.push({ row: t.rows[i][0], column: header[j], value: v }); }
    }
    if (!small.length) continue;
    out.push(finding({ rule: "ETH-07", title: "Small cells in a firm-level table", severity: "minor", confidence: "medium", source_ref: REF.cells,
      message: `Table ${t.id}${caption ? " (" + caption.slice(0, 60) + ")" : ""} has ${small.length} cell(s) with fewer than ${SMALL} firms (${small.slice(0, 4).map(c => `${c.row}: ${c.value}`).join("; ")}). Small cells can identify single firms.`,
      fix: `Merge categories, suppress counts below ${SMALL}, or state that the firms agreed to this level of detail.`,
      span: p ? { section: p.section, start: p.start, end: p.end, text: p.text } : null, detail: { table: t.id, cells: small, threshold: SMALL } }));
  }
  return out;
}

export async function run(doc, opts = {}) { return checkEthics(doc, opts).findings; }
export default { ROLE, run, checkEthics, smallCells };
