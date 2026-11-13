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
q_regression <- function(d, dv, ivs, robust = FALSE, cluster = NULL, fe = NULL, weights = NULL, factors = NULL) {
  keep <- unique(c(dv, ivs, cluster, fe, weights)); dd <- d[, keep, drop = FALSE]; dd <- dd[complete.cases(dd), , drop = FALSE]
  for (v in factors) dd[[v]] <- factor(dd[[v]]); for (v in fe) dd[[v]] <- factor(dd[[v]])
  term <- function(v) paste0("`", v, "`")
  rhs <- c(vapply(ivs, term, ""), if (length(fe)) vapply(fe, term, ""))
  f <- as.formula(paste0(term(dv), " ~ ", paste(rhs, collapse = " + ")))
  w <- if (!is.null(weights)) num(dd, weights) else NULL
  fit <- if (is.null(w)) lm(f, data = dd) else lm(f, data = dd, weights = w)
  s <- summary(fit); cf <- coef(summary(fit)); Xf <- model.matrix(fit); n <- nrow(Xf); k <- ncol(Xf); e <- residuals(fit); ww <- if (is.null(w)) rep(1, n) else w
  B <- solve(crossprod(Xf * sqrt(ww)))
  se_type <- if (!is.null(cluster)) "cluster-robust (CR1) by " else if (robust || !is.null(weights)) "HC1 (heteroskedasticity-robust)" else "OLS"
  if (!is.null(cluster)) { cl <- factor(dd[[cluster]]); G <- nlevels(cl); U <- rowsum(Xf * (e * ww), cl); V <- B %*% crossprod(U) %*% B * (G / (G - 1)) * ((n - 1) / (n - k)); se <- sqrt(diag(V)); dfr <- G - 1; se_type <- paste0(se_type, cluster, " (", G, " clusters)") }
  else if (robust || !is.null(weights)) { V <- B %*% crossprod(Xf * (e * ww)) %*% B * n / (n - k); se <- sqrt(diag(V)); dfr <- fit$df.residual }
  else { se <- cf[, 2]; dfr <- fit$df.residual }
  est <- cf[, 1]; tval <- est / se; pval <- 2 * pt(-abs(tval), dfr); crit <- qt(.975, dfr)
  shown <- rownames(cf)[!grepl(paste0("^(", paste(c("ZZZ", vapply(fe, function(v) paste0("`?", gsub("([.()])", "\\\\\\1", v), "`?"), "")), collapse = "|"), ")"), rownames(cf))]
  X <- model.matrix(fit)[, setdiff(shown, "(Intercept)"), drop = FALSE]; vif <- if (ncol(X)) q_vif(X) else numeric(0); names(vif) <- colnames(X)
  sdy <- sd(dd[[dv]])
  list(dv = dv, n = n, se_type = se_type, fixed_effects = if (length(fe)) lapply(fe, function(v) list(variable = v, levels = nlevels(dd[[v]]))) else NULL, weighted = !is.null(weights),
       coefficients = lapply(shown, function(r) list(term = { t0 <- gsub("`", "", r); for (v in factors) if (startsWith(t0, v) && nchar(t0) > nchar(v)) t0 <- paste0(v, ": ", substring(t0, nchar(v) + 1)); t0 }, b = unname(est[r]), se = unname(se[r]), t = unname(tval[r]), p = unname(pval[r]), ci_low = unname(est[r] - crit * se[r]), ci_high = unname(est[r] + crit * se[r]),
         vif = if (r %in% names(vif)) unname(vif[r]) else NA, beta = if (r == "(Intercept)" || !(r %in% colnames(X))) NA else unname(est[r] * sd(X[, r]) / sdy))),
       r_squared = s$r.squared, adj_r_squared = s$adj.r.squared, F = unname(s$fstatistic[1]), df1 = unname(s$fstatistic[2]), df2 = unname(s$fstatistic[3]), p = unname(pf(s$fstatistic[1], s$fstatistic[2], s$fstatistic[3], lower.tail = FALSE)),
       residual_se = s$sigma, shapiro_residuals_p = if (n >= 3 && n <= 5000) shapiro.test(residuals(fit))$p.value else NA)
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

# ---- figures: drawn by R (grDevices, cairo PNG), neutral academic style, one file per figure ----
q_fig_n <- 0
q_fig <- function(title, draw, w = 1600, h = 1100) {
  q_fig_n <<- q_fig_n + 1; f <- sprintf("fig_%02d.png", q_fig_n)
  png(f, width = w, height = h, res = 200, type = "cairo", family = "sans")
  op <- par(mar = c(4.2, 4.4, 2.6, 1.2), cex.main = 1, font.main = 1, las = 1, bty = "l", col.axis = "grey25", fg = "grey35")
  ok <- tryCatch({ draw(); TRUE }, error = function(e) { plot.new(); text(.5, .5, conditionMessage(e)); FALSE })
  par(op); dev.off(); list(file = f, title = title)
}
INK <- "grey20"; FILL <- "grey80"; ACC <- "#2b5c8a"
q_plots <- function(proc, d, a) {
  out <- list(); add <- function(x) out[[length(out) + 1]] <<- x
  qq1 <- function(x, lab) add(q_fig(paste0("Normal Q-Q plot: ", lab), function() { qqnorm(x, main = paste0("Normal Q-Q plot: ", lab), pch = 16, col = adjustcolor(INK, .6), xlab = "Theoretical quantiles", ylab = "Sample quantiles"); qqline(x, col = ACC, lwd = 2) }))
  switch(proc,
    descriptives = for (v in a$variables) { xx <- num(d, v); xx <- xx[!is.na(xx)]
      add(q_fig(paste0("Distribution of ", v), function() { h <- hist(xx, breaks = "FD", plot = FALSE); hist(xx, breaks = h$breaks, freq = FALSE, col = FILL, border = "white", main = paste0("Distribution of ", v, " (n = ", length(xx), ")"), xlab = v, ylab = "Density", ylim = c(0, max(h$density) * 1.15)); curve(dnorm(x, mean(xx), sd(xx)), add = TRUE, col = ACC, lwd = 2) }))
      add(q_fig(paste0("Box plot of ", v), function() boxplot(xx, horizontal = TRUE, col = FILL, border = INK, main = paste0("Box plot of ", v), xlab = v), h = 700)) },
    normality = for (v in a$variables) { x <- num(d, v); qq1(x[!is.na(x)], v) },
    frequencies = { t <- table(d[[a$variable]]); add(q_fig(paste0("Frequencies of ", a$variable), function() { b <- barplot(t, col = FILL, border = NA, main = paste0("Frequencies of ", a$variable, " (N = ", sum(t), ")"), ylab = "Count", ylim = c(0, max(t) * 1.15)); text(b, t, labels = t, pos = 3, cex = .8, col = INK) })) },
    crosstab = { t <- table(d[[a$row]], d[[a$column]]); add(q_fig(paste0(a$row, " by ", a$column), function() { barplot(t, beside = TRUE, col = grey.colors(nrow(t), .35, .85), border = NA, main = paste0(a$row, " by ", a$column), xlab = a$column, ylab = "Count", ylim = c(0, max(t) * 1.3), legend.text = rownames(t), args.legend = list(x = "top", horiz = TRUE, bty = "n", title = a$row, inset = c(0, -0.02))) })) },
    ttest = { if (!is.null(a$paired_with)) { x <- num(d, a$variable); y <- num(d, a$paired_with); ok <- !is.na(x) & !is.na(y)
        add(q_fig(paste0(a$variable, " and ", a$paired_with, " (paired)"), function() { matplot(rbind(1, 2), rbind(x[ok], y[ok]), type = "l", lty = 1, col = adjustcolor(INK, .35), xaxt = "n", xlim = c(.8, 2.2), main = paste0(a$variable, " vs ", a$paired_with, " (n = ", sum(ok), ")"), ylab = "Value", xlab = ""); axis(1, 1:2, c(a$variable, a$paired_with)); points(1:2, c(mean(x[ok]), mean(y[ok])), pch = 19, cex = 1.6, col = ACC) }))
      } else if (!is.null(a$group)) { x <- num(d, a$variable); g <- factor(d[[a$group]])
        add(q_fig(paste0(a$variable, " by ", a$group), function() { boxplot(x ~ g, col = FILL, border = INK, main = paste0(a$variable, " by ", a$group), xlab = a$group, ylab = a$variable, outline = TRUE); stripchart(x ~ g, vertical = TRUE, method = "jitter", add = TRUE, pch = 16, col = adjustcolor(INK, .35)); points(seq_len(nlevels(g)), tapply(x, g, mean, na.rm = TRUE), pch = 18, cex = 1.8, col = ACC) }))
      } else { x <- num(d, a$variable); qq1(x[!is.na(x)], a$variable) } },
    anova = { y <- num(d, a$variable); g <- factor(d[[a$group]]); ok <- !is.na(y) & !is.na(g); y <- y[ok]; g <- droplevels(g[ok])
      m <- tapply(y, g, mean); se <- tapply(y, g, function(v) sd(v) / sqrt(length(v))); n <- tapply(y, g, length); lo <- m - qt(.975, n - 1) * se; hi <- m + qt(.975, n - 1) * se
      add(q_fig(paste0("Mean ", a$variable, " by ", a$group, " with 95% CI"), function() { plot(seq_along(m), m, ylim = range(lo, hi), xlim = c(.5, length(m) + .5), pch = 19, col = ACC, cex = 1.4, xaxt = "n", xlab = a$group, ylab = paste0("Mean ", a$variable), main = paste0("Mean ", a$variable, " by ", a$group, " (95% CI)")); axis(1, seq_along(m), names(m)); arrows(seq_along(m), lo, seq_along(m), hi, angle = 90, code = 3, length = .06, col = INK) }))
      add(q_fig(paste0(a$variable, " by ", a$group), function() boxplot(y ~ g, col = FILL, border = INK, main = paste0(a$variable, " by ", a$group), xlab = a$group, ylab = a$variable))) },
    correlation = { m <- sapply(a$variables, function(v) num(d, v))
      if (ncol(m) == 2) { ok <- complete.cases(m); add(q_fig(paste0(colnames(m)[2], " against ", colnames(m)[1]), function() { plot(m[ok, 1], m[ok, 2], pch = 16, col = adjustcolor(INK, .55), xlab = colnames(m)[1], ylab = colnames(m)[2], main = sprintf("%s and %s (r = %.2f)", colnames(m)[1], colnames(m)[2], cor(m[ok, 1], m[ok, 2], method = a$method %||% "pearson"))); abline(lm(m[ok, 2] ~ m[ok, 1]), col = ACC, lwd = 2) })) }
      else { r <- cor(m, use = "pairwise.complete.obs", method = a$method %||% "pearson"); k <- ncol(r)
        add(q_fig("Correlation matrix", function() { par(mar = c(7, 7, 2.6, 1)); pal <- colorRampPalette(c("#8a2b2b", "white", ACC))(101); image(1:k, 1:k, t(r[k:1, ]), zlim = c(-1, 1), col = pal, axes = FALSE, xlab = "", ylab = "", main = "Correlation matrix"); axis(1, 1:k, colnames(r), las = 2, tick = FALSE); axis(2, 1:k, rev(colnames(r)), las = 1, tick = FALSE); for (i in 1:k) for (j in 1:k) text(i, k - j + 1, sprintf("%.2f", r[j, i]), cex = .8, col = if (abs(r[j, i]) > .55) "white" else INK) }, w = 1400, h = 1300)) } },
    regression = { ivs <- a$independents; dd <- d[, c(a$dependent, ivs)]; dd <- dd[complete.cases(dd), , drop = FALSE]; fit <- lm(as.formula(paste0("`", a$dependent, "` ~ ", paste0("`", ivs, "`", collapse = " + "))), data = dd)
      if (length(ivs) == 1) add(q_fig(paste0(a$dependent, " against ", ivs), function() { plot(dd[[ivs]], dd[[a$dependent]], pch = 16, col = adjustcolor(INK, .55), xlab = ivs, ylab = a$dependent, main = paste0(a$dependent, " against ", ivs, " with OLS fit")); abline(fit, col = ACC, lwd = 2) }))
      add(q_fig("Residuals against fitted values", function() { plot(fitted(fit), residuals(fit), pch = 16, col = adjustcolor(INK, .55), xlab = "Fitted values", ylab = "Residuals", main = "Residuals against fitted values"); abline(h = 0, col = "grey55", lty = 2); lines(lowess(fitted(fit), residuals(fit)), col = ACC, lwd = 2) }))
      qq1(residuals(fit), "regression residuals")
      if (length(ivs) >= 2) out <- c(out, q_chart(d, list(type = "coefficient", y = a$dependent, independents = ivs))) },
    logistic = { ivs <- a$independents; dd <- d[, c(a$dependent, ivs)]; dd <- dd[complete.cases(dd), , drop = FALSE]; y <- dd[[a$dependent]]; if (!all(y %in% c(0, 1))) { y <- factor(y); dd[[a$dependent]] <- as.numeric(y == levels(y)[2]) }
      fit <- glm(as.formula(paste0("`", a$dependent, "` ~ ", paste0("`", ivs, "`", collapse = " + "))), data = dd, family = binomial()); v <- ivs[1]
      add(q_fig(paste0("Predicted probability of ", a$dependent, " by ", v), function() { o <- order(dd[[v]]); plot(dd[[v]], jitter(dd[[a$dependent]], .08), pch = 16, col = adjustcolor(INK, .4), xlab = v, ylab = paste0("P(", a$dependent, " = 1)"), main = paste0("Predicted probability of ", a$dependent, if (length(ivs) > 1) " (other predictors at observed values)" else "")); lines(dd[[v]][o], fitted(fit)[o], col = ACC, lwd = 2) })) },
    reliability = { r <- q_reliability(d, a$variables); add(q_fig("Corrected item-total correlations", function() { v <- sapply(r$item_stats, function(s) s$corrected_item_total_r); par(mar = c(4.2, 9, 2.6, 1)); barplot(rev(v), names.arg = rev(a$variables), horiz = TRUE, col = FILL, border = NA, xlim = c(min(0, v), 1), main = sprintf("Corrected item-total correlations (alpha = %.2f)", r$cronbach_alpha), xlab = "r"); abline(v = .3, lty = 2, col = "grey50") })) },
    chart = { out <- q_chart(d, a) },
    egba = { for (f in egba_plots(d, a)) add(f) },
    survival = { out <- q_chart(d, c(a, list(type = "km"))) },
    efa = { m <- sapply(a$variables, function(v) num(d, v)); m <- m[complete.cases(m), , drop = FALSE]; e <- eigen(cor(m))$values
      add(q_fig("Scree plot", function() { plot(seq_along(e), e, type = "b", pch = 19, col = ACC, xlab = "Component", ylab = "Eigenvalue", main = "Scree plot"); abline(h = 1, lty = 2, col = "grey50") })) },
    NULL)
  out
}

# ---- survival analysis (package 'survival', a recommended R package) ----
q_survival <- function(d, time, event, group = NULL, covariates = NULL) {
  if (!requireNamespace("survival", quietly = TRUE)) stop("The R package 'survival' is not installed.")
  vars <- c(time, event, group, covariates); dd <- d[, vars, drop = FALSE]; dd <- dd[complete.cases(dd), , drop = FALSE]
  dd[[time]] <- num(dd, time); ev <- dd[[event]]; if (!all(ev %in% c(0, 1))) { ev <- factor(ev); dd[[event]] <- as.numeric(ev == levels(ev)[2]) }
  S <- survival::Surv(dd[[time]], dd[[event]])
  km <- if (is.null(group)) survival::survfit(S ~ 1) else survival::survfit(S ~ factor(dd[[group]]))
  sm <- summary(km); tb <- summary(km)$table; if (is.null(dim(tb))) tb <- t(as.matrix(tb))
  out <- list(n = nrow(dd), events = sum(dd[[event]]), groups = lapply(seq_len(nrow(tb)), function(i) list(group = sub("^.*=", "", rownames(tb)[i] %||% "all"), n = unname(tb[i, "records"]), events = unname(tb[i, "events"]), median_time = unname(tb[i, "median"]), median_ci_low = unname(tb[i, "0.95LCL"]), median_ci_high = unname(tb[i, "0.95UCL"]))))
  if (!is.null(group)) { lr <- survival::survdiff(S ~ factor(dd[[group]])); out$log_rank <- list(chisq = lr$chisq, df = length(lr$n) - 1, p = pchisq(lr$chisq, length(lr$n) - 1, lower.tail = FALSE)) }
  rhs <- c(if (!is.null(group)) paste0("factor(`", group, "`)"), if (length(covariates)) paste0("`", covariates, "`"))
  if (length(rhs)) { cx <- survival::coxph(as.formula(paste0("survival::Surv(`", time, "`, `", event, "`) ~ ", paste(rhs, collapse = " + "))), data = dd); s <- summary(cx); cf <- s$coefficients; ci <- s$conf.int
    out$cox <- list(coefficients = lapply(rownames(cf), function(r) list(term = sub("^factor\\(`?([^`)]*)`?\\)(.*)$", "\\1: \\2", r), b = cf[r, "coef"], hazard_ratio = cf[r, "exp(coef)"], se = cf[r, "se(coef)"], z = cf[r, "z"], p = cf[r, "Pr(>|z|)"], hr_ci_low = ci[r, "lower .95"], hr_ci_high = ci[r, "upper .95"])),
      concordance = unname(s$concordance[1]), lr_test = unname(s$logtest["test"]), lr_df = unname(s$logtest["df"]), lr_p = unname(s$logtest["pvalue"]),
      ph_test_global_p = tryCatch({ z <- survival::cox.zph(cx); unname(z$table["GLOBAL", "p"]) }, error = function(e) NA)) }
  out
}

# ---- chart builder: the chart types used in business and economics journals ----
PAL <- c("#2b5c8a", "#b5651d", "#4d7c3f", "#7a3b69", "#5f6b73", "#a58b2a")
q_chart <- function(d, a) {
  type <- a$type; ttl <- a$title %||% ""; err <- a$error %||% "ci"; out <- list(); add <- function(x) out[[length(out) + 1]] <<- x
  mci <- function(y) { y <- y[!is.na(y)]; n <- length(y); m <- mean(y); se <- sd(y) / sqrt(n); w <- if (err == "se") se else if (err == "sd") sd(y) else if (err == "none") 0 else qt(.975, max(n - 1, 1)) * se; c(m = m, lo = m - w, hi = m + w, n = n) }
  elab <- c(ci = "95% CI", se = "±1 SE", sd = "±1 SD", none = "")[[err]]
  g <- if (!is.null(a$group)) factor(d[[a$group]]) else NULL
  switch(type,
    bar = {  # mean of y by x (optionally by group), with error bars; or counts of x when y is missing
      x <- factor(d[[a$x]])
      if (is.null(a$y)) { t <- if (is.null(g)) table(x) else table(g, x); add(q_fig(if (nzchar(ttl)) ttl else paste0("Count by ", a$x), function() { b <- barplot(t, beside = !is.null(g), col = if (is.null(g)) FILL else PAL[seq_len(nrow(t))], border = NA, ylim = c(0, max(t) * 1.25), xlab = a$x, ylab = "Count", main = if (nzchar(ttl)) ttl else paste0("Count by ", a$x), legend.text = if (!is.null(g)) rownames(t), args.legend = list(x = "top", horiz = TRUE, bty = "n", title = a$group)) })) }
      else { y <- num(d, a$y)
        if (is.null(g)) { s <- sapply(levels(x), function(l) mci(y[x == l])); add(q_fig(if (nzchar(ttl)) ttl else paste0("Mean ", a$y, " by ", a$x), function() { b <- barplot(s["m", ], col = FILL, border = NA, ylim = range(0, s["lo", ], s["hi", ]) * c(1, 1.15), xlab = a$x, ylab = paste0("Mean ", a$y, if (nzchar(elab)) paste0(" (", elab, ")")), main = if (nzchar(ttl)) ttl else paste0("Mean ", a$y, " by ", a$x)); if (err != "none") arrows(b, s["lo", ], b, s["hi", ], angle = 90, code = 3, length = .05, col = INK) })) }
        else { M <- sapply(levels(x), function(l) sapply(levels(g), function(k) mci(y[x == l & g == k])["m"])); L <- sapply(levels(x), function(l) sapply(levels(g), function(k) mci(y[x == l & g == k])["lo"])); H <- sapply(levels(x), function(l) sapply(levels(g), function(k) mci(y[x == l & g == k])["hi"])); M <- matrix(M, nlevels(g)); L <- matrix(L, nlevels(g)); H <- matrix(H, nlevels(g)); dimnames(M) <- list(levels(g), levels(x))
          add(q_fig(if (nzchar(ttl)) ttl else paste0("Mean ", a$y, " by ", a$x, " and ", a$group), function() { b <- barplot(M, beside = TRUE, col = PAL[seq_len(nrow(M))], border = NA, ylim = range(0, L, H, na.rm = TRUE) * c(1, 1.25), xlab = a$x, ylab = paste0("Mean ", a$y, if (nzchar(elab)) paste0(" (", elab, ")")), main = if (nzchar(ttl)) ttl else paste0("Mean ", a$y, " by ", a$x, " and ", a$group), legend.text = rownames(M), args.legend = list(x = "top", horiz = TRUE, bty = "n", title = a$group)); if (err != "none") arrows(b, L, b, H, angle = 90, code = 3, length = .04, col = INK) })) } } },
    stacked100 = { x <- factor(d[[a$x]]); t <- prop.table(table(g, x), 2) * 100
      add(q_fig(if (nzchar(ttl)) ttl else paste0(a$group, " shares by ", a$x), function() { par(mar = c(4.2, 4.4, 4.6, 1)); b <- barplot(t, col = PAL[seq_len(nrow(t))], border = "white", ylab = "Percent", xlab = a$x, ylim = c(0, 100)); title(if (nzchar(ttl)) ttl else paste0(a$group, " shares by ", a$x), line = 3); legend("top", inset = c(0, -0.1), horiz = TRUE, xpd = TRUE, bty = "n", fill = PAL[seq_len(nrow(t))], border = NA, legend = rownames(t), cex = .85)
        cy <- apply(t, 2, function(v) cumsum(v) - v / 2); for (j in seq_len(ncol(t))) for (i in seq_len(nrow(t))) if (t[i, j] >= 6) text(b[j], cy[i, j], sprintf("%.0f%%", t[i, j]), col = "white", cex = .75) })) },
    line = { x <- d[[a$x]]; xn <- suppressWarnings(as.numeric(x)); xs <- if (all(!is.na(xn[!is.na(x)]))) sort(unique(xn)) else sort(unique(x)); y <- num(d, a$y); xv <- if (is.numeric(xs)) xn else x
      gl <- if (is.null(g)) "all" else levels(g)
      add(q_fig(if (nzchar(ttl)) ttl else paste0("Mean ", a$y, " over ", a$x), function() { S <- lapply(gl, function(k) { sel <- if (is.null(g)) rep(TRUE, length(y)) else g == k; t(sapply(xs, function(v) mci(y[sel & xv == v]))) }); rng <- range(unlist(lapply(S, function(s) s[, c("lo", "hi")])), na.rm = TRUE)
        plot(seq_along(xs), S[[1]][, "m"], type = "n", ylim = rng, xaxt = "n", xlab = a$x, ylab = paste0("Mean ", a$y, if (nzchar(elab)) paste0(" (", elab, " band)")), main = if (nzchar(ttl)) ttl else paste0("Mean ", a$y, " over ", a$x)); axis(1, seq_along(xs), xs)
        for (i in seq_along(S)) { s <- S[[i]]; ok <- !is.na(s[, "lo"]); if (err != "none") polygon(c(seq_along(xs)[ok], rev(seq_along(xs)[ok])), c(s[ok, "lo"], rev(s[ok, "hi"])), col = adjustcolor(PAL[i], .15), border = NA); lines(seq_along(xs), s[, "m"], col = PAL[i], lwd = 2); points(seq_along(xs), s[, "m"], pch = 19, col = PAL[i]) }
        if (!is.null(g)) legend("topleft", bty = "n", lwd = 2, col = PAL[seq_along(gl)], legend = gl, title = a$group) })) },
    scatter = { x <- num(d, a$x); y <- num(d, a$y); sz <- if (!is.null(a$size)) num(d, a$size) else NULL; ok <- !is.na(x) & !is.na(y)
      add(q_fig(if (nzchar(ttl)) ttl else paste0(a$y, " against ", a$x), function() { col <- if (is.null(g)) adjustcolor(INK, .55) else adjustcolor(PAL[as.integer(g)], .7); cx <- if (is.null(sz)) 1 else 0.6 + 2.4 * (sz - min(sz, na.rm = TRUE)) / diff(range(sz, na.rm = TRUE))
        plot(x[ok], y[ok], pch = 16, col = col[ok], cex = if (length(cx) > 1) cx[ok] else cx, xlab = a$x, ylab = a$y, main = if (nzchar(ttl)) ttl else paste0(a$y, " against ", a$x))
        if (is.null(g)) abline(lm(y[ok] ~ x[ok]), col = ACC, lwd = 2) else { for (i in seq_len(nlevels(g))) { s <- ok & g == levels(g)[i]; if (sum(s) > 2) abline(lm(y[s] ~ x[s]), col = PAL[i], lwd = 2) }; legend("topleft", bty = "n", pch = 16, col = PAL[seq_len(nlevels(g))], legend = levels(g), title = a$group) }
        if (!is.null(sz)) mtext(paste0("Point size: ", a$size), side = 3, line = .2, cex = .75, col = "grey40") })) },
    violin = { y <- num(d, a$y); gg <- if (is.null(g)) factor(rep("all", length(y))) else g
      add(q_fig(if (nzchar(ttl)) ttl else paste0("Distribution of ", a$y, if (!is.null(g)) paste0(" by ", a$group)), function() { lv <- levels(gg); plot(NA, xlim = c(.5, length(lv) + .5), ylim = range(y, na.rm = TRUE), xaxt = "n", xlab = a$group %||% "", ylab = a$y, main = if (nzchar(ttl)) ttl else paste0("Distribution of ", a$y, if (!is.null(g)) paste0(" by ", a$group))); axis(1, seq_along(lv), lv)
        for (i in seq_along(lv)) { v <- y[gg == lv[i] & !is.na(y)]; if (length(v) < 3) next; dn <- density(v); w <- .4 * dn$y / max(dn$y); polygon(c(i - w, rev(i + w)), c(dn$x, rev(dn$x)), col = adjustcolor(PAL[i], .25), border = PAL[i]); q <- quantile(v, c(.25, .5, .75)); segments(i, q[1], i, q[3], lwd = 5, col = INK); points(i, q[2], pch = 21, bg = "white", cex = 1.2) } })) },
    density = { y <- num(d, a$y); gg <- if (is.null(g)) factor(rep("all", length(y))) else g; D <- lapply(levels(gg), function(l) { v <- y[gg == l & !is.na(y)]; if (length(v) > 2) density(v) })
      add(q_fig(if (nzchar(ttl)) ttl else paste0("Density of ", a$y), function() { plot(NA, xlim = range(unlist(lapply(D, function(z) z$x))), ylim = c(0, max(unlist(lapply(D, function(z) z$y))) * 1.1), xlab = a$y, ylab = "Density", main = if (nzchar(ttl)) ttl else paste0("Density of ", a$y)); for (i in seq_along(D)) if (!is.null(D[[i]])) { polygon(D[[i]], col = adjustcolor(PAL[i], .15), border = NA); lines(D[[i]], col = PAL[i], lwd = 2) }; if (!is.null(g)) legend("topright", bty = "n", lwd = 2, col = PAL[seq_along(D)], legend = levels(gg), title = a$group) })) },
    coefficient = { ivs <- a$independents; dd <- d[, c(a$y, ivs)]; dd <- dd[complete.cases(dd), , drop = FALSE]; fit <- lm(as.formula(paste0("`", a$y, "` ~ ", paste0("`", ivs, "`", collapse = " + "))), data = dd)
      if (isTRUE(a$standardize)) { for (v in c(a$y, ivs)) dd[[v]] <- as.numeric(scale(dd[[v]])); fit <- lm(as.formula(paste0("`", a$y, "` ~ ", paste0("`", ivs, "`", collapse = " + "))), data = dd) }
      cf <- coef(summary(fit))[-1, , drop = FALSE]; ci <- confint(fit)[-1, , drop = FALSE]; k <- nrow(cf)
      add(q_fig(if (nzchar(ttl)) ttl else paste0("Coefficients for ", a$y, " (95% CI)"), function() { par(mar = c(4.2, 10, 2.6, 1.2)); o <- order(cf[, 1]); plot(cf[o, 1], seq_len(k), xlim = range(ci, 0), pch = 19, col = ACC, yaxt = "n", ylab = "", xlab = if (isTRUE(a$standardize)) "Standardised coefficient" else "Coefficient", main = if (nzchar(ttl)) ttl else paste0("Coefficients for ", a$y, " (95% CI, n = ", nrow(dd), ")")); axis(2, seq_len(k), rownames(cf)[o], las = 1, tick = FALSE); segments(ci[o, 1], seq_len(k), ci[o, 2], seq_len(k), col = INK, lwd = 2); abline(v = 0, lty = 2, col = "grey50") }, h = 300 + 110 * k)) },
    interaction = { y <- num(d, a$y); x <- num(d, a$x); m <- d[[a$moderator]]; mn <- suppressWarnings(as.numeric(m)); dd <- data.frame(y = y, x = x, m = if (all(!is.na(mn[!is.na(m)])) && length(unique(mn)) > 5) mn else factor(m)); dd <- dd[complete.cases(dd), ]
      fit <- lm(y ~ x * m, data = dd); xs <- seq(min(dd$x), max(dd$x), length.out = 50)
      lv <- if (is.factor(dd$m)) levels(dd$m) else { mu <- mean(dd$m); s <- sd(dd$m); c(mu - s, mu, mu + s) }; lab <- if (is.factor(dd$m)) lv else c("−1 SD", "mean", "+1 SD")
      add(q_fig(if (nzchar(ttl)) ttl else paste0("Effect of ", a$x, " on ", a$y, " by ", a$moderator), function() { plot(NA, xlim = range(xs), ylim = range(dd$y), xlab = a$x, ylab = a$y, main = if (nzchar(ttl)) ttl else paste0(a$x, " × ", a$moderator, " on ", a$y)); points(dd$x, dd$y, pch = 16, col = adjustcolor("grey50", .3))
        for (i in seq_along(lv)) { nd <- data.frame(x = xs, m = if (is.factor(dd$m)) factor(lv[i], levels = lv) else lv[i]); p <- predict(fit, nd, interval = "confidence"); polygon(c(xs, rev(xs)), c(p[, 2], rev(p[, 3])), col = adjustcolor(PAL[i], .15), border = NA); lines(xs, p[, 1], col = PAL[i], lwd = 2) }
        legend("topleft", bty = "n", lwd = 2, col = PAL[seq_along(lv)], legend = lab, title = a$moderator)
        pi <- coef(summary(fit)); r <- grep(":", rownames(pi)); pv <- pi[r[1], 4]; mtext(sprintf("interaction b = %.3f, %s", pi[r[1], 1], if (pv < .001) "p < .001" else sub("0\\.", ".", sprintf("p = %.3f", pv))), side = 3, line = .2, cex = .75, col = "grey35") })) },
    km = { tm <- num(d, a$time); ev <- d[[a$event]]; if (!all(ev %in% c(0, 1, NA))) { ev <- factor(ev); ev <- as.numeric(ev == levels(ev)[2]) }; gg <- if (is.null(g)) factor(rep("all", length(tm))) else g; ok <- !is.na(tm) & !is.na(ev) & !is.na(gg)
      km <- survival::survfit(survival::Surv(tm[ok], ev[ok]) ~ gg[ok])
      ng <- nlevels(droplevels(gg[ok])); add(q_fig(if (nzchar(ttl)) ttl else "Kaplan–Meier survival", function() { par(mar = c(5.8 + 1 * ng, 4.4, 2.6, 1.2)); plot(km, col = PAL[seq_len(nlevels(droplevels(gg[ok])))], lwd = 2, conf.int = nlevels(droplevels(gg[ok])) == 1, mark.time = TRUE, xlab = a$time, ylab = "Survival probability", main = if (nzchar(ttl)) ttl else "Kaplan–Meier survival", bty = "l")
        lv <- levels(droplevels(gg[ok])); if (length(lv) > 1) { lr <- survival::survdiff(survival::Surv(tm[ok], ev[ok]) ~ gg[ok]); legend("bottomleft", bty = "n", lwd = 2, col = PAL[seq_along(lv)], legend = lv, title = sprintf("%s (log-rank p = %.3f)", a$group, pchisq(lr$chisq, length(lv) - 1, lower.tail = FALSE))) }
        at <- pretty(c(0, max(tm[ok]))); at <- at[at <= max(tm[ok])]; s <- summary(km, times = at, extend = TRUE); mtext("Number at risk", side = 1, line = 4, adj = 0, cex = .75, font = 2)
        for (i in seq_along(lv)) { sel <- if (length(lv) > 1) s$strata == levels(s$strata)[i] else rep(TRUE, length(s$time)); mtext(s$n.risk[sel], side = 1, line = 4.6 + .9 * i, at = s$time[sel], cex = .7, col = PAL[i]) } }, h = 1150 + 70 * ng)) },
    waterfall = { lab <- as.character(d[[a$x]]); v <- num(d, a$y); ok <- !is.na(v) & !is.na(lab); lab <- lab[ok]; v <- v[ok]; if (anyDuplicated(lab)) { u <- unique(lab); v <- as.numeric(tapply(v, factor(lab, levels = u), sum)); lab <- u }; cum <- cumsum(v); start <- c(0, head(cum, -1))
      add(q_fig(if (nzchar(ttl)) ttl else paste0("Bridge of ", a$y), function() { par(mar = c(7, 4.4, 2.6, 1)); n <- length(v); plot(NA, xlim = c(.5, n + 1.5), ylim = range(0, start, cum) * 1.1, xaxt = "n", xlab = "", ylab = a$y, main = if (nzchar(ttl)) ttl else paste0("Bridge of ", a$y))
        rect(seq_len(n) - .35, start, seq_len(n) + .35, cum, col = ifelse(v >= 0, PAL[1], PAL[2]), border = NA); rect(n + 1 - .35, 0, n + 1 + .35, tail(cum, 1), col = "grey45", border = NA); segments(seq_len(n) + .35, cum, seq_len(n) + .65, cum, col = "grey60", lty = 3)
        axis(1, seq_len(n + 1), c(lab, "Total"), las = 2, tick = FALSE); text(seq_len(n), pmax(start, cum), formatC(v, format = "fg", digits = 3, big.mark = ","), pos = 3, cex = .7) })) },
    stop(paste0("Unknown chart type '", type, "'")))
  out
}

# ---- data audit: what the file actually holds, before any analysis ----
q_data_audit <- function(d, id = NULL) {
  cols <- lapply(names(d), function(v) { x <- d[[v]]; xn <- suppressWarnings(as.numeric(as.character(x))); nn <- sum(!is.na(x) & !(as.character(x) %in% c("", "NA")))
    numeric_share <- if (nn) sum(!is.na(xn)) / nn else 0; type <- if (numeric_share > .95) "numeric" else if (numeric_share > .5) "mixed (mostly numeric)" else "text/category"
    o <- list(variable = v, type = type, n_nonmissing = nn, missing = nrow(d) - nn, missing_pct = 100 * (nrow(d) - nn) / max(nrow(d), 1), distinct = length(unique(x[!is.na(x)])))
    if (type != "text/category") { z <- xn[!is.na(xn)]; q <- quantile(z, c(.25, .75)); iqr <- q[2] - q[1]
      o <- c(o, list(min = min(z), median = median(z), max = max(z), mean = mean(z), sd = sd(z), outliers_iqr = sum(z < q[1] - 3 * iqr | z > q[2] + 3 * iqr), zeros = sum(z == 0), negatives = sum(z < 0),
        non_numeric_values = if (numeric_share < 1) paste(head(unique(as.character(x[is.na(xn) & !is.na(x) & as.character(x) != ""])), 5), collapse = "; ") else "")) }
    else o$top_values <- paste(head(names(sort(table(x), decreasing = TRUE)), 5), collapse = "; ")
    o })
  dup_rows <- sum(duplicated(d))
  dup_ids <- if (!is.null(id) && id %in% names(d)) sum(duplicated(d[[id]])) else NA
  list(rows = nrow(d), columns = ncol(d), duplicate_rows = dup_rows, duplicate_ids = dup_ids, id = id %||% NA, complete_rows = sum(complete.cases(d)), variables = cols)
}

# ---- statistical power and sample size (closed-form or noncentral distributions; base R) ----
q_power <- function(a) {
  test <- a$test; alpha <- a$alpha %||% .05; pw <- a$power; n <- a$n; es <- a$effect
  if (is.null(es) && test != "proportions") stop("Give the expected effect size ('effect').")
  solve_n <- function(fun, lo = 2, hi = 1e6) { if (fun(hi) < pw) return(NA); while (hi - lo > 1) { m <- floor((lo + hi) / 2); if (fun(m) >= pw) hi <- m else lo <- m }; hi }
  r <- switch(test,
    ttest = { f <- function(nn) power.t.test(n = nn, delta = es, sd = 1, sig.level = alpha)$power; list(effect = "Cohen's d", per_group = !is.null(pw) && is.null(n), n_per_group = if (is.null(n)) solve_n(f) else n, power = if (is.null(n)) pw else f(n)) },
    paired = { f <- function(nn) power.t.test(n = nn, delta = es, sd = 1, sig.level = alpha, type = "paired")$power; list(effect = "Cohen's dz", n_pairs = if (is.null(n)) solve_n(f) else n, power = if (is.null(n)) pw else f(n)) },
    correlation = { f <- function(nn) { z <- atanh(es) * sqrt(nn - 3); pnorm(z - qnorm(1 - alpha / 2)) + pnorm(-z - qnorm(1 - alpha / 2)) }; list(effect = "r", n = if (is.null(n)) solve_n(function(nn) f(max(nn, 4))) else n, power = if (is.null(n)) pw else f(n)) },
    anova = { k <- a$groups %||% 3; f <- function(nn) { N <- nn * k; pf(qf(1 - alpha, k - 1, N - k), k - 1, N - k, ncp = es^2 * N, lower.tail = FALSE) }; list(effect = "Cohen's f", groups = k, n_per_group = if (is.null(n)) solve_n(f) else n, power = if (is.null(n)) pw else f(n)) },
    regression = { u <- a$predictors %||% 1; f <- function(N) { v <- N - u - 1; if (v < 1) return(0); pf(qf(1 - alpha, u, v), u, v, ncp = es * N, lower.tail = FALSE) }; list(effect = "Cohen's f² for the tested predictors", predictors_tested = u, n = if (is.null(n)) solve_n(f, lo = u + 2) else n, power = if (is.null(n)) pw else f(n)) },
    proportions = { p1 <- a$p1; p2 <- a$p2; if (is.null(p1) || is.null(p2)) stop("Give p1 and p2."); f <- function(nn) power.prop.test(n = nn, p1 = p1, p2 = p2, sig.level = alpha)$power; list(effect = "two proportions", p1 = p1, p2 = p2, n_per_group = if (is.null(n)) solve_n(f) else n, power = if (is.null(n)) pw else f(n)) },
    survival = { hr <- es; share <- a$allocation %||% .5; pw0 <- pw %||% .8; ev <- ceiling((qnorm(1 - alpha / 2) + qnorm(pw0))^2 / (share * (1 - share) * log(hr)^2)); er <- a$event_rate
      list(effect = "hazard ratio", method = "Schoenfeld (1983) events formula", events_needed = ev, allocation = share, firms_needed = if (!is.null(er)) ceiling(ev / er) else NA, event_rate = er %||% NA, power = pw0) },
    stop("test must be ttest, paired, correlation, anova, regression, proportions or survival"))
  c(list(test = test, alpha = alpha, effect_size = es), r)
}

# ---- EGBA: evidence-graded bounds analysis (organisational-form cost comparison, paired evaluation) ----
# Input data: one row per source observation with columns param, form, country, sector, low, high,
# evidence_class (A-E), related_party (0/1), scenario (optional). A cell is "COUNTRY:SECTOR[:SCENARIO]".
EGBA_RUNGS <- c("A", "AB", "ABC", "ABCD", "ABCDE")
egba_rows <- function(d, cell, norp = FALSE) {
  k <- strsplit(cell, ":", fixed = TRUE)[[1]]; ctry <- k[1]; sec <- if (length(k) > 1) k[2] else "all"; scen <- if (length(k) > 2) k[3] else ""
  s <- if ("scenario" %in% names(d)) ifelse(is.na(d$scenario), "", as.character(d$scenario)) else rep("", nrow(d))
  rp <- if ("related_party" %in% names(d)) suppressWarnings(as.numeric(d$related_party)) else rep(0, nrow(d))
  keep <- d$country == ctry & (d$sector == sec | d$sector == "all" | sec == "all") & (s == "" | s == scen)
  if (norp) keep <- keep & (is.na(rp) | rp != 1)
  x <- d[keep, , drop = FALSE]; x$low <- as.numeric(x$low); x$high <- as.numeric(x$high); x
}
egba_env <- function(x, p, f, rung) {
  cls <- strsplit(rung, "")[[1]]
  r <- x[x$param == p & (x$form == f | x$form == "both") & toupper(x$evidence_class) %in% cls, , drop = FALSE]
  if (!nrow(r)) return(NULL); c(min(r$low), max(r$high))
}
egba_label <- function(lo, hi) if (hi < 0) "integration favoured" else if (lo > 0) "specialist favoured" else "assumption-sensitive"
egba_cell <- function(x, Q, rung = "ABCDE") {
  need <- list(rho = c("rho", "S"), p_S = c("p", "S"), F_S = c("F", "S"), F_I = c("F", "I"), o_I = c("o", "I"))
  b <- lapply(need, function(n) egba_env(x, n[1], n[2], rung)); miss <- names(b)[vapply(b, is.null, TRUE)]
  fr <- if (any(c("rho", "p_S", "F_S", "F_I") %in% miss)) NULL else {
    rp <- c(b$rho[1] * b$p_S[1], b$rho[2] * b$p_S[2])
    data.frame(Q = Q, oI_star_IR = rp[1] + (b$F_S[1] - b$F_I[2]) / Q, oI_star_SR = rp[2] + (b$F_S[2] - b$F_I[1]) / Q) }
  e1 <- if (length(miss)) NULL else {
    rp <- c(b$rho[1] * b$p_S[1], b$rho[2] * b$p_S[2])
    lo <- b$o_I[1] - rp[2] + (b$F_I[1] - b$F_S[2]) / Q; hi <- b$o_I[2] - rp[1] + (b$F_I[2] - b$F_S[1]) / Q
    data.frame(Q = Q, E1_low = lo, E1_high = hi, label = mapply(egba_label, lo, hi)) }
  list(missing = miss, frontier = fr, e1 = e1, M2_ceiling = if (is.null(b$o_I)) NA else b$o_I[2])
}
q_egba <- function(d, cells, Q = c(500, 1000, 2000, 4000, 6000, 8000, 10000), q_star = 500) {
  for (v in c("param", "form", "country", "sector", "low", "high", "evidence_class")) if (!v %in% names(d)) stop(paste0("EGBA needs column '", v, "'"))
  out <- lapply(setNames(cells, cells), function(cell) {
    one <- function(norp) {
      x <- egba_rows(d, cell, norp); if (!nrow(x)) stop(paste0("no rows for cell ", cell))
      ladder <- lapply(EGBA_RUNGS, function(rg) { r <- egba_cell(x, q_star, rg)
        list(rung = rg, identified = is.null(r$e1) == FALSE, missing = if (length(r$missing)) paste(r$missing, collapse = ", ") else "",
             E1_low = if (is.null(r$e1)) NA else r$e1$E1_low, E1_high = if (is.null(r$e1)) NA else r$e1$E1_high, label = if (is.null(r$e1)) "NOT IDENTIFIED" else r$e1$label) })
      main <- egba_cell(x, Q, "ABCDE")
      grade <- { g <- NA; for (L in ladder) if (L$identified && L$label != "assumption-sensitive") { g <- substr(L$rung, nchar(L$rung), nchar(L$rung)); break }; g }
      list(rows_used = nrow(x), missing = main$missing, M2_ceiling = main$M2_ceiling,
           paired = if (is.null(main$e1)) paste0("NOT IDENTIFIED (missing ", paste(main$missing, collapse = ", "), ")") else main$e1,
           frontier = if (is.null(main$frontier)) "NOT IDENTIFIED" else main$frontier,
           ladder_at_q_star = ladder, evidence_grade_at_q_star = grade,
           status = if (is.null(main$e1) && is.null(main$frontier)) "NOT IDENTIFIED" else "CONDITIONAL MODEL RESULT") }
    m <- one(FALSE); n <- one(TRUE)
    changed <- if (is.data.frame(m$paired) && is.data.frame(n$paired)) any(m$paired$label != n$paired$label) else NA
    c(m, list(norp = n, label_changed_without_related_party = changed)) })
  list(method = "Evidence-Graded Bounds Analysis (EGBA), paired evaluation", q_star = q_star, Q = Q, cells = out)
}
egba_plots <- function(d, a) {
  r <- q_egba(d, a$cells, a$q_grid %||% c(500, 1000, 2000, 4000, 6000, 8000, 10000), a$q_star %||% 500); figs <- list()
  add <- function(f) figs[[length(figs) + 1]] <<- f
  shades <- c("grey10", "grey45", "grey70", "grey30"); ltys <- c(1, 2, 4, 5, 3)
  pc <- Filter(function(c) is.data.frame(c$paired), r$cells)
  if (length(pc)) add(q_fig("EGBA: paired cost difference per session", function() {
    Qs <- r$Q; k <- length(pc); allv <- unlist(lapply(pc, function(c) c(c$paired$E1_low, c$paired$E1_high)))
    plot(NA, xlim = c(.5, length(Qs) + .5), ylim = range(c(allv, 0)), xaxt = "n", xlab = "Sessions per year (Q)", ylab = "E1 = AC_I - AC_S (EUR per session)", main = "Paired cost difference per session")
    axis(1, seq_along(Qs), format(Qs, big.mark = ",")); abline(h = 0, col = "black")
    for (j in seq_len(k)) { p <- pc[[j]]$paired; xs <- seq_along(Qs) + (j - (k + 1) / 2) * .22; segments(xs, p$E1_low, xs, p$E1_high, lwd = 7, lend = 1, col = shades[j]) }
    legend("bottomright", names(pc), lwd = 7, col = shades[seq_len(k)], bty = "n", cex = .8) }))
  fc <- Filter(function(c) is.data.frame(c$frontier), r$cells)
  if (length(fc)) add(q_fig("EGBA: breakdown frontier", function() {
    ys <- unlist(lapply(fc, function(c) c$frontier$oI_star_IR)); ce <- unlist(lapply(fc, function(c) c$M2_ceiling)); ce <- ce[is.finite(ce)]
    plot(NA, xlim = range(r$Q), ylim = c(0, max(c(ys, ce)) * 1.1), xlab = "Sessions per year (Q)", ylab = "Host opportunity cost o_I (EUR per session)", main = "Breakdown frontier: integration favoured below the line")
    for (j in seq_along(fc)) { f <- fc[[j]]$frontier; lines(f$Q, f$oI_star_IR, lty = ltys[j], lwd = 2, col = shades[j]) }
    for (j in seq_along(fc)) { cv <- fc[[j]]$M2_ceiling; if (is.finite(cv)) { abline(h = cv, lty = 3, col = "grey40"); text(min(r$Q), cv, paste0("M2 ceiling, ", names(fc)[j]), adj = c(0, -0.5), cex = .7, col = "grey30") } }
    legend("topright", names(fc), lty = ltys[seq_along(fc)], lwd = 2, col = shades[seq_along(fc)], bty = "n", cex = .8) }))
  for (nm in names(r$cells)) { L <- r$cells[[nm]]$ladder_at_q_star
    add(q_fig(paste0("EGBA: evidence ladder, ", nm), function() {
      v <- unlist(lapply(L, function(l) c(l$E1_low, l$E1_high))); v <- v[is.finite(v)]; yl <- if (length(v)) range(c(v, 0)) * 1.1 else c(-1, 1)
      plot(NA, xlim = c(.5, 5.5), ylim = yl, xaxt = "n", xlab = "Evidence rung", ylab = "E1 (EUR per session)", main = paste0("Evidence ladder, ", nm, ", Q = ", format(r$q_star, big.mark = ",")))
      axis(1, 1:5, c("A", "A-B", "A-C", "A-D", "A-E")); abline(h = 0)
      for (i in 1:5) { l <- L[[i]]; if (l$identified) segments(i, l$E1_low, i, l$E1_high, lwd = 9, lend = 1, col = "grey20") else text(i, if (length(v)) mean(yl) else yl[1] + .7 * diff(yl), paste0("NOT\nIDENTIFIED\n(missing\n", gsub(", ", ",\n", l$missing), ")"), cex = .6, col = "grey30") } })) }
  figs
}
