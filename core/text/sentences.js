// Sentence splitting with character offsets. Protects common abbreviations ("et al.", "e.g.", "i.e.", "Fig.",
// "Eq.", "No.", "vs.", initials) and decimal numbers, so citations and statistics stay inside one sentence.
const ABBR = /\b(?:et al|e\.g|i\.e|cf|vs|Fig|Figs|Eq|Eqs|No|Nos|Vol|pp|p|ed|eds|Dr|Prof|Mr|Mrs|Ms|Inc|Ltd|Co|approx|resp|Sec|Ch|Tab)\.$/i;

/** Split `text` into sentences. Returns [{ text, start, end }] with offsets into `text`. */
export function splitSentences(text) {
  const out = [];
  const rx = /[.!?]+["')\]]*\s+(?=["'(\[]?[A-Z0-9])/g;
  let last = 0, m;
  while ((m = rx.exec(text))) {
    const endPunct = m.index + m[0].trimEnd().length;
    const head = text.slice(last, endPunct);
    if (ABBR.test(head.replace(/["')\]]+$/, "")) || /\b[A-Z]\.$/.test(head) && !/\b[A-Z]{2,}\.$/.test(head)) continue;
    push(last, endPunct);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return out;
  function push(a, b) {
    const raw = text.slice(a, b), lead = raw.length - raw.trimStart().length, t = raw.trim();
    if (t) out.push({ text: t, start: a + lead, end: a + lead + t.length });
  }
}

export default { splitSentences };
