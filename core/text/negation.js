// Negation scope (specification Section 3.2). A match is negated when a negator occurs before it in the same
// clause, within `window` tokens. Clause breaks are , ; : and but / however / although / whereas / while.
const NEGATORS = /\b(not|never|no|neither|nor|without|rather than|instead of|cannot|can't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|is not|are not|was not|were not|do not|does not|did not|no longer|far from)\b/i;
const CLAUSE_BREAK = /[,;:]|\b(?:but|however|although|whereas|while)\b/i;

export function isNegated(sentence, start, window = 8) {
  const before = sentence.slice(0, start);
  const clauses = before.split(CLAUSE_BREAK);
  const clause = clauses[clauses.length - 1] || "";
  const tokens = clause.trim().split(/\s+/).slice(-window).join(" ");
  return NEGATORS.test(tokens);
}

export { NEGATORS, CLAUSE_BREAK };
export default { isNegated, NEGATORS, CLAUSE_BREAK };
