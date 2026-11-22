// Structural tests for Phase 1 (methods reviewer).
const LIMIT = /\b(limitations?|limited by|weakness\w*|shortcomings?|caveats?|we cannot|cannot rule out|should be (read|interpreted) with caution)\b/i;
// a specific limitation names the data, sample, measure or design
const SPECIFIC = /\b(data|dataset|sample\w*|respondents?|response rate|non-?response|self-?report\w*|measure\w*|proxy|proxies|scale|cross-?section\w*|panel|design|causal\w*|endogene\w+|reverse causality|selection|surviv\w+|common method|single (country|industry|sector|informant|source)|one (country|industry|sector|region)|generali[sz]\w*|period|years?|countr(y|ies)|firms?|size|small|missing|attrition|instrument\w*|identif\w+|bias\w*|omitted|confound\w*|coverage|snapshot|interview\w*|cases?)\b/i;

export default {
  /**
   * MTH-06. Passes when the paper names at least one specific limitation (data, sample, measure or design).
   * Fails when limitation sentences exist but none is specific, or when a full paper (methods, results and a
   * discussion, conclusion or limitations section) has no limitation sentence at all. Other texts are not judged.
   */
  limitations_specific: doc => {
    const full = doc.hasSection("methods") && doc.hasSection("results") && (doc.hasSection("discussion") || doc.hasSection("conclusion") || doc.hasSection("limitations"));
    if (!full) return { ok: true, detail: { judged: false } };
    const pool = doc.hasSection("limitations") ? doc.sentencesIn(["limitations"]) : doc.sentencesIn(["discussion", "conclusion", "implications"]).filter(s => LIMIT.test(s.text));
    const ctx = doc.hasSection("limitations") ? pool : doc.sentencesIn(["discussion", "conclusion", "implications"]);
    if (!pool.length) return { ok: false, anchor: null, detail: { judged: true, limitation_sentences: 0 } };
    // limitation sentences plus the sentence that follows each, where the detail is often given
    const idx = new Set(); pool.forEach(s => { const i = ctx.indexOf(s); idx.add(i); if (i + 1 < ctx.length) idx.add(i + 1); });
    const look = [...idx].map(i => ctx[i]).filter(Boolean);
    const ok = look.some(s => SPECIFIC.test(s.text.replace(/\bfuture (research|studies|work)\b/gi, "")));
    return { ok, anchor: pool[0], detail: { judged: true, limitation_sentences: pool.length } };
  },
};
