# How to add a writing rule from a book

This guide is for a person who has read a writing book (or essay) and wants to add its advice to the Quartile rulebook. Quartile is MIT-licensed and public. Books are copyrighted. So the rulebook holds **our own short rules that point to the book**, never the book's text.

## 1. The licence rules (read first)

1. Read the book yourself. Buy it or borrow it from a library. Do not use a summary, a scan from the internet or a text produced by a tool.
2. Write each rule **in your own words**. Do not copy sentences, lists, tables or examples from the book.
3. Quote **a few words at most** (a short term the book uses, in quotation marks), and only when the term itself matters.
4. Put the **chapter or page** in `source_ref`, for example `"Ch. 4"` or `"pp. 112-114"`.
5. Never add the book's text to the repository: not in YAML, not in test files, not in comments, not in commit messages. Test sentences are written by you.

If you are unsure whether something is too close to the book, write it again more briefly in plainer words.

## 2. Where the rule goes

There is one file per source in `rulebook/`:

| File | Source ID |
|---|---|
| `belcher_2019.yaml` | BELCHER2019 |
| `huff_1999.yaml` | HUFF1999 |
| `thomson_2013.yaml` | THOMSON2013 |
| `booth_2016.yaml` | BOOTH2016 |
| `mccloskey_2019.yaml` | MCCLOSKEY2019 |
| `cochrane.yaml` | COCHRANE |
| `williams.yaml` | WILLIAMS |

Each file already has a full `source:` block and `rules: []`. Add your rule under `rules:`. When you start work on a file, change `extraction_status` from `"awaiting owner"` to `"in progress"`, and to `"done"` when you reach the target or have read the whole book.

For a new source, copy one of these files, give it a new `id` and a full `citation`, and keep `licence_note: "Rules paraphrased; no text reproduced"`.

## 3. Choose the kind of check

Every rule has `check:` set to one of three values. Choose honestly. **About half of writing advice cannot be checked by a program**, and that is fine.

| check | Use it when | What the user sees |
|---|---|---|
| `structural` | A program can test the document's structure reliably (a section exists; a claim sentence is in the first paragraphs). Uses a named test from `core/rules/structural.js` or `core/rules/tests/*.js`. | An automatic finding, confidence high. |
| `pattern` | A regular expression finds the problem in one sentence, and false hits are rare. | An automatic finding, confidence medium (set `confidence: low` if unsure). |
| `manual` | Judgement is needed: whether an argument is clear, whether the contribution is interesting, whether a paragraph has one idea. | A line in a short human checklist, severity note. Never an automatic flag. |

When in doubt, choose `manual`. A wrong automatic flag does more harm than a missed one.

Severity: writing advice is almost never a reason to reject a paper. Use `note` or `minor`. Use `major` only when the book treats the point as essential **and** the check is structural with high confidence. Never use `blocker` for a writing rule.

## 4. Write the rule

Required fields: `id`, `title`, `role`, `severity`, `designs`, `check`, `source_ref`, `message`. Also give `fix`, and `where` (the section keys, for example `introduction` or `[abstract, introduction]`). The schema is in `core/rules/schema.js`.

- `id`: the source prefix, a topic and a number, for example `BEL-ARG-01`. IDs must be unique across the whole rulebook.
- `role`: `writing` for style and craft rules; `eic` or another role only if the rule is about that role's work.
- `designs`: `[all]`, or the designs the rule applies to.
- `pattern` rules: add `negation: scope` (or `negatable: true`) if a negated sentence must not flag; add `except` or `unless_nearby` to remove known false hits.
- `message` says what is wrong in one plain sentence. `fix` says what to do.

## 5. Add tests

Every rule except `manual` needs test files in `tests/rules/<ID>/`:

- `pos_1.txt`: a short text that **must** flag the rule.
- `neg_1.txt`: a similar text that **must not** flag it (the problem is fixed).
- `neg_2.txt`: the **negated** version of the positive (for example "does not cause" instead of "causes"), which must not flag. If negation makes no sense for the rule (a length rule, for example), use another near miss and say why in the rule's `note`.

Write the test texts yourself. Start each with a heading such as `# Introduction` so the text lands in the right section. List the files under `tests:` in the rule.

Then run:

```
node tests/rules/run.js
```

It loads every rulebook file, refuses a rule without `source_ref`, without tests, with a duplicate ID or with a broken regular expression, and checks every positive and negative file. All of it must pass before you commit.

## 6. Worked example (fictional source)

The source below is **fictional**. It does not exist. It only shows the steps.

Suppose a person reads *"Plain Papers"* by A. N. Example (imaginary press, 2030). In chapter 3 the imaginary author advises, at length, that a results paragraph should open with the finding rather than with the table number. The person writes a new file `rulebook/example_2030.yaml` (in a real case, the source's own file):

```yaml
source:
  id: EXAMPLE2030
  citation: "Example, A. N. (2030). Plain Papers. Imaginary Press. (Fictional source used only in docs/CONTRIBUTING_RULES.md.)"
  licence_note: "Rules paraphrased; no text reproduced"
  access: library
  target_rules: 1
  extraction_status: "done"
rules:
  - id: EXA-RES-01
    title: "Results paragraph opens with a table number"
    role: writing
    severity: note
    confidence: low
    designs: [all]
    check: pattern
    pattern: '^(?:As (?:shown|reported|presented) in |In )?Table \d+ (?:shows|reports|presents)\b'
    negation: none
    where: results
    source_ref: "Ch. 3"
    message: "The sentence opens with the table instead of the finding."
    fix: "Start with the finding, then point to the table in brackets: 'Young firms invest less (Table 2)'."
    tests:
      positive: [tests/rules/EXA-RES-01/pos_1.txt]
      negative: [tests/rules/EXA-RES-01/neg_1.txt, tests/rules/EXA-RES-01/neg_2.txt]
```

Notice: the rule is one sentence in our own words; nothing from the "book" is quoted; the chapter is in `source_ref`; the check is `pattern` with low confidence because the advice is a preference, not an error.

Test files, written by the person:

`tests/rules/EXA-RES-01/pos_1.txt`
```
# Results

Table 2 shows that young firms invest less than old firms.
```

`tests/rules/EXA-RES-01/neg_1.txt`
```
# Results

Young firms invest less than old firms (Table 2).
```

`tests/rules/EXA-RES-01/neg_2.txt` (negated form)
```
# Results

Table 2 does not show a difference between young and old firms.
```

The negated sentence does not match the pattern ("does not show" is not "shows"), so it does not flag.

A second piece of advice in the same imaginary chapter, "each results paragraph should make one point", needs judgement. It becomes a `manual` rule, with no pattern and no tests:

```yaml
  - id: EXA-RES-02
    title: "One point per results paragraph"
    role: writing
    severity: note
    designs: [all]
    check: manual
    where: results
    source_ref: "Ch. 3"
    message: "Check by hand that each results paragraph makes one point."
    fix: "Split paragraphs that report two unrelated findings."
```

Finally run `node tests/rules/run.js`, then the full test list in the brief, and commit.

## 7. Checklist before you commit

- [ ] Every rule is in my own words; at most a few quoted words.
- [ ] `source_ref` gives the chapter or page.
- [ ] `check` is honest: `manual` where judgement is needed.
- [ ] Severity is `note` or `minor` (never `blocker`).
- [ ] Positive, negative and negated tests exist and are my own text.
- [ ] `node tests/rules/run.js` passes.
- [ ] No book text anywhere in the commit.
