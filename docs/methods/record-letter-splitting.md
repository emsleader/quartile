# Splitting editor and reviewer letters into requests

Used by `record_letter` (`core/record/split.js`). Our own method; it extends the splitter sketched in
specification Section 11. No outside code was used.

1. The letter is read line by line. Headings change the sender: "Editor:", "Editor's comments",
   "Associate Editor", "Editor-in-Chief" (editor or associate-editor), "Reviewer 1", "Referee #2",
   "REVIEWER 2", "Referee report" (reviewer-n; unnumbered reviewers are counted in order).
2. Item markers start a new request: codes ("R1.3:", "R2-1", "E2."), "Reviewer 1, Comment 3:",
   "Comment 2:" / "Point 3.", numbered lists ("1.", "1)", "(1)", "2 -"), and bullets ("-", "•", "*").
   Lettered lines ("a)", "(b)") stay with the open item; with no open item they form their own list.
3. Lines that follow an item belong to it. After a blank line, an indented line, a line starting in lower case,
   or a line starting with "This", "These", "In particular", "For example" and similar also belongs to it.
4. Prose paragraphs are split into sentences. A sentence that asks for something (for example "please",
   "should", "needs", "is unclear", "too long", "clarify", "discuss") becomes one request; a following sentence
   that starts with "This", "It", "For example" and similar joins it.
5. Not requests: greetings, sign-offs and the signature after them, decision statements ("I regret ...",
   "I have now read ..."), administrative instructions (deadlines, point-by-point response, tracked changes,
   upload) and praise.
6. Numbers: the letter's own numbers are kept (E1, R1.3). A repeated number in a "Minor comments" block becomes
   R1.m1; other repeats get a letter (R1.2b). Requests without a number continue after the highest number of
   the same sender.

Measured on fictional letters written for the tests (tests/phases/phase9-letters): see docs/reports/phase-9.md.
