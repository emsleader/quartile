# Validation of core/stats/grim.js, grimmer.js, debit.js and pcurve.js against brute-force enumeration in base R.
# The scrutiny package (MIT) named in the specification is not installed and CRAN is blocked here, so every
# expected answer is found by listing all possible data sets (or all possible totals) and checking them.
# Writes grim.json, grimmer.json, grimmer_exact.json, debit.json, caliper.json. Run: Rscript tests/validation/consistency.R
source(file.path(dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1]))), "_json.R"))
set.seed(20261122)
TOL <- 1e-9
dec <- function(s) { m <- regmatches(s, regexpr("\\.[0-9]+", s)); if (length(m)) nchar(m) - 1 else 0 }
fmt <- function(x, d) formatC(x, format = "f", digits = d)

# ---- GRIM: list every integer total on the scale, keep those whose mean is within half a unit ----
grim_bf <- function(ms, n, items, lo = 0, hi = 10) {
  h <- 0.5 * 10^(-dec(ms)); m <- as.numeric(ms); tot <- (n * items * lo):(n * items * hi)
  any(abs(tot / (n * items) - m) <= h + TOL)
}
cases <- list(
  list(args = list("3.48", 25, list(dp = 2, items = 1)), expected = grim_bf("3.48", 25, 1)),
  list(args = list("3.47", 25, list(dp = 2, items = 1)), expected = grim_bf("3.47", 25, 1)),
  list(args = list("5.19", 28, list(dp = 2, items = 1)), expected = grim_bf("5.19", 28, 1)))
for (i in 1:120) {
  n <- sample(5:99, 1); items <- sample(c(1, 1, 1, 2, 3), 1); d <- sample(c(1, 2, 2, 3), 1)
  ms <- fmt(runif(1, 1, 7), d)
  cases[[length(cases) + 1]] <- list(args = list(ms, n, list(dp = d, items = items)), expected = grim_bf(ms, n, items))
}
write_validation("grim", "core/stats/grim.js", "grim", cases, pick = "possible")

# ---- GRIMMER necessary conditions: list every integer total S and every integer sum of squares Q ----
grimmer_bf <- function(ms, ss, n, items) {
  hm <- 0.5 * 10^(-dec(ms)) * items; hs <- 0.5 * 10^(-dec(ss)) * items
  m <- as.numeric(ms) * items; s <- as.numeric(ss) * items
  for (S in floor((m - 1) * n):ceiling((m + 1) * n)) {
    if (abs(S / n - m) > hm + TOL) next
    qmin <- floor(S^2 / n); qmax <- ceiling((n - 1) * (s + hs)^2 + S^2 / n) + 2
    for (Q in qmin:qmax) {
      if ((Q - S) %% 2 != 0) next
      v <- (Q - S^2 / n) / (n - 1); if (v < -TOL) next
      if (abs(sqrt(max(0, v)) - s) <= hs + TOL) return(TRUE)
    }
  }
  FALSE
}
cases <- list()
for (i in 1:150) {
  n <- sample(5:60, 1); items <- sample(c(1, 1, 1, 2), 1); k <- sample(n:(5 * n * items), 1)
  ms <- fmt(k / (n * items), 2); ss <- fmt(runif(1, 0.3, 2), 2)
  cases[[length(cases) + 1]] <- list(args = list(ms, ss, n, list(items = items)), expected = grimmer_bf(ms, ss, n, items))
}
write_validation("grimmer", "core/stats/grimmer.js", "grimmer", cases, pick = "possible",
  note = "Necessary conditions only (GRIM, whole-number sum of squares, parity), checked by listing every total and every sum of squares.")

# ---- GRIMMER exact: list every data set (multiset) of n values on a bounded scale ----
multisets <- function(n, K) {   # all count vectors c_0..c_K with sum n
  if (K == 0) return(matrix(n, 1, 1))
  out <- NULL
  for (c0 in 0:n) { rest <- multisets(n - c0, K - 1); out <- rbind(out, cbind(c0, rest)) }
  out
}
cases <- list()
for (cfg in list(c(6, 1, 5), c(9, 1, 5), c(12, 1, 5), c(7, 1, 7), c(10, 1, 7), c(8, 0, 10))) {
  n <- cfg[1]; lo <- cfg[2]; hi <- cfg[3]; vals <- lo:hi
  C <- multisets(n, hi - lo)
  S <- C %*% vals; Q <- C %*% vals^2
  means <- as.vector(S / n); sds <- as.vector(sqrt(pmax(0, (Q - S^2 / n) / (n - 1))))
  for (i in 1:30) {
    j <- sample(length(means), 1)
    ms <- fmt(means[j], 2)
    ss <- if (i %% 2 == 0) fmt(sds[j], 2) else fmt(runif(1, 0, (hi - lo) / 1.5), 2)
    h <- 0.005 + TOL
    ok <- any(abs(means - as.numeric(ms)) <= h & abs(sds - as.numeric(ss)) <= h)
    cases[[length(cases) + 1]] <- list(args = list(ms, ss, n, list(min = lo, max = hi)), expected = ok)
  }
}
write_validation("grimmer_exact", "core/stats/grimmer.js", "grimmerExact", cases, pick = "possible",
  note = "Every data set of n integers between min and max was listed; a reported pair is possible when some data set is within half a unit on both mean and SD.")

# ---- DEBIT: list every count k of ones out of n and compute the SD of the actual 0/1 vector ----
debit_bf <- function(ms, ss, n, type) {
  hm <- 0.5 * 10^(-dec(ms)); hs <- 0.5 * 10^(-dec(ss))
  for (k in 0:n) {
    x <- c(rep(1, k), rep(0, n - k)); m <- mean(x)
    if (abs(m - as.numeric(ms)) > hm + TOL) next
    s1 <- sd(x); s2 <- sqrt(mean((x - m)^2))
    ok <- switch(type, sample = abs(s1 - as.numeric(ss)) <= hs + TOL, population = abs(s2 - as.numeric(ss)) <= hs + TOL,
                 either = abs(s1 - as.numeric(ss)) <= hs + TOL || abs(s2 - as.numeric(ss)) <= hs + TOL)
    if (ok) return(TRUE)
  }
  FALSE
}
cases <- list()
for (i in 1:150) {
  n <- sample(4:400, 1); k <- sample(0:n, 1); type <- sample(c("sample", "population", "either"), 1)
  x <- c(rep(1, k), rep(0, n - k))
  ms <- fmt(k / n, 2)
  ss <- if (i %% 2 == 0) fmt(sd(x), 2) else fmt(sd(x) + sample(c(-0.02, -0.01, 0.01, 0.03), 1), 2)
  if (as.numeric(ss) < 0) ss <- "0.00"
  cases[[length(cases) + 1]] <- list(args = list(ms, ss, n, list(sdType = type)), expected = debit_bf(ms, ss, n, type))
}
write_validation("debit", "core/stats/debit.js", "debit", cases, pick = "possible")

# ---- caliper: counts in (.04, .05] and (.03, .04], one-sided binomial test ----
cases <- list()
for (i in 1:40) {
  k <- sample(5:60, 1); p <- round(c(runif(k, 0.03, 0.05), runif(sample(0:20, 1), 0, 0.2)), 3)
  a <- sum(p > 0.040 & p <= 0.050); b <- sum(p > 0.030 & p <= 0.040)
  exp <- if (a + b < 10) list(testable = FALSE, justBelow = a, below = b) else
    list(testable = TRUE, justBelow = a, below = b, pOneSided = pbinom(a - 1, a + b, 0.5, lower.tail = FALSE))
  cases[[length(cases) + 1]] <- list(args = list(as.list(p)), expected = exp)
}
write_validation("caliper", "core/stats/pcurve.js", "caliper", cases)
