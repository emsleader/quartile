// Design classifier (specification Section 3.3). A declared design always overrides detection.
export const DESIGNS = ["regression", "bounds", "sem", "experiment", "slr", "qualitative", "survey", "conceptual", "simulation"];

export const SIGNALS = {
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
  const methodsText = (doc.sectionText && doc.sectionText("methods")) || doc.text || "";
  const signals = {};
  for (const [k, rx] of Object.entries(SIGNALS)) signals[k] = (methodsText.match(new RegExp(rx.source, "gi")) || []).length;
  const ranked = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  return { primary: ranked[0][1] > 0 ? ranked[0][0] : "unknown", declared: false, signals };
}

export default { DESIGNS, SIGNALS, classifyDesign };
