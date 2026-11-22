// LIB-06: the owner's citation policy (specification 20.6).
// Non-SLR papers: only Q1/Q2 journal articles. SLRs: journal articles (Q1-Q4), books and chapters; conference and
// working papers excluded. Exceptions: items tagged own-work or close-idea.
// One change from the code sketch in 20.6: a retracted item is flagged even when it carries an exception tag,
// because missing a retraction is the more costly error (listed in the phase report for the owner).
export const POLICY_SOURCE = "Owner citation policy, Quartile specification Section 20.6 (decision of 21 November 2026)";

const f = (rule, severity, title, message, fix, item, span = null) => ({
  rule, role: "production", title, severity, confidence: "high", source: POLICY_SOURCE, source_ref: "Spec 20.6 / " + rule,
  message, fix, span, detail: { item_id: item.id, title: item.csl?.title || null, type: item.type, quartile: item.quartile || null, quartile_year: item.quartile_year || null, tags: item.tags || [] },
});

/** item: hydrated library item ({ id, type, quartile, quartile_year, tags, csl }). paperType: slr | empirical | conceptual. */
export function citationPolicy(item, tags = item.tags || [], paperType = "empirical", span = null) {
  const t = new Set(tags);
  if (t.has("retracted")) return f("LIB-POL-01", "blocker", "Retracted work cited", "The library's verification log marks this work as retracted.", "Remove the citation, or cite it only to discuss the retraction and say so in the text.", item, span);
  if (t.has("own-work") || t.has("close-idea")) return null;
  const isJournal = item.type === "article-journal";
  const isBook = item.type === "book" || item.type === "chapter";
  if (paperType === "slr") {
    if (isBook) return null;
    if (!isJournal) return f("LIB-POL-02", "major", "Source type not allowed in an SLR", `SLR rule: a ${item.type} is not a journal article, book or chapter.`, "Replace it with the published journal version, or move it out of the included studies.", item, span);
    if (!item.quartile) return f("LIB-POL-04", "minor", "Journal quartile unknown", "The journal is not found in your SCImago bank by ISSN.", "Check the journal in the SCImago bank; add the ISSN to the library record if it is missing.", item, span);
    return null;
  }
  if (!isJournal) return f("LIB-POL-03", "major", "Only Q1/Q2 journal articles may be cited", `Policy allows Q1/Q2 journal articles only; this is a ${item.type}.`, "Cite the published Q1/Q2 journal version, or tag the item own-work or close-idea if an exception applies.", item, span);
  if (!item.quartile) return f("LIB-POL-04", "minor", "Journal quartile unknown", "The journal is not found in your SCImago bank by ISSN.", "Check the journal in the SCImago bank; add the ISSN to the library record if it is missing.", item, span);
  if (!["Q1", "Q2"].includes(item.quartile)) return f("LIB-POL-05", "major", "Journal below Q2", `Journal is ${item.quartile}${item.quartile_year ? " (" + item.quartile_year + ")" : ""}; policy allows Q1/Q2 only.`, "Replace it with a Q1/Q2 source, or tag it close-idea if it is the closest prior work.", item, span);
  return null;
}

export default { citationPolicy, POLICY_SOURCE };
