// Phase 3: editor-in-chief role (specification Section 5). Offline: every literature source is injected or synthetic.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseText } from "../../core/text/parse.js";
import eic, { contributionClaims, noveltyClaims, contributionTest, noveltyCheck, scopeFit, formatLimits, formatMeasures, plannedOpenAlexQueries, openAlexOverlap, crossrefTitles, tfidf, cosine, THRESHOLD, LABEL } from "../../core/roles/eic.js";
import tool from "../../tools/contribution_test.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MS = (extraRef = "") => `Cash Buffers Shorten Opening Delays in Service Firms

Abstract

We study 120 franchised studios in Europe. This paper is the first to measure the delay between franchise signing and studio opening.

Keywords: finance; franchising; growth

1. Introduction

Small firms face credit limits that slow growth (Smith, 2019).

We contribute by showing that cash buffers shorten the delay between franchise signing and studio opening in service firms.

This is not the first study of credit access in franchising.

This paper examines whether cash buffers shorten the delay.

2. Methods

We use a panel of franchised studios.

References

Smith, J. (2019). Credit and growth. Journal of Finance, 1, 1-2. https://doi.org/10.1234/smith.2019
${extraRef}`;
const PRIOR = { title: "Cash reserves and the opening speed of franchised studios", doi: "10.5555/prior.1", year: 2021 };
const fixed = (results, extra = {}) => async () => ({ searched: true, source: "test source", results, ...extra });

// claim extraction, negation-aware
{
  const doc = parseText(MS());
  const c = contributionClaims(doc).map(s => s.text);
  assert.ok(c.some(t => t.startsWith("We contribute")), "CONTRIB claim found");
  assert.ok(c.some(t => t.startsWith("This paper is the first")), "first claim is a contribution claim");
  const n = noveltyClaims(doc).map(x => x.sentence.text);
  assert.ok(n.some(t => t.startsWith("This paper is the first")));
  assert.ok(!n.some(t => t.startsWith("This is not the first")), "negated novelty claim ignored");
}

// EIC-01 blocker: closest paper uncited, score >= threshold, real comparison
{
  const doc = parseText(MS());
  const ct = await contributionTest(doc, { overlap: fixed([{ ...PRIOR, score: 0.7 }]) });
  const f = ct.findings.find(x => x.detail.claim.startsWith("We contribute"));
  assert.equal(f.severity, "blocker"); assert.equal(f.rule, "EIC-01"); assert.ok(f.message.includes(PRIOR.title));
  assert.equal(THRESHOLD, 0.55);
  assert.ok(f.span && doc.text.slice(f.span.start, f.span.end) === f.span.text, "span is exact");
  // EIC-02 with a close paper: major, medium
  const nv = noveltyCheck(doc, ct.cache, {});
  assert.equal(nv.length, 1); assert.equal(nv[0].severity, "major"); assert.equal(nv[0].confidence, "medium");
}
// cited (DOI in reference list, or given), below threshold, or not a real comparison: note
{
  const cited = parseText(MS(`Lee, K. (2021). Something. Journal X, 2, 3-4. https://doi.org/${PRIOR.doi}`));
  for (const [doc, ov, opts, why] of [
    [cited, fixed([{ ...PRIOR, score: 0.9 }]), {}, "DOI in references"],
    [parseText(MS()), fixed([{ ...PRIOR, score: 0.9 }]), { cited_dois: ["https://doi.org/" + PRIOR.doi.toUpperCase()] }, "DOI given"],
    [parseText(MS(`Lee, K. (2021). Cash reserves and the opening speed of franchised studios. Journal X, 2, 3-4.`)), fixed([{ ...PRIOR, doi: null, score: 0.9 }]), {}, "title in references"],
    [parseText(MS()), fixed([{ ...PRIOR, score: 0.54 }]), {}, "below threshold"],
    [parseText(MS()), fixed([{ ...PRIOR, score: 0.9, real: false }]), {}, "not a real comparison"],
    [parseText(MS()), fixed([{ ...PRIOR }]), {}, "no score"],
  ]) {
    const ct = await contributionTest(doc, { overlap: ov, ...opts });
    assert.ok(ct.findings.length && ct.findings.every(f => f.severity === "note" && f.status === "needs_human"), "note when " + why);
  }
}
// nothing searched: EIC-01 note (low), EIC-02 major with low confidence
{
  const doc = parseText(MS());
  const ct = await contributionTest(doc, { overlap: async () => ({ searched: false, error: "no corpus" }) });
  assert.ok(ct.findings.every(f => f.severity === "note" && f.confidence === "low"));
  const nv = noveltyCheck(doc, ct.cache, {});
  assert.equal(nv[0].severity, "major"); assert.equal(nv[0].confidence, "low"); assert.match(nv[0].message, /no literature source/);
  // searched, nothing close: EIC-02 note
  const ct2 = await contributionTest(doc, { overlap: fixed([{ ...PRIOR, score: 0.2 }]) });
  assert.equal(noveltyCheck(doc, ct2.cache, {})[0].severity, "note");
  // default (no corpus folder in this process): not searched, no network
  const saved = process.env.QUARTILE_CORPUS; delete process.env.QUARTILE_CORPUS;
  const ct3 = await contributionTest(doc, {});
  assert.ok(ct3.findings.every(f => f.detail.searched === false && f.severity === "note"));
  if (saved !== undefined) process.env.QUARTILE_CORPUS = saved;
}

// live mode: the reported phrases are exactly those that core/net.js literatureOverlap sends to OpenAlex
{
  const claim = "We contribute by showing that franchisees with larger cash reserves open their fitness studios sooner after they sign the franchise agreement.";
  const urls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ results: [{ id: "W1", title: PRIOR.title, doi: "https://doi.org/" + PRIOR.doi, publication_year: 2021 }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const r = await openAlexOverlap()(claim);
    assert.equal(r.sent.length, 1);
    const sentPhrases = urls.map(u => decodeURIComponent(new URL(u).searchParams.get("filter")).replace(/^[a-z_.]+:"|"$/g, ""));
    assert.equal(urls.length, 2, "two OpenAlex queries for one phrase");
    assert.ok(urls.every(u => new URL(u).host === "api.openalex.org"));
    assert.ok(sentPhrases.every(p => p === r.sent[0].phrase), "reported phrase equals the phrase sent");
    assert.ok(r.results.length && r.results.every(x => x.real === false && x.score === null), "phrase matches cannot raise a blocker");
    // the tool reports what was sent
    urls.length = 0;
    const out = await tool.handler({ text: MS().replace("We contribute by showing that cash buffers shorten the delay between franchise signing and studio opening in service firms.", claim), live: true });
    assert.equal(out.label, LABEL);
    assert.ok(Array.isArray(out.sent_outside.sent) && out.sent_outside.sent.length >= 1);
    assert.ok(out.findings.every(f => f.severity !== "blocker"), "live phrase matches alone give no blocker");
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(plannedOpenAlexQueries("Too short to send (Smith, 2019) here and there."), []);
}

// tool, offline
{
  const out = await tool.handler({ text: MS() });
  assert.equal(out.kind, "contribution_test"); assert.equal(out.label, LABEL);
  assert.match(out.sent_outside, /^nothing/);
  assert.ok(out.claims.length >= 2 && out.novelty_claims.length === 1);
  assert.match(out.threshold_note, /calibrated/);
  await assert.rejects(() => tool.handler({}), /text or path/);
}

// EIC-03 scope fit: TF-IDF cosine, 5 most similar titles, Crossref sends only the ISSN
{
  const V = tfidf(["cash franchise studio", "cash franchise studio", "hospital nurses"]);
  assert.ok(Math.abs(cosine(V[0], V[1]) - 1) < 1e-9); assert.equal(cosine(V[0], V[2]), 0);
  const doc = parseText(MS());
  const titles = ["Franchise studio openings and cash", "Nurse staffing in hospitals", "Bank credit for franchised studios", "Monetary policy and inflation", "Delay in opening service outlets", "Soil quality in farms", "Studio growth in Europe"];
  const [f] = await scopeFit(doc, { aims: "The journal publishes research on small business finance, franchise systems and studio growth.", titles });
  assert.equal(f.rule, "EIC-03"); assert.equal(f.detail.most_similar.length, 5); assert.ok(f.detail.aims_similarity > 0);
  assert.ok(f.detail.most_similar.slice(0, 4).every(t => !/Soil|Nurse|Monetary/.test(t.title) && t.score > 0), "related titles rank first");
  assert.equal((await scopeFit(doc, {})).length, 0, "nothing asked, nothing reported");
  const [g] = await scopeFit(doc, { journal: "no such journal" }); assert.match(g.message, /not computed/);
  let seen = null;
  const r = await crossrefTitles("1234-5678", { fetchImpl: async (u) => { seen = new URL(u); return new Response(JSON.stringify({ message: { items: [{ title: ["A title"], DOI: "10.1/x" }] } }), { status: 200 }); } });
  assert.equal(seen.host, "api.crossref.org"); assert.ok(seen.pathname.includes("/journals/1234-5678/works"));
  assert.deepEqual([...seen.searchParams.keys()].sort(), ["filter", "rows", "select"]);
  assert.equal(r.titles[0].title, "A title"); assert.equal(r.sent.issn, "1234-5678");
  const [h] = await scopeFit(doc, { issn: "12345678", fetch_titles: true, aims: "franchising", crossrefTitles: async (issn) => ({ titles: titles.map(t => ({ title: t })), sent: { issn } }) });
  assert.equal(h.detail.sent.issn, "1234-5678");
}

// EIC-04 format limits
{
  const doc = parseText(MS());
  const m = formatMeasures(doc);
  assert.equal(m.keywords, 3); assert.ok(m.abstract_words > 10 && m.abstract_words < 40);
  const [na] = formatLimits(doc, { journal: "Revue de Philosophie Economique" });
  assert.match(na.message, /limits not available/i); assert.equal(na.severity, "note");
  const fs = formatLimits(doc, { limits: { max_words: 20, max_abstract_words: 10, min_keywords: 4, highlights_required: true, structured_abstract_required: true } });
  assert.deepEqual(fs.map(f => f.severity).sort(), ["major", "minor", "minor", "minor", "minor"]);
  assert.equal(formatLimits(doc, { limits: { max_words: 100000, max_abstract_words: 300, max_keywords: 6 } }).length, 0);
}

// role entry points
{
  const doc = parseText(MS());
  const all = await eic.run(doc, { overlap: fixed([{ ...PRIOR, score: 0.1 }]) });
  assert.ok(all.every(f => f.role === "eic" && f.rule && f.source_ref && f.confidence && "span" in f));
  const rv = await eic.review(doc, { overlap: fixed([]) });
  assert.equal(rv.label, LABEL);
  assert.ok(!rv.findings.some(f => f.rule === "EIC-06-AIM"), "aim sentence present");
}

// acceptance (synthetic): 10 claims with known closest prior work, in a temporary corpus, separate process
{
  const out = JSON.parse(execFileSync(process.execPath, [path.join(here, "phase3_corpus_acceptance.js")], { encoding: "utf8", env: { ...process.env } }).trim().split("\n").pop());
  assert.equal(out.n, 10);
  assert.ok(out.hits >= 8, `known prior paper in top 3 for ${out.hits} of 10 (need 8)`);
  console.log(`phase3: synthetic contribution-test acceptance ${out.hits}/10 in top 3`);
}
