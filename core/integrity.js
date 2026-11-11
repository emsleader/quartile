// Pre-submission integrity screen, aligned with the logic of the COPE flowchart
// "Plagiarism in a submitted manuscript" (COPE Council, https://doi.org/10.24318/cope.2019.2.1) and its companion on
// redundant (duplicate) publication. Wording here is Quartile's own; the COPE flowcharts are CC BY-NC-ND.
// The screen compares a manuscript with texts the user supplies (earlier papers, sources) and, in a local install,
// with the private corpus. It grades the overlap and says what an editor following COPE would do and what the
// author should fix before submitting. It is a screening aid, not a finding of misconduct.
const NG = 8;
const norm = t => (String(t).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const sentencesOf = t => String(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map(s => s.trim()).filter(s => s.split(" ").length >= 6);
const hasCite = s => /\((?:[^()]*?(?:19|20)\d{2}[a-z]?|[^()]*n\.d\.)[^()]*\)|\[\d+(?:[,–-]\s*\d+)*\]|\b[A-Z][a-z]+(?: et al\.)? \((?:19|20)\d{2}/.test(s);
const quoted = s => /[“"][^”"]{15,}[”"]/.test(s);

function shingles(text) { const w = norm(text), set = new Map(); for (let k = 0; k + NG <= w.length; k++) { const g = w.slice(k, k + NG).join(" "); if (!set.has(g)) set.set(g, k); } return set; }

// sources: [{ id, title, text, own: true|false }]
function screen(text, sources = [], extraLookup = null) {
  const S = sentencesOf(text), index = sources.map(src => ({ ...src, sh: shingles(src.text) }));
  const hits = [];
  S.forEach((s, i) => {
    const w = norm(s); let best = null;
    for (const src of index) { let run = 0, maxRun = 0; for (let k = 0; k + NG <= w.length; k++) { if (src.sh.has(w.slice(k, k + NG).join(" "))) { run++; maxRun = Math.max(maxRun, run); } else run = 0; } if (maxRun) { const covered = Math.min(1, (maxRun + NG - 1) / w.length); if (!best || covered > best.covered) best = { src, covered }; } }
    if (!best && extraLookup) { const e = extraLookup(s); if (e) best = { src: { id: e.id, title: e.title, own: false, corpus: true }, covered: e.covered || 0.5 }; }
    if (best) hits.push({ i, sentence: s, sourceId: best.src.id, source: best.src.title, own: !!best.src.own, corpus: !!best.src.corpus, covered: +best.covered.toFixed(2), cited: hasCite(s), quoted: quoted(s), hasNumbers: /\d[\d.,]*\s*(%|percent|per cent)|\b\d+\.\d+\b/.test(s) });
  });
  // runs of consecutive overlapping sentences (paragraph-level reuse)
  let longestRun = 0, run = 0, prev = -2; hits.forEach(h => { run = h.i === prev + 1 ? run + 1 : 1; prev = h.i; longestRun = Math.max(longestRun, run); });
  const other = hits.filter(h => !h.own), own = hits.filter(h => h.own);
  const unattributed = other.filter(h => !h.cited && !h.quoted), share = hits.length / Math.max(S.length, 1);
  const dataReuse = other.some(h => h.hasNumbers && !h.cited);
  // grading: Quartile's screening heuristics. COPE sets no numeric threshold; the nature of what is copied matters as much as the amount.
  let grade = "none";
  if (unattributed.length) grade = unattributed.length <= 3 && longestRun < 2 && !dataReuse && unattributed.every(h => h.covered < 0.8) ? "minor" : "substantial";
  const redundancy = own.length ? (own.length >= 5 || longestRun >= 3 ? "substantial" : "minor") : "none";
  const actions = [];
  if (grade === "none" && redundancy === "none") actions.push("No overlap with the supplied texts or the corpus. Keep the originality statement in the cover letter truthful and specific.");
  if (grade === "minor") actions.push("Minor overlap: short phrases reused without attribution. An editor following COPE would ask you to rephrase them or present them as direct quotations with references. Fix every flagged sentence before submitting.");
  if (grade === "substantial") actions.push("Substantial overlap: whole sentences, consecutive passages or numbers reused without attribution. An editor following COPE would treat this as clear plagiarism: contact the corresponding author with the evidence, normally reject the manuscript, and may inform the author's institution. Rewrite these passages in your own words and cite the source, or quote and cite them, before submitting.");
  if (redundancy !== "none") actions.push(`Overlap with your own earlier work (${own.length} sentences). COPE handles this under redundant (duplicate) publication: ${redundancy === "minor" ? "limited reuse, for example in methods, is often acceptable if the earlier paper is cited." : "extensive reuse needs the earlier work cited and disclosed to the editor, and may be redundant publication."} Cite the earlier paper where the text or data reappear and disclose the overlap in the cover letter.`);
  if (other.some(h => h.cited && !h.quoted && h.covered >= 0.8)) actions.push("Some sentences are cited but copied almost verbatim. Citation alone is not enough for copied wording: paraphrase or use quotation marks.");
  const disclosure = own.length ? `Parts of this manuscript overlap with our earlier work (${[...new Set(own.map(h => h.source))].join("; ")}). The earlier work is cited where the overlap occurs. The present manuscript differs in [state what is new: data, analysis, argument].` : null;
  return {
    kind: "integrity", grade, redundancy, sentencesChecked: S.length, overlappingSentences: hits.length, share: +share.toFixed(3), longestConsecutiveRun: longestRun,
    unattributed: unattributed.length, dataReuseSuspected: dataReuse,
    flagged: hits.slice(0, 60).map(h => ({ sentence: h.sentence, source: h.source, own: h.own, covered: h.covered, cited: h.cited, quoted: h.quoted, fix: h.own ? "Cite your earlier paper here, or rewrite and disclose the overlap." : h.quoted && h.cited ? "Quoted and cited: acceptable if the quotation is short and necessary." : h.cited ? "Cited but copied: paraphrase or put the copied words in quotation marks." : "Unattributed: rewrite in your own words and cite the source, or quote and cite it." })),
    actions, coverLetterDisclosure: disclosure,
    basis: "Screening aligned with COPE Council, 'Plagiarism in a submitted manuscript' (https://doi.org/10.24318/cope.2019.2.1) and the COPE flowchart on redundant publication in a submitted manuscript. Grades are Quartile's heuristics: COPE sets no numeric threshold, and an editor judges what was copied as well as how much. Only overlap with the texts supplied (and the local corpus) can be found; this is not a web-wide plagiarism check."
  };
}
module.exports = { screen, sentencesOf };
