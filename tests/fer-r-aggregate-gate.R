#!/usr/bin/env Rscript
# Public aggregate-only R arithmetic: no WBES private data and NOT the six original R scripts.
args <- commandArgs(trailingOnly=TRUE)
input <- if (length(args)) args[1] else 'tests/fer-aggregate-fixture.tsv'
x <- read.delim(input, sep='\t', stringsAsFactors=FALSE, check.names=FALSE)
stopifnot(all(c('key','value') %in% names(x)), !anyDuplicated(x$key))
v <- setNames(as.numeric(x$value), x$key)
get <- function(k) { if (!k %in% names(v) || !is.finite(v[[k]])) stop(sprintf('Invalid %s', k)); v[[k]] }
chk <- function(name, got, want, tolerance=1e-5) {
 if (!is.finite(got)||!is.finite(want)||abs(got-want)>tolerance) stop(sprintf('FAIL %s: %.10f vs %.10f',name,got,want))
 cat(sprintf('PASS %-26s %.8f\n',name,got))
}
chk('wave change',get('wave_2023_pct')-get('wave_2019_pct'),get('cross_change_pp'))
chk('gap',get('cross_change_pp')-get('matched_change_pp'),get('gap_pp'))
chk('symmetric decomposition',get('within_pp')+get('weight_share_pp')+get('turnover_pp'),get('cross_change_pp'),1e-4)
chk('paired n',get('both1')+get('only19')+get('only23')+get('both0'),get('matched_n'))
chk('paired change',100*(get('only23')-get('only19'))/get('matched_n'),get('matched_change_pp'))
chk('exact McNemar',binom.test(get('only23'),get('only19')+get('only23'),p=.5)$p.value,get('mcnemar_p'),1e-8)
chk('logit OR',exp(get('logit_beta')),get('logit_OR'))
chk('logit Wald OR low',exp(get('logit_beta')-1.96*get('logit_SE')),get('logit_CI_low'),2e-4)
chk('logit Wald OR high',exp(get('logit_beta')+1.96*get('logit_SE')),get('logit_CI_high'),2e-4)
chk('logit Wald p',2*pnorm(-abs(get('logit_beta')/get('logit_SE'))),get('logit_p'),1e-4)
chk('LPM robust Wald p',2*pnorm(-abs(get('lpm_beta_pp')/get('lpm_SE_pp'))),get('lpm_p'),1e-4)
stopifnot(get('propensity_min')>0,get('propensity_max')<1,get('propensity_min')<get('propensity_max'))
stopifnot(get('IPW_ESS')>0,get('IPW_ESS')<=get('matched_n'))
stopifnot(get('B5000_IPW_contrast_low')<0,get('B5000_IPW_contrast_high')>0)
cat('PASS overlap/ESS and non-significant B=5000 IPW-minus-unweighted interval.\n')
cat('R AGGREGATE GATE PASS; THIS DOES NOT EXECUTE RAW DATA OR THE SIX ORIGINAL R SCRIPTS.\n')
writeLines(c(capture.output(sessionInfo()),'GATE: PUBLIC_AGGREGATE_ONLY'), 'fer_r_aggregate_validation_session.txt')
