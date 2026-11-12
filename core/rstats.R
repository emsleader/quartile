# Quartile statistics procedures, run in R (base R + the recommended package 'foreign').
# Each procedure returns a named list of numbers and labels; qj() writes them as JSON without extra packages.
qj <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    nm <- names(x)
    if (!is.null(nm) && all(nzchar(nm))) return(paste0("{", paste0('"', gsub('"', '\\\\"', nm), '":', vapply(x, qj, ""), collapse = ","), "}"))
    return(paste0("[", paste0(vapply(x, qj, ""), collapse = ","), "]"))
  }
  if (is.factor(x)) x <- as.character(x)
  if (is.matrix(x)) return(qj(lapply(seq_len(nrow(x)), function(i) { r <- as.list(x[i, ]); names(r) <- colnames(x); c(list(row = rownames(x)[i] %||% as.character(i)), r) })))
  one <- function(v) {
    if (is.na(v)) return("null")
    if (is.logical(v)) return(if (v) "true" else "false")
    if (is.numeric(v)) { if (!is.finite(v)) return("null"); return(format(v, digits = 15, scientific = abs(v) > 0 && (abs(v) < 1e-4 || abs(v) >= 1e15))) }
    s <- gsub("\\\\", "\\\\\\\\", as.character(v)); s <- gsub('"', '\\\\"', s); s <- gsub("\n", "\\\\n", s); paste0('"', s, '"')
  }
  if (length(x) == 1 && is.null(names(x))) return(one(x))
  if (!is.null(names(x))) { l <- as.list(x); return(qj(l)) }
  paste0("[", paste0(vapply(x, one, ""), collapse = ","), "]")
}
`%||%` <- function(a, b) if (is.null(a)) b else a
num <- function(d, v) { x <- d[[v]]; if (is.factor(x)) x <- as.character(x); suppressWarnings(as.numeric(x)) }

q_descriptives <- function(d, vars) {
  lapply(setNames(vars, vars), function(v) { x <- num(d, v); n <- sum(!is.na(x))
    list(n = n, missing = sum(is.na(x)), mean = mean(x, na.rm = TRUE), sd = sd(x, na.rm = TRUE), min = min(x, na.rm = TRUE), q1 = unname(quantile(x, .25, na.rm = TRUE)),
         median = median(x, na.rm = TRUE), q3 = unname(quantile(x, .75, na.rm = TRUE)), max = max(x, na.rm = TRUE),
         skewness = { m <- mean(x, na.rm = TRUE); s <- sd(x, na.rm = TRUE); sum((x - m)^3, na.rm = TRUE) / (n * s^3) },
         kurtosis = { m <- mean(x, na.rm = TRUE); s <- sd(x, na.rm = TRUE); sum((x - m)^4, na.rm = TRUE) / (n * s^4) - 3 }) })
}
q_frequencies <- function(d, var) { t <- table(d[[var]], useNA = "ifany"); p <- prop.table(t) * 100
  list(variable = var, n = sum(t), levels = lapply(seq_along(t), function(i) list(value = names(t)[i] %||% "NA", count = as.numeric(t[i]), percent = as.numeric(p[i]), cumulative = sum(p[1:i])))) }
q_crosstab <- function(d, row, col) {
  t <- table(d[[row]], d[[col]]); ct <- suppressWarnings(chisq.test(t, correct = FALSE)); n <- sum(t); k <- min(dim(t))
  out <- list(rows = row, cols = col, n = n, table = lapply(rownames(t), function(r) c(list(row = r), as.list(setNames(as.numeric(t[r, ]), colnames(t))))),
       chisq = unname(ct$statistic), df = unname(ct$parameter), p = ct$p.value, cramers_v = sqrt(unname(ct$statistic) / (n * (k - 1))),
       min_expected = min(ct$expected), cells_expected_below_5 = mean(ct$expected < 5) * 100)
  if (all(dim(t) == 2)) { f <- fisher.test(t); out$fisher_p <- f$p.value; out$odds_ratio <- unname(f$estimate) }
  out
}
q_ttest <- function(d, var, group = NULL, paired_with = NULL, mu = 0) {
  x <- num(d, var)
  if (!is.null(paired_with)) { y <- num(d, paired_with); ok <- !is.na(x) & !is.na(y); r <- t.test(x[ok], y[ok], paired = TRUE); dz <- mean(x[ok] - y[ok]) / sd(x[ok] - y[ok])
    return(list(type = "paired", n = sum(ok), mean_difference = unname(r$estimate), t = unname(r$statistic), df = unname(r$parameter), p = r$p.value, ci_low = r$conf.int[1], ci_high = r$conf.int[2], cohens_dz = dz)) }
  if (is.null(group)) { r <- t.test(x, mu = mu); return(list(type = "one-sample", n = sum(!is.na(x)), mean = mean(x, na.rm = TRUE), mu = mu, t = unname(r$statistic), df = unname(r$parameter), p = r$p.value, ci_low = r$conf.int[1], ci_high = r$conf.int[2], cohens_d = (mean(x, na.rm = TRUE) - mu) / sd(x, na.rm = TRUE))) }
  g <- factor(d[[group]]); if (nlevels(g) != 2) stop(paste0("Group variable '", group, "' must have exactly 2 levels; it has ", nlevels(g)))
  a <- x[g == levels(g)[1]]; b <- x[g == levels(g)[2]]; a <- a[!is.na(a)]; b <- b[!is.na(b)]
  w <- t.test(a, b); s <- t.test(a, b, var.equal = TRUE); sp <- sqrt(((length(a) - 1) * var(a) + (length(b) - 1) * var(b)) / (length(a) + length(b) - 2))
  lev <- { z <- abs(c(a - median(a), b - median(b))); gg <- factor(rep(1:2, c(length(a), length(b)))); summary(aov(z ~ gg))[[1]] }
  list(type = "independent", groups = levels(g), n = c(length(a), length(b)), means = c(mean(a), mean(b)), sds = c(sd(a), sd(b)),
       welch = list(t = unname(w$statistic), df = unname(w$parameter), p = w$p.value, ci_low = w$conf.int[1], ci_high = w$conf.int[2]),
       student = list(t = unname(s$statistic), df = unname(s$parameter), p = s$p.value),
       levene_brown_forsythe = list(F = lev[["F value"]][1], df1 = lev[["Df"]][1], df2 = lev[["Df"]][2], p = lev[["Pr(>F)"]][1]),
       cohens_d = (mean(a) - mean(b)) / sp, mann_whitney = { m <- suppressWarnings(wilcox.test(a, b)); list(W = unname(m$statistic), p = m$p.value) })
}
q_anova <- function(d, var, group) {
  y <- num(d, var); g <- factor(d[[group]]); ok <- !is.na(y) & !is.na(g); y <- y[ok]; g <- droplevels(g[ok])
  fit <- aov(y ~ g); s <- summary(fit)[[1]]; ss <- s[["Sum Sq"]]; tk <- TukeyHSD(fit)$g; w <- oneway.test(y ~ g); kw <- kruskal.test(y ~ g)
  list(n = length(y), groups = lapply(levels(g), function(l) list(group = l, n = sum(g == l), mean = mean(y[g == l]), sd = sd(y[g == l]))),
       F = s[["F value"]][1], df1 = s[["Df"]][1], df2 = s[["Df"]][2], p = s[["Pr(>F)"]][1], eta_squared = ss[1] / sum(ss),
       welch = list(F = unname(w$statistic), df1 = unname(w$parameter[1]), df2 = unname(w$parameter[2]), p = w$p.value),
       kruskal_wallis = list(H = unname(kw$statistic), df = unname(kw$parameter), p = kw$p.value),
       tukey = lapply(rownames(tk), function(r) list(comparison = r, difference = tk[r, "diff"], ci_low = tk[r, "lwr"], ci_high = tk[r, "upr"], p_adj = tk[r, "p adj"])))
}
q_correlation <- function(d, vars, method = "pearson") {
  m <- sapply(vars, function(v) num(d, v)); out <- list()
  for (i in seq_along(vars)) for (j in seq_along(vars)) if (i < j) { ok <- complete.cases(m[, c(i, j)]); r <- suppressWarnings(cor.test(m[ok, i], m[ok, j], method = method))
    out[[length(out) + 1]] <- list(x = vars[i], y = vars[j], n = sum(ok), r = unname(r$estimate), p = r$p.value, ci_low = if (!is.null(r$conf.int)) r$conf.int[1] else NA, ci_high = if (!is.null(r$conf.int)) r$conf.int[2] else NA) }
  list(method = method, pairs = out)
}
q_vif <- function(X) { if (ncol(X) < 2) return(setNames(rep(1, ncol(X)), colnames(X))); sapply(seq_len(ncol(X)), function(j) 1 / (1 - summary(lm(X[, j] ~ X[, -j]))$r.squared)) }
q_regression <- function(d, dv, ivs, robust = FALSE) {
  f <- as.formula(paste0("`", dv, "` ~ ", paste0("`", ivs, "`", collapse = " + "))); dd <- d[, c(dv, ivs)]; dd <- dd[complete.cases(dd), , drop = FALSE]
  fit <- lm(f, data = dd); s <- summary(fit); cf <- s$coefficients; ci <- confint(fit); X <- model.matrix(fit)[, -1, drop = FALSE]
  se <- cf[, 2]
  if (robust) { e <- residuals(fit); Xf <- model.matrix(fit); n <- nrow(Xf); k <- ncol(Xf); B <- solve(crossprod(Xf)); V <- B %*% crossprod(Xf * e) %*% B * n / (n - k); se <- sqrt(diag(V)) }
  tval <- cf[, 1] / se; pval <- 2 * pt(-abs(tval), fit$df.residual)
  vif <- q_vif(X); names(vif) <- colnames(X)
  list(dv = dv, n = nrow(dd), se_type = if (robust) "HC1 (heteroskedasticity-robust)" else "OLS",
       coefficients = lapply(rownames(cf), function(r) list(term = r, b = cf[r, 1], se = unname(se[r]), t = unname(tval[r]), p = unname(pval[r]), ci_low = unname(if (robust) cf[r, 1] - qt(.975, fit$df.residual) * se[r] else ci[r, 1]), ci_high = unname(if (robust) cf[r, 1] + qt(.975, fit$df.residual) * se[r] else ci[r, 2]), vif = if (r %in% names(vif)) unname(vif[r]) else NA,
         beta = if (r == "(Intercept)") NA else cf[r, 1] * sd(X[, r]) / sd(dd[[dv]]))),
       r_squared = s$r.squared, adj_r_squared = s$adj.r.squared, F = unname(s$fstatistic[1]), df1 = unname(s$fstatistic[2]), df2 = unname(s$fstatistic[3]), p = unname(pf(s$fstatistic[1], s$fstatistic[2], s$fstatistic[3], lower.tail = FALSE)),
       residual_se = s$sigma, shapiro_residuals_p = if (nrow(dd) >= 3 && nrow(dd) <= 5000) shapiro.test(residuals(fit))$p.value else NA)
}
q_logistic <- function(d, dv, ivs) {
  f <- as.formula(paste0("`", dv, "` ~ ", paste0("`", ivs, "`", collapse = " + "))); dd <- d[, c(dv, ivs)]; dd <- dd[complete.cases(dd), , drop = FALSE]
  y <- dd[[dv]]; if (!all(y %in% c(0, 1))) { y <- factor(y); if (nlevels(y) != 2) stop("The dependent variable must be binary (0/1 or two levels)."); dd[[dv]] <- as.numeric(y == levels(y)[2]) }
  fit <- glm(f, data = dd, family = binomial()); s <- summary(fit); cf <- s$coefficients; null <- glm(as.formula(paste0("`", dv, "` ~ 1")), data = dd, family = binomial())
  ll1 <- as.numeric(logLik(fit)); ll0 <- as.numeric(logLik(null)); n <- nrow(dd); lr <- 2 * (ll1 - ll0)
  list(dv = dv, n = n, events = sum(dd[[dv]]), coefficients = lapply(rownames(cf), function(r) list(term = r, b = cf[r, 1], se = cf[r, 2], z = cf[r, 3], p = cf[r, 4], odds_ratio = exp(cf[r, 1]), or_ci_low = exp(cf[r, 1] - 1.959964 * cf[r, 2]), or_ci_high = exp(cf[r, 1] + 1.959964 * cf[r, 2]))),
       lr_chisq = lr, df = length(ivs), p = pchisq(lr, length(ivs), lower.tail = FALSE), aic = AIC(fit), mcfadden_r2 = 1 - ll1 / ll0,
       nagelkerke_r2 = (1 - exp((ll0 - ll1) * 2 / n)) / (1 - exp(ll0 * 2 / n)), classification_correct = mean((fitted(fit) > .5) == (dd[[dv]] == 1)) * 100)
}
q_reliability <- function(d, items) {
  m <- sapply(items, function(v) num(d, v)); m <- m[complete.cases(m), , drop = FALSE]; k <- ncol(m); v <- var(m)
  alpha <- k / (k - 1) * (1 - sum(diag(v)) / sum(v))
  drop <- sapply(seq_len(k), function(j) { mm <- m[, -j, drop = FALSE]; vv <- var(mm); kk <- ncol(mm); kk / (kk - 1) * (1 - sum(diag(vv)) / sum(vv)) })
  itc <- sapply(seq_len(k), function(j) cor(m[, j], rowSums(m[, -j, drop = FALSE])))
  list(items = k, n = nrow(m), cronbach_alpha = alpha, standardized_alpha = { r <- cor(m); rb <- mean(r[upper.tri(r)]); k * rb / (1 + (k - 1) * rb) },
       item_stats = lapply(seq_len(k), function(j) list(item = items[j], mean = mean(m[, j]), sd = sd(m[, j]), corrected_item_total_r = itc[j], alpha_if_deleted = drop[j])))
}
q_efa <- function(d, vars, factors = 1, rotation = "varimax") {
  m <- sapply(vars, function(v) num(d, v)); m <- m[complete.cases(m), , drop = FALSE]; r <- cor(m)
  kmo <- { ir <- solve(r); pr <- -ir / sqrt(outer(diag(ir), diag(ir))); diag(pr) <- 0; rr <- r; diag(rr) <- 0; sum(rr^2) / (sum(rr^2) + sum(pr^2)) }
  bart <- { n <- nrow(m); p <- ncol(m); chi <- -((n - 1) - (2 * p + 5) / 6) * log(det(r)); list(chisq = chi, df = p * (p - 1) / 2, p = pchisq(chi, p * (p - 1) / 2, lower.tail = FALSE)) }
  fa <- factanal(m, factors = factors, rotation = rotation); L <- unclass(fa$loadings)
  list(n = nrow(m), factors = factors, rotation = rotation, kmo = kmo, bartlett = bart, eigenvalues = eigen(r)$values,
       loadings = lapply(rownames(L), function(i) c(list(item = i), as.list(setNames(as.numeric(L[i, ]), paste0("F", seq_len(ncol(L))))), list(uniqueness = unname(fa$uniquenesses[i])))),
       chisq = unname(fa$STATISTIC %||% NA), df = unname(fa$dof), p = unname(fa$PVAL %||% NA))
}
q_normality <- function(d, vars) lapply(setNames(vars, vars), function(v) { x <- num(d, v); x <- x[!is.na(x)]; if (length(x) < 3 || length(x) > 5000) return(list(n = length(x), note = "Shapiro-Wilk needs 3 to 5000 values")); s <- shapiro.test(x); list(n = length(x), W = unname(s$statistic), p = s$p.value) })

q_run <- function(name, expr) { r <- tryCatch(expr, error = function(e) list(error = conditionMessage(e))); r$procedure <- name; r }
