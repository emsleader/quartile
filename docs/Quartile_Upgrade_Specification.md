<!-- Part B of Quartile_Developer_Package.md (Seyed Mehdi Alavi, 21 November 2026), saved verbatim as the contract for the upgrade beyond 0.16.x. Converted from the supplied HTML rendering; content unchanged. -->

# Part B — Technical specification

*From checking tool to full review committee. Save this part as `docs/Quartile_Upgrade_Specification.md`.*

## 1. Goal and design principles

**Goal.** Quartile should review a business, economics or finance manuscript the way a full editorial committee would. That means an editor-in-chief, a methods reviewer, a finance and statistics reviewer, a business-administration committee, a production editor and a research-integrity office. Every finding must be traceable, reproducible and hard to dispute.

"Tank-proof" means seven rules that every module must follow:

| \#  | Principle                       | What it means in code                                                                                                                                                                          |
|-----|---------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| P1  | **No unexplained flag**         | Every finding carries a rule ID, the exact text span, the source of the rule (book, guideline or journal policy, with page or section) and a fix suggestion.                                   |
| P2  | **False positives are bugs**    | A wrong flag damages trust more than a missed one. Each rule ships with positive and negative test sentences. Release is blocked if precision on the gold set falls below target (Section 12). |
| P3  | **Design-aware**                | Checks run only when they apply. Regression checks never run on a bounds, descriptive or qualitative paper (bug report items 8, 13).                                                           |
| P4  | **Negation- and heading-aware** | "is not a preregistration" never triggers the preregistration rule. A heading counts as evidence of a section (items 1–4, 6, 7).                                                               |
| P5  | **Severity is honest**          | Four levels: `blocker` (likely desk reject), `major`, `minor`, `note`. Confidence (`high` / `medium` / `low`) is reported separately from severity.                                            |
| P6  | **Simulation is labelled**      | Reviewer-role output is always labelled "simulated pre-submission review". It is never called a journal decision.                                                                              |
| P7  | **Private by default**          | Unpublished manuscripts are processed locally. No text leaves the machine unless the user calls a live lookup tool (references, journal data).                                                 |

## 2. Architecture

    quartile/
      core/
        text/            parse.js, sections.js, negation.js, sentences.js, design.js
        rules/           engine.js, schema.js, loader.js
        roles/           eic.js, methods.js, finance.js, business.js,
                         production.js, ethics.js, response.js
        stats/           grim.js, sprite.js, pcurve.js, recompute.js
        report/          committee.js, render.js
      rulebook/          *.yaml  (one file per source: books, guidelines, journals)
      tests/
        gold/            annotated manuscripts and expected findings
        rules/           one test file per rule (positive + negative sentences)
      tools/             MCP tool registrations (one file per tool)

**Data flow.** Manuscript (DOCX, PDF or plain text) → `parse` → document model (sections, sentences, tables, numbers, citations) → `design` classifier → rule engine runs the rules that apply to this design → each role module adds its own structured checks → `committee` aggregates → report (JSON + DOCX/HTML).

**Document model (shared by all modules):**

``` js
// core/text/parse.js — output shape
/**
 * @typedef {Object} Doc
 * @property {string} text                 full plain text
 * @property {Section[]} sections          detected sections, in order
 * @property {Sentence[]} sentences        with section id and char offsets
 * @property {Table[]} tables              cells as strings + parsed numbers
 * @property {NumberToken[]} numbers       every number with context window
 * @property {Citation[]} citations        in-text citations + reference list
 * @property {DesignProfile} design        filled by core/text/design.js
 */
```

## 3. Phase 0 — Foundation (do first, before any new role)

The bug report of 13 November 2026 lists 13 issues. Most of them share three root causes. Fixing the causes once fixes every current and future rule.

## 3.1 Section detection with heading variants (fixes items 3, 4, 6, 7)

``` js
// core/text/sections.js
const CANON = {
  introduction: [/^(\d+[\.\)]?\s*)?introduction$/i],
  literature:   [/^(\d+[\.\)]?\s*)?(literature review|related (work|literature)|background|theoretical (background|framework)|theory( and (hypotheses|propositions))?|conceptual framework)$/i],
  methods:      [/^(\d+[\.\)]?\s*)?((data|research)( and| &)? (methods?|methodology|design)|methods?|methodology|empirical (strategy|approach)|identification( strategy)?|research design|sample and data)$/i],
  results:      [/^(\d+[\.\)]?\s*)?(results|findings|empirical results|analysis)$/i],
  discussion:   [/^(\d+[\.\)]?\s*)?(discussion|general discussion)$/i],
  implications: [/^(\d+[\.\)]?\s*)?((managerial|practical|policy) implications|implications( for .+)?)$/i],
  limitations:  [/^(\d+[\.\)]?\s*)?(limitations( and future research)?|study limitations)$/i],
  conclusion:   [/^(\d+[\.\)]?\s*)?(conclusions?|concluding remarks)$/i],
  disclosure:   [/^(declaration of (competing )?interests?|conflicts? of interest|competing interests|related parties|disclosure( statement)?)$/i],
  ethics:       [/^(ethics( statement| approval)?|ethical (approval|considerations))$/i],
  data_avail:   [/^(data (availability|access)( statement)?|code and data)$/i],
};

/** A heading is a short line (≤ 12 words), no final period, its own paragraph. */
export function isHeadingLine(line) {
  const t = line.trim();
  if (!t || t.length > 120) return false;
  if (/[.;:]$/.test(t)) return false;
  return t.split(/\s+/).length <= 12;
}

export function detectSections(paragraphs) {
  const out = [];
  paragraphs.forEach((p, i) => {
    if (!isHeadingLine(p.text)) return;
    const t = p.text.trim();
    for (const [key, pats] of Object.entries(CANON)) {
      if (pats.some(rx => rx.test(t))) { out.push({ key, heading: t, start: i }); break; }
    }
  });
  // section ends where the next detected section starts
  return out.map((s, k) => ({ ...s, end: k + 1 < out.length ? out[k + 1].start : paragraphs.length }));
}

export const hasSection = (sections, key) => sections.some(s => s.key === key);
```

**Rule:** any check of the form "X section missing" must call `hasSection` first and only then fall back to keyword search in the body.

## 3.2 Negation scope (fixes items 1, 2)

``` js
// core/text/negation.js
const NEGATORS = /\b(not|never|no|neither|nor|without|rather than|instead of|cannot|can't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|is not|are not|was not|were not|do not|does not|did not|no longer|far from)\b/i;
const CLAUSE_BREAK = /[,;:]|\b(but|however|although|whereas|while)\b/i;

/**
 * True if the match at [start, end) in `sentence` is inside a negation scope:
 * a negator occurs before it in the same clause, within `window` tokens.
 */
export function isNegated(sentence, start, window = 8) {
  const before = sentence.slice(0, start);
  const clauses = before.split(CLAUSE_BREAK);
  const clause = clauses[clauses.length - 1] || '';
  const tokens = clause.trim().split(/\s+/).slice(-window).join(' ');
  return NEGATORS.test(tokens);
}
```

Every text rule declares `negatable: true | false` in the rulebook (Section 4). The engine drops a hit when `negatable` is true and `isNegated` returns true.

## 3.3 Design classifier (fixes items 8, 9, 13)

``` js
// core/text/design.js
const SIGNALS = {
  regression:  /\b(regress(ion|ed)|OLS|logit|probit|fixed effects?|panel (data )?model|coefficient|instrumental variable|2SLS|difference-in-differences|IV estimat)/i,
  bounds:      /\b(partial identification|bounds? (analysis|on)|identified set|Manski|breakdown frontier|EGBA)\b/i,
  sem:         /\b(structural equation|SEM|PLS-SEM|confirmatory factor|CFA|AVE|HTMT)\b/i,
  experiment:  /\b(randomi[sz]ed|treatment group|control group|conjoint|vignette|between-subjects)\b/i,
  slr:         /\b(systematic (literature )?review|PRISMA|scoping review|evidence (and gap )?map|meta-analysis)\b/i,
  qualitative: /\b(semi-structured interviews?|thematic analysis|grounded theory|case stud(y|ies)|coding scheme)\b/i,
  survey:      /\b(questionnaire|survey (data|instrument)|respondents?|Likert)\b/i,
  conceptual:  /\b(propositions?|conceptual (paper|model|framework))\b/i,
  simulation:  /\b(simulation|Monte Carlo|calibrat(ed|ion))\b/i,
};

export function classifyDesign(doc, declared = null) {
  if (declared) return { primary: declared, declared: true, signals: {} };
  const methodsText = doc.sectionText('methods') || doc.text;
  const signals = {};
  for (const [k, rx] of Object.entries(SIGNALS)) {
    signals[k] = (methodsText.match(new RegExp(rx, 'gi')) || []).length;
  }
  const ranked = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  return { primary: ranked[0][1] > 0 ? ranked[0][0] : 'unknown', declared: false, signals };
}
```

The user can always declare the design (`design: "bounds"`), and a declared design overrides detection. Each rule lists the designs it applies to.

## 3.4 Remaining Phase 0 fixes

| Item  | Fix                                                                                                                                     |
|-------|-----------------------------------------------------------------------------------------------------------------------------------------|
| 5     | `evidence_ledger`: allow an empty grade or "—" when status is `NOT IDENTIFIED`.                                                         |
| 9     | `number_registry`: report "untraced, output not supplied" separately; no penalty for numbers in tables whose output file was not given. |
| 10    | CHANGELOG lists every tool added in each version (CI check: each file in `tools/` must appear in CHANGELOG).                            |
| 11–12 | EGBA figures: recycle line types and shades for any number of cells; warn if more than 8 cells.                                         |
| 13    | APA sentence for an "assumption-sensitive" cell adds "(sign not identified at any rung)".                                               |

**Acceptance for Phase 0:** all 13 items have a regression test; the WB-EMS manuscript gives zero false positives on items 1–9.

## 4. Rule engine and rulebook

All text rules live in YAML, not in code. This lets new rules be added from books and guidelines without touching the engine, and every flag carries its source.

## 4.1 Rule schema

``` yaml
## rulebook/belcher_2019.yaml  (example entry; wording is ours, not the book's)
source:
  id: BELCHER2019
  citation: "Belcher, W. L. (2019). Writing Your Journal Article in Twelve Weeks (2nd ed.). University of Chicago Press."
  licence_note: "Rules paraphrased; no text reproduced."
rules:
  - id: BEL-ARG-01
    title: "Main argument stated early"
    role: eic                       # eic | methods | finance | business | production | ethics
    severity: major
    designs: [all]
    check: structural               # structural | pattern | count | manual
    where: introduction
    test: "first_n_paragraphs_contain_claim(3)"
    source_ref: "Ch. 4"
    message: "The paper's main argument is not stated in the first three paragraphs of the introduction."
    fix: "State the argument in one sentence by the end of paragraph 2 or 3."
    tests:
      positive: ["tests/rules/BEL-ARG-01/pos_1.txt"]
      negative: ["tests/rules/BEL-ARG-01/neg_1.txt"]
```

``` yaml
## pattern rule example
  - id: MTH-CAUSAL-01
    title: "Causal verb with non-causal design"
    role: methods
    severity: major
    designs: [regression, survey, bounds, qualitative]   # not: experiment
    check: pattern
    pattern: '\b(causes?|caused|drives?|leads? to|results? in|the effect of)\b'
    negatable: true
    unless_nearby: '\b(instrument|exogenous|natural experiment|randomi[sz]ed|regression discontinuity|difference-in-differences)\b'
    where: [abstract, results, discussion, conclusion]
    source_ref: "STROBE item 20; Booth et al. 2016 ch. 8"
    message: "Causal wording ('{match}') for a design that does not identify causal effects."
    fix: "Use 'is associated with' or state the identification assumption."
```

## 4.2 Engine

``` js
// core/rules/engine.js
import { isNegated } from '../text/negation.js';
import * as structural from './structural.js';

export function runRules(doc, rules, opts = {}) {
  const design = doc.design.primary;
  const findings = [];
  for (const r of rules) {
    if (!(r.designs.includes('all') || r.designs.includes(design))) continue;
    if (opts.roles && !opts.roles.includes(r.role)) continue;

    if (r.check === 'pattern') {
      const rx = new RegExp(r.pattern, 'gi');
      const near = r.unless_nearby ? new RegExp(r.unless_nearby, 'i') : null;
      for (const s of doc.sentencesIn(r.where)) {
        for (const m of s.text.matchAll(rx)) {
          if (r.negatable && isNegated(s.text, m.index)) continue;
          if (near && near.test(doc.window(s.id, 2))) continue;
          findings.push(makeFinding(r, s, m[0]));
        }
      }
    } else if (r.check === 'structural') {
      const res = structural.evaluate(r.test, doc, r.where);
      if (!res.ok) findings.push(makeFinding(r, res.anchor, null, res.detail));
    } else if (r.check === 'manual') {
      findings.push({ ...base(r), severity: 'note', status: 'needs_human',
                      message: `Check by hand: ${r.title}` });
    }
  }
  return dedupe(findings);
}

function base(r) {
  return { rule: r.id, role: r.role, title: r.title, severity: r.severity,
           source: r.source_id, source_ref: r.source_ref, fix: r.fix };
}
function makeFinding(r, sentence, match, detail) {
  return { ...base(r), confidence: r.check === 'pattern' ? 'medium' : 'high',
           message: r.message.replace('{match}', match ?? ''),
           span: sentence ? { section: sentence.section, start: sentence.start, end: sentence.end,
                              text: sentence.text } : null, detail };
}
function dedupe(fs) {
  const seen = new Set();
  return fs.filter(f => { const k = `${f.rule}|${f.span?.start}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
```

## 4.3 Loader validation

`core/rules/loader.js` validates every YAML file against `schema.js` (JSON Schema, using `ajv`). CI fails if:

- a rule has no `source_ref`;
- a rule has no positive and no negative test; or
- two rules share an ID.

## 5. Role 1 — Editor-in-chief (`core/roles/eic.js`)

Purpose: decide whether the paper would survive the desk. Output is a simulated desk assessment with reasons.

| ID     | Check                                       | How                                                                                                                                                                                                                                                                                                                                                                            |
|--------|---------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| EIC-01 | **Contribution test**                       | Extract the contribution sentences (intro patterns: "we contribute", "this paper is the first", "unlike prior work"). Retrieve the 10 closest papers (existing `literature_overlap` and `corpus_search`). For each contribution claim, report the closest prior paper and the overlap score. Flag `blocker` if a claim has overlap ≥ threshold with a paper that is not cited. |
| EIC-02 | **"First" and "novel" claims**              | Any "first/novel/no study has" claim must be checked against EIC-01 results; unverified → `major`.                                                                                                                                                                                                                                                                             |
| EIC-03 | **Scope fit**                               | Compare the abstract with the target journal's aims and scope text (stored in the journal bank) and with the journal's last 2 years of titles (Crossref API by ISSN). Report a similarity score and the 5 most similar published papers.                                                                                                                                       |
| EIC-04 | **Format limits**                           | Word count, abstract length, keywords, highlights and structured abstract against the journal bank entry.                                                                                                                                                                                                                                                                      |
| EIC-05 | **Title test**                              | Title states the finding or the question; ≤ 20 words; no unexplained abbreviation.                                                                                                                                                                                                                                                                                             |
| EIC-06 | **Problem → gap → aim in the introduction** | Structural: the introduction has (a) a problem with a number or citation, (b) a gap naming specific studies, and (c) one explicit aim sentence.                                                                                                                                                                                                                                |

``` js
// core/roles/eic.js — contribution extraction
const CONTRIB = /\b(we contribute|our contribution|this (paper|study|article) (is the first|contributes|extends|adds)|unlike (prior|previous|existing) (work|studies|research)|to our knowledge|no (prior )?stud(y|ies) ha(s|ve))\b/i;

export function contributionClaims(doc) {
  return doc.sentencesIn(['abstract', 'introduction', 'conclusion'])
            .filter(s => CONTRIB.test(s.text));
}

export async function contributionTest(doc, { overlap, citedDois, threshold = 0.55 }) {
  const out = [];
  for (const claim of contributionClaims(doc)) {
    const near = await overlap(claim.text, { k: 10 });      // existing literature_overlap
    const top = near[0];
    const uncited = top && !citedDois.has(top.doi);
    out.push({
      rule: 'EIC-01', role: 'eic', claim: claim.text, closest: near.slice(0, 3),
      severity: top && top.score >= threshold && uncited ? 'blocker' : 'note',
      message: uncited && top.score >= threshold
        ? `A close prior study is not cited: ${top.title} (${top.year}).`
        : 'Closest prior work listed for the author to confirm the difference.',
    });
  }
  return out;
}
```

## 6. Role 2 — Methods reviewer (`core/roles/methods.js`)

| ID     | Check                                                                                                                                                  | Applies to              |
|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------|
| MTH-01 | **Claim–design match** (rule MTH-CAUSAL-01 above, plus "predicts", "proves", "confirms")                                                               | all non-experimental    |
| MTH-02 | **Reporting checklist** — loads the right checklist for the design and marks each item found / not found / needs human                                 | all                     |
| MTH-03 | **Sample flow** — every exclusion step has a number, and the numbers add up                                                                            | survey, slr, regression |
| MTH-04 | **Measurement defined before use** — each variable in the results appears in the methods                                                               | all quantitative        |
| MTH-05 | **Pre-specification honesty** — "preregistered" only with a registry link; plan written after data must not be called preregistration (negation-aware) | all                     |
| MTH-06 | **Limitations are specific** — at least one limitation names the data, sample or design, not only "future research"                                    | all                     |

**Checklists to encode as YAML** (paraphrased item text, with official item numbers):

| Checklist                                                                                        | Design                             | Source                                                   |
|--------------------------------------------------------------------------------------------------|------------------------------------|----------------------------------------------------------|
| PRISMA 2020 (27 items)                                                                           | slr                                | Page et al. 2021, BMJ                                    |
| STROBE (22 items)                                                                                | regression, survey (observational) | von Elm et al. 2007                                      |
| CHERRIES (web surveys)                                                                           | survey                             | Eysenbach 2004, JMIR                                     |
| AAPOR transparency items                                                                         | survey                             | AAPOR Transparency Initiative                            |
| Conjoint reporting (attributes, levels, design, randomisation, attention checks, AMCE estimator) | experiment                         | Hainmueller, Hopkins & Yamamoto 2014; Bansak et al. 2021 |
| COREQ (32 items)                                                                                 | qualitative                        | Tong et al. 2007                                         |
| JARS-Quant / JARS-Qual                                                                           | all                                | APA 2018                                                 |

``` js
// core/roles/methods.js — sample-flow arithmetic
// Finds patterns like "Of 8,159 records, 412 were duplicates, leaving 7,747"
const FLOW = /(\d[\d,]*)\s+(records|firms|respondents|observations|responses)[^.]{0,80}?(\d[\d,]*)\s+(were|was)\s+(excluded|removed|duplicates?|dropped)[^.]{0,60}?(leaving|resulting in|giving)\s+(\d[\d,]*)/gi;
const n = s => Number(s.replace(/,/g, ''));

export function sampleFlow(doc) {
  const out = [];
  for (const s of doc.sentences) {
    for (const m of s.text.matchAll(FLOW)) {
      const [start, removed, left] = [n(m[1]), n(m[3]), n(m[7])];
      if (start - removed !== left) out.push({
        rule: 'MTH-03', role: 'methods', severity: 'major', confidence: 'high',
        message: `Sample flow does not add up: ${start} − ${removed} = ${start - removed}, text says ${left}.`,
        span: s });
    }
  }
  return out;
}
```

## 7. Role 3 — Finance and statistics reviewer (`core/roles/finance.js`, `core/stats/`)

## 7.1 Checks

| ID     | Check                                                                                                                                                    | Applies to             |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------|
| FIN-01 | **Endogeneity addressed** — omitted variables, reverse causality, selection; at least one strategy or an explicit statement that no causal claim is made | regression only        |
| FIN-02 | **Standard errors** — clustering level stated and justified; robust errors                                                                               | regression only        |
| FIN-03 | **Economic significance** — each key coefficient is interpreted in units (e.g. "a one-SD increase … raises … by x%"), not only by p-value                | regression             |
| FIN-04 | **Survivorship and look-ahead bias** — sample of surviving firms only; variables measured after the outcome                                              | panel, regression      |
| FIN-05 | **Outliers** — winsorising or trimming level stated                                                                                                      | regression, survey     |
| FIN-06 | **Multiple testing** — more than 10 hypothesis tests without correction or a pre-specified primary outcome → note                                        | all quantitative       |
| FIN-07 | **Robustness section present** — alternative measures, subsamples, estimators                                                                            | regression             |
| FIN-08 | **Survey weights** — WBES / ES data used without sampling weights → major                                                                                | survey (WBES detected) |
| STA-01 | **GRIM test** — reported means possible for n and scale                                                                                                  | all with means         |
| STA-02 | **p-value recomputation** — t, F, χ² with df → p (extends `check_statistics`)                                                                            | all                    |
| STA-03 | **p-value clustering** — share of p in \[0.04, 0.05\] vs \[0.03, 0.04\]                                                                                  | all with ≥ 15 p-values |
| STA-04 | **Percentages add to 100** (± rounding) in each table column                                                                                             | all                    |
| STA-05 | **n consistency** — the same sample size everywhere it is reported                                                                                       | all                    |

## 7.2 GRIM test (Brown & Heathers, 2017)

``` js
// core/stats/grim.js
/**
 * GRIM: is a mean reported to `dp` decimals possible with n respondents
 * answering `items` integer-valued items? Returns { possible, nearest }.
 * Valid for integer responses only (Likert, counts). Not for continuous data.
 */
export function grim(mean, n, { dp = 2, items = 1 } = {}) {
  const denom = n * items;
  const target = Number(mean);
  const half = 0.5 * Math.pow(10, -dp);
  // candidate integer sums whose mean rounds to the reported value
  const lo = Math.ceil((target - half) * denom - 1e-9);
  const hi = Math.floor((target + half) * denom + 1e-9);
  for (let sum = lo; sum <= hi; sum++) {
    const m = sum / denom;
    if (round(m, dp) === round(target, dp)) return { possible: true, nearest: m };
  }
  return { possible: false, nearest: Math.round(target * denom) / denom };
}
const round = (x, dp) => Math.round(x * Math.pow(10, dp) + Number.EPSILON) / Math.pow(10, dp);

// GRIM only has power when n * items < 10^dp; report "not testable" otherwise.
export const grimTestable = (n, dp = 2, items = 1) => n * items < Math.pow(10, dp);
```

**Tests:** `grim(3.48, 25)` → possible (87/25 = 3.48); `grim(3.47, 25)` → not possible; `grim(5.19, 28)` → not possible (145/28 = 5.18, 146/28 = 5.21).

## 7.3 p-value clustering (STA-03)

``` js
// core/stats/pcurve.js — simple caliper test, reported as a note only
export function caliper(pvalues) {
  const a = pvalues.filter(p => p > 0.040 && p <= 0.050).length;
  const b = pvalues.filter(p => p > 0.030 && p <= 0.040).length;
  if (a + b < 10) return { testable: false };
  // exact one-sided binomial test of a vs b under p = 0.5
  const N = a + b; let tail = 0;
  for (let k = a; k <= N; k++) tail += binom(N, k) * Math.pow(0.5, N);
  return { testable: true, justBelow: a, below: b, pOneSided: tail,
           severity: tail < 0.05 ? 'note' : null };
}
function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
```

STA-03 is always a `note`, never a blocker: clustering is a signal to check, not proof of anything.

**Validation of all statistics code:** each function in `core/stats/` is checked against R on a test set (R's `pbinom`, `pt`, `pf`, `pchisq`; GRIM against the published examples in Brown & Heathers 2017). The R script and its output are stored in `tests/validation/` with the R and package versions.

## 8. Role 4 — Business-administration committee (`core/roles/business.js`)

| ID     | Check                                                                                                                                                                                                                                                                                                                                        | Applies to                     |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------|
| BUS-01 | **Named theory** — at least one theory or mechanism is named and cited (dictionary of ≥ 150 theory names: agency theory, pecking order, trade-off theory, resource-based view, transaction cost economics, real options, institutional theory, signalling, stakeholder theory, dynamic capabilities, economies of scope, opportunity cost …) | all except slr                 |
| BUS-02 | **Theory → hypothesis chain** — each hypothesis or proposition (H1, P1 …) has a preceding paragraph that cites a theory or prior finding                                                                                                                                                                                                     | regression, survey, conceptual |
| BUS-03 | **Hypotheses tested** — each declared H appears in the results with a verdict (supported, not supported, mixed)                                                                                                                                                                                                                              | regression, survey, experiment |
| BUS-04 | **Construct validity** — for multi-item scales: reliability (α or ω), AVE ≥ 0.5, HTMT \< 0.85 or 0.90, common-method-variance test                                                                                                                                                                                                           | sem, survey with scales        |
| BUS-05 | **Managerial implications** — a section or paragraph exists (heading-aware) and contains at least one concrete action ("owners should", "lenders could")                                                                                                                                                                                     | all empirical                  |
| BUS-06 | **Boundary conditions** — the paper states where the findings do not apply (sector, country, firm size)                                                                                                                                                                                                                                      | all                            |
| BUS-07 | **Unit of analysis is consistent** — firm vs owner vs establishment are not mixed                                                                                                                                                                                                                                                            | all quantitative               |

``` js
// core/roles/business.js — hypothesis chain
const HYP = /\b(H|P)(\d+[a-z]?)\s*[:.)]/g;

export function hypothesisChain(doc, theoryDict) {
  const out = [];
  const paras = doc.paragraphs;
  paras.forEach((p, i) => {
    for (const m of p.text.matchAll(HYP)) {
      const prev = paras.slice(Math.max(0, i - 2), i + 1).map(x => x.text).join(' ');
      const hasTheory = theoryDict.some(t => prev.toLowerCase().includes(t));
      const hasCite = /\([A-Z][^()]*\d{4}[a-z]?\)/.test(prev);
      if (!hasTheory && !hasCite) out.push({
        rule: 'BUS-02', role: 'business', severity: 'major', confidence: 'medium',
        message: `${m[1]}${m[2]} is not preceded by a theory or a cited finding.`, span: p });
    }
  });
  return out;
}
```

## 9. Role 5 — Production editor (`core/roles/production.js`)

| ID     | Check                                                                                                                                                        |
|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| PRD-01 | **Number consistency** — every key number (n, effect sizes, percentages) is the same in abstract, results, tables and conclusion (extends `number_registry`) |
| PRD-02 | **Tables and figures** — each is cited in the text, numbered in order, and has a title and notes (source, n, period)                                         |
| PRD-03 | **Abbreviations** — defined at first use, and in the abstract separately                                                                                     |
| PRD-04 | **Reference integrity** — every in-text citation is in the list and vice versa; DOIs resolve; retractions flagged (existing `verify_references_live`)        |
| PRD-05 | **Citation policy** — share of Q1/Q2 journal references, and conference or working papers flagged (user policy setting)                                      |
| PRD-06 | **Terminology** — one term per concept; flags synonym drift (e.g. "fixed-asset purchase" vs "equipment investment" in the same paper)                        |
| PRD-07 | **Reference recency and self-citation** — share of references from the last 5 years; self-citation share                                                     |

``` js
// core/roles/production.js — terminology drift
export function terminologyDrift(doc, groups) {
  // groups: [["fixed-asset purchase","equipment investment","capital purchase"], ...]
  const out = [];
  for (const g of groups) {
    const used = g.map(term => ({ term, n: (doc.text.match(new RegExp(`\\b${term}\\b`, 'gi')) || []).length }))
                  .filter(x => x.n > 0);
    if (used.length > 1) out.push({
      rule: 'PRD-06', role: 'production', severity: 'minor', confidence: 'high',
      message: `Several terms for one concept: ${used.map(u => `${u.term} (${u.n})`).join(', ')}.`,
      fix: `Choose one term and use it everywhere.` });
  }
  return out;
}
```

The term groups come from a user glossary file (`glossary.yaml`) per paper, so the author decides which terms are synonyms.

## 10. Role 6 — Ethics and data office (`core/roles/ethics.js`)

| ID     | Check                                                                                                                        | Applies to                                           |
|--------|------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| ETH-01 | Ethics approval: body and reference number present                                                                           | human participants (survey, experiment, qualitative) |
| ETH-02 | Informed consent described                                                                                                   | human participants                                   |
| ETH-03 | Data protection: GDPR legal basis, pseudonymisation, storage period                                                          | EU participants                                      |
| ETH-04 | Conflict of interest: heading-aware; **dual-role flag** if the author's affiliations include a company in the studied sector | all                                                  |
| ETH-05 | Data and code availability statement                                                                                         | all empirical                                        |
| ETH-06 | Funding statement                                                                                                            | all                                                  |
| ETH-07 | Small-cell disclosure: tables with cells of n \< 5 firms → warning                                                           | survey with firm-level tables                        |

ETH-04 takes the author profile from a local `author.yaml` (affiliations, sectors), so a paper on EMS studios by an author with EMS business interests is always asked for a clear disclosure.

## 11. Role 7 — Response-to-reviewers manager (`core/roles/response.js`)

Input: reviewer letter (text) + old and new manuscript. Output: a response table.

``` js
// core/roles/response.js
// 1. split reviewer letter into numbered comments
export function splitComments(letter) {
  return letter.split(/\n(?=\s*(?:Reviewer\s*\d+[,:]?\s*)?(?:Comment\s*)?\(?\d+[\.\)]\s)/i)
               .map((t, i) => ({ id: `C${i + 1}`, text: t.trim() }))
               .filter(c => c.text.length > 20);
}
// 2. for each comment, find changed paragraphs in the new version that share key terms
// 3. output rows: comment | response draft (author writes) | change made | location (section, page) | status
```

| Column   | Content                                          |
|----------|--------------------------------------------------|
| Comment  | verbatim reviewer text                           |
| Change   | old paragraph → new paragraph (diff)             |
| Location | section and paragraph number in the new version  |
| Status   | addressed / partly / declined with reason / open |

Release check: no comment may remain "open" before the response letter is exported.

## 12. Role 8 — Writing-craft rulebook from books

**Licence rule.** Quartile is MIT-licensed and public. Book text is copyrighted. Therefore:

1.  No book text, and no long quotation, enters the repository.
2.  Each rule is written in our own words, with the book and the chapter or page as `source_ref`.
3.  Books are bought or borrowed from the university library. Rule extraction is done by a person reading the book.

**Priority sources:**

| Code          | Source                                                                             | Access  | Rules to extract (target)                           |
|---------------|------------------------------------------------------------------------------------|---------|-----------------------------------------------------|
| BELCHER2019   | Belcher, *Writing Your Journal Article in Twelve Weeks*, 2nd ed., U. Chicago Press | library | 30 (argument, structure, submission)                |
| HUFF1999      | Huff, *Writing for Scholarly Publication*, Sage                                    | library | 25 (conversation with literature, management field) |
| THOMSON2013   | Thomson & Kamler, *Writing for Peer Reviewed Journals*, Routledge                  | library | 25 (contribution, reviewer response)                |
| BOOTH2016     | Booth, Colomb, Williams et al., *The Craft of Research*, 4th ed., U. Chicago Press | library | 30 (question, claim, evidence, warrant)             |
| MCCLOSKEY2019 | McCloskey, *Economical Writing*, 3rd ed., U. Chicago Press                         | library | 20 (economics prose)                                |
| COCHRANE      | Cochrane, "Writing Tips for PhD Students" (free essay)                             | free    | 20 (finance papers)                                 |
| WILLIAMS      | Williams & Bizup, *Style: Lessons in Clarity and Grace*                            | library | 20 (sentence clarity)                               |
| Q1CORPUS      | Our measured corpus of 15 Q1 SME-finance papers (existing style skill)             | own     | sentence length, moves, voice                       |

Each rule is classified as `structural` (automatic), `pattern` (automatic, medium confidence) or `manual` (listed for the author to confirm). About half of writing advice cannot be checked automatically. These rules appear as a short human checklist, never as automatic flags.

## 13. Final committee report (`core/report/committee.js`)

``` js
// core/report/committee.js
const ROLES = ['eic', 'methods', 'finance', 'business', 'production', 'ethics'];
const W = { blocker: 25, major: 8, minor: 2, note: 0 };

export function committeeReport(findings, design) {
  const byRole = Object.fromEntries(ROLES.map(r => [r, findings.filter(f => f.role === r)]));
  const light = fs => fs.some(f => f.severity === 'blocker') ? 'red'
                    : fs.filter(f => f.severity === 'major').length >= 3 ? 'red'
                    : fs.some(f => f.severity === 'major') ? 'amber' : 'green';
  const roles = ROLES.map(r => ({
    role: r, light: light(byRole[r]),
    blockers: byRole[r].filter(f => f.severity === 'blocker').length,
    majors: byRole[r].filter(f => f.severity === 'major').length,
    top3: byRole[r].filter(f => f.severity !== 'note').slice(0, 3),
  }));
  const penalty = findings.reduce((s, f) => s + (f.confidence === 'low' ? 0 : W[f.severity]), 0);
  return {
    label: 'Simulated pre-submission review — not a journal decision',
    design,
    readiness: Math.max(0, 100 - penalty),
    overall: roles.some(r => r.light === 'red') ? 'not ready' : roles.some(r => r.light === 'amber') ? 'revise first' : 'ready to submit',
    roles,
    needsHuman: findings.filter(f => f.status === 'needs_human'),
  };
}
```

**Report layout (one page, then details):**

1.  Header: title, design detected or declared, target journal, date, Quartile version.
2.  Overall: ready / revise first / not ready, and the readiness score.
3.  One row per role: light, blockers, majors, top 3 issues.
4.  Human checklist (manual rules).
5.  Details: every finding with rule ID, text span, source and fix.

The report uses black headings and a colour-blind-safe palette for the lights (green, amber, red each with an icon and a word, never colour alone).

## 14. Quality assurance — what makes it "tank-proof"

## 14.1 Gold-standard test set

- **Size:** 30 manuscripts to begin with. Use 10 of the author's own papers and drafts (local only, never in the public repo) and 20 open-access published papers (CC BY) from target journals.
- **Annotation:** for each, a human lists the true issues (rule ID + span). Two annotators for 10 of them; agreement reported (Cohen's κ).
- **Planted errors:** 50 synthetic errors inserted into clean papers (wrong sum in a sample flow, impossible GRIM mean, causal verb, missing ethics number, inconsistent n).

## 14.2 Release targets

| Metric                                            | Target                        |
|---------------------------------------------------|-------------------------------|
| Precision per role (share of flags that are true) | ≥ 0.85                        |
| Recall on planted errors                          | ≥ 0.90                        |
| Precision for `blocker` flags                     | ≥ 0.95                        |
| Statistics functions vs R                         | identical to 6 decimal places |
| False positives on the WB-EMS paper (bug report)  | 0                             |

## 14.3 Continuous integration

``` yaml
## .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:rules        # every rule: positive must flag, negative must not
      - run: npm run test:stats        # compare with stored R outputs
      - run: npm run test:gold         # precision/recall; fails below targets
      - run: npm run check:changelog   # every tool listed
```

``` js
// tests/rules/run.js — one generic test for every YAML rule
import { loadRules } from '../../core/rules/loader.js';
import { runRules } from '../../core/rules/engine.js';
import { parseText } from '../../core/text/parse.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';

for (const r of loadRules('rulebook')) {
  for (const f of r.tests.positive) {
    const doc = parseText(fs.readFileSync(f, 'utf8'), { design: r.designs[0] === 'all' ? null : r.designs[0] });
    assert.ok(runRules(doc, [r]).some(x => x.rule === r.id), `${r.id} should flag ${f}`);
  }
  for (const f of r.tests.negative) {
    const doc = parseText(fs.readFileSync(f, 'utf8'), { design: r.designs[0] === 'all' ? null : r.designs[0] });
    assert.ok(!runRules(doc, [r]).some(x => x.rule === r.id), `${r.id} must NOT flag ${f}`);
  }
}
```

## 14.4 Feedback loop

Every report has a "this flag is wrong" option, which saves the rule ID and span to `feedback.jsonl` locally. A rule with more than 3 confirmed false positives is automatically downgraded to `note` until it is fixed.

## 15. New MCP tools

| Tool                  | Input                                                                    | Output                                                   |
|-----------------------|--------------------------------------------------------------------------|----------------------------------------------------------|
| `committee_review`    | manuscript, target journal, declared design (optional), roles (optional) | committee report (Section 13)                            |
| `contribution_test`   | manuscript                                                               | contribution claims + closest prior work                 |
| `reporting_checklist` | manuscript, checklist name (auto by design)                              | item-by-item table                                       |
| `grim_check`          | table of means, n, decimals, items                                       | possible / not possible per mean                         |
| `hypothesis_map`      | manuscript                                                               | H/P list → theory → result verdict                       |
| `response_tracker`    | reviewer letter, old and new manuscript                                  | response table (DOCX)                                    |
| `rulebook_status`     | —                                                                        | rules per source, test coverage, precision from feedback |

``` js
// tools/committee_review.js — registration (adapt to the existing tool registry)
import { z } from 'zod';
import { parseFile } from '../core/text/parse.js';
import { classifyDesign } from '../core/text/design.js';
import { loadRules } from '../core/rules/loader.js';
import { runRules } from '../core/rules/engine.js';
import * as roles from '../core/roles/index.js';
import { committeeReport } from '../core/report/committee.js';

export const committeeReviewTool = {
  name: 'committee_review',
  description: 'Simulated pre-submission review by six roles (editor-in-chief, methods, finance and statistics, business, production, ethics). Not a journal decision.',
  inputSchema: z.object({
    path: z.string(),
    journal: z.string().optional(),
    design: z.enum(['regression','bounds','sem','experiment','slr','qualitative','survey','conceptual','simulation']).optional(),
    roles: z.array(z.string()).optional(),
  }),
  async handler({ path, journal, design, roles: only }) {
    const doc = await parseFile(path);
    doc.design = classifyDesign(doc, design ?? null);
    const findings = [
      ...runRules(doc, loadRules('rulebook'), { roles: only }),
      ...(await roles.runAll(doc, { journal, only })),
    ];
    return committeeReport(findings, doc.design);
  },
};
```

## 16. Delivery plan

| Phase | Content                                                                                         | Acceptance                                                     |
|-------|-------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| **0** | Foundation: sections, negation, design classifier, bug items 1–13, rule engine, YAML loader, CI | All 13 bugs have tests; WB-EMS paper gives 0 false positives   |
| **1** | Methods role: claim–design, PRISMA 2020, STROBE, CHERRIES, conjoint checklist, sample flow      | Precision ≥ 0.85 on gold set                                   |
| **2** | Finance and statistics role: FIN-01…08, GRIM, p recomputation, caliper, n consistency           | Stats identical to R; WBES weight check works                  |
| **3** | Editor-in-chief role: contribution test, scope fit, format limits                               | Tested on 10 papers with known closest prior work              |
| **4** | Business and production roles; glossary; hypothesis map                                         | Precision ≥ 0.85                                               |
| **5** | Ethics role; author profile; small-cell check                                                   | Dual-role flag works on author's own papers                    |
| **6** | Writing rulebook from priority books (paraphrased)                                              | ≥ 150 rules, each with source and tests                        |
| **7** | Committee report, response tracker, feedback loop                                               | One-page report rendered; no "open" comments allowed on export |

Each phase ends with a version number in the CHANGELOG (not in file names), a git tag, and a Zenodo release.

## 17. Limits to state honestly in the README

- Quartile checks consistency, reporting and wording. It cannot judge whether a theory is interesting or a contribution is important; it only shows the evidence for a human to judge.
- The contribution test depends on the literature it can search. A missing closest paper is possible.
- Simulated reviewer output is not a prediction of a journal decision.
- Commercial journal lists (ABS/AJG, Scopus, Web of Science) and similarity checkers (iThenticate/Turnitin) are not included because of licences. Quartile uses open data (Crossref, OpenAlex, DOAJ, SCImago public data within its terms) and the user's own licensed access.

## 18. Third-party open-source components

Licences were checked on 21 November 2026 (npm registry, CRAN, TEI wiki). Only MIT-compatible licences (MIT, BSD, Apache 2.0, ISC) may be bundled. Every bundled package is listed in `THIRD_PARTY_LICENSES.md` with its licence text.

| Component                                                   | Licence      | Use                                                                    | Phase |
|-------------------------------------------------------------|--------------|------------------------------------------------------------------------|-------|
| GROBID (separate service, Docker)                           | Apache 2.0   | PDF → TEI: header, sections, references                                | 0     |
| mammoth.js                                                  | BSD-2-Clause | DOCX → structured HTML with real headings                              | 0     |
| pdfjs-dist                                                  | Apache 2.0   | PDF text fallback when GROBID is not running                           | 0     |
| compromise / wink-nlp                                       | MIT          | sentence splitting, part-of-speech, negation support                   | 0     |
| ajv, js-yaml                                                | MIT          | rulebook loading and schema validation                                 | 0     |
| simple-statistics (ISC), @stdlib dists (Apache 2.0)         | —            | t, F, χ² distributions for p-value recomputation                       | 2     |
| citation-js                                                 | MIT          | parsing BibTeX, RIS, DOI references                                    | 4     |
| retext, retext-passive, retext-simplify, retext-readability | MIT          | style checks                                                           | 6     |
| write-good, proselint (JS port)                             | MIT          | wordiness and cliché checks                                            | 6     |
| jsdiff                                                      | BSD-3-Clause | old vs new manuscript diff for the response tracker                    | 7     |
| franc                                                       | MIT          | language detection                                                     | 0     |
| scrutiny (R, CRAN)                                          | MIT          | validation reference for GRIM / GRIMMER / DEBIT in `tests/validation/` | 2     |

**Ideas only, no code copied:** statcheck (GPL-3) and metacheck (AGPL-3). Their methods may be re-implemented from the published papers and documentation; their source code must not be copied or bundled.

## 20. Built-in reference library (Quartile Library)

**USER DECISION — 21 November 2026 — Seyed Mehdi Alavi:** Quartile builds its own reference library, owned by us, instead of connecting to Zotero.

### 20.1 Goals

1.  One local library holds every reference the user reads, cites or excludes, with its verification status.
2.  Every manuscript check uses the library: in-text citations are matched against it, and policy rules (Q1/Q2, preprints, retractions) are applied from it.
3.  No lock-in: full import and export in BibTeX, RIS and CSL-JSON at any time.
4.  Private: the library lives on the user's machine. Only DOIs, titles and ISSNs are sent to Crossref, OpenAlex or DOAJ for lookups.

### 20.2 Storage

- **SQLite** through `better-sqlite3` (MIT) in `~/.quartile/library/library.sqlite`. Use `sql.js` (MIT) as a fallback where native modules cannot be built.
- Attached PDFs are stored as files in `~/.quartile/library/files/<item-id>/`, never inside the database.
- A nightly or on-demand **CSL-JSON export** (`library.json`) for backup and version control.

``` sql
-- core/library/schema.sql
CREATE TABLE items (
  id            TEXT PRIMARY KEY,           -- ULID
  csl           TEXT NOT NULL,              -- full CSL-JSON record
  doi           TEXT UNIQUE,                -- lower-case, no prefix
  title_norm    TEXT NOT NULL,              -- lower-case, no punctuation, for duplicate search
  year          INTEGER,
  type          TEXT,                       -- article-journal, book, chapter, preprint, paper-conference, report ...
  issn          TEXT,
  venue         TEXT,
  quartile      TEXT,                       -- Q1..Q4 from the user's SCImago bank, with year
  quartile_year INTEGER,
  added_at      TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE verification (
  item_id    TEXT REFERENCES items(id),
  source     TEXT NOT NULL,                 -- scite | crossref | openalex | manual
  status     TEXT NOT NULL,                 -- verified | could_not_verify | retracted | corrected | expression_of_concern
  checked_at TEXT NOT NULL,
  note       TEXT
);
CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, parent_id TEXT);
CREATE TABLE item_collections (item_id TEXT, collection_id TEXT, PRIMARY KEY (item_id, collection_id));
CREATE TABLE tags (item_id TEXT, tag TEXT, PRIMARY KEY (item_id, tag));
CREATE TABLE notes (id TEXT PRIMARY KEY, item_id TEXT, body TEXT, created_at TEXT);
CREATE TABLE files (id TEXT PRIMARY KEY, item_id TEXT, path TEXT, sha256 TEXT, kind TEXT); -- vor | aam | preprint | supplement
CREATE TABLE screening (                    -- for systematic reviews
  item_id TEXT, review TEXT, stage TEXT,    -- title_abstract | full_text
  decision TEXT, reason TEXT, reviewer TEXT, decided_at TEXT,
  PRIMARY KEY (item_id, review, stage, reviewer)
);
CREATE VIRTUAL TABLE items_fts USING fts5(title, authors, abstract, venue, content='');
```

### 20.3 Functions

| ID     | Function                 | Detail                                                                                                                                                                                                                                                                    |
|--------|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| LIB-01 | **Add by DOI**           | Crossref (then OpenAlex) metadata → CSL-JSON; quartile from the user's SCImago bank by ISSN and year                                                                                                                                                                      |
| LIB-02 | **Import**               | BibTeX, RIS, CSL-JSON, and a Zotero export file (via its RIS or CSL-JSON export), using `@citation-js/plugin-bibtex`, `plugin-ris`, `plugin-doi` (MIT)                                                                                                                    |
| LIB-03 | **Duplicate detection**  | Same DOI → duplicate. Without a DOI: normalised title similarity ≥ 0.92 (fuse.js, Apache 2.0) **and** same year ± 1 **and** same first-author surname → suggested merge, never automatic                                                                                  |
| LIB-04 | **Collections and tags** | One collection per paper (e.g. "SLR2", "Paper 1"). System tags added automatically: `verified-YYYY-MM-DD`, `Q1`–`Q4`, `preprint`, `conference`, `retracted`, `own-work`, `close-idea`                                                                                     |
| LIB-05 | **Verification log**     | Each check (Scite, Crossref, manual) is a row in `verification`, so the history is kept. Retraction status from Crossref metadata (`update-to` / relation fields)                                                                                                         |
| LIB-06 | **Citation policy**      | Applies the user's rule: in non-SLR papers only Q1/Q2 journal articles; exceptions are tags `own-work` and `close-idea`; in SLRs Q1–Q4 journals plus books and chapters; conference and working papers excluded. Each violation is a finding with the rule ID `LIB-POL-*` |
| LIB-07 | **Manuscript matching**  | Every in-text citation ("Smith et al., 2021", "(Smith & Jones, 2020a)", numbered styles) is matched to a library item. Reports: cited but not in library; in the reference list but not cited; ambiguous (two items match); year or author mismatch                       |
| LIB-08 | **Bibliography output**  | APA 7 built in (Section 20.7); journal styles added one by one                                                                                                                                                                                                            |
| LIB-09 | **Export**               | BibTeX (with stable cite keys `AuthorYearWord`), RIS, CSL-JSON, and a pandoc-ready `.bib` for `[@key]` citations                                                                                                                                                          |
| LIB-10 | **Screening (SLR)**      | Title/abstract and full-text decisions per reviewer, primary exclusion reason, PRISMA counts generated from the table. **Agreement statistics are computed in R** from an exported table (owner's rule), not in JS                                                        |
| LIB-11 | **Search**               | Full-text search over title, authors, abstract and venue (SQLite FTS5)                                                                                                                                                                                                    |
| LIB-12 | **PDF attach**           | Attach a local PDF; store SHA-256; mark as version of record, accepted manuscript or preprint                                                                                                                                                                             |

### 20.4 New MCP tools

| Tool                                | Purpose                                                                                     |
|-------------------------------------|---------------------------------------------------------------------------------------------|
| `library_add`                       | add by DOI, BibTeX string or RIS string                                                     |
| `library_import` / `library_export` | file import and export (BibTeX, RIS, CSL-JSON)                                              |
| `library_search`                    | search and filter (collection, tag, quartile, year)                                         |
| `library_verify`                    | record a verification result for an item (from Scite, Crossref or manual)                   |
| `library_match_manuscript`          | match a manuscript's citations and reference list to the library; apply the citation policy |
| `library_bibliography`              | build the reference list for a collection or a manuscript in APA 7                          |
| `library_dedupe`                    | list suggested merges for the user to approve                                               |
| `library_screening`                 | record or export screening decisions for a review                                           |

All write tools ask for confirmation in the tool result before deleting or merging anything. Nothing is deleted without an explicit `confirm: true`.

### 20.5 Code — citation matching

``` js
// core/library/match.js
const AUTHOR_YEAR = /\(?([A-Z][A-Za-zÀ-ÿ'’\-]+)(?:\s+(?:et al\.|&|and)\s*([A-Z][A-Za-zÀ-ÿ'’\-]+)?)?,?\s+((?:19|20)\d{2})([a-z]?)\)?/g;

export function extractCitations(text) {
  const out = [];
  for (const m of text.matchAll(AUTHOR_YEAR)) {
    out.push({ first: m[1], second: m[2] || null, year: Number(m[3]), suffix: m[4] || '',
               etal: /et al\./.test(m[0]), at: m.index, raw: m[0] });
  }
  return out;
}

export function matchCitation(c, db) {
  const rows = db.prepare(
    `SELECT id, csl FROM items WHERE year BETWEEN ? AND ?`).all(c.year - 1, c.year + 1);
  const hits = rows.map(r => ({ id: r.id, csl: JSON.parse(r.csl) }))
    .filter(r => (r.csl.author?.[0]?.family || '').toLowerCase() === c.first.toLowerCase());
  const exact = hits.filter(h => issuedYear(h.csl) === c.year);
  if (exact.length === 1) return { status: 'matched', item: exact[0].id };
  if (exact.length > 1)  return { status: 'ambiguous', items: exact.map(h => h.id) };
  if (hits.length)       return { status: 'year_mismatch', items: hits.map(h => h.id) };
  return { status: 'not_in_library' };
}
const issuedYear = csl => csl.issued?.['date-parts']?.[0]?.[0];
```

### 20.6 Code — citation policy

``` js
// core/library/policy.js
export function citationPolicy(item, tags, paperType /* 'slr' | 'empirical' | 'conceptual' */) {
  const t = new Set(tags);
  if (t.has('own-work') || t.has('close-idea')) return null;          // owner's exceptions
  if (t.has('retracted')) return f('LIB-POL-01', 'blocker', 'Retracted paper cited.');
  const isJournal = item.type === 'article-journal';
  const isBook = item.type === 'book' || item.type === 'chapter';
  if (paperType === 'slr') {
    if (isJournal || isBook) return null;
    return f('LIB-POL-02', 'major', `SLR rule: ${item.type} is not a journal article, book or chapter.`);
  }
  if (!isJournal) return f('LIB-POL-03', 'major', `Only Q1/Q2 journal articles may be cited; this is a ${item.type}.`);
  if (!item.quartile) return f('LIB-POL-04', 'minor', 'Journal quartile unknown; check the SCImago bank.');
  if (!['Q1', 'Q2'].includes(item.quartile))
    return f('LIB-POL-05', 'major', `Journal is ${item.quartile} (${item.quartile_year}); policy allows Q1/Q2 only.`);
  return null;
}
const f = (rule, severity, message) => ({ rule, role: 'production', severity, confidence: 'high', message });
```

### 20.7 Bibliography formatting and the citeproc licence

**FACT (checked 21 November 2026):** `@citation-js/plugin-csl` is MIT, but it depends on `citeproc` (citeproc-js), which is licensed **CPAL-1.0 OR AGPL-1.0**. The CSL style files themselves are CC BY-SA 3.0.

**Rule for the developer:**

1.  **Default:** write our own APA 7 formatter (`core/library/apa7.js`) for the main types: journal article, book, chapter, report, preprint, conference paper, dataset, software. Test it against 50 hand-checked references.
2.  **Do not bundle `citeproc` or `@citation-js/plugin-csl`** until the owner decides. Using citeproc under CPAL-1.0 is possible but brings an attribution obligation; the owner decides this after a licence check.
3.  Journal-specific styles beyond APA are added later, either as our own formatters or through citeproc if the owner approves it.
4.  For long documents, `library_export` produces a `.bib` file so the user can format with pandoc's built-in citeproc, which runs as a separate program.

### 20.8 Migration from Zotero

`library_import` accepts a Zotero export (Zotero → File → Export Library → CSL JSON or RIS). Collections are kept when exported as Zotero RDF (`fast-xml-parser`, MIT). The user exports once; from then on Quartile Library is the main library.

## 21. Paper history and learning (Quartile Record)

**USER DECISION — 21 November 2026 — Seyed Mehdi Alavi:** every record that comes in for a paper is stored in Quartile, everything that happens to each paper is recorded, and Quartile learns from all of it.

### 21.1 Principles

1.  **Append-only.** Events are never edited or deleted. A mistake is fixed by a new `correction` event that points to the old one. This gives a complete, auditable history.
2.  **Everything attached.** Each event can carry files: manuscript versions, letters, reviews, proofs, emails saved as text or PDF. Files are stored with their SHA-256 so any version can be proved later.
3.  **Learning needs approval.** Quartile proposes rules from letters and outcomes; the owner approves, edits or rejects each one. No rule enters the rulebook without approval.
4.  **Local and private.** The record lives in the same local database as the Quartile Library (Section 20). Nothing is uploaded.
5.  **Linked.** Each paper links to its collection in the Library, its manuscript versions, its committee reports, and its response tables (Section 11).

### 21.2 Data model

``` sql
-- core/record/schema.sql
CREATE TABLE papers (
  id          TEXT PRIMARY KEY,            -- e.g. 'FER-HU-WBES'
  title       TEXT NOT NULL,
  short_name  TEXT,                        -- 'FER paper', 'SLR2', 'Paper 1'
  type        TEXT,                        -- empirical | slr | conceptual | conference
  design      TEXT,                        -- regression | bounds | survey | ...
  collection  TEXT,                        -- Library collection id
  status      TEXT,                        -- derived from the latest status event
  created_at  TEXT NOT NULL
);
CREATE TABLE events (
  id          TEXT PRIMARY KEY,            -- ULID (sortable by time)
  paper_id    TEXT NOT NULL REFERENCES papers(id),
  occurred_at TEXT NOT NULL,               -- when it happened (user-supplied)
  recorded_at TEXT NOT NULL,               -- when it was entered
  type        TEXT NOT NULL,               -- see 21.3
  journal     TEXT,                        -- ISSN or journal-bank id
  actor       TEXT,                        -- editor | reviewer-1 | co-author | supervisor | library | self
  summary     TEXT NOT NULL,               -- one line, in the owner's words
  body        TEXT,                        -- full text of letter or note
  corrects    TEXT REFERENCES events(id),  -- for correction events only
  data        TEXT                         -- JSON: decision, scores, deadlines, word counts ...
);
CREATE TABLE event_files (event_id TEXT, path TEXT, sha256 TEXT, kind TEXT, PRIMARY KEY (event_id, path));
CREATE TABLE requests (                    -- one row per request found in a letter
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id),
  paper_id    TEXT NOT NULL,
  journal     TEXT,
  actor       TEXT,
  number      TEXT,                        -- 'E1', 'R1.3' ...
  text        TEXT NOT NULL,               -- verbatim request
  category    TEXT,                        -- see 21.4
  status      TEXT DEFAULT 'open',         -- open | addressed | partly | declined
  response    TEXT,                        -- what was done
  location    TEXT                         -- section/paragraph in the revised version
);
CREATE TABLE lessons (                     -- proposed and approved learning
  id          TEXT PRIMARY KEY,
  from_request TEXT REFERENCES requests(id),
  scope       TEXT NOT NULL,               -- journal:<issn> | design:<design> | all
  rule_yaml   TEXT NOT NULL,               -- proposed rule in rulebook format (Section 4)
  status      TEXT DEFAULT 'proposed',     -- proposed | approved | rejected | retired
  decided_at  TEXT,
  note        TEXT
);
-- triggers block UPDATE and DELETE on events and event_files
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
```

### 21.3 Event types

| Group             | Types                                                                                                                                                                                                                 |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Writing           | `idea`, `outline`, `draft_version`, `co_author_comment`, `supervisor_comment`, `language_edit`, `quartile_check` (stores the committee report)                                                                        |
| Literature        | `search_run` (database, query, date, hits), `fulltext_request`, `fulltext_received`, `fulltext_not_retrieved`                                                                                                         |
| Data and analysis | `data_received`, `analysis_run` (script, R version, output hash), `validation_record`                                                                                                                                 |
| Ethics            | `ethics_submitted`, `ethics_approved` (reference number), `ethics_amendment`                                                                                                                                          |
| Journal           | `presubmission_enquiry`, `enquiry_reply`, `submitted`, `desk_decision`, `under_review`, `review_received`, `decision` (accept / minor / major / reject / transfer), `revision_submitted`, `proofs`, `published` (DOI) |
| Outreach          | `conference_presented`, `preprint_posted`, `shared`                                                                                                                                                                   |
| Owner decisions   | `user_decision` (the "USER DECISION — date — name" records)                                                                                                                                                           |
| Other             | `note`, `correction`                                                                                                                                                                                                  |

### 21.4 Request categories (for learning)

`contribution`, `literature_missing`, `cite_journal_papers`, `theory`, `method_design`, `identification`, `robustness`, `statistics`, `data_description`, `formal_model_equations`, `replication_package`, `policy_implications`, `managerial_implications`, `external_validity`, `limitations`, `structure`, `length`, `language`, `figures_tables`, `references_format`, `ethics_disclosure`, `other`.

Quartile proposes a category from keywords; the owner confirms it.

### 21.5 How Quartile learns

    letter (event: decision / review_received)
       └─► split into numbered requests      (core/record/split.js — reuse Section 11 splitter)
             └─► category proposed            (keyword model, owner confirms)
                   └─► lesson proposed        (rule YAML draft, scope = this journal)
                         └─► owner approves   (status = approved)
                               └─► rule active in committee_review
                                   for every paper sent to that journal
                                   (and for all papers if scope = all)

**Three kinds of learning:**

1.  **Journal lessons.** Approved requests from a journal become rules for that journal. Example: FER asks for a formal model with equations → rule `FER-EQ-01` checks future FER manuscripts for numbered equations.
2.  **Repeated lessons.** When the same category appears in letters from two or more journals, Quartile proposes widening the scope to `all` (owner approves).
3.  **Outcome statistics** (descriptive only, from the owner's own history): time from submission to first decision per journal; decisions by journal; most frequent request categories; requests still open. Shown as counts and dates, never as predictions.

``` js
// core/record/learn.js
const CATEGORY_HINTS = {
  formal_model_equations: /\b(equation|formal model|model specification|derive|notation)\b/i,
  literature_missing:     /\b(literature|recent (studies|work)|missing references?|engage with)\b/i,
  cite_journal_papers:    /\b(papers? (published )?in (this|our) journal|previous issues)\b/i,
  robustness:             /\b(robust(ness)?|sensitivity|alternative (specification|measure))\b/i,
  replication_package:    /\b(replicat|code and data|reproduc)\w*/i,
  policy_implications:    /\b(policy|policymakers?|regulator|central bank)\b/i,
  external_validity:      /\b(generali[sz]|external validity|other countries|beyond hungary)\b/i,
  contribution:           /\b(contribution|novelty|what is new|added value)\b/i,
  structure:              /\b(restructure|reorgani[sz]e|section order|shorten|length)\b/i,
};

export function proposeCategory(text) {
  const hits = Object.entries(CATEGORY_HINTS).filter(([, rx]) => rx.test(text)).map(([k]) => k);
  return hits.length ? hits : ['other'];
}

export function proposeLesson(request, journalIssn) {
  const cat = request.category;
  return {
    scope: `journal:${journalIssn}`,
    rule_yaml: [
      `- id: ${journalIssn}-${cat}-${request.number}`,
      `  title: "Earlier request from this journal: ${cat.replace(/_/g, ' ')}"`,
      `  role: eic`,
      `  severity: major`,
      `  designs: [all]`,
      `  check: manual`,
      `  source_ref: "Editor/reviewer letter, event ${request.event_id}"`,
      `  message: ${JSON.stringify('This journal previously asked: ' + request.text.slice(0, 240))}`,
      `  fix: "Confirm the manuscript already addresses this before submission."`,
    ].join('\n'),
    status: 'proposed',
  };
}
```

New lessons start as `check: manual` (a checklist item for the owner). A lesson becomes an automatic check only after a developer writes the structural or pattern test and its positive and negative examples (Section 4).

### 21.6 New MCP tools

| Tool              | Purpose                                                                                              |
|-------------------|------------------------------------------------------------------------------------------------------|
| `record_paper`    | create a paper record, link it to a Library collection                                               |
| `record_event`    | add an event with optional files (append-only)                                                       |
| `record_letter`   | add an editor or reviewer letter: stores the event, splits requests, proposes categories and lessons |
| `record_requests` | list and update the status of requests (open / addressed / partly / declined, with location)         |
| `record_lessons`  | list proposed lessons; approve, edit, reject or retire them                                          |
| `record_timeline` | full history of a paper in date order, exported as DOCX or Markdown                                  |
| `record_stats`    | descriptive statistics over the owner's own history (Section 21.5, point 3)                          |

### 21.7 Use in other modules

- `committee_review` loads approved lessons for the target journal and for `all`, and shows them as a separate "Lessons from earlier letters" block in the report.
- `response_tracker` (Section 11) reads requests from the record, so the response table is built from the stored letter.
- `submission_readiness` refuses to mark a revision ready while any request of that revision is still `open`.
- The history can be exported as a dated, plain timeline for the owner's PhD records; the export contains only the owner's events, decisions and documents.

### 21.8 First data

Enter the full history of the FER paper first (submission 6 November 2026, editor decision 18 November 2026, revision in progress), with the editor's letter as the first `record_letter` input. Its requests become the first lessons, to be approved by the owner.

## 22. Sources for the rules named in this specification

- Anaya, J. (2016). The GRIMMER test: A method for testing the validity of reported measures of variability. *PeerJ Preprints*, 4, e2400v1. <https://doi.org/10.7287/peerj.preprints.2400> *(preprint — software documentation only)*
- Appelbaum, M., Cooper, H., Kline, R. B., Mayo-Wilson, E., Nezu, A. M., & Rao, S. M. (2018). Journal article reporting standards for quantitative research in psychology: The APA Publications and Communications Board task force report. *American Psychologist*, 73(1), 3–25. <https://doi.org/10.1037/amp0000191>
- Brown, N. J. L., & Heathers, J. A. J. (2017). The GRIM test: A simple technique detects numerous anomalies in the reporting of results in psychology. *Social Psychological and Personality Science*, 8(4), 363–369. <https://doi.org/10.1177/1948550616673876>
- Eysenbach, G. (2004). Improving the quality of web surveys: The Checklist for Reporting Results of Internet E-Surveys (CHERRIES). *Journal of Medical Internet Research*, 6(3), e34. <https://doi.org/10.2196/jmir.6.3.e34>
- Hainmueller, J., Hopkins, D. J., & Yamamoto, T. (2014). Causal inference in conjoint analysis: Understanding multidimensional choices via stated preference experiments. *Political Analysis*, 22(1), 1–30. <https://doi.org/10.1093/pan/mpt024>
- Heathers, J. A., & Brown, N. J. L. (2019). DEBIT: A simple consistency test for binary data. *OSF Preprints*. <https://doi.org/10.17605/osf.io/pm825> *(preprint — software documentation only)*
- Henseler, J., Ringle, C. M., & Sarstedt, M. (2015). A new criterion for assessing discriminant validity in variance-based structural equation modeling. *Journal of the Academy of Marketing Science*, 43(1), 115–135. <https://doi.org/10.1007/s11747-014-0403-8>
- Nuijten, M. B., Hartgerink, C. H. J., van Assen, M. A. L. M., Epskamp, S., & Wicherts, J. M. (2016). The prevalence of statistical reporting errors in psychology (1985–2013). *Behavior Research Methods*, 48(4), 1205–1226. <https://doi.org/10.3758/s13428-015-0664-2>
- Page, M. J., McKenzie, J. E., Bossuyt, P. M., et al. (2021). The PRISMA 2020 statement: An updated guideline for reporting systematic reviews. *BMJ*, 372, n71. <https://doi.org/10.1136/bmj.n71>
- Tong, A., Sainsbury, P., & Craig, J. (2007). Consolidated criteria for reporting qualitative research (COREQ): A 32-item checklist for interviews and focus groups. *International Journal for Quality in Health Care*, 19(6), 349–357. <https://doi.org/10.1093/intqhc/mzm042>
- von Elm, E., Altman, D. G., Egger, M., Pocock, S. J., Gøtzsche, P. C., & Vandenbroucke, J. P. (2007). The Strengthening the Reporting of Observational Studies in Epidemiology (STROBE) statement: Guidelines for reporting observational studies. *The Lancet*, 370(9596), 1453–1457. <https://doi.org/10.1016/S0140-6736(07)61602-X>

All references above were checked in Scite on 21 November 2026: all exist, none has a retraction or expression of concern, none is in a predatory journal. Two (GRIMMER, DEBIT) are preprints: use them only as method sources in software documentation, not as evidence in a journal article. Add all to Zotero before citing.

