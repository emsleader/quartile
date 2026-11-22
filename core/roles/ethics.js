// Role module: ethics. Filled in its own phase (see docs/Quartile_Upgrade_Specification.md).
// run(doc, opts) returns findings in the engine's shape: { rule, role, title, severity, confidence, source,
// source_ref, message, fix, span: { section, start, end, text } | null, detail }.
export const ROLE = "ethics";
export async function run(doc, opts = {}) { return []; }
export default { ROLE, run };
