"use strict";
// Quartile 0.16.x: FER case-specific, deterministic equation catalogue and aggregate evidence audit.
// Never uploads, stores, or processes identifiable WBES microdata. No R execution occurs here.
const FORMULAE = Object.freeze([
  {id:"FER01",name:"Weighted wave purchase share",latex:String.raw`\hat P_t=\frac{\sum_{i\in S_t}w_{it}Y_{it}}{\sum_{i\in S_t}w_{it}}`,source:"WBES wave weights",assumptions:["Each wave uses its own eligibility rules and survey weights","Y is binary fixed-asset purchase incidence, not amount or capital stock"],test:"rate in [0,1]; positive denominator and exact weighted numerator"},
  {id:"FER02",name:"Repeated cross-section change",latex:String.raw`\widehat\Delta_{CS}=\hat P_{2023}-\hat P_{2019}`,source:"Two independently weighted survey waves",assumptions:["Survey years are not automatically investment fiscal years"],test:"2023 rate minus 2019 rate"},
  {id:"FER03",name:"Matched-establishment change",latex:String.raw`\widehat\Delta_M=\frac{1}{|M|}\sum_{i\in M}(Y_{i,2023}-Y_{i,2019})`,source:"Baseline-eligible re-interviewed establishments (n=244)",assumptions:["Matched definition uses baseline 2019 size 5–99, not 2023 own-wave eligibility","Matched observations are paired"] ,test:"transition discordance c−b divided by n"},
  {id:"FER04",name:"Contrast between estimands",latex:String.raw`\hat G=\widehat\Delta_{CS}-\widehat\Delta_M`,source:"Wave and matched estimands",assumptions:["The contrast does not by itself identify selection bias or a monetary-policy effect"],test:"cross-sectional change minus matched change"},
  {id:"FER05",name:"Exact symmetric survey-composition decomposition",latex:String.raw`\hat P_t=s_t p_t+(1-s_t)q_t;\quad\Delta P=\bar s\Delta p+\bar p\Delta s+[(1-s_1)q_1-(1-s_0)q_0]`,source:"240 own-wave-eligible continuing establishments, wave-only firms, and survey weights",assumptions:["Components sum BEFORE rounding","Entry/exit means survey sample turnover, not actual firm openings/closures"],test:"within + weight-share + net sample turnover equals wave change"},
  {id:"FER06",name:"Entrant-versus-leaver weighted LPM",latex:String.raw`Y_i=\alpha+\beta E_i+\gamma'X_i+\epsilon_i`,source:"840 wave-only firms; survey weights",assumptions:["X includes size, sector, log(age), foreign ownership","Entrant indicator is perfectly linked with 2023 vs 2019; beta is not a treatment effect","Report HC1 standard errors"],test:"robust SE positive; coefficient and p-value statistically compatible"},
  {id:"FER07",name:"Baseline re-interview probability",latex:String.raw`\Pr(R_i=1\mid X_{i,2019})=\operatorname{logit}^{-1}(\alpha+\theta Y_{i,2019}+\delta'X_{i,2019})`,source:"Baseline 2019 n=656, 244 re-interviews",assumptions:["Baseline purchasing, sector, size, log age, foreign ownership, region covariates","Model estimates conditional association, not the cause of attrition"],test:"odds ratio = exp(logit coefficient), confidence interval uses its SE"},
  {id:"FER08",name:"Inverse-probability re-interview adjusted change",latex:String.raw`\widehat\Delta_{IPW}=\frac{\sum_{i\in M}(Y_{i1}-Y_{i0})/\hat\pi_i}{\sum_{i\in M}1/\hat\pi_i}`,source:"Matched re-interviewed establishments and estimated baseline propensities",assumptions:["Missing at random conditional on specified 2019 observables","Positivity and stable weights","Do not reinterpret as an MNAR correction"],test:"propensity in (0,1), effective sample <= observed n, covariate balance reported"},
  {id:"FER09",name:"Exact paired McNemar",latex:String.raw`p_{exact}=\min\{1,\,2\Pr[\operatorname{Binomial}(b+c,0.5)\leq\min(b,c)]\}`,source:"Paired 2x2 table: only 2019=b; only 2023=c",assumptions:["Discordant pairs, exact two-sided binomial calculation"],test:"recompute p from transition counts"},
  {id:"FER10",name:"Effective sample size",latex:String.raw`n_{eff}=\frac{(\sum_i u_i)^2}{\sum_i u_i^2}`,source:"Positive IPW weights of matched observations",assumptions:["Effective n does not establish representativeness"],test:"0 < n_eff <= number of included matched firms"},
  {id:"FER11",name:"Joint stratified firm bootstrap and uncertainty",latex:String.raw`CI_{95\%}(\hat\theta)=[Q_{.025}(\hat\theta^{*}),Q_{.975}(\hat\theta^{*})]`,source:"Resample firms in original strata; keep paired observations together",assumptions:["Refit re-interview Logit within each bootstrap replication when evaluating IPW","Record seed, software/RNG, valid draws, and failed fits","Python and R seeds are not interchangeable"],test:"interval endpoints finite and ordered; draw failures recorded"},
  {id:"FER12",name:"Financing-source conditional shares",latex:String.raw`\widehat F_{t,k}=\frac{\sum_i w_{it}I(Y_{it}=1,\,F_{it,k}=1)}{\sum_i w_{it}I(Y_{it}=1)}`,source:"Purchasing firms only",assumptions:["Do not conflate financing composition with credit demand, availability or policy impact"],test:"conditional denominator positive; report purchasing base n"}
]);
const EPS = 1e-8;
const finite = n => typeof n === "number" && Number.isFinite(n);
const near = (a,b,tol=EPS)=>finite(a)&&finite(b)&&Math.abs(a-b)<=tol;
const status = (id,pass,reason,actual,expected,critical=true)=>({id,status:pass?"pass":"fail",critical,reason,actual,expected});
function exactMcNemar(b,c){
  if(!Number.isInteger(b)||!Number.isInteger(c)||b<0||c<0) return NaN;
  const n=b+c;if(n===0)return 1; const k=Math.min(b,c);
  let logComb=0,p=0;
  for(let j=0;j<=k;j++) {if(j>0)logComb+=Math.log(n-j+1)-Math.log(j);p+=Math.exp(logComb-n*Math.LN2)}
  return Math.min(1,2*p);
}
function checkCI(interval){return Array.isArray(interval)&&interval.length===2&&interval.every(finite)&&interval[0]<=interval[1]}
function approxNormalP(z){
  const x=Math.abs(z), t=1/(1+0.2316419*x), phi=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);
  return Math.min(1,Math.max(0,2*phi*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))))));
}
// Input is a sanitised aggregate JSON report; NEVER raw firm-level observations.
function audit(rep){
  if(!rep||typeof rep!=="object"||Array.isArray(rep))throw new Error("Expected aggregate report object");
  const pts=rep.point_estimates||{},s=rep.samples||{},dg=rep.regression_diagnostics||{},bt=rep.independent_bootstrap_CI95||{},src=rep.source_dataset||{};
  const checks=[];
  const push=(id,condition,reason,actual,expected,critical=true)=>checks.push(status(id,condition,reason,actual,expected,critical));
  push("SOURCE_FORMAT",src.n_rows===2237&&src.n_variables===811&&/^[a-f\d]{64}$/.test(src.sha256||""),"Recorded four-wave panel dimensions and SHA-256 format",[src.n_rows,src.n_variables],"[2237,811], 64-digit hash");
  push("SAMPLE_COUNTS",s.eligible_2019===656&&s.eligible_2023===664&&s.reinterviewed_2019_baseline===244&&s.continuers_own_wave===240,"Analytical sample roles do not mix eligibility definitions",[s.eligible_2019,s.eligible_2023,s.reinterviewed_2019_baseline,s.continuers_own_wave],[656,664,244,240]);
  const dCS=pts.weighted_2023_purchase_pct-pts.weighted_2019_purchase_pct;
  push("WAVE_CHANGE",near(dCS,pts.cross_section_change_pp,1e-5),"Weighted wave change reconciles",dCS,pts.cross_section_change_pp);
  const gap=pts.cross_section_change_pp-pts.matched_change_pp;
  push("ESTIMAND_GAP",near(gap,pts.gap_pp,1e-5),"Gap of two estimands reconciles",gap,pts.gap_pp);
  const decom=pts.within_symmetric_pp+pts.continuing_weight_pp+pts.net_sample_turnover_pp;
  push("DECOMPOSITION_IDENTITY",near(decom,pts.cross_section_change_pp,1e-4),"All decomposition components close before rounding",decom,pts.cross_section_change_pp);
  const n=s.reinterviewed_2019_baseline,trs=rep.transition_counts||{};
  const transSum=Object.values(trs).every(v=>Number.isInteger(v)&&v>=0)?Object.values(trs).reduce((a,b)=>a+b,0):NaN;
  push("PAIRED_COUNTS",transSum===n,"2x2 matched transition counts sum to n",transSum,n);
  const match=100*(trs.only_2023-trs.only_2019)/n;
  push("MATCHED_CHANGE",near(match,pts.matched_change_pp,1e-5),"Matched difference matches paired discordances",match,pts.matched_change_pp);
  const mc=exactMcNemar(trs.only_2019,trs.only_2023);
  push("MCNEMAR_EXACT",near(mc,pts.mcnemar_exact_p,1e-8),"Two-sided exact McNemar p-value",mc,pts.mcnemar_exact_p);
  const or=Math.exp(dg.logit_purchase_coefficient);
  push("LOGIT_OR",near(or,dg.logit_purchase_OR,1e-5),"OR=exp(beta) for baseline purchasing",or,dg.logit_purchase_OR);
  const wald=[Math.exp(dg.logit_purchase_coefficient-1.96*dg.logit_purchase_model_SE),Math.exp(dg.logit_purchase_coefficient+1.96*dg.logit_purchase_model_SE)];
  push("LOGIT_OR_WALD95",checkCI(dg.logit_purchase_OR_CI95)&&wald.every((v,i)=>near(v,dg.logit_purchase_OR_CI95[i],0.0002)),"OR 95% Wald CI recomputed from beta and SE",wald,dg.logit_purchase_OR_CI95);
  const logitP=approxNormalP(dg.logit_purchase_coefficient/dg.logit_purchase_model_SE);
  push("LOGIT_P",near(logitP,dg.logit_purchase_p,1e-4),"Two-sided approximate normal p matches logit beta/SE",logitP,dg.logit_purchase_p);
  push("PROPENSITY_OVERLAP",finite(dg.propensity_min)&&dg.propensity_min>0&&dg.propensity_min<dg.propensity_max&&dg.propensity_max<1,"Positivity in observed fitted propensity distribution",[dg.propensity_min,dg.propensity_max],"0<min<max<1");
  push("IPW_ESS",finite(dg.IPW_effective_N)&&dg.IPW_effective_N>0&&dg.IPW_effective_N<=n,"Positive effective N <= matched count",dg.IPW_effective_N,`0<N<=${n}`);
  push("IPW_BALANCE",finite(dg.maximum_absolute_balance_SMD_after)&&dg.maximum_absolute_balance_SMD_after>=0&&dg.maximum_absolute_balance_SMD_after<0.1,"Measured covariate balance under 0.10 SMD (not an MNAR test)",dg.maximum_absolute_balance_SMD_after,"< 0.10",false);
  push("LPM_HC1",finite(dg.lpm_grp_HC1_SE_pp)&&dg.lpm_grp_HC1_SE_pp>0&&finite(pts.adjusted_entrant_leaver_LPM_pp)&&Math.abs(approxNormalP(pts.adjusted_entrant_leaver_LPM_pp/dg.lpm_grp_HC1_SE_pp)-dg.lpm_grp_HC1_p)<0.00015,"HC1 coefficient/SE and reported p-value compatible (normal approximation)",approxNormalP(pts.adjusted_entrant_leaver_LPM_pp/dg.lpm_grp_HC1_SE_pp),dg.lpm_grp_HC1_p);
  for(const [key,b] of Object.entries(bt)){
    const items=b||{};for(const [name,iv] of Object.entries(items))push(`CI_${key}_${name}`,checkCI(iv),"Bootstrap percentile interval is numeric and ordered",iv,"finite low <= high",false);
  }
  push("BOOTSTRAP_REFIT",dg.IPW_refit_failures_in_1000===0&&dg.IPW_refit_failures_in_5000===0,"Recorded independent propensity bootstrap fit failures",[dg.IPW_refit_failures_in_1000,dg.IPW_refit_failures_in_5000],[0,0],false);
  const failed=checks.filter(x=>x.status==="fail");
  const required=checks.filter(x=>x.critical);
  return {version:"Quartile 0.16.x / FER formula audit 1.0",mode:"deterministic_aggregate_arithmetic_only",pass:required.every(x=>x.status==="pass"),summary:{checked:checks.length,passed:checks.length-failed.length,failed:failed.length,critical_failed:required.filter(x=>x.status==="fail").length},checks,notValidated:["Original 6 R scripts have not run on raw .dta; R coefficients and exact R bootstrap seed unverified","Source SHA-256 is a recorded claim; app does not possess raw microdata to verify it","Covariate balance and observed propensity overlap do not establish selection-on-observables","Neither changes nor entrant/leaver coefficient identify the causal effect of Hungarian monetary, energy or lending policy","Researcher/econometrician approval and FER formatting gate are pending"],source_provenance:rep.evidence_status||"user_supplied_unverified_report",archive:src.restricted_storage||null};
}
module.exports={FORMULAE,exactMcNemar,audit};
