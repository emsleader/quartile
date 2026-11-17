# FER-targeted Q1 corpus: source and access register

Reference: [Quartile 0.16.0](https://doi.org/10.5281/zenodo.24222068). The accompanying `fer-q1-100-candidates.json` and `.csv` list **100 bibliographic candidate papers**, not 100 analyzed full texts.

## Verified now
- Five topical groups: survey attrition, SME finance, firm composition/decomposition, monetary policy and sampling inference.
- Sources selected with Elicit, checked against Quartile's SCImago 2024 journal bank, and DOI/title/year cross-checked with Scite.
- Some candidate full-text links were discovered, but every `fulltext_verified` field remains false. An accessible URL does not establish permission to mine or that the published full text is available.

## Before claiming 'learned from 100 Q1 full-text articles'
1. Independently refresh journal quartile against the latest SCImago release; store source release, category and best quartile. Reject or flag changed rankings.
2. Use institutional access, Unpaywall or OpenAlex location metadata to obtain legally accessible published versions. Check source license and DOI/title matches in the PDF. Retain provenance and SHA-256 hashes.
3. Extract and check all text, tables and references. Report the number of full texts processed **separately** from discovery and from metadata validation.
4. Measure paragraph count and words per paragraph, median sentence length, length variability, opening rhetorical move, evidence–claim order, paragraph handoffs, citations per 1,000 words, uncertainty language and ending/transition functions. Stratify by paper section and paper type.
5. Aggregate medians and interquartile ranges with observation counts. **Never** tune the engine to mimic exact phrasing, and avoid overfitting to a journal's house style.
6. Build the section-level outline for a manuscript. Work with the writer to approve exactly one paragraph at a time. Keep approved paragraphs locked and pass them as context before the next paragraph.
7. Use Quartile's `verify_rewrite` guard on edits to original text and `corpus_originality` on any new prose based on the reference corpus. The guard is conservative: interpret a failure as review-needed, not an automatic paraphrase target.

## Functional additions
- `paragraph_flow` reports sentence-level rhythm and adjacency anchors, with explicit warnings that lexical overlap is not semantic coherence.
- `next_paragraph_brief` builds a one-paragraph drafting brief including accepted preceding paragraphs, verified evidence and the next section's goal. It drafts nothing itself; the client model authors the candidate paragraph and the user approves it.
- `connected_paragraph_edit` is a guided MCP prompt for a single, protected revision.

## Target journal and research safeguards
FER asked for explicit formal econometric models, stronger policy relevance and better structure. Those are substantive scientific tasks, not merely writing-style deficiencies. The writer must not invent additional causal identification or treat a policy shock as a treatment without an identification design.

## Publication integrity
The manuscript and its published research data remain under author control. Source manuscripts are used only for stylistic analysis, with licensing and scholarly attribution. The generated work must be original and keep all numeric findings and citations traceable.
