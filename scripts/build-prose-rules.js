#!/usr/bin/env node
// Builds data/prose-rules.json from reviewed, pinned open-source word lists (see data/THIRD-PARTY.md).
//   git clone https://github.com/amperser/proselint  (commit dbed789caae662d06c7c8a5a13dd31f1acd36f5c, BSD-3-Clause)
//   npm pack too-wordy@0.3.1 no-cliches@0.3.0 weasel-words@0.1.1  (MIT)
//   node scripts/build-prose-rules.js <proselint dir> <too-wordy dir> <no-cliches dir>
// Only word lists are taken, no code. Lists are filtered for academic business writing.
const fs = require("fs"), path = require("path");
const [PL, TW, NC] = process.argv.slice(2);
if (!NC) { console.error("usage: node scripts/build-prose-rules.js <proselint> <too-wordy> <no-cliches>"); process.exit(1); }
const pairs = f => fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map(l => l.split(",")).filter(p => p.length === 2 && p[0] && p[1]).map(([a, b]) => [a.trim(), b.trim()]);
const arr = (file, name) => eval(fs.readFileSync(file, "utf8").match(new RegExp((name ? name : "") + "[^=]*=\\s*(\\[[\\s\\S]*?\\]);"))[1]);
const C = path.join(PL, "proselint", "checks");

// redundancy (Garner via proselint): "adequate enough" -> "adequate"
const redundancy = pairs(path.join(C, "redundancy", "garner"));
// needless variants (proselint): "abolishment" -> "abolition"; drop pairs where both are standard in business writing
const KEEP_VARIANT = new Set(["optimization", "utilization", "prioritization", "monetization", "methodology"]);
const needless = pairs(path.join(C, "needless-variants")).filter(([a]) => !KEEP_VARIANT.has(a.toLowerCase()) && a.length > 4);
// wordy phrases (too-wordy): multi-word phrases only; Quartile's own concise replacements where one is safe
const REPL = { "a number of": "several", "at the present time": "now", "at this time": "now", "because of the fact that": "because", "by means of": "by", "by virtue of the fact that": "because", "close proximity": "proximity", "due to the fact that": "because", "during the course of": "during", "each and every": "each", "first and foremost": "first", "for the purpose of": "to", "for the duration of": "during", "have a tendency to": "tend to", "in an effort to": "to", "in excess of": "more than", "in light of the fact that": "because", "in order to": "to", "in regard to": "about", "in the event that": "if", "in the course of": "during", "in the near future": "soon", "is able to": "can", "are able to": "can", "on a daily basis": "daily", "owing to the fact that": "because", "prior to": "before", "subsequent to": "after", "with regard to": "about", "with respect to": "about", "in spite of the fact that": "although", "the majority of": "most", "until such time as": "until", "it is important to note that": "", "it should be noted that": "", "as a matter of fact": "in fact", "a large number of": "many", "at all times": "always", "make a decision": "decide", "give consideration to": "consider", "has the ability to": "can", "in close proximity to": "near" };
const KEEP_WORDY = new Set(["in terms of", "in accordance with", "comply with", "benefit from", "attributable to", "in addition", "in the case of"]); // standard in business and legal prose
const wordy = arr(path.join(TW, "too-wordy.js"), "wordyWords").filter(x => x.split(" ").length >= 2 && !KEEP_WORDY.has(x) && !/^(it|there|this) (is|was|are|were)$/i.test(x));
Object.keys(REPL).forEach(k => { if (!wordy.includes(k)) wordy.push(k); });
const cliches = arr(path.join(NC, "cliches.js"), "cliches").filter(x => x.split(" ").length >= 2);
// intensifiers and weasel words for academic prose (subset of weasel-words; "significantly", "many", "several", "few" are excluded because they are normal in statistics and business writing)
const weasel = ["very", "quite", "extremely", "exceedingly", "remarkably", "clearly", "obviously", "surprisingly", "huge", "vast", "tiny", "fairly", "really", "truly", "literally", "basically", "essentially", "undoubtedly", "of course", "needless to say"];
const out = { version: 1, built: new Date().toISOString().slice(0, 10),
  sources: [{ name: "proselint", url: "https://github.com/amperser/proselint", commit: "dbed789caae662d06c7c8a5a13dd31f1acd36f5c", license: "BSD-3-Clause", lists: ["redundancy (Garner)", "needless variants"] },
    { name: "too-wordy", url: "https://www.npmjs.com/package/too-wordy", version: "0.3.1", license: "MIT", lists: ["wordy phrases"] },
    { name: "no-cliches", url: "https://www.npmjs.com/package/no-cliches", version: "0.3.0", license: "MIT", lists: ["cliches"] },
    { name: "weasel-words", url: "https://www.npmjs.com/package/weasel-words", version: "0.1.1", license: "MIT", lists: ["intensifiers (subset)"] }],
  redundancy, needless, wordy: wordy.map(p => [p, REPL[p] !== undefined ? REPL[p] : null]), cliches, weasel };
fs.writeFileSync(path.join(__dirname, "..", "data", "prose-rules.json"), JSON.stringify(out));
console.log({ redundancy: redundancy.length, needless: needless.length, wordy: wordy.length, cliches: cliches.length, weasel: weasel.length });
