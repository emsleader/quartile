# Sample-flow arithmetic (MTH-03)

Quartile's own method. No third-party code was used.

## What it checks

A paper often reports how a sample shrinks: a start count, some removals, and the count that is left. MTH-03 checks
that the numbers add up. It works one paragraph at a time and reads the sentences in order.

## How it reads a flow

Each whole number in a sentence gets one role, from the words around it:

- **start** — "Of 8,159 records", "we identified 1,234 records", "the initial sample contained 12,400 observations",
  "Records identified: 1,234", "records identified (n = 1,234)";
- **removal** — "412 were excluded", "after removing 234 duplicates", "120 did not respond", "duplicates removed (n = 234)";
- **left** — "leaving 7,747", "1,000 remained", "a final sample of 950 firms", "50 studies were included",
  "records screened (n = 1,000)".

Numbers are ignored when they are percentages, decimals, years, numbers after "Table", "Figure", "Section" and
similar words, numbers after "fewer than", "at least" and similar words, and numbers inside brackets other than
"(n = …)".

## When it raises a flag

At every "left" count that follows a start count and at least one removal, Quartile computes start minus removals.
To avoid false alarms it accepts the stated count if it matches any of these readings:

1. start minus the removals that have their own verb ("412 were excluded");
2. start minus all numbers listed after a removal verb ("we removed 35 firms with missing values and 12 firms in finance");
3. start minus the first removal only (the later numbers break the removal down by reason).

If the start could also be a sum ("1,000 records from Scopus and 234 from Web of Science"), both readings are tried.
It does **not** flag when:

- a removal has no number ("after removing duplicates, 1,950 remained");
- a removal is in another unit ("we excluded 2 countries" from a count of firms);
- the start and the "left" count are in different units (firms and firm-years).

After a flagged step, both the stated and the computed count are kept as possible starts for the next step, so one
error does not raise a second flag further down the flow.

## Limits

- Flows split across paragraphs, or shown only in a figure, are not read.
- Numbers written as words ("twelve firms") are not read.
- A missing step (the counts drop with no stated removal) is not flagged.
