// Builds the Phase 4 synthetic gold cases (tests/gold/cases/phase4-*.json): business and production issues with
// known positions, and clean controls. Run: node tests/gold/phase4-build.js. Texts are synthetic (no real data).
// Expected spans are the sentence or paragraph that contains `find`; an expectation without `find` has no span.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseText } from "../../core/text/parse.js";

const R = {
  beck: "Beck, T., & Demirguc-Kunt, A. (2006). Small and medium-size enterprises: Access to finance as a growth constraint. Journal of Banking & Finance, 30(11), 2931-2943. https://doi.org/10.1016/j.jbankfin.2006.05.009",
  myers: "Myers, S. C., & Majluf, N. S. (1984). Corporate financing and investment decisions when firms have information that investors do not have. Journal of Financial Economics, 13(2), 187-221. https://doi.org/10.1016/0304-405X(84)90023-0",
  kraus: "Kraus, A., & Litzenberger, R. H. (1973). A state-preference model of optimal financial leverage. Journal of Finance, 28(4), 911-922. https://doi.org/10.1111/j.1540-6261.1973.tb01415.x",
  barney: "Barney, J. (1991). Firm resources and sustained competitive advantage. Journal of Management, 17(1), 99-120. https://doi.org/10.1177/014920639101700108",
  henseler: "Henseler, J., Ringle, C. M., & Sarstedt, M. (2015). A new criterion for assessing discriminant validity in variance-based structural equation modeling. Journal of the Academy of Marketing Science, 43(1), 115-135. https://doi.org/10.1007/s11747-014-0403-8",
  podsakoff: "Podsakoff, P. M., MacKenzie, S. B., Lee, J.-Y., & Podsakoff, N. P. (2003). Common method biases in behavioral research: A critical review of the literature and recommended remedies. Journal of Applied Psychology, 88(5), 879-903. https://doi.org/10.1037/0021-9010.88.5.879",
  fornell: "Fornell, C., & Larcker, D. F. (1981). Evaluating structural equation models with unobservable variables and measurement error. Journal of Marketing Research, 18(1), 39-50. https://doi.org/10.1177/002224378101800104",
  teece: "Teece, D. J., Pisano, G., & Shuen, A. (1997). Dynamic capabilities and strategic management. Strategic Management Journal, 18(7), 509-533.",
  sanchez: "Sanchez, R. (1995). Strategic flexibility in product competition. Strategic Management Journal, 16(S1), 135-159.",
  bourgeois: "Bourgeois, L. J. (1981). On the measurement of organizational slack. Academy of Management Review, 6(1), 29-39.",
  pindyck: "Pindyck, R. S. (1991). Irreversibility, uncertainty, and investment. Journal of Economic Literature, 29(3), 1110-1148.",
  eisenhardt: "Eisenhardt, K. M. (1989). Building theories from case study research. Academy of Management Review, 14(4), 532-550.",
  petersen: "Petersen, M. A., & Rajan, R. G. (1994). The benefits of lending relationships: Evidence from small business data. Journal of Finance, 49(1), 3-37.",
  smithconf: "Smith, J. (2019). Cash and growth in service firms. Proceedings of the Annual Conference of the European Academy of Management, Lisbon.",
  kitchenham: "Kitchenham, B. (2004). Procedures for performing systematic reviews. Keele University Technical Report TR/SE-0401.",
  tranfield: "Tranfield, D., Denyer, D., & Smart, P. (2003). Towards a methodology for developing evidence-informed management knowledge by means of systematic review. British Journal of Management, 14(3), 207-222.",
};
const refs = (...k) => "References\n\n" + k.map(x => R[x]).join("\n\n");

export const CASES = [
  // ---------- clean controls ----------
  { id: "phase4-clean-regression", design: "regression", expected: [], text: `Cash holdings and sales growth in small service firms

Abstract

This study examines how cash holdings relate to sales growth in small and medium-sized enterprises (SMEs). Using fixed effects regressions on 412 firms from 2015 to 2022, we find that a one-standard-deviation rise in cash is associated with 3.1% higher sales growth. Leverage is not associated with growth.

1. Introduction

Small service firms often lack access to bank credit (Beck & Demirguc-Kunt, 2006). Small and medium-sized enterprises (SMEs) therefore rely on internal funds. Pecking order theory (Myers & Majluf, 1984) predicts that firms prefer internal funds to outside finance.

2. Theory and hypotheses

Under pecking order theory, internal cash lowers the cost of investment when outside finance is costly (Myers & Majluf, 1984). Firms with more cash can therefore expand when demand rises.

H1: Cash holdings are positively associated with sales growth.

Trade-off theory links debt to tax benefits and distress costs (Kraus & Litzenberger, 1973). High leverage may limit the funds available for expansion.

H2: Leverage is negatively associated with sales growth.

3. Data and methods

We use a panel of 412 firms observed from 2015 to 2022. Sales growth is the yearly change in log sales. We estimate fixed effects regressions with clustered standard errors. Return on assets (ROA) is a control.

4. Results

Table 1 reports the estimates. The coefficient on cash is 0.21 (p < 0.01), which equals 3.1% higher growth per standard deviation, so H1 is supported. The coefficient on leverage is small, and H2 is not supported. Figure 1 shows the growth paths by cash tercile.

Table 1. Fixed effects estimates of sales growth

| Variable | Coefficient | SE |
| Cash | 0.21 | 0.05 |
| Leverage | -0.03 | 0.04 |
| ROA | 0.11 | 0.06 |

Note: n = 412 firms, 2015-2022. Source: Orbis. ROA = return on assets.

Figure 1. Sales growth by cash tercile

5. Discussion

The findings are consistent with pecking order theory for service SMEs. Owners of small studios should hold a cash buffer before they plan expansion, and lenders could offer credit lines tied to cash flow.

The results may not generalise to large firms or to manufacturing, and the sample covers one country.

6. Conclusion

Cash holdings are associated with faster sales growth in service SMEs (3.1% per standard deviation).

${refs("beck", "kraus", "myers")}` },

  { id: "phase4-clean-survey", design: "survey", expected: [], text: `Dynamic capabilities and service innovation in small firms

Abstract

We survey 236 owners of small service firms. Capabilities are related to innovation (β = 0.34).

1. Introduction

Dynamic capabilities explain how firms renew their resources (Teece, Pisano, & Shuen, 1997). Firm resources are a source of advantage when they are hard to copy (Barney, 1991).

2. Theory and hypotheses

Following the dynamic capabilities view (Teece, Pisano, & Shuen, 1997), firms that sense and seize opportunities renew their services faster.

H1: Sensing capability is positively associated with service innovation.

3. Methods

The questionnaire was answered by 236 owners. Each construct was measured with four items on a seven-point Likert scale. Cronbach's alpha ranged from 0.81 to 0.90 and composite reliability from 0.84 to 0.92. The average variance extracted (AVE) ranged from 0.58 to 0.71. All heterotrait-monotrait ratios (HTMT) were below 0.85 (Henseler, Ringle, & Sarstedt, 2015), and AVE exceeded the squared correlations (Fornell & Larcker, 1981). Harman's single-factor test and a marker variable showed no common method variance (Podsakoff et al., 2003).

4. Results

Sensing is related to innovation (β = 0.34, p < 0.01), so H1 is supported.

5. Discussion

Managerial implications are direct. Owners could set a monthly review of customer requests to sense new service needs.

The findings may not apply to large firms, and the sample is limited to one country.

6. Conclusion

Sensing capability is related to service innovation (β = 0.34).

${refs("barney", "fornell", "henseler", "podsakoff", "teece")}` },

  { id: "phase4-clean-conceptual", design: "conceptual", expected: [], text: `Strategic flexibility and investment timing: a conceptual framework

Abstract

This conceptual paper develops propositions on how slack and asset redeployability shape the timing of equipment investment.

1. Introduction

Investment in equipment is partly irreversible (Pindyck, 1991). Strategic flexibility lets firms switch resources between uses (Sanchez, 1995).

2. Conceptual framework

Real options theory holds that irreversibility raises the value of waiting (Pindyck, 1991). Firms with slack can wait without losing their position (Bourgeois, 1981).

P1: Organizational slack delays irreversible equipment investment.

Redeployable assets lower the cost of a wrong decision, because the asset can be moved to another use (Sanchez, 1995).

P2: Asset redeployability weakens the delay predicted in P1.

3. Discussion

The framework applies only to firms whose main assets are specific equipment, and it may not hold for asset-light firms.

4. Conclusion

The propositions can be tested with panel data on equipment purchases.

${refs("bourgeois", "pindyck", "sanchez")}` },

  { id: "phase4-clean-qualitative", design: "qualitative", expected: [], text: `How studio owners decide to add new services

Abstract

We study eight studio owners through semi-structured interviews.

1. Introduction

The resource-based view explains growth from hard-to-copy resources (Barney, 1991). Case studies are suited to how and why questions (Eisenhardt, 1989).

2. Methods

We conducted semi-structured interviews with eight owners and used thematic analysis with two coders.

3. Findings

Owners added services when they had trained staff and spare floor space.

4. Discussion

Practical implications follow. Owners should test a new service with existing clients before buying equipment.

The findings are limited to small studios in one city and may not transfer to chains.

5. Conclusion

Spare capacity and trained staff came before every new service.

${refs("barney", "eisenhardt")}` },

  { id: "phase4-clean-slr", design: "slr", expected: [], text: `Financing of small service firms: a systematic literature review

Abstract

We review 64 studies on the financing of small service firms.

1. Introduction

Systematic reviews in management follow explicit protocols (Tranfield, Denyer, & Smart, 2003).

2. Methods

We followed the PRISMA 2020 statement and searched Scopus and Web of Science.

3. Results

Most studies use survey data from one country.

4. Discussion

The review covers English-language journal articles only, so its conclusions may not extend to other languages.

5. Conclusion

Evidence on service firms is thin.

${refs("tranfield")}` },

  // ---------- known issues ----------
  { id: "phase4-issues-regression-a", design: "regression",
    expected: [{ rule: "BUS-01" }, { rule: "BUS-02", find: "H2: Firm age" }, { rule: "BUS-02", find: "H3: Owner education" }, { rule: "BUS-03", find: "H3: Owner education" }, { rule: "BUS-05" }, { rule: "BUS-06" },
      { rule: "PRD-01", find: "4.7% faster growth" }, { rule: "PRD-02", find: "Table 2. Robustness" }, { rule: "PRD-03", find: "EBIT is used" }, { rule: "PRD-04", find: "(Petersen & Rajan, 1996)" }, { rule: "PRD-04", find: "(Gordon, 2010)" }],
    text: `Bank credit and growth in small firms

Abstract

Using 380 firms, we find that bank credit is associated with 4.7% faster growth.

1. Introduction

Small firms depend on bank credit (Beck & Demirguc-Kunt, 2006). Relationships with banks matter for small borrowers (Petersen & Rajan, 1996).

2. Hypotheses

Firms with a bank loan can fund new equipment earlier (Beck & Demirguc-Kunt, 2006).

H1: Bank credit is positively associated with sales growth.

Older firms may have fewer growth options left.

H2: Firm age is negatively associated with sales growth.

H3: Owner education is positively associated with sales growth.

3. Data and methods

We use a panel of 380 firms from 2016 to 2021 and fixed effects regressions. EBIT is used as a control. Earnings before interest and taxes (EBIT) are scaled by assets.

4. Results

Table 1 reports the main estimates. Bank credit raises growth by 3.9% (p < 0.05), so H1 is supported. Firm age has a negative coefficient, and H2 is supported. Older firms grew more slowly in the sample (Gordon, 2010).

Table 1. Main estimates

| Variable | Coefficient |
| Credit | 0.039 |
| Age | -0.012 |

Note: n = 380 firms, 2016-2021. Source: national business register.

Table 2. Robustness estimates

| Variable | Coefficient |
| Credit | 0.041 |

Note: n = 380 firms. Source: national business register.

5. Conclusion

Bank credit is associated with faster growth.

${refs("beck", "petersen")}` },

  { id: "phase4-issues-survey-b", design: "survey",
    expected: [{ rule: "BUS-04" }, { rule: "BUS-04", find: "alpha for trust was 0.62" }, { rule: "BUS-05", find: "Practical implications" }, { rule: "BUS-07", find: "412 firms" },
      { rule: "PRD-02", find: "Table 1:" }, { rule: "PRD-02", find: "Table 1:" }, { rule: "PRD-02", find: "Figure 2. Measurement" }, { rule: "PRD-03", find: "We surveyed owners on CRM" }, { rule: "PRD-04", find: "(Barney, 1992)" }],
    text: `Customer relationship tools and loyalty in small studios

Abstract

We surveyed owners on CRM use and loyalty. Use is related to loyalty (β = 0.29).

1. Introduction

The resource-based view (Barney, 1992) treats customer knowledge as a resource. Customer relationship management (CRM) tools store that knowledge.

2. Theory and hypotheses

Under the resource-based view, knowledge that rivals cannot copy supports loyalty (Barney, 1992).

H1: CRM use is positively associated with customer loyalty.

3. Methods

The questionnaire was sent to 380 owners. Each construct had five items on a Likert scale. Cronbach's alpha for trust was 0.62, and composite reliability was above 0.80. Figure 2 shows the measurement model and Figure 1 the research model.

Figure 2. Measurement model

Figure 1. Research model

4. Results

The final sample covers 412 firms. Table 1 reports the estimates. CRM use is related to loyalty (β = 0.29, p < 0.01), so H1 is supported.

Table 1:

| Path | Estimate |
| CRM to loyalty | 0.29 |

5. Discussion

Practical implications are important for small studios. The results matter for anyone who runs a studio.

The findings are limited to studios in one country.

6. Conclusion

CRM use is related to loyalty (β = 0.29).

${refs("barney")}` },

  { id: "phase4-issues-sem-c", design: "sem",
    expected: [{ rule: "BUS-01", find: "Social exchange theory explains" }, { rule: "BUS-04", find: "AVE for commitment was 0.44" }, { rule: "BUS-04", find: "HTMT ratio between trust and commitment was 0.93" },
      { rule: "PRD-02", find: "reported in Table 3" }, { rule: "PRD-03", find: "The AVE for commitment" }, { rule: "PRD-03", find: "The HTMT ratio" }, { rule: "PRD-03", find: "We use PLS-SEM" }, { rule: "PRD-02", find: "Table 3 gives the full model" }, { rule: "PRD-T-01", find: "table below" }, { rule: "PRD-T-05", find: "Hair et al, 2019" }, { rule: "BUS-T-01", find: "prove that" }, { rule: "PRD-04", find: "Placeholder, A. (2020)" }],
    text: `Trust and commitment in franchise networks

Abstract

We study 214 franchisees with structural equation modelling.

1. Introduction

Social exchange theory explains how trust builds commitment in franchise networks. Franchisees invest when they trust the franchisor.

2. Hypotheses

Trust lowers the perceived risk of investing in the network.

H1: Trust is positively associated with commitment.

Commitment leads franchisees to follow network rules.

H2: Trust is positively associated with rule compliance.

3. Methods

We use PLS-SEM with three-item scales (Hair et al, 2019). Composite reliability exceeded 0.80 and a marker variable test showed no common method variance. The AVE for commitment was 0.44. The HTMT ratio between trust and commitment was 0.93.

4. Results

The table below reports the paths. H1 is supported (β = 0.41). The path for H2 is reported in Table 3. Table 3 gives the full model, and Table 1 gives the measurement model.

Table 1. Measurement model

| Construct | CR |
| Trust | 0.86 |

Note: n = 214 franchisees. Source: own survey, 2024.

5. Discussion

The paths prove that trust builds commitment. Managerial implications: franchisors should share cost data with franchisees each quarter.

The model may not apply to networks outside retail services.

6. Conclusion

Trust builds commitment in franchise networks.

References

Placeholder, A. (2020). An unused reference kept for the reference list test. Journal of Retailing, 96(1), 1-10.` },

  { id: "phase4-issues-conceptual-d", design: "conceptual",
    expected: [{ rule: "BUS-02", find: "P2: Studios" }, { rule: "BUS-06" }, { rule: "BUS-T-04", find: "We test the propositions" }, { rule: "PRD-T-03", find: "This thesis" }, { rule: "PRD-03", find: "WB-EMS studios face" }],
    text: `Integration of new services in small studios

Abstract

This conceptual paper develops propositions on adding a new service to an existing studio.

1. Introduction

This thesis asks when studios add a new service line. Economies of scope arise when two services share inputs (Teece, Pisano, & Shuen, 1997).

2. Conceptual framework

Under economies of scope, shared staff and space lower the cost of a second service (Teece, Pisano, & Shuen, 1997).

P1: Shared inputs increase the likelihood of adding a new service.

WB-EMS studios face high equipment costs. Whole-body electromyostimulation (WB-EMS) needs trained staff.

P2: Studios with trained staff are more likely to add WB-EMS.

3. Discussion

We test the propositions with interview data from studio owners.

4. Conclusion

The framework explains service integration.

${refs("teece")}` },

  { id: "phase4-issues-regression-e", design: "regression",
    expected: [{ rule: "PRD-01", find: "418 firms" }, { rule: "BUS-T-02", find: "accept the null" }, { rule: "PRD-T-02", find: "[TODO]" }, { rule: "PRD-T-04", find: "table 1" }, { rule: "PRD-05", find: "Smith, J. (2019)" }, { rule: "BUS-T-03", find: "owners must" }],
    text: `Cash buffers and investment in service firms

Abstract

Using 418 firms, we find that cash buffers are associated with more investment.

1. Introduction

Pecking order theory predicts that firms use internal funds first (Myers & Majluf, 1984). Conference work reports a similar pattern (Smith, 2019).

2. Hypotheses

Internal funds avoid the costs of outside finance (Myers & Majluf, 1984).

H1: Cash buffers are positively associated with investment.

Debt may crowd out investment when lenders demand collateral (Kraus & Litzenberger, 1973).

H2: Leverage is negatively associated with investment.

3. Data and methods

We use 412 firms from 2017 to 2022 and fixed effects regressions [TODO].

4. Results

As shown in table 1, cash buffers have a positive coefficient, and H1 is supported. For leverage we accept the null hypothesis, so H2 is not supported.

Table 1. Investment estimates

| Variable | Coefficient |
| Cash | 0.18 |

Note: n = 412 firms, 2017-2022. Source: Orbis.

5. Discussion

Managerial implications are clear: owners must keep a cash buffer before they invest. Lenders could also review collateral rules.

The results may not generalise beyond service firms in Central Europe.

6. Conclusion

Cash buffers are associated with more investment.

${refs("kraus", "myers", "smithconf")}` },
];

// Held-out cases: written after the checks were frozen, run once, not used for tuning.
export const HELDOUT = [
  { id: "phase4-heldout-regression-clean", design: "regression", expected: [], text: `Trade credit and liquidity in small wholesalers

Abstract

We study 1,250 small wholesalers in Poland from 2012 to 2020. Firms that receive more trade credit hold 12% less cash.

1 Introduction

Trade credit is a major source of short-term finance for small firms (Petersen & Rajan, 1997). The precautionary motive for cash holdings (Opler et al., 1999) suggests that firms with access to supplier credit need smaller buffers.

2 Theory and hypotheses

Suppliers know their buyers well and can lend when banks cannot (Petersen & Rajan, 1997). A firm with supplier credit faces a lower risk of running out of cash.

Hypothesis 1: Trade credit received is negatively associated with cash holdings.

Bank relationships provide a second buffer (Petersen & Rajan, 1994). Firms with a long bank relationship may also need less cash.

Hypothesis 2: The length of the main bank relationship is negatively associated with cash holdings.

3 Data and methods

The panel covers 1,250 firms and 9,870 firm-years. We estimate fixed effects regressions with standard errors clustered by firm. Table 1 gives descriptive statistics and Table 2 the estimates.

Table 1. Descriptive statistics

| Variable | Mean | SD |
| Cash to assets | 0.14 | 0.09 |
| Trade credit to assets | 0.22 | 0.11 |

Note: n = 9,870 firm-years, 2012-2020. Source: Orbis.

4 Results

A one-standard-deviation rise in trade credit is associated with 12% less cash, so Hypothesis 1 is supported. The relationship length has no clear association with cash, and Hypothesis 2 is not supported.

Table 2. Fixed effects estimates of cash holdings

| Variable | Coefficient | SE |
| Trade credit | -0.16 | 0.03 |
| Relationship length | -0.01 | 0.02 |

Note: n = 9,870 firm-years from 1,250 firms, 2012-2020. Source: Orbis.

5 Discussion

Managerial implications follow from the first result. Owners who can negotiate longer supplier terms could release part of their cash buffer for investment.

The findings hold for wholesalers in one country and may not extend to retail or manufacturing firms.

6 Conclusion

Trade credit and cash are substitutes for small wholesalers (12% less cash).

References

Opler, T., Pinkowitz, L., Stulz, R., & Williamson, R. (1999). The determinants and implications of corporate cash holdings. Journal of Financial Economics, 52(1), 3-46.

Petersen, M. A., & Rajan, R. G. (1994). The benefits of lending relationships: Evidence from small business data. Journal of Finance, 49(1), 3-37.

Petersen, M. A., & Rajan, R. G. (1997). Trade credit: Theories and evidence. Review of Financial Studies, 10(3), 661-691.` },

  { id: "phase4-heldout-survey-issues", design: "survey",
    expected: [{ rule: "BUS-04" }, { rule: "BUS-04", find: "HTMT value between" }, { rule: "BUS-03", find: "Hypothesis 2: Owner" }, { rule: "BUS-06" }, { rule: "PRD-04", find: "(Ajzen, 1991)" }],
    text: `Owner attitudes and the adoption of booking software

Abstract

We survey 305 owners of small salons on booking software.

1. Introduction

The theory of planned behaviour (Ajzen, 1991) links attitudes to intentions. The technology acceptance model (Davis, 1989) adds perceived usefulness.

2. Theory and hypotheses

Perceived usefulness raises the intention to adopt new software (Davis, 1989).

Hypothesis 1: Perceived usefulness is positively associated with adoption intention.

Owners who feel in control of technology are more willing to try it (Ajzen, 1991).

Hypothesis 2: Owner self-efficacy is positively associated with adoption intention.

3. Methods

The questionnaire reached 305 owners. Constructs were measured with four items each on a five-point Likert scale. Cronbach's alpha ranged from 0.78 to 0.88, and the average variance extracted (AVE) ranged from 0.55 to 0.69. The heterotrait-monotrait ratio (HTMT) was used for discriminant validity. The HTMT value between usefulness and intention was 0.88.

4. Results

Usefulness is related to intention (β = 0.38), and Hypothesis 1 is supported. Hypothesis 2 is examined in the second model.

5. Discussion

Software vendors could offer a free trial month to owners who doubt the benefits.

6. Conclusion

Perceived usefulness matters for adoption.

References

Davis, F. D. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. MIS Quarterly, 13(3), 319-340.` },

  { id: "phase4-heldout-experiment-issues", design: "experiment",
    expected: [{ rule: "BUS-03", find: "H2: Showing" }, { rule: "PRD-02", find: "Figure 1. Experimental design" }, { rule: "PRD-01", find: "48%" }, { rule: "PRD-03", find: "The WTP was elicited" }, { rule: "PRD-T-05", find: "Thaler et al" }],
    text: `Price framing and membership choice in fitness studios

Abstract

In a randomised vignette experiment with 600 participants, a monthly price frame raised sign-up intentions to 48%.

1. Introduction

Prospect theory predicts that losses weigh more than gains (Kahneman & Tversky, 1979). Mental accounting suggests that people treat small monthly sums differently (Thaler et al, 1985).

2. Hypotheses

Monthly frames make the price look smaller in each mental account (Thaler, 1985).

H1: A monthly price frame increases sign-up intention.

Loss framing raises the weight of what is given up (Kahneman & Tversky, 1979).

H2: Showing the price as a loss reduces sign-up intention.

3. Methods

Participants were randomised to a treatment group or a control group. The WTP was elicited with a slider. Willingness to pay (WTP) was measured in euros.

4. Results

Sign-up intention was 44% under the monthly frame and 31% under the annual frame, so H1 is supported.

5. Discussion

Studio managers could show monthly prices on their price lists.

The results come from hypothetical choices and may not hold for real payments.

6. Conclusion

Monthly frames raise sign-up intentions.

Figure 1. Experimental design

References

Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.

Thaler, R. (1985). Mental accounting and consumer choice. Marketing Science, 4(3), 199-214.` },

  { id: "phase4-heldout-bounds-clean", design: "bounds", expected: [], text: `Bounds on the return to equipment investment in small studios

Abstract

We report partial identification bounds for 58 studios.

1. Introduction

Real options theory explains why owners delay investment under uncertainty (Dixit & Pindyck, 1994).

2. Methods

We use bounds analysis without assuming random assignment (Manski, 2003).

3. Results

The identified set for the return contains zero for every specification.

4. Discussion

Practical implications are modest. Owners could treat vendor return figures as one point in a wide range.

The bounds apply only to the 58 studios observed and should not be extrapolated to chains.

5. Conclusion

The data cannot sign the return to investment.

References

Dixit, A. K., & Pindyck, R. S. (1994). Investment under uncertainty. Princeton University Press.

Manski, C. F. (2003). Partial identification of probability distributions. Springer.` },
];

export function build(c) {
  const doc = parseText(c.text, { design: c.design });
  const expected = c.expected.map(e => {
    if (!e.find) return { rule: e.rule, note: "document-level" };
    const s = doc.sentences.find(x => x.text.includes(e.find)) || doc.paragraphs.find(p => p.text.includes(e.find));
    if (!s) throw new Error(`${c.id}: cannot find "${e.find}"`);
    return { rule: e.rule, section: s.section, start: s.start, end: s.end, note: e.find };
  });
  return { id: c.id, licence: "synthetic", design: c.design, text: c.text, expected, planted: false };
}

if (process.argv[1] && process.argv[1].endsWith("phase4-build.js")) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "cases");
  fs.mkdirSync(dir, { recursive: true });
  for (const c of [...CASES, ...HELDOUT]) fs.writeFileSync(path.join(dir, c.id + ".json"), JSON.stringify(build(c), null, 1) + "\n");
  console.log(`wrote ${CASES.length + HELDOUT.length} cases`);
}
export default { CASES, HELDOUT, build };
