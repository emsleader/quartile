# Validation of core/stats/dist.js and core/stats/recompute.js (pValue, pRange, checkResult) against base R.
# Writes distributions_*.json and recompute_*.json next to this script. Run: Rscript tests/validation/distributions.R
source(file.path(dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1]))), "_json.R"))

M <- "core/stats/dist.js"
qs <- c(-40, -4.5, -2.2, -1.96, -0.5, 0, 0.3, 1, 1.645, 1.96, 2.2, 2.58, 3.3, 6, 12, 40)
dfs <- c(1, 2, 3, 5, 9.5, 28, 120, 1000, 1e5)

cases <- list()
for (q in qs) for (d in dfs) for (lt in c(TRUE, FALSE)) cases[[length(cases) + 1]] <- list(args = list(q, d, lt), expected = pt(q, d, lower.tail = lt))
write_validation("distributions_pt", M, "pt", cases)

cases <- list()
for (q in c(0.01, 0.2, 1, 2.5, 3.21, 4.1, 7.8, 25, 120)) for (d1 in c(1, 2, 4, 10, 30)) for (d2 in c(2, 7, 45, 200, 5000)) for (lt in c(TRUE, FALSE))
  cases[[length(cases) + 1]] <- list(args = list(q, d1, d2, lt), expected = pf(q, d1, d2, lower.tail = lt))
write_validation("distributions_pf", M, "pf", cases)

cases <- list()
for (q in c(0.001, 0.1, 0.5, 1, 2, 3.84, 4.5, 6.63, 10, 25, 60, 150, 400)) for (d in c(1, 2, 3, 4, 7, 15, 50, 150)) for (lt in c(TRUE, FALSE))
  cases[[length(cases) + 1]] <- list(args = list(q, d, lt), expected = pchisq(q, d, lower.tail = lt))
write_validation("distributions_pchisq", M, "pchisq", cases)

cases <- list()
for (q in c(-8, -5, -3.29, -2.58, -1.96, -1.645, -1, -0.2, 0, 0.2, 1, 1.645, 1.96, 2.58, 3.29, 5, 8)) for (lt in c(TRUE, FALSE))
  cases[[length(cases) + 1]] <- list(args = list(q, lt), expected = pnorm(q, lower.tail = lt))
write_validation("distributions_pnorm", M, "pnorm", cases)

cases <- list()
for (n in c(1, 5, 10, 13, 20, 50, 200)) for (p in c(0.05, 0.3, 0.5, 0.77)) for (k in unique(round(c(0, 1, n / 4, n / 2, 3 * n / 4, n - 1, n)))) for (lt in c(TRUE, FALSE))
  cases[[length(cases) + 1]] <- list(args = list(k, n, p, lt), expected = pbinom(k, n, p, lower.tail = lt))
write_validation("distributions_pbinom", M, "pbinom", cases)

cases <- list()
for (x in c(0.001, 0.05, 0.3, 0.5, 0.71, 0.95, 0.999)) for (a in c(0.5, 1, 2.5, 14, 500)) for (b in c(0.5, 1, 3, 22.5, 800))
  cases[[length(cases) + 1]] <- list(args = list(x, a, b), expected = pbeta(x, a, b))
write_validation("distributions_ibeta", M, "ibeta", cases)

cases <- list()
for (x in c(0.1, 0.5, 1, 1.5, 2.5, 7.3, 14, 51.5, 171, 1000, 25000)) cases[[length(cases) + 1]] <- list(args = list(x), expected = lgamma(x))
write_validation("distributions_lgamma", M, "lgamma", cases)

# ---- recompute.js: p from a statistic ----
R <- "core/stats/recompute.js"
pv <- function(test, x, d1, d2, tails) {
  x <- abs(x)
  one <- switch(test,
    t = pt(-x, d1), z = pnorm(-x),
    r = { r <- min(x, 1 - 1e-15); pt(-r * sqrt(d1 / (1 - r^2)), d1) },
    F = return(pf(x, d1, d2, lower.tail = FALSE)),
    chi2 = return(pchisq(x, d1, lower.tail = FALSE)))
  if (tails == 1) one else min(1, 2 * one)
}
specs <- list(
  list("t", 2.20, 28, NULL), list("t", -1.70, 15, NULL), list("t", 4.31, 112.6, NULL), list("t", 0.85, 1200, NULL),
  list("z", 1.96, NULL, NULL), list("z", -2.81, NULL, NULL), list("z", 0.44, NULL, NULL),
  list("r", 0.30, 48, NULL), list("r", -0.12, 300, NULL), list("r", 0.91, 8, NULL),
  list("F", 3.21, 2, 45), list("F", 12.7, 1, 98), list("F", 0.88, 4, 220), list("F", 2.05, 6, 1500),
  list("chi2", 4.50, 1, NULL), list("chi2", 11.07, 5, NULL), list("chi2", 0.65, 2, NULL), list("chi2", 33.2, 12, NULL))
cases <- list()
for (s in specs) for (tails in (if (s[[1]] %in% c("t", "z", "r")) c(2, 1) else 2)) {
  d1 <- if (is.null(s[[3]])) NULL else s[[3]]; d2 <- if (is.null(s[[4]])) NULL else s[[4]]
  cases[[length(cases) + 1]] <- list(args = list(s[[1]], s[[2]], d1, d2, tails), expected = pv(s[[1]], s[[2]], if (is.null(d1)) NA else d1, if (is.null(d2)) NA else d2, tails))
}
write_validation("recompute_pValue", R, "pValue", cases)

# pRange: p over the rounding interval of a printed statistic
dec <- function(s) { m <- regmatches(s, regexpr("\\.[0-9]+", s)); if (length(m)) nchar(m) - 1 else 0 }
prange <- function(test, s, d1, d2, tails) {
  v <- abs(as.numeric(s)); h <- 0.5 * 10^(-dec(s)); lo <- max(0, v - h); hi <- v + h
  if (test == "r") hi <- min(hi, 1)
  c(pv(test, hi, d1, d2, tails), pv(test, lo, d1, d2, tails))
}
rs <- list(list("t", "2.20", 28, NA), list("t", "-1.7", 15, NA), list("F", "3.21", 2, 45), list("chi2", "4.50", 1, NA),
           list("z", "1.96", NA, NA), list("r", ".30", 48, NA), list("r", ".999", 20, NA), list("t", "0.04", 10, NA))
cases <- list()
for (s in rs) {
  r <- prange(s[[1]], s[[2]], s[[3]], s[[4]], 2)
  cases[[length(cases) + 1]] <- list(args = list(s[[1]], s[[2]], if (is.na(s[[3]])) NULL else s[[3]], if (is.na(s[[4]])) NULL else s[[4]], 2), expected = list(r[1], r[2]))
}
write_validation("recompute_pRange", R, "pRange", cases)

# checkResult: consistency and decision error at alpha = .05, written again here in R from the method notes
consistent_p <- function(op, ps, lo, hi) {
  rp <- as.numeric(ps); d <- max(1, dec(ps)); h <- 0.5 * 10^(-d)
  if (op == "=" && rp == 0) return(lo < h)
  switch(op, "<" = lo < rp, "<=" = lo <= rp, ">" = hi > rp, ">=" = hi >= rp, "=" = lo <= rp + h + 1e-12 && hi >= rp - h - 1e-12)
}
decision <- function(op, ps) {
  rp <- as.numeric(ps)
  if (op %in% c("<", "<=")) return(if (rp <= 0.05) "sig" else NA)
  if (op %in% c(">", ">=")) return(if (rp >= 0.05) "ns" else NA)
  if (rp < 0.05) "sig" else if (rp > 0.05) "ns" else NA
}
check <- function(test, stat, d1, d2, op, ps, one) {
  can1 <- test %in% c("t", "z", "r")
  two <- prange(test, stat, d1, d2, 2); ok2 <- consistent_p(op, ps, two[1], two[2])
  ok1 <- FALSE; if (can1) { o <- prange(test, stat, d1, d2, 1); ok1 <- consistent_p(op, ps, o[1], o[2]) }
  use1 <- one && can1 && ok1 && !ok2
  rng <- if (use1) prange(test, stat, d1, d2, 1) else two
  cons <- ok2 || (one && ok1)
  rep <- decision(op, ps)
  de <- !cons && !is.na(rep) && ((rep == "sig" && rng[1] >= 0.05) || (rep == "ns" && rng[2] < 0.05))
  list(consistent = cons, decisionError = de, recomputed = pv(test, abs(as.numeric(stat)), d1, d2, if (use1) 1 else 2), tails = if (use1) 1 else 2)
}
cr <- list(
  list("t", "2.20", 28, NA, "=", ".036", FALSE), list("t", "2.20", 28, NA, "=", ".018", FALSE), list("t", "2.20", 28, NA, "=", ".018", TRUE),
  list("t", "1.50", 30, NA, "<", ".05", FALSE), list("t", "1.80", 40, NA, "<", ".05", TRUE), list("t", "2.10", 40, NA, ">", ".05", FALSE),
  list("F", "3.21", 2, 45, "=", ".049", FALSE), list("F", "3.21", 2, 45, "=", ".05", FALSE), list("F", "2.10", 3, 120, "<", ".05", FALSE),
  list("F", "8.40", 1, 60, "<", ".01", FALSE), list("chi2", "4.50", 1, NA, "=", ".034", FALSE), list("chi2", "3.10", 1, NA, "<", ".05", FALSE),
  list("z", "1.96", NA, NA, "=", ".05", FALSE), list("z", "2.40", NA, NA, "=", ".16", FALSE), list("z", "3.90", NA, NA, "=", ".000", FALSE),
  list("r", ".30", 48, NA, "=", ".034", FALSE), list("r", ".20", 48, NA, "<", ".05", FALSE), list("r", ".25", 98, NA, "<=", ".01", FALSE),
  list("t", "0.90", 25, NA, ">", ".10", FALSE), list("t", "2.60", 25, NA, ">=", ".05", FALSE))
cases <- list()
for (s in cr) {
  arg <- list(test = s[[1]], stat = s[[2]], op = s[[5]], p = s[[6]], oneTailed = s[[7]])
  if (!is.na(s[[3]])) arg$df1 <- s[[3]]; if (!is.na(s[[4]])) arg$df2 <- s[[4]]
  cases[[length(cases) + 1]] <- list(args = list(arg), expected = check(s[[1]], s[[2]], s[[3]], s[[4]], s[[5]], s[[6]], s[[7]]))
}
write_validation("recompute_checkResult", R, "checkResult", cases)
