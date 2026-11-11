// Q1 writing standards used by the app and the MCP server.
const LEVELS = {
  grammar: "Grammar only: correct errors of grammar, spelling, punctuation, agreement, articles, prepositions and tense. Every wording choice that is already correct stays exactly as written.",
  simple: "Simple: fix grammar, readability and minor style problems with as few changes as possible. Sentence order and structure stay as they are.",
  standard: "Standard: improve academic fluency, transitions, sentence variety, paragraph coherence and professional tone, keeping the scientific meaning intact.",
  enhanced: "Enhanced: deeper structural and rhetorical editing of each paragraph, keeping every claim, piece of evidence, finding and contribution. Expect more flags to review."
};
const BASE_RULES = [
  "1. Put the finding or the question in the first two sentences of the abstract and of the introduction.",
  "2. Name the data in one clause: population, country, period, sample size.",
  "3. State the gap as a contradiction or omission in named prior work, never as 'little research has examined'.",
  "4. Use causal verbs only when the design identifies causation (natural experiment, exogenous shock, difference-in-differences, instrument); otherwise 'is associated with' or 'is consistent with'.",
  "5. Report one or two key numbers in the abstract, unchanged from the results.",
  "6. Say for whom the effect is stronger or weaker, as the evidence shows.",
  "7. Prefer 'we' in active voice, short sentences and plain verbs (is, has, shows).",
  "8. Cut background sentences that do not lead to the gap.",
  "9. Close with one modest implication; never predict acceptance, impact or adoption.",
  "10. Type B: state what the model adds before what it shows. Type D: name the framework or process the paper contributes.",
  "11. In finance papers, put the identification strategy in the first sentence.",
  "12. Position against one or two named prior papers and say what this paper changes in their argument.",
  "13. When a construct has distinct parts, name each part and state its expected effect separately.",
  "14. Report null and negative results in the same plain wording as positive ones."];
const WTYPES = {
  A: { name: "A. Empirical finance", journals: "JF, RFS, JFE, Financial Management, EFM", rules: "Open with the data or design and the main finding, 'we' as subject. Gap = a named prior result plus the open question about it. Causal verbs only with a natural experiment, exogenous shock or difference-in-differences; otherwise 'associated with', 'consistent with'. One or two numbers in the abstract. Close with one sentence on what the evidence supports. Identification strategy in the first sentence." },
  B: { name: "B. Structural or theory model", journals: "Econometrica, ReStud, JPE, JME", rules: "Open with what the model adds, then what it shows. Gap = a friction the standard model leaves out. 'We show' refers to the model's logic; empirical fit is 'matches' or 'accounts for'. Results as comparative statics: what rises or falls with what. Close with the implication for a puzzle or for policy." },
  C: { name: "C. Small business and entrepreneurship", journals: "Small Business Economics, JSBM, ISBJ, ETP, ICC", rules: "Open with the firm population and the constraint studied, then the result. Gap = a stylized fact that small firms contradict, or a population earlier data could not observe. Hedge with 'suggest', 'indicate'. State heterogeneity by firm size and age: who is most affected. Split broad constructs into named parts with separate predicted effects. Report policy tests and null results plainly. Close with a specific, modest policy implication." },
  D: { name: "D. Service and management theory", journals: "Journal of Service Research, JOSM, JMS", rules: "Open with the managerial problem, then the gap in existing theory (it looks at one actor or level and misses another). Name the contribution as a framework or process; propositions rather than estimates. Results as named mechanisms or sub-processes. Close with concrete levers for managers." }
};
const ROLE_RULES = {
  abstract: "Abstract: finding or question first; data in one clause; one or two key numbers; heterogeneity; one modest closing implication. No background sentence first.",
  opening: "Opening text: treat as an abstract or introduction opening; the point comes first.",
  introduction: "Introduction: the point and the gap in the first paragraph; position against one or two named prior papers; state the contribution concretely.",
  literature: "Literature and hypotheses: synthesize by argument, not paper by paper; keep each construct and its definition distinct; state each hypothesis with its direction (and shape if non-linear).",
  methods: "Methods and data: keep every methodological detail; passive voice is acceptable; name the identification strategy plainly; describe sample, period and measures precisely.",
  results: "Results: numbers unchanged; causal wording only as the design allows; report null and negative results as plainly as positive ones; say for whom effects differ.",
  discussion: "Discussion: interpret within the evidence; limitations as conditions, not apologies; one specific implication; no generic 'future research' closers.",
  conclusion: "Conclusion: restate the main finding with its number once; one specific implication; no generic closers.",
  references: "Reference list: never edited.",
  declarations: "Declarations: never edited.",
  other: ""
};

const TIERS = {
  Q1: "Q1 (top journals): open on a puzzle, a contradiction between named prior findings or a fact the dominant theory cannot explain. One central claim per paragraph, in the order claim → reason → evidence. Name the strongest rival explanation and say how the design or the evidence rules it out. Position against one or two named papers and say what changes in their argument; frame the contribution as a new prediction, mechanism or boundary condition of a named theory. State scope conditions plainly. Hedge only where the design limits the inference, and say which limit. Paragraphs end on evidence or an implication, never on a slogan.",
  Q2: "Q2: position the paper within a named literature stream and state the contribution relative to that stream; give the mechanism behind each hypothesis; report robustness and alternative specifications; state one or two boundary conditions; claims are measured and specific.",
  Q3: "Q3: clear problem statement and research question; contribution to a specific context (country, sector or firm type) stated explicitly; hypotheses follow from cited work; methods described so they can be replicated; limitations listed.",
  Q4: "Q4: correct structure (introduction, literature, method, results, discussion), clear and correct English, research question and contribution stated, methods described."
};
const TIER_RIGOR = "When the target tier asks for something the text does not contain (a rival explanation, a robustness test, a boundary condition, a named theory), never invent it. Restructure and sharpen only what the author already wrote; report the missing element as an author task.";
const tierOf = () => ($("#editTier") && $("#editTier").value) || "Q1";
const ROLES = ["opening","abstract","introduction","literature","methods","results","discussion","conclusion","references","declarations","other"];

module.exports = { LEVELS, BASE_RULES, WTYPES, ROLE_RULES, ROLES, TIERS, TIER_RIGOR };
