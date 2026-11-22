// Section detection with heading variants (specification Section 3.1).
// Owner decision of 22 November 2026: the heading rule of 0.14.3 stays. A heading may end in ":" or "." and may
// carry a number ("3.", "Section 3:"); the specification's CANON names are matched after that prefix and suffix
// are removed. Heading lines themselves come from Core.isHeading (the existing, tested heuristic) and, for DOCX,
// from the document's real heading styles.
import Core from "../core.js";

export const CANON = {
  introduction: [/^introduction$/i],
  literature:   [/^(literature review|related (work|literature)|background|theoretical (background|framework)|theory( and (hypotheses|propositions))?|conceptual framework)$/i],
  methods:      [/^((data|research)( and| &)? (methods?|methodology|design)|methods?|methodology|empirical (strategy|approach)|identification( strategy)?|research design|sample and data)$/i],
  results:      [/^(results|findings|empirical results|analysis)$/i],
  discussion:   [/^(discussion|general discussion)$/i],
  implications: [/^((managerial|practical|policy) implications|implications( for .+)?)$/i],
  limitations:  [/^(limitations( and future research)?|study limitations)$/i],
  conclusion:   [/^(conclusions?|concluding remarks)$/i],
  disclosure:   [/^(declaration of (competing )?interests?|conflicts? of interest|competing interests|related parties|disclosure( statement)?)$/i],
  ethics:       [/^(ethics( statement| approval)?|ethical (approval|considerations))$/i],
  data_avail:   [/^(data (availability|access)( statement)?|code and data)$/i],
};

// Existing role names (Core.detectRole) mapped to section keys.
const ROLE_KEY = { abstract: "abstract", introduction: "introduction", literature: "literature", methods: "methods", results: "results",
  discussion: "discussion", conclusion: "conclusion", declarations: "disclosure", references: "references", opening: "opening", other: "other" };

/** Strip markdown hashes, numbering ("3.", "3.2", "IV.", "Section 3:") and a trailing ":" or "." from a heading. */
export function normaliseHeading(h) {
  return String(h || "").replace(/[*_`]+/g, "").replace(/^#+\s*/, "").trim()
    .replace(/^(section|chapter)\s+\d+(\.\d+)*\s*[:.)-]?\s*/i, "")
    .replace(/^(\d+(\.\d+)*|[ivxlc]+)[.)]?\s+/i, "")
    .replace(/[:.]\s*$/, "").trim();
}

/** The current heading rule (0.14.3), kept by owner decision. */
export const isHeadingLine = line => Core.isHeading(String(line || "").trim());

/** Section key for a heading: a CANON name wins; otherwise the existing role, refined for limitations, implications and declarations. */
export function canonKey(heading, role) {
  const h = normaliseHeading(heading);
  for (const [key, pats] of Object.entries(CANON)) if (pats.some(rx => rx.test(h))) return key;
  const t = h.toLowerCase();
  if (role === "declarations" || /declaration|disclosure|conflict|competing interest|related part/.test(t)) {
    if (/ethic/.test(t)) return "ethics";
    if (/data (availability|access)|code and data/.test(t)) return "data_avail";
    if (/fund/.test(t) && !/conflict|interest|related/.test(t)) return "funding";
    return "disclosure";
  }
  if (/limitation/.test(t)) return "limitations";
  if (/implication/.test(t)) return "implications";
  return ROLE_KEY[role] || "other";
}

/**
 * Detect sections from parsed paragraphs. `paragraphs` are { text, isHeading, role? } in order.
 * Returns [{ key, heading, start, end }] with paragraph indices; a section ends where the next one starts.
 */
export function detectSections(paragraphs) {
  const out = [];
  paragraphs.forEach((p, i) => { if (p.isHeading) out.push({ key: canonKey(p.text, p.role), heading: p.text.trim(), start: i }); });
  return out.map((s, k) => ({ ...s, end: k + 1 < out.length ? out[k + 1].start : paragraphs.length }));
}

export const hasSection = (sections, key) => sections.some(s => s.key === key);

export default { CANON, normaliseHeading, isHeadingLine, canonKey, detectSections, hasSection };
