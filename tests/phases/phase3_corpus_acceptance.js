// Phase 3 acceptance, synthetic and offline: 10 contribution claims, each with one known closest prior paper,
// placed in a temporary QUARTILE_CORPUS folder with 20 distractor papers on nearby topics. For each claim the
// default source (private corpus search) must put the known paper in the top 3. Run in its own process by
// tests/phases/phase3-eic.test.js (the corpus search keeps its index in memory). Prints one JSON line.
// The real acceptance test needs the owner's 10 papers with known closest prior work.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "q3corpus-"));
process.env.QUARTILE_CORPUS = dir;
fs.mkdirSync(path.join(dir, "finance"));

const FILLER = "Small and medium firms depend on external finance, and owners often face high costs when banks ask for collateral or personal guarantees. Many studies of firm finance use survey data, accounting records or bank data from several countries, and they report mixed results for growth and survival.";
// [key, title, topic sentences]  (each topic text is long enough to be indexed: 30+ words per paragraph)
const TARGETS = [
  ["cash", "Cash reserves and the opening speed of franchised fitness studios", "Franchisees who hold larger cash reserves open their fitness studios sooner after they sign the franchise agreement. The delay between signing and opening is shorter when the franchisee can pay for equipment and the lease from its own cash instead of waiting for a bank loan."],
  ["trade", "Supplier trade credit for restaurants during the energy price shock", "Restaurants that received longer supplier payment terms during the energy price shock kept more staff and closed less often. Trade credit from food suppliers acted as a short-term buffer when gas and electricity bills rose sharply for restaurant owners."],
  ["lease", "Leasing versus buying equipment and investment reversibility in service firms", "Service firms that lease their equipment instead of buying it can reverse the investment more easily when demand falls. Leasing lowers the sunk cost of equipment and makes exit cheaper, so investment reversibility is higher for leased machines than for owned machines."],
  ["relationship", "Bank relationship length and collateral requirements for Hungarian micro firms", "Hungarian micro firms with longer bank relationships are asked for less collateral when they apply for a loan. Each additional year of the relationship lowers the collateral requirement because the bank learns about the owner and the firm over time."],
  ["crowd", "Founder social media followers and crowdfunding campaign success", "Founders with more social media followers reach their crowdfunding goal more often and faster. The follower count of the founder predicts the number of early backers, and early backers signal campaign quality to later backers on the crowdfunding platform."],
  ["esg", "ESG disclosure and the cost of debt in private family firms", "Private family firms that publish voluntary ESG disclosure pay lower interest rates on their bank debt. Lenders read sustainability reports as a signal of lower risk, so the cost of debt falls after a family firm starts ESG disclosure."],
  ["hotel", "Working capital and hotel survival after pandemic lockdowns", "Hotels with more working capital before the pandemic lockdowns were more likely to survive the closures. A larger working capital cushion let hotel owners pay fixed costs during months without guests and reopen after the lockdowns ended."],
  ["venture", "Venture debt and founder dilution in technology startups", "Technology startups that raise venture debt between equity rounds give away less ownership, so founder dilution is lower. Venture debt extends the cash runway and lets the startup reach the next equity round at a higher valuation."],
  ["guarantee", "Government loan guarantees and innovation spending of small firms", "Small firms that obtain a government loan guarantee raise their innovation spending in the following years. The public guarantee reduces the collateral the bank asks for and frees internal funds for research and product development."],
  ["factoring", "Invoice factoring and export growth of textile manufacturers", "Textile manufacturers that use invoice factoring grow their exports faster than similar manufacturers that do not. Selling export invoices to a factor turns slow foreign receivables into cash and lets the manufacturer accept larger foreign orders."],
];
const DISTRACTORS = [
  ["Franchise royalty fees and brand growth", "Franchise systems with lower royalty fees add new franchisees faster, and brand growth depends on how franchisors set the initial fee and the royalty rate for each new studio or outlet in the network."],
  ["Menu pricing in restaurants under inflation", "Restaurants raise menu prices in small steps during inflation, and owners fear losing guests when prices rise, so menu pricing follows food costs with a delay of several months in most restaurant markets."],
  ["Equipment maintenance costs in hospitals", "Hospitals with older equipment pay higher maintenance costs, and the decision to replace a machine depends on the repair history, the budget cycle and the price of new equipment from suppliers."],
  ["Bank branch closures and local lending", "Bank branch closures reduce local lending to small firms, because loan officers lose soft information about owners when a branch in the town closes and decisions move to a regional office."],
  ["Social media marketing in small retail shops", "Small retail shops that post on social media every week report more visitors, but the effect on sales is small and depends on the type of product and the age of the customers who follow the shop."],
  ["ESG ratings and stock returns of listed firms", "Listed firms with higher ESG ratings earn similar stock returns to firms with lower ratings, and rating agencies disagree about many firms, which makes ESG ratings a noisy signal for investors."],
  ["Hotel room pricing and online travel agencies", "Hotels that sell rooms through online travel agencies set lower direct prices to win guests back, and room pricing changes with the commission that each agency charges the hotel owner."],
  ["Venture capital exits and acquisition markets", "Venture capital funds exit most investments through acquisitions rather than public listings, and exit timing follows the acquisition market and the age of the fund rather than the startup's own growth."],
  ["Tax credits for research in small firms", "Research tax credits raise reported research spending in small firms, but part of the increase comes from relabelling existing costs, and the effect on new products is hard to measure."],
  ["Textile supply chains and buyer audits", "Textile supply chains with frequent buyer audits show fewer safety problems, and factories that pass audits receive repeat orders from large brands in Europe and North America."],
  ["Gym membership pricing and customer churn", "Gyms that offer monthly memberships lose more customers than gyms with annual contracts, and customer churn rises after the new year when many new members stop training."],
  ["Energy efficiency investment in hotels", "Hotels that invest in energy efficiency cut their electricity use, and the payback period depends on the price of energy and the age of the building and its heating system."],
  ["Collateral law reform and lending in Eastern Europe", "Collateral law reforms in Eastern Europe made movable assets usable as collateral, and lending to firms with machines and inventory rose after the reforms took effect in several countries."],
  ["Crowdfunding platforms and project categories", "Crowdfunding platforms host projects in many categories, and success rates differ between games, design, music and film projects, with technology projects asking for the largest amounts."],
  ["Family firm succession and investment", "Family firms reduce investment in the years before succession, and the next generation often changes strategy after it takes control of the firm and its board."],
  ["Pandemic support loans and firm survival", "Pandemic support loans kept many small firms alive during the lockdowns, but some of these firms were weak before the crisis and closed when the support ended."],
  ["Startup valuation and equity round size", "Startups that raise larger equity rounds receive higher valuations, and investors compete for startups with strong revenue growth and experienced founders in the technology sector."],
  ["Public procurement and small firm growth", "Small firms that win public procurement contracts grow faster in the following years, because public buyers pay on time and the contracts give the firm a stable base of sales."],
  ["Export credit insurance and foreign sales", "Firms with export credit insurance accept orders from riskier foreign buyers, and foreign sales rise when the insurer covers payment risk for new export markets."],
  ["Equipment rental markets and construction firms", "Construction firms rent heavy equipment for short projects and buy it for long ones, and rental markets grow when project demand is uncertain and interest rates are high."],
];
const paper = (title, topic) => `# Abstract\n\n${topic} ${FILLER}\n\n# 1. Introduction\n\n${FILLER} ${FILLER}\n\n${topic}\n\n# 2. Data and methods\n\nWe use a sample of firms observed over several years and estimate the association with standard methods used in firm finance. ${FILLER}\n\n# 3. Results\n\n${topic} The results hold in several robustness checks that change the sample and the controls.\n\n# 4. Conclusion\n\n${FILLER} Further research can test these links in other countries and sectors.\n\n# References\n\nSmith, J. (2019). Credit. Journal of Finance, 1, 1-2.\n`;

const papers = [];
TARGETS.forEach(([k, title, topic], i) => { const file = `finance/target_${k}.md`; fs.writeFileSync(path.join(dir, file), paper(title, topic)); papers.push({ file, title, doi: `10.9999/synthetic.target.${i + 1}`, year: 2020 + (i % 5), journal: "Synthetic Journal", field: "finance", license: "synthetic" }); });
DISTRACTORS.forEach(([title, topic], i) => { const file = `finance/distractor_${i + 1}.md`; fs.writeFileSync(path.join(dir, file), paper(title, topic)); papers.push({ file, title, doi: `10.9999/synthetic.distractor.${i + 1}`, year: 2021, journal: "Synthetic Journal", field: "finance", license: "synthetic" }); });
fs.writeFileSync(path.join(dir, "corpus-index.json"), JSON.stringify({ papers }));

// manuscript claims: paraphrases, not copies, of each target's finding
const CLAIMS = [
  "We contribute by showing that franchisees with more cash on hand open their studio faster after signing the agreement.",
  "Our contribution is to show that longer payment terms from food suppliers helped restaurants survive the rise in energy bills.",
  "This paper contributes evidence that leased equipment makes investment easier to reverse than owned equipment in service firms.",
  "Unlike prior studies, we show that a longer relationship with the bank lowers the collateral that micro firms must pledge for a loan.",
  "We contribute by showing that the founder's follower count on social media predicts early backers and crowdfunding success.",
  "To our knowledge, we are the first to show that voluntary sustainability disclosure lowers the interest rate that family firms pay on bank debt.",
  "This study contributes by showing that hotels with a larger working capital cushion survived the lockdowns more often.",
  "Our contribution is evidence that venture debt between equity rounds reduces founder dilution in startups.",
  "We contribute by showing that a public loan guarantee frees internal funds that small firms spend on innovation and product development.",
  "This paper extends the literature by showing that selling export invoices to a factor speeds export growth for textile firms.",
];

const { parseText } = await import("../../core/text/parse.js");
const { contributionTest } = await import("../../core/roles/eic.js");
const rows = [];
for (let i = 0; i < CLAIMS.length; i++) {
  const doc = parseText(`Abstract\n\nWe study firm finance in a synthetic sample.\n\n1. Introduction\n\n${CLAIMS[i]}\n\n2. Methods\n\nWe use a panel.\n`);
  const ct = await contributionTest(doc, {});
  const f = ct.findings[0];
  const top3 = (f?.detail.closest || []).map(c => c.title);
  rows.push({ claim: i + 1, expected: TARGETS[i][1], top3, hit: top3.includes(TARGETS[i][1]), rank: top3.indexOf(TARGETS[i][1]) + 1 || null, top_score: f?.detail.closest[0]?.score ?? null, severity: f?.severity, searched: f?.detail.searched });
}
fs.rmSync(dir, { recursive: true, force: true });
const hits = rows.filter(r => r.hit).length;
console.log(JSON.stringify({ n: rows.length, hits, hit_rate: hits / rows.length, corpus_papers: papers.length, rows }));
