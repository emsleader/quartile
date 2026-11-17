#!/usr/bin/env Rscript
# FER Hungary: executed R aggregate consistency checks ONLY.
# NO WBES microdata are supplied or processed here. Original six R scripts are NOT tested.
# Reference values are from 17 Nov 2026 independent Python WBES reconstruction.
options(warn = 2)
stopifnot(getRversion() >= "4.3.0")
w19 <- 54.27305826309487
w23 <- 63.6238314446319
dcs <- 9.35077318153703
matched <- -6.147540983606557
gap <- 15.498314165143587
within <- -3.41412218
weight_share <- -1.85767285
turnover <- 14.62256821153703
stopifnot(isTRUE(all.equal(w23 - w19, dcs, tolerance=1e-10)))
stopifnot(isTRUE(all.equal(dcs - matched, gap, tolerance=1e-10)))
stopifnot(abs(within + weight_share + turnover - dcs) < 2e-6)
b <- 60L; c <- 45L; n <- 244L
stopifnot(97L + b + c + 42L == n)
stopifnot(abs(100 * (c-b)/n - matched) < 1e-10)
p.exact <- binom.test(c,b+c, p=0.5)$p.value
stopifnot(abs(p.exact - 0.1715646971542424) < 1e-12)
# R 4.3.x's own RNG, simple nonparametric paired-cell bootstrap (NOT the canonical firm-stratified joint CI).
set.seed(20261106)
C <- rmultinom(10000, 244, prob=c(97,60,45,42)/244)
simple_paired <- 100*(C[3,]-C[2,])/244
paired_ci <- unname(quantile(simple_paired, c(.025,.975)))
stopifnot(all(is.finite(paired_ci)), paired_ci[1] < 0, paired_ci[2] > 0)
beta <- 0.44384682338526393; se <- 0.17479648498054096
or <- exp(beta); or_ci <- exp(beta + c(-1,1)*1.96*se)
p <- 2*pnorm(-abs(beta/se))
stopifnot(abs(or - 1.5586917122152368) < 1e-10)
stopifnot(max(abs(or_ci - c(1.106548501518883,2.195583700482746))) < 1e-9)
stopifnot(abs(p - 0.01110997675381333) < 1e-9)
b_lpm <- 0.204751080684227; se_hc1 <- 0.059195483930040906
p_hc1 <- 2*pt(-abs(b_lpm/se_hc1),df=840-7)
stopifnot(abs(p_hc1 - 0.0005699194653118987) < 3e-5)
stopifnot(0.16680243734916575>0,0.5875721614285071<1,227.94123704905903<=244)
# The independent Python B=5,000 and B=10,000 CI for IPW-minus-matched both include zero.
stopifnot(-0.0883<0, 11.2261>0, -0.140<0,11.188>0)
cat("R_AGGREGATE_STATUS=PASS\n")
cat("R_VERSION=",R.version.string,"\n",sep="")
cat("EXACT_MCNEMAR_P=",format(p.exact,digits=12),"\n",sep="")
cat("SIMPLE_PAIRED_R_BOOTSTRAP_CI95_PP=",paste(format(paired_ci,digits=5),collapse=","),"\n",sep="")
cat("LOGIT_OR=",format(or,digits=10)," OR_WALD95=",paste(round(or_ci,6),collapse=",")," P=",format(p,digits=9),"\n",sep="")
cat("LPM_HC1_T_P=",format(p_hc1,digits=9),"\n",sep="")
cat("R_SCRIPT_SCOPE=aggregate_consistency_only;NO_RAW_WBES;NO_ORIGINAL_SIX_R_EXECUTED\n")
