// JSON Schema for rulebook files (specification Section 4.1), checked with ajv.
// Extensions beyond the specification's example, needed to carry existing checks without changing their behaviour:
//   context      regex that must also match in the same sentence (the claim audit's "evidence words")
//   except       regex that suppresses a hit in the same sentence
//   negation     "scope" (specification 3.2, default when negatable is true), "before" or "near" (the claim audit's
//                0.14.1 denial rules), or "none"
//   legacy_id    the rule name an existing tool reports, so its output does not change
//   confidence   overrides the engine default (pattern: medium, structural: high)
export const ROLES = ["eic", "methods", "finance", "business", "production", "ethics", "response", "writing", "core"];
export const SEVERITIES = ["blocker", "major", "minor", "note"];
export const CHECKS = ["structural", "pattern", "count", "manual"];

export const ruleSchema = {
  type: "object",
  required: ["id", "title", "role", "severity", "designs", "check", "source_ref", "message"],
  additionalProperties: false,
  properties: {
    id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$" },
    legacy_id: { type: "string" },
    title: { type: "string", minLength: 3 },
    role: { enum: ROLES },
    severity: { enum: SEVERITIES },
    confidence: { enum: ["high", "medium", "low"] },
    designs: { type: "array", minItems: 1, items: { type: "string" } },
    check: { enum: CHECKS },
    pattern: { type: "string" },
    flags: { type: "string", pattern: "^[imsu]*$" },
    context: { type: "string" },
    except: { type: "string" },
    negatable: { type: "boolean" },
    negation: { enum: ["scope", "before", "near", "none"] },
    unless_nearby: { type: "string" },
    where: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
    test: { type: "string" },
    count: { type: "object" },
    source_ref: { type: "string", minLength: 1 },
    message: { type: "string" },
    fix: { type: "string" },
    note: { type: "string" },
    tests: {
      type: "object", additionalProperties: false,
      properties: { positive: { type: "array", items: { type: "string" } }, negative: { type: "array", items: { type: "string" } } },
    },
  },
  allOf: [
    { if: { properties: { check: { const: "pattern" } } }, then: { required: ["pattern"] } },
    { if: { properties: { check: { const: "structural" } } }, then: { required: ["test"] } },
  ],
};

export const fileSchema = {
  type: "object", required: ["source", "rules"], additionalProperties: false,
  properties: {
    source: { type: "object", required: ["id", "citation"], additionalProperties: true,
      properties: { id: { type: "string" }, citation: { type: "string" }, licence_note: { type: "string" }, url: { type: "string" } } },
    rules: { type: "array", items: ruleSchema },
  },
};

export default { ruleSchema, fileSchema, ROLES, SEVERITIES, CHECKS };
