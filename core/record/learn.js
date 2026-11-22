// Category and lesson proposals (specification 21.4 and 21.5). Proposals only: the owner confirms every
// category and approves every lesson.

export const CATEGORIES = ["contribution", "literature_missing", "cite_journal_papers", "theory", "method_design", "identification",
  "robustness", "statistics", "data_description", "formal_model_equations", "replication_package", "policy_implications",
  "managerial_implications", "external_validity", "limitations", "structure", "length", "language", "figures_tables",
  "references_format", "ethics_disclosure", "other"];

// Specification 21.5, unchanged.
export const CATEGORY_HINTS = {
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

// Our additions for the other categories of 21.4. Checked after the specification's hints, so the spec order wins.
export const EXTRA_HINTS = {
  theory:                  /\b(theor(y|etical)|conceptual framework|hypothes[ie]s)\b/i,
  method_design:           /\b(research design|sampling|sample selection|questionnaire|survey design|methodolog)\w*/i,
  identification:          /\b(endogene\w*|identification|causal\w*|instrument(al)? variables?|reverse causality|omitted variables?)\b/i,
  statistics:              /\b(standard errors?|significance|p-values?|statistical(ly)?|confidence intervals?|cluster(ed|ing))\b/i,
  data_description:        /\b(descriptive statistics|data (source|description|set)|dataset|summary statistics|variable definitions?)\b/i,
  managerial_implications: /\b(managerial|managers|practitioners?|practical implications)\b/i,
  limitations:             /\b(limitations?|caveats?)\b/i,
  length:                  /\b(word (count|limit)|too long|page limit|words)\b/i,
  language:                /\b(language|grammar|proofread\w*|typos?|wording|english|native speaker)\b/i,
  figures_tables:          /\b(figures?|tables?|graphs?|charts?|plots?)\b/i,
  references_format:       /\b(reference list|citation style|references? (format|style)|apa|doi)\b/i,
  ethics_disclosure:       /\b(ethic\w*|consent|conflicts? of interest|disclos\w*|funding statement|data availability)\b/i,
};

/** Spec 21.5: categories whose hint matches, in specification order; ['other'] when none. Extended by EXTRA_HINTS. */
export function proposeCategory(text) {
  const hits = [...Object.entries(CATEGORY_HINTS), ...Object.entries(EXTRA_HINTS)].filter(([, rx]) => rx.test(text)).map(([k]) => k);
  return hits.length ? hits : ["other"];
}

/** Characters allowed in a rule ID (core/rules/schema.js). */
export const idPart = s => String(s).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");

/** Spec 21.5 lesson proposal (rule in rulebook format, check: manual). request: { number, category, text, event_id }. */
export function proposeLesson(request, journalIssn) {
  const cat = request.category;
  const id = request.rule_id || `${idPart(journalIssn)}-${cat}-${idPart(request.number)}`;
  return {
    scope: `journal:${journalIssn}`,
    rule_yaml: [
      `- id: ${id}`,
      `  title: "Earlier request from this journal: ${cat.replace(/_/g, " ")}"`,
      `  role: eic`,
      `  severity: major`,
      `  designs: [all]`,
      `  check: manual`,
      `  source_ref: "Editor/reviewer letter, event ${request.event_id}"`,
      `  message: ${JSON.stringify("This journal previously asked: " + request.text.slice(0, 240))}`,
      `  fix: "Confirm the manuscript already addresses this before submission."`,
    ].join("\n"),
    status: "proposed",
  };
}

/** Repeated lesson (21.5 point 2): the same category came from two or more journals; proposed with scope all. */
export function proposeRepeatedLesson(category, journals, requestIds) {
  return {
    scope: "all",
    rule_yaml: [
      `- id: ALL-${category}`,
      `  title: "Asked by several journals: ${category.replace(/_/g, " ")}"`,
      `  role: eic`,
      `  severity: major`,
      `  designs: [all]`,
      `  check: manual`,
      `  source_ref: ${JSON.stringify(`Requests ${requestIds.join(", ")} from ${journals.length} journals`)}`,
      `  message: ${JSON.stringify(`Journals ${journals.join(", ")} each asked about ${category.replace(/_/g, " ")}.`)}`,
      `  fix: "Check this point in every manuscript before submission."`,
    ].join("\n"),
    status: "proposed",
  };
}

export default { CATEGORIES, CATEGORY_HINTS, EXTRA_HINTS, proposeCategory, proposeLesson, proposeRepeatedLesson, idPart };
