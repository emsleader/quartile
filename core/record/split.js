// Split an editor or reviewer letter into numbered requests (specification 21.5, extending the Section 11
// splitter). Handles: "Editor:" / "Associate Editor" blocks, "Reviewer 1" / "Referee #2" blocks, explicit codes
// ("R1.3:", "E2."), "Comment 2:" / "Point 3." items, "Reviewer 1, Comment 3:", numbered lists ("1.", "1)",
// "(1)", "2 -"), bulleted lists, lettered sub-items (kept with their parent), and prose paragraphs (each
// sentence that asks for something becomes one request). Greetings, sign-offs and administrative instructions
// (deadlines, response-letter format) are not requests; they stay in the stored letter.

// The Section 11 splitter, kept as one of the item markers.
export const SECTION11_MARKER = /^\s*(?:Reviewer\s*\d+[,:]?\s*)?(?:Comment\s*)?\(?\d+[\.\)]\s/i;

const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, b: 2, c: 3, d: 4 };
const ROLE_EDITOR = "((?:associate|handling|managing|guest|deputy|section|academic)\\s+editor|editor[-\\s]in[-\\s]chief|co-?editor|editor)";
const PRE = "(?:(?:comments?|remarks?|report|notes?)\\s+(?:from|by|of)\\s+(?:the\\s+)?)?";
const POST = "(?:'s|s')?(?:\\s+(?:comments?|remarks?|report|notes?|decision letter))?(?:\\s+to\\s+(?:the\\s+)?authors?)?";
const EDITOR_H = new RegExp(`^\\s*${PRE}${ROLE_EDITOR}${POST}\\s*(?:[:\\-–—]\\s*(.*))?$`, "i");
const REVIEWER_H = new RegExp(`^\\s*${PRE}(?:reviewer|referee)\\s*#?\\s*(\\d+|one|two|three|four|five|[A-D])?${POST}\\s*(?:[:\\-–—]\\s*(.*))?$`, "i");
const REV_COMMENT = /^\s*(?:reviewer|referee)\s*#?\s*(\d+)\s*[,:;\-–]?\s*(?:comment|point|remark|issue|query|question|q)\s*#?\s*(\d+(?:\.\d+)?)\s*[:.)\-–—]?\s*(.*)$/i;
const CODE = /^\s*\(?((?:R|Rev|Ref)\s?(\d+)\s?[.\-–:]\s?(\d+(?:\.\d+)?)|(AE|E|Ed|EIC)\s?(\d+(?:\.\d+)?))\)?\s*[:.)\-–—]?\s+(.*)$/i;
const COMMENT = /^\s*(?:(?:major|minor|specific|general|additional)\s+)?(?:comment|point|remark|issue|query|concern|question|request)\s*#?\s*(\d+(?:\.\d+)?)\s*(?:[:.)\-–—]\s*(.*)|$)/i;
const NUMBERED = /^\s*(?:\((\d{1,2})\)|(\d{1,2}(?:\.\d{1,2})?)[.)]|(\d{1,2})\s+[-–—:])\s+(.*)$/;
const BULLET = /^\s*[-•*–—▪◦·●]\s+(.*)$/;
const LETTERED = /^\s*(?:\(([a-h]|i{1,3}|iv|v|vi{0,3})\)|([a-h]|i{1,3}|iv|v|vi{0,3})[.)])\s+(.*)$/;
const SUBHEAD = /^\s*(?:(major|minor|general|specific|other|additional|technical|editorial)\s+(?:comments?|issues?|points?|concerns?|remarks?|suggestions?|revisions?)|(major|minor))\s*:?\s*$/i;
const GREETING = /^\s*(?:dear\b|to the authors?\b|hello\b|hi\b)/i;
const CLOSING = /^\s*(?:(?:sincerely|yours(?: sincerely| faithfully| truly)?|best (?:wishes|regards)|kind(?:est)? regards|warm regards|regards|with (?:best|kind|warm) (?:regards|wishes)|respectfully|cordially)\b|(?:best|thank you(?: again)?|many thanks)[,.!]?\s*$)/i;
const ADMIN = /\b(address(?:ing)? (?:all|each|every|the) (?:of the )?(?:points?|comments?|concerns?|reviewers?'?)|(?:detailed |separate )?response (?:letter|to (?:the )?reviewers)|point[- ]by[- ]point|revised (?:manuscript|version|paper) (?:by|within|before)|deadline|due date|(?:submit|upload) (?:your|the) revis|log ?in\b|author (?:center|centre)|tracked changes|track changes|highlight(?:ed)? (?:all )?(?:the )?changes|look forward|(?:days|weeks) (?:from|of) (?:the date of )?this (?:letter|e-?mail)|manuscript (?:id|number)\b)/i;
const DECISION_LINE = /^\s*(?:decision|recommendation|overall recommendation|my recommendation)\s*:|\b(?:i am (?:writing|pleased|sorry)|i regret|we regret|our decision|has (?:now )?been (?:reviewed|evaluated)|the reviewers? (?:have|has) (?:now )?(?:commented|completed|returned|evaluated)|i have (?:now )?(?:read|received|reviewed)|(?:invite|offer) (?:you to submit )?a (?:major|minor) revision)\b/i;
const CUE = /\b(too (?:long|short|brief|vague|general|broad|descriptive|dense)|please|kindly|should|must|need(?:s|ed)? to|needs? (?:a|an|more|further|to)|would (?:like|benefit|be (?:helpful|useful|good|better|welcome))|i (?:would )?(?:suggest|recommend|ask|encourage|urge|expect|invite)|we (?:would )?(?:suggest|recommend|ask|encourage|expect)|(?:is|are|remains?) (?:unclear|missing|not clear|not convincing|insufficient|underdeveloped|weak|thin|limited)|it is (?:not|un)clear|not (?:clear|convinced|explained|justified|discussed|reported)|consider(?:ing)?\b|could (?:you|the authors?)|can (?:you|the authors?)|(?:is|are) required|requires?\b|lacks?\b|missing\b|add(?:ing)? (?:a|an|more|the)\b|clarify|explain|justify|discuss|provide|report|include|expand|elaborate|shorten|reduce|revise|rewrite|reorgani[sz]e|restructure|engage with|cite|compare)\b/i;
const NOT_REQUEST = /^(?:the (?:paper|manuscript|study|topic|article) (?:is|addresses|deals|examines|investigates|studies|uses|makes)\b(?![^.]*\b(?:but|however|although|should|needs?|must)\b))|\b(?:the following (?:changes|points|comments|issues|requests|revisions)|as follows)\b|\bshould be (?:commended|congratulated)\b|\b(?:i enjoyed|thank you for|thanks for)\b/i;
const CONTINUATION_START = /^(?:this|these|that|those|it|they|such|in particular|for (?:example|instance)|e\.g\.|i\.e\.|specifically|moreover|furthermore|also,|in addition|otherwise|as a result|for this reason|here|there)\b/i;

/** Sentence split for prose paragraphs (abbreviation-aware enough for letters). */
export function sentences(p) {
  const t = p.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out = []; let start = 0;
  const rx = /[.!?]["'”’)]?\s+(?=["'“‘(]?[A-Z0-9])/g;
  for (const m of t.matchAll(rx)) {
    if (/(?:\b(?:e\.g|i\.e|et al|cf|vs|Dr|Prof|Mr|Ms|Mrs|No|Fig|Figs|Eq|Eqs|Sec|Sect|pp?|approx|Vol|Tab)|\b[A-Z])$/.test(t.slice(0, m.index))) continue;
    out.push(t.slice(start, m.index + 1).trim()); start = m.index + m[0].length;
  }
  out.push(t.slice(start).trim());
  return out.filter(Boolean);
}

const actorOfReviewer = n => `reviewer-${n}`;
const prefixOf = actor => actor === "editor" ? "E" : actor === "associate-editor" ? "AE" : /^reviewer-(\d+)$/.test(actor) ? "R" + actor.split("-")[1] + "." : "Q";

function editorActor(word) { return /associate|handling|section|academic|guest|deputy|co-?editor/i.test(word) ? "associate-editor" : "editor"; }

/**
 * Split a letter. opts.actor: actor for text before any heading (default 'editor').
 * Returns [{ number, actor, text, kind: 'list'|'code'|'comment'|'prose', line }].
 */
export function splitLetter(letter, opts = {}) {
  const lines = String(letter || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  let actor = opts.actor || "editor";
  let reviewerSeq = 0, sub = null, closed = false;
  const items = [];
  let cur = null;           // open list item
  let para = [];            // prose lines waiting
  let lastWasBlank = false;
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(" ").trim(); para = [];
    if (!text) return;
    cur = null;
    proseRequests(text, actor, items);
  };
  const open = (number, kind, text, line, a = actor) => {
    flushPara();
    cur = { number, actor: a, text: (text || "").trim(), kind, line, sub };
    items.push(cur);
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flushPara(); lastWasBlank = true; continue; }
    const wasBlank = lastWasBlank; lastWasBlank = false;
    let m;
    if ((m = line.match(REV_COMMENT))) {
      closed = false; actor = actorOfReviewer(m[1]); reviewerSeq = Math.max(reviewerSeq, Number(m[1]));
      open(`R${m[1]}.${m[2]}`, "code", m[3], i); continue;
    }
    if (line.length <= 90 && (m = line.match(REVIEWER_H))) {
      flushPara(); cur = null; closed = false; sub = null;
      const n = m[1] ? (WORDNUM[m[1].toLowerCase()] || Number(m[1])) : ++reviewerSeq;
      reviewerSeq = Math.max(reviewerSeq, n); actor = actorOfReviewer(n);
      if (m[2] && m[2].trim()) para.push(m[2].trim());
      continue;
    }
    if (line.length <= 90 && (m = line.match(EDITOR_H)) && !/^\s*(?:the|an?|our)\s/i.test(line)) {
      flushPara(); cur = null; closed = false; sub = null;
      actor = editorActor(m[1]);
      if (m[2] && m[2].trim()) para.push(m[2].trim());
      continue;
    }
    if (closed) continue;                                  // signature block after a sign-off
    if (CLOSING.test(line) && line.length < 60) { flushPara(); cur = null; closed = true; continue; }
    if (GREETING.test(line) && line.length < 80) { flushPara(); cur = null; continue; }
    if ((m = line.match(SUBHEAD))) { flushPara(); cur = null; sub = (m[1] || m[2]).toLowerCase(); continue; }
    if ((m = line.match(CODE))) {
     
      if (m[2]) { actor = actorOfReviewer(m[2]); reviewerSeq = Math.max(reviewerSeq, Number(m[2])); open(`R${m[2]}.${m[3]}`, "code", m[6], i); }
      else { const ed = /^AE$/i.test(m[4]) || actor === "associate-editor" ? "associate-editor" : "editor"; actor = ed; open(`${ed === "editor" ? "E" : "AE"}${m[5]}`, "code", m[6], i); }
      continue;
    }
    if ((m = line.match(COMMENT))) { open(prefixOf(actor) + m[1], "comment", m[2] || "", i); continue; }
    if ((m = line.match(NUMBERED))) { open(prefixOf(actor) + (m[1] || m[2] || m[3]), "list", m[4], i); continue; }
    if ((m = line.match(BULLET))) { open(null, "bullet", m[1], i); continue; }
    if ((m = line.match(LETTERED))) {                       // sub-item of the open item, or a lettered list of its own
      if (cur && cur.kind !== "lettered") { cur.text += " " + line.trim(); continue; }
      open(null, "lettered", m[3], i); continue;
    }
    // plain text line
    if (cur && !wasBlank) { cur.text += (cur.text ? " " : "") + line.trim(); continue; }
    if (cur && !cur.text) { cur.text = line.trim(); continue; }
    if (cur && wasBlank && (/^\s{2,}/.test(raw) || /^[a-z(]/.test(line.trim()) || CONTINUATION_START.test(line.trim()))) { cur.text += " " + line.trim(); continue; }
    if (cur && wasBlank) cur = null;
    para.push(line.trim());
  }
  flushPara();
  return number(items.filter(it => it.text && it.text.replace(/\W/g, "").length >= 8));
}

function proseRequests(text, actor, items) {
  if (DECISION_LINE.test(text) && !CUE.test(text.replace(DECISION_LINE, ""))) return;
  let last = null;
  for (const s of sentences(text)) {
    if (CLOSING.test(s) || GREETING.test(s)) { last = null; continue; }
    const req = CUE.test(s) && !DECISION_LINE.test(s) && !ADMIN.test(s) && !NOT_REQUEST.test(s) && !/^\s*(?:decision|recommendation)\s*:/i.test(s);
    if (last && CONTINUATION_START.test(s) && !ADMIN.test(s)) { last.text += " " + s; continue; }
    if (!req) { last = null; continue; }
    last = { number: null, actor, text: s, kind: "prose" };
    items.push(last);
  }
}

/** Give every item a unique number: explicit numbers first, then the rest continue after the highest. */
function number(items) {
  const used = new Set();
  const maxOf = {};
  for (const it of items) {
    if (!it.number) continue;
    let n = it.number;
    if (used.has(n)) { const p = prefixOf(it.actor); const tail = n.slice(p.length); n = it.sub === "minor" && !used.has(`${p}m${tail}`) ? `${p}m${tail}` : n; }
    for (let k = 98; used.has(n); k++) n = `${it.number}${String.fromCharCode(k)}`;
    it.number = n; used.add(n);
    const p = prefixOf(it.actor); const tail = n.slice(p.length);
    if (/^\d+$/.test(tail)) maxOf[p] = Math.max(maxOf[p] || 0, Number(tail));
  }
  for (const it of items) {
    if (it.number) continue;
    const p = prefixOf(it.actor);
    let k = (maxOf[p] || 0) + 1;
    while (used.has(p + k)) k++;
    it.number = p + k; maxOf[p] = k; used.add(it.number);
  }
  return items.map(({ number, actor, text, kind }) => ({ number, actor, text: text.replace(/\s+/g, " ").trim(), kind }));
}

export default { splitLetter, sentences, SECTION11_MARKER };
