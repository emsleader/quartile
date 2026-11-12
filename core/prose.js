// Prose lint and readability for academic business writing. Offline.
// Word lists come from reviewed open-source projects (proselint BSD-3-Clause; too-wordy, no-cliches, weasel-words MIT),
// pinned in data/prose-rules.json and credited in data/THIRD-PARTY.md. Matching code and replacements are Quartile's own.
const fs = require("fs"), path = require("path");
const L = require("./lib.js");
const NOISE = /^(it|there|this) (is|was|are|were)$/i;
let R = null;
function rules() { if (!R) { try { R = JSON.parse(fs.readFileSync(process.env.QUARTILE_PROSE_RULES || path.join(__dirname, "..", "data", "prose-rules.json"), "utf8")); } catch (e) { R = { redundancy: [], needless: [], wordy: [], cliches: [], weasel: [] }; } } return R; }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEVER = new Set(["adulterate", "cumulate"]); // valid words that the needless-variants list would wrongly change

function syllables(w) { w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, ""); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); }
function readability(t) {
  const S = t.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.split(/\s+/).length >= 3), W = t.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  if (!S.length || W.length < 50) return null;
  const syl = W.map(syllables), sy = syl.reduce((a, b) => a + b, 0), poly = syl.filter(n => n >= 3).length, wps = W.length / S.length, spw = sy / W.length;
  return { words: W.length, sentences: S.length, wordsPerSentence: +wps.toFixed(1),
    fleschReadingEase: +(206.835 - 1.015 * wps - 84.6 * spw).toFixed(1), fleschKincaidGrade: +(0.39 * wps + 11.8 * spw - 15.59).toFixed(1),
    gunningFog: +(0.4 * (wps + 100 * poly / W.length)).toFixed(1), longSentences: S.filter(s => s.split(/\s+/).length > 40).length,
    note: "Flesch reading ease 0-100 (higher is easier); Flesch-Kincaid grade and Gunning fog in school years. Published business and economics articles usually score 10-35 on Flesch and grade 14-18: use these to spot passages far harder than the rest of the paper, not as targets." };
}
function lint(text, { maxIssues = 400 } = {}) {
  const r = rules(), d = L.parse(text), issues = [], fixed = new Map();
  const paras = d.paras.filter(p => !p.isHeading && !p.isRef && !p.isTable && !["references", "declarations"].includes(d.roleOf(p.id)));
  const lists = [
    ["redundancy", r.redundancy.map(([a, b]) => [a, b]), "Redundant: '{b}' says the same."],
    ["wordy", r.wordy.filter(([a]) => !NOISE.test(a)), "Wordy phrase{rep}."],
    ["needless variant", r.needless.filter(([a]) => !NEVER.has(a)), "Needless variant: the usual form is '{b}'. Check the meaning before changing."],
    ["cliche", r.cliches.map(c => [c, null]), "Cliché: say it plainly."],
    ["intensifier", r.weasel.map(w => [w, null]), "Intensifier or weasel word: delete it or give the evidence."],
  ];
  const compiled = lists.map(([type, items, msg]) => ({ type, msg, items: items.map(([a, b]) => ({ a, b, re: new RegExp("(?<![\\p{L}-])" + esc(a) + "(?![\\p{L}-])", "giu") })) }));
  for (const p of paras) {
    const t = p.text, sents = t.split(/(?<=[.!?])\s+(?=[A-Z“"(])/);
    for (const { type, msg, items } of compiled) for (const it of items) { it.re.lastIndex = 0; let m;
      while ((m = it.re.exec(t)) && issues.length < maxIssues) {
        const s = sents.find(x => x.includes(m[0])) || t.slice(Math.max(0, m.index - 60), m.index + 60);
        if (type === "intensifier" && /\b(p|t|F|r)\s*[<=>]/.test(s)) continue; // "clearly" next to a statistic is usually a report, leave it
        const rep = it.b, issue = { type, quote: m[0], sentence: s.trim(), suggestion: rep, message: msg.replace("{b}", rep || "").replace("{rep}", rep === undefined || rep === null ? "" : rep === "" ? ": delete it" : `: use '${rep}'`) };
        issues.push(issue);
        if ((type === "redundancy" || type === "wordy") && rep !== null && rep !== undefined) {
          const cur = fixed.has(s.trim()) ? fixed.get(s.trim()) : s; if (!new RegExp(esc(m[0]), "i").test(cur)) continue;
          const ns = cur.replace(new RegExp(esc(m[0]) + (rep === "" ? "\\s*" : ""), "i"), (x) => rep === "" ? "" : (x[0] === x[0].toUpperCase() ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep)).replace(/^\s*([a-z])/, c => c.toUpperCase());
          if (ns !== cur && L.verify(s, ns).pass) fixed.set(s.trim(), ns.trim());
        }
      } }
    // repeated word ("the the"), a common typing slip (write-good's lexical illusions idea)
    t.replace(/\b(\p{L}+)\s+\1\b/giu, (m0, w) => { if (!/^(that|had|is|very)$/i.test(w)) issues.push({ type: "repeated word", quote: m0, sentence: (sents.find(x => x.includes(m0)) || "").trim(), suggestion: w, message: `Repeated word: '${m0}'.` }); return m0; });
  }
  const edits = [...fixed].map(([quote, replacement]) => ({ quote, replacement }));
  const byType = issues.reduce((a, i) => (a[i.type] = (a[i.type] || 0) + 1, a), {});
  return { kind: "prose", issues: issues.slice(0, maxIssues), count: issues.length, byType, replacements: edits, readability: readability(paras.map(p => p.text).join(" ")),
    sources: (r.sources || []).map(s => `${s.name} ${s.version || s.commit.slice(0, 7)} (${s.license})`),
    note: "Word lists from proselint (BSD-3-Clause) and the too-wordy, no-cliches and weasel-words packages (MIT), filtered for business research. Redundancy and wordy-phrase fixes are whole-sentence edits that already passed verify_rewrite; needless variants and clichés are flags only." };
}
module.exports = { lint, readability, syllables };
