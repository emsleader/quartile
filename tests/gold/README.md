# Gold set

Annotated manuscripts and their true issues, used by `npm run test:gold` to measure precision and recall per
role and per severity (targets in specification 14.2).

## Where the texts live

- `tests/gold/cases/*.json` — open texts only: synthetic texts and open-access CC BY papers. These run in CI.
- The owner's own manuscripts stay **outside the repository**, in the folder named by `QUARTILE_GOLD_PRIVATE`,
  with the same file format. They are read only on the owner's machine.

## Case format

```json
{
  "id": "synthetic-001",
  "licence": "synthetic | CC BY 4.0 (with DOI)",
  "design": "regression",
  "text": "full text, or omit and give \"file\" with a path relative to the case file",
  "expected": [ { "rule": "MTH-03", "section": "methods", "start": 120, "end": 188, "note": "8,159 - 412 is not 7,700" } ],
  "planted": true,
  "annotated_roles": ["methods"]
}
```

`annotated_roles` (optional) says which roles were annotated. A case annotated for some roles only is scored for
those roles only; leave it out for a fully annotated manuscript, where every finding of every role is scored.

`start` and `end` are character offsets into the normalised text of `core/text/parse.js` (`doc.text`). A finding
counts as a true positive when its rule matches and its span overlaps the annotated span (or the annotation has no
span). Every expected issue not found is a miss. Every finding not annotated is a false positive.

## Planted errors

`node tests/gold/plant.js <clean.txt> <out.json>` inserts known errors into a clean text (wrong sample-flow sum,
impossible GRIM mean, causal verb, missing ethics number, inconsistent n, and a negated sentence that must not
flag) and writes the case with its expected findings.

## Two annotators

For 10 of the owner's manuscripts, two people annotate independently; `tests/gold/agreement.R` computes Cohen's
kappa from the exported table (owner's rule: agreement statistics are computed in R).
