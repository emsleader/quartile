// Structural tests used by rulebook entries with check: structural. Each test is a named function of the document
// model; the rule's `test` field names it with optional arguments, e.g. "has_section(limitations)" or
// "first_n_paragraphs_contain_claim(3)". New tests are added here, each with its own unit test.
const CLAIM = /\b(we (argue|show|find|propose|contribute|demonstrate)|this (paper|study|article) (argues|shows|finds|proposes|contributes|demonstrates)|our (argument|contribution|main finding))\b/i;

export const TESTS = {
  /** The section exists (heading-aware). */
  has_section: (doc, key) => ({ ok: doc.hasSection(key), detail: { section: key } }),
  /** One of the sections exists. */
  has_any_section: (doc, ...keys) => ({ ok: keys.some(k => doc.hasSection(k)), detail: { sections: keys } }),
  /** A claim sentence appears in the first n paragraphs of `where` (default: introduction). */
  first_n_paragraphs_contain_claim: (doc, n = 3, where = "introduction") => {
    const paras = doc.paragraphs.filter(p => !p.isHeading && p.section === where).slice(0, Number(n));
    return { ok: paras.some(p => CLAIM.test(p.text)), anchor: firstSentence(doc, where), detail: { paragraphs: paras.length } };
  },
  /** The text of the sections matches the regex given as argument. */
  section_matches: (doc, where, re) => {
    const keys = String(where).split("|"); const t = keys.includes("all") ? doc.text : doc.sectionText(keys);
    return { ok: new RegExp(re, "i").test(t), anchor: firstSentence(doc, keys[0]) };
  },
};

function firstSentence(doc, where) { return doc.sentencesIn(where)[0] || null; }

/** Parse "name(a, b)" and run it. Unknown tests throw, so a typo in a rule fails the rule tests. */
export function evaluate(spec, doc) {
  const m = String(spec).match(/^\s*([a-z_]+)\s*(?:\((.*)\))?\s*$/);
  if (!m || !TESTS[m[1]]) throw new Error(`Unknown structural test: ${spec}`);
  const args = m[2] ? m[2].split(/,(?![^\[]*\])/).map(s => s.trim().replace(/^["']|["']$/g, "")) : [];
  return TESTS[m[1]](doc, ...args);
}

export default { TESTS, evaluate };
