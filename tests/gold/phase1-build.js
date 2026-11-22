// Builds the Phase 1 synthetic gold cases (tests/gold/cases/phase1-*.json) with plant() from plant.js.
// Run: node tests/gold/phase1-build.js   (the JSON files are committed; rerun only when the texts change)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plant } from "./plant.js";
import { parseText } from "../../core/text/parse.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "cases");

const REGRESSION = `Leverage and growth in small service firms

Abstract

We study how leverage relates to sales growth in small service firms in Hungary between 2015 and 2022.

# 1. Introduction

Small service firms often rely on bank debt. We ask whether leverage is associated with later sales growth.

# 2. Data and Methods

We use annual accounts from the national company register for 2015 to 2022. Sales growth is the yearly change in log sales. Leverage is total debt divided by total assets. Firm size is the log of total assets. Firm age is the number of years since registration. We estimate a panel regression with firm and year fixed effects and cluster standard errors by firm.

# 3. Results

Leverage is negatively associated with sales growth (coefficient -0.12, standard error 0.04). Firm size is positively associated with growth.

# 4. Discussion

Higher leverage goes together with slower growth in this sample.

# 5. Limitations

The accounts cover only firms that file full statements, so the smallest firms are missing. The design is observational and cannot rule out reverse causality.

# 6. Conclusion

Leverage and growth move in opposite directions for small service firms.`;

const SURVEY = `Owner experience and digital adoption

Abstract

We report a questionnaire study of small business owners in three Hungarian regions.

# 1. Introduction

Digital tools spread unevenly among small firms. We ask whether owner experience is associated with adoption.

# 2. Data and Methods

We sent a paper questionnaire to owners listed in the chamber of commerce register in 2023. Adoption is the number of digital tools in use, from a list of eight. Owner experience is years as an owner. Respondents also reported firm size in employees. We estimate an ordered logit regression.

# 3. Results

Owner experience is positively associated with adoption. Larger firms report more tools.

# 4. Discussion

Experienced owners use more digital tools in this sample.

# 5. Limitations

The sample covers three regions only and relies on self-reported tool use, so the results may not generalise to other regions.

# 6. Conclusion

Owner experience and adoption go together.`;

const SLR = `A systematic literature review of financing in equipment-dependent service firms

Abstract

This systematic literature review maps studies on how equipment-dependent service firms finance their assets.

# 1. Introduction

No prior systematic review covers this group of firms. Our aim is to map the evidence.

# 2. Methods

We searched Scopus and Web of Science in March 2025 with a Boolean search string. Two reviewers screened titles and abstracts independently. Studies were included if they reported firm-level financing data.

# 3. Results

Most included studies use survey data from Europe. Leasing is the most studied instrument.

# 4. Discussion

The evidence is thin outside Europe.

# 5. Limitations

The review covers only English-language, peer-reviewed sources, so grey literature is missing.

# 6. Conclusion

Leasing dominates the studied financing options.`;

const cases = [];
const add = (id, design, base, plants, opts = {}) => {
  const r = plant(base, plants.map(p => ({ rule: p.rule ?? null, where: p.where, text: p.text })));
  const doc = parseText(r.text, { design });
  // expected spans: the whole planted paragraph (plant() finds only single-sentence plants)
  const expected = plants.filter(p => p.rule).map(p => {
    const start = doc.text.indexOf(p.text);
    const sec = doc.sentences.find(s => s.start >= start)?.section;
    return { rule: p.rule, section: sec, start, end: start + p.text.length, note: p.note || "planted" };
  });
  cases.push({ id: "phase1-" + id, licence: "synthetic", design, text: r.text, expected, planted: plants.some(p => p.rule) && !opts.notPlanted });
};

// 1. planted sample-flow errors (every one must be caught)
add("flow-planted-regression", "regression", REGRESSION, [
  { rule: "MTH-03", where: "methods", text: "The register lists 14,820 firm-year observations. We dropped 1,210 observations with missing sales and 405 observations from financial firms, resulting in a final sample of 13,105 firm-year observations.", note: "14,820 - 1,210 - 405 = 13,205" },
  { rule: "MTH-03", where: "methods", text: "Of 3,000 firms, 240 were excluded as inactive, leaving 2,670 firms.", note: "3,000 - 240 = 2,760" },
]);
add("flow-planted-survey", "survey", SURVEY, [
  { rule: "MTH-03", where: "methods", text: "Of 1,500 questionnaires sent, 610 were returned, of which 42 were incomplete and removed, leaving 578 usable responses.", note: "610 - 42 = 568" },
  { rule: "MTH-03", where: "methods", text: "In the second wave we contacted 900 owners; 315 did not respond, leaving 595 respondents.", note: "900 - 315 = 585" },
]);
add("flow-planted-slr-prose", "slr", SLR, [
  { rule: "MTH-03", where: "methods", text: "The search returned 2,310 records. After removing 412 duplicates, 1,908 records remained. Of these, 1,650 were excluded on title and abstract, leaving 248 full texts. A further 190 were excluded at full text, and 58 studies were included.", note: "1,908 - 1,650 = 258" },
]);
add("flow-planted-slr-prisma", "slr", SLR, [
  { rule: "MTH-03", where: "results", text: "Records identified from databases (n = 1,234); duplicates removed (n = 234); records screened (n = 1,000); records excluded (n = 800); reports assessed for eligibility (n = 210); reports excluded (n = 150); studies included (n = 60).", note: "1,000 - 800 = 200" },
  { rule: "MTH-03", where: "methods", text: "Records identified: 980; duplicates removed: 80; records screened: 910; records excluded: 700; studies included: 210.", note: "980 - 80 = 900" },
]);
add("flow-planted-multistep", "regression", REGRESSION, [
  { rule: "MTH-03", where: "methods", text: "The initial sample contained 5,400 firms. We removed 310 firms with negative equity, 95 firms with fewer than 2 employees and 60 firms with missing ownership data, leaving 4,945 firms.", note: "5,400 - 310 - 95 - 60 = 4,935" },
]);

// 2. correct flows that must not flag
add("flow-correct", "regression", REGRESSION, [
  { where: "methods", text: "The register lists 14,820 firm-year observations. We dropped 1,210 observations with missing sales and 405 observations from financial firms, resulting in a final sample of 13,205 firm-year observations." },
  { where: "methods", text: "Of 3,000 firms, 240 were excluded as inactive, leaving 2,760 firms." },
  { where: "methods", text: "Of these 2,760 firms, 200 were excluded because they had fewer than 10 employees, and 60 because of missing data, leaving 2,500." },
  { where: "methods", text: "We identified 1,000 firms in the register and 234 in the trade directory. After removing 234 duplicates, 1,000 remained." },
  { where: "methods", text: "Of 5,000 firms, we excluded 2 countries, leaving 4,300 firms." },
]);
add("flow-correct-survey", "survey", SURVEY, [
  { where: "methods", text: "Of 1,500 questionnaires sent, 610 were returned, of which 42 were incomplete and removed, leaving 568 usable responses." },
  { where: "methods", text: "Of 900 owners contacted, 320 agreed to participate and 12 were later excluded, leaving 308 respondents." },
  { where: "methods", text: "In 2019, the panel had 1,200 members; data from 2018 were dropped, leaving 1,200 members for analysis." },
]);
add("flow-correct-slr", "slr", SLR, [
  { where: "results", text: "Records identified from databases (n = 1,234); duplicates removed (n = 234); records screened (n = 1,000); records excluded (n = 800); reports assessed for eligibility (n = 200); reports excluded (n = 150); studies included (n = 50)." },
  { where: "methods", text: "The search returned 2,310 records. After deduplication, 1,950 remained. Of these, 1,700 were excluded on title and abstract, leaving 250 full texts. A further 190 were excluded at full text, and 60 studies were included." },
  { where: "methods", text: "Reports excluded (n = 150): wrong population (n = 100), wrong design (n = 50)." },
]);

// 3. causal wording: planted positives, negated and identified sentences that must not flag
add("causal-planted", "regression", REGRESSION, [
  { rule: "MTH-CAUSAL-01", where: "discussion", text: "Owner experience causes higher growth among the sampled firms." },
  { rule: "MTH-CAUSAL-01", where: "results", text: "Higher leverage leads to slower sales growth." },
  { rule: "MTH-CAUSAL-02", where: "results", text: "The results prove that leverage matters for growth." },
  { where: "discussion", text: "The panel does not show that leverage causes slower growth." },
  { where: "discussion", text: "We cannot claim that leverage drives growth." },
  { where: "results", text: "The results in Table 3 are stable across specifications." },
  { where: "discussion", text: "This leads to the second question of the paper." },
]);
add("causal-negatives", "survey", SURVEY, [
  { where: "discussion", text: "The answers do not show that experience causes adoption." },
  { where: "results", text: "Experience is not what drives adoption in these answers." },
  { where: "discussion", text: "Owners named rising costs as one of the causes of slow adoption." },
  { where: "results", text: "The resource-based view predicts that experience matters." },
]);
add("causal-identified", "regression", REGRESSION, [
  { where: "results", text: "We exploit the 2018 credit reform as a natural experiment. Under this design, easier credit leads to faster growth." },
]);
add("causal-experiment", "experiment", REGRESSION.replace("We estimate a panel regression", "We ran a randomised field experiment and estimate a regression"), [
  { where: "results", text: "The treatment causes higher growth in the treated firms." },
]);

// 4. pre-specification
add("prereg-planted", "survey", SURVEY, [
  { rule: "MTH-05", where: "methods", text: "The hypotheses and analysis plan were preregistered before data collection." },
]);
add("prereg-negatives", "survey", SURVEY, [
  { where: "methods", text: "The analysis plan was not preregistered; it was written after a first look at the data." },
  { where: "methods", text: "This protocol is not a preregistration." },
]);
add("prereg-link", "survey", SURVEY + "\n\n# Data availability\n\nThe plan is at https://osf.io/abcd1 (registered 3 March 2023).", [
  { where: "methods", text: "The hypotheses and analysis plan were preregistered before data collection." },
]);

// 5. measurement defined before use
add("measure-planted", "regression", REGRESSION, [
  { rule: "MTH-04", where: "results", text: "The coefficient on CashBuffer is positive and significant." },
]);
add("measure-defined", "regression", REGRESSION.replace("Firm age is the number", "CashBuffer is cash divided by total assets. Firm age is the number"), [
  { where: "results", text: "The coefficient on CashBuffer is positive and significant." },
]);

// 6. limitations
add("limits-generic", "regression", REGRESSION.replace(/# 5\. Limitations\n\n[^\n]+\n\n/, "# 5. Limitations\n\nThis study has some limitations. Future research should address them.\n\n"), [
  { rule: "MTH-06", where: "discussion", text: "Higher leverage goes together with slower growth in this group of firms.", note: "anchor sentence; finding is document-level" },
]);

fs.mkdirSync(OUT, { recursive: true });
for (const c of cases) {
  // MTH-06 is document-level: drop the span of its annotation
  for (const e of c.expected) if (e.rule === "MTH-06") { delete e.start; delete e.end; delete e.section; }
  fs.writeFileSync(path.join(OUT, c.id + ".json"), JSON.stringify(c, null, 1) + "\n");
}
console.log(`wrote ${cases.length} Phase 1 gold cases`);
