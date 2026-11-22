// Writes the synthetic library fixtures (no real data):
//   library-500.bib + library-500.expected.json  — 500 BibTeX entries of many types with accents, LaTeX escapes,
//                                                   special characters and DOIs, and the decoded values we expect.
//   library-dedupe.json                           — record pairs labelled duplicate / not duplicate.
// Run: node tests/fixtures/make-library-fixtures.js   (deterministic: seeded random numbers)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
let seed = 20261122; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];

// [bib form, decoded form]
const FAMILIES = [["Smith", "Smith"], ["Kov{\\'a}cs", "Kovács"], ["M{\\\"u}ller", "Müller"], ["Øster", "Øster"], ["{\\~N}{\\'u}{\\~n}ez", "Ñúñez"], ["O'Brien", "O'Brien"],
  ["Nagy", "Nagy"], ["Szab{\\'o}", "Szabó"], ["Wei{\\ss}", "Weiß"], ["Dvořák", "Dvořák"], ["Lee", "Lee"], ["Garc{\\'i}a", "García"], ["Zhang", "Zhang"], ["Çelik", "Çelik"],
  ["Al-Sayed", "Al-Sayed"], ["Fran{\\c{c}}ois", "François"], ["Kowalczyk", "Kowalczyk"], ["Jørgensen", "Jørgensen"], ["Brown", "Brown"], ["Tanaka", "Tanaka"]];
const GIVENS = [["John", "John"], ["P{\\'e}ter", "Péter"], ["Ana", "Ana"], ["J.", "J."], ["Mar{\\'i}a Jos{\\'e}", "María José"], ["Seán", "Seán"], ["Åse", "Åse"], ["Jean-Paul", "Jean-Paul"], ["Li", "Li"], ["K. M.", "K. M."]];
const WORDS = ["growth", "financial", "flexibility", "firms", "evidence", "service", "equipment", "investment", "survival", "credit", "constraints", "markets", "Europe", "SMEs", "capital", "risk", "panel", "data", "survey", "innovation"];
const SPECIAL = [["R\\&D", "R&D"], ["50\\%", "50%"], ["\\$1", "$1"], ["\\#2", "#2"], ["x\\_y", "x_y"], ["{GDP}", "GDP"], ["A--B", "A–B"], ["“quoted”", "“quoted”"], ["Ünïcode", "Ünïcode"], ["{\\\"o}konomie", "ökonomie"], ["a\\textasciitilde{}b", "a~b"], ["Café", "Café"], ["\\textbackslash{}", "\\"]];
const TYPES = [["article", "article-journal"], ["article", "article-journal"], ["article", "article-journal"], ["book", "book"], ["incollection", "chapter"], ["inproceedings", "paper-conference"],
  ["techreport", "report"], ["phdthesis", "thesis"], ["misc", "document"], ["unpublished", "manuscript"], ["online", "webpage"], ["dataset", "dataset"], ["software", "software"], ["inbook", "chapter"], ["mastersthesis", "thesis"]];
const JOURNALS = [["Journal of Finance", "Journal of Finance"], ["Small Business Economics", "Small Business Economics"], ["Journal of Business Venturing", "Journal of Business Venturing"], ["Revue d'{\\'E}conomie", "Revue d'Économie"], ["Strategic Management Journal", "Strategic Management Journal"]];

const bib = [], expected = [];
for (let i = 0; i < 500; i++) {
  const [bt, ct] = TYPES[i % TYPES.length];
  const nA = bt === "techreport" && i % 2 ? 0 : 1 + Math.floor(rnd() * 4);
  const authorsB = [], authorsE = [];
  for (let k = 0; k < nA; k++) { const f = pick(FAMILIES), g = pick(GIVENS); authorsB.push(`${f[0]}, ${g[0]}`); authorsE.push({ family: f[1], given: g[1] }); }
  if (i % 37 === 0) { authorsB.push("van der Berg, Anna"); authorsE.push({ family: "Berg", given: "Anna", "non-dropping-particle": "van der" }); }
  if (!nA) { authorsB.push("{World Bank}"); authorsE.push({ family: "World Bank" }); }
  const w = [pick(WORDS), pick(WORDS), pick(WORDS)]; const sp = pick(SPECIAL);
  const titleB = `${w[0][0].toUpperCase() + w[0].slice(1)} and ${w[1]} ${i}: ${sp[0]} ${w[2]}`;
  const titleE = `${w[0][0].toUpperCase() + w[0].slice(1)} and ${w[1]} ${i}: ${sp[1]} ${w[2]}`;
  const year = 1990 + Math.floor(rnd() * 36);
  const F = [["author", authorsB.join(" and ")], ["title", titleB], ["year", String(year)]];
  const E = { type: ct, title: titleE, author: authorsE, year };
  if (ct === "article-journal") { const j = pick(JOURNALS); F.push(["journal", j[0]], ["volume", String(1 + i % 60)], ["number", String(1 + i % 4)], ["pages", `${i + 1}--${i + 20}`]); Object.assign(E, { "container-title": j[1], volume: String(1 + i % 60), issue: String(1 + i % 4), page: `${i + 1}-${i + 20}` }); }
  if (ct === "chapter" || ct === "paper-conference") { F.push(["booktitle", "Handbook of {SME} Finance"], ["editor", "Ed, Eva and Kov{\\'a}cs, P."], ["pages", `${i}--${i + 9}`], ["publisher", "Springer"]); Object.assign(E, { "container-title": "Handbook of SME Finance", page: `${i}-${i + 9}`, publisher: "Springer" }); }
  if (ct === "book") { F.push(["publisher", "Routledge"], ["address", "London"], ["edition", String(1 + i % 3)]); Object.assign(E, { publisher: "Routledge", "publisher-place": "London", edition: String(1 + i % 3) }); }
  if (ct === "report") { F.push(["institution", "World Bank"], ["number", "WP " + i], ["type", "Policy Research Working Paper"]); Object.assign(E, { publisher: "World Bank", number: "WP " + i, genre: "Policy Research Working Paper" }); }
  if (ct === "thesis") { F.push(["school", "Sz{\\'e}chenyi Istv{\\'a}n University"]); Object.assign(E, { publisher: "Széchenyi István University" }); }
  if (ct === "dataset" || ct === "software") { F.push(["version", "1." + (i % 9)], ["publisher", "Zenodo"]); Object.assign(E, { version: "1." + (i % 9), publisher: "Zenodo" }); }
  if (i % 3 !== 2) { const d = i % 25 === 0 ? `10.1002/(SICI)1097-0266(1996)17:3<${i}::AID-SMJ>3.0.CO;2-K` : `10.${1000 + (i % 7)}/q8.${i}_x-${year}`; F.push(["doi", d]); E.DOI = d; }
  if (i % 5 === 0) { F.push(["url", `https://example.org/item?id=${i}&x=a_b%20c`]); E.URL = `https://example.org/item?id=${i}&x=a_b%20c`; }
  if (i % 4 === 0) { F.push(["abstract", "Abstract " + i + " with {\\'e}l{\\`e}ve, 10\\% and R\\&D."]); E.abstract = `Abstract ${i} with élève, 10% and R&D.`; }
  if (i % 6 === 0) { F.push(["keywords", "finance, growth"]); E.keyword = "finance,growth"; }
  if (i % 9 === 0) { F.push(["note", "Note: see p.~4"]); }
  if (i % 11 === 0) { F.push(["timestamp", "2026-01-0" + (1 + i % 9)], ["owner", "synthetic"]); E.custom_bibtex = { timestamp: "2026-01-0" + (1 + i % 9), owner: "synthetic" }; }
  const key = `item${String(i).padStart(3, "0")}`;
  bib.push(`@${bt}{${key},\n` + F.map(([k, v]) => `  ${k} = {${v}}`).join(",\n") + "\n}\n");
  expected.push({ key, ...E });
}
fs.writeFileSync(path.join(dir, "library-500.bib"), "% Synthetic test file for the Quartile Library (no real references).\n\n" + bib.join("\n"));
fs.writeFileSync(path.join(dir, "library-500.expected.json"), JSON.stringify(expected, null, 1));

// ---------- duplicate sets ----------
// library-dedupe.json was used while building the rules; library-dedupe-check.json (other seed, other titles, two
// more kinds of false pair) was made afterwards and not used for tuning.
const T1 = ["Financial flexibility and the growth of service firms", "Credit constraints and equipment investment in small firms", "Survival of equipment dependent studios in Europe",
  "Bank lending to SMEs after the financial crisis", "Leasing versus buying: evidence from European SMEs", "The economics of franchising in fitness services",
  "Working capital and firm performance in emerging markets", "Trade credit as a buffer in recessions", "Investment reversibility and exit decisions", "Cash holdings of private firms"];
function dedupeSet(T, extra) {
const pairs = [];
const typo = s => { const i = 5 + Math.floor(rnd() * (s.length - 10)); return s.slice(0, i) + s.slice(i + 1); };
let n = 0; const rec = (family, title, year, doi) => ({ id: "D" + String(n++).padStart(4, "0"), type: "article-journal", title, author: [{ family, given: "A." }], issued: { "date-parts": [[year]] }, ...(doi ? { DOI: doi } : {}) });
for (let k = 0; k < 60; k++) {
  const fam = pick(FAMILIES)[1], t = T[k % T.length] + (k >= 10 ? " " + pick(WORDS) : ""), y = 2000 + (k % 20);
  const a = rec(fam, t, y);
  const kind = k % 6;
  // true near-duplicates
  if (kind === 0) pairs.push({ a, b: rec(fam, typo(t), y), dup: true, why: "one-letter typo" });
  if (kind === 1) pairs.push({ a, b: rec(fam, t.toUpperCase() + ".", y + 1), dup: true, why: "case, punctuation, year + 1 (online vs print)" });
  if (kind === 2) pairs.push({ a, b: rec(fam, t.replace(/a/, "á").replace(/e/, "é"), y), dup: true, why: "diacritics" });
  if (kind === 3) pairs.push({ a: { ...a, DOI: "10.9999/dup." + k }, b: rec(fam, "Completely different title " + k, y + 5, "10.9999/DUP." + k), dup: true, why: "same DOI, different case" });
  // false near-duplicates
  if (kind === 4) pairs.push({ a: rec(fam, t + " part 1", y), b: rec(fam, t + " part 2", y), dup: false, why: "part 1 vs part 2" });
  if (kind === 5) pairs.push({ a, b: rec(fam, t, y + 3), dup: false, why: "same title, three years apart (new edition)" });
  // more false pairs on every k
  pairs.push({ a: rec(fam, t, y), b: rec(fam === "Smith" ? "Brown" : "Smith", t, y), dup: false, why: "same title and year, other first author" });
  if (k % 2) pairs.push({ a: rec(fam, t + " evidence from Hungary", y), b: rec(fam, t + " evidence from Poland", y), dup: false, why: "different country" });
  if (k % 3 === 0) pairs.push({ a: rec(fam, t, y, "10.9999/a." + k), b: rec(fam, t, y, "10.9999/b." + k), dup: false, why: "same title, two different DOIs (e.g. erratum)" });
  if (extra) {
    pairs.push({ a: rec(fam, t + " in banks", y), b: rec(fam, t + " in firms", y), dup: false, why: "one different final word" });
    pairs.push({ a: rec(fam, "A review of " + t.toLowerCase(), y), b: rec(fam, "A meta-analysis of " + t.toLowerCase(), y), dup: false, why: "review vs meta-analysis" });
    pairs.push({ a, b: rec(fam, t.replace(/ /, "  ").replace(/s\b/, ""), y), dup: true, why: "double space and a lost letter" });
  }
}
return pairs;
}
const pairs = dedupeSet(T1, false);
fs.writeFileSync(path.join(dir, "library-dedupe.json"), JSON.stringify({ note: "Synthetic. dup = true means the pair is the same work. Used while building the rules.", pairs }, null, 1));
seed = 777;
const T2 = ["Microfinance and household enterprise growth", "Venture capital and regional innovation", "Supplier finance in manufacturing supply chains", "Payment delays and SME liquidity",
  "Family ownership and investment cycles", "Public guarantees for bank loans", "Digital payments and small retailers", "Collateral requirements in transition economies"];
const check = dedupeSet(T2, true);
fs.writeFileSync(path.join(dir, "library-dedupe-check.json"), JSON.stringify({ note: "Synthetic check set, made after the rules were fixed; not used for tuning.", pairs: check }, null, 1));
console.log(`library-500.bib: ${bib.length} entries; library-dedupe.json: ${pairs.length} pairs (${pairs.filter(p => p.dup).length} true); library-dedupe-check.json: ${check.length} pairs (${check.filter(p => p.dup).length} true).`);
