# Quartile EGBA (Evidence-Graded Bounds Analysis), base R.
# Evidence grades are admitted in ladder order (default A-E documentary/public, S survey answers, I interviews).
# A parameter's interval is the intersection of the intervals admitted so far; no interval yet = NOT IDENTIFIED;
# a non-overlapping new interval is recorded as a conflict and the earlier interval is kept. Survey evidence may be
# raw answers: 95% CI of the mean ("ci95") or the 10th-90th percentile range ("p10p90"). Bounds by corner enumeration
# (exact for expressions linear in each parameter). Breakdown: value of one parameter at which the least favourable
# bound reaches the threshold.
EGBA_OPS <- c("+", "-", "*", "/", "^", "(", "min", "max", "abs", "log", "exp", "sqrt")

egba_interval <- function(ev) {
  if (is.list(ev) && !is.null(ev$values)) {
    v <- sort(as.numeric(unlist(ev$values))); if (length(v) < 2) stop("survey evidence needs at least two answers")
    if (identical(ev$method, "p10p90")) { q <- function(p) v[min(length(v), max(1, floor(p * (length(v) - 1) + 0.5) + 1))]; return(c(q(.10), q(.90))) }
    h <- 1.959964 * sd(v) / sqrt(length(v)); return(c(mean(v) - h, mean(v) + h))
  }
  if (is.list(ev) && !is.null(ev$low)) return(c(as.numeric(ev$low), as.numeric(ev$high)))
  x <- as.numeric(unlist(ev)); c(min(x), max(x))
}

q_egba <- function(s) {
  ex <- parse(text = s$expression)[[1]]
  nm <- all.names(ex); vars <- all.vars(ex); ops <- setdiff(nm, vars)
  bad <- setdiff(ops, EGBA_OPS); if (length(bad)) stop(paste("expression element not allowed:", paste(bad, collapse = ", ")))
  fixed <- lapply(s$fixed %||% list(), as.numeric); params <- s$parameters %||% list()
  ladder <- unlist(s$ladder %||% list("A", "B", "C", "D", "E", "S", "I")); thr <- as.numeric(s$threshold %||% 0)
  lb <- s$label_below %||% "below threshold favoured"; la <- s$label_above %||% "above threshold favoured"
  miss <- setdiff(vars, c(names(fixed), names(params))); if (length(miss)) stop(paste("no value or evidence for:", paste(miss, collapse = ", ")))
  if (length(params) > 14) stop("at most 14 uncertain parameters")
  f <- function(env) eval(ex, c(env, fixed), baseenv())
  cur <- setNames(vector("list", length(params)), names(params)); rungs <- list(); conflicts <- list()
  corners <- function(iv) { g <- expand.grid(iv, KEEP.OUT.ATTRS = FALSE); vapply(seq_len(nrow(g)), function(i) f(as.list(g[i, , drop = FALSE])), 0) }
  for (g in ladder) {
    for (p in names(params)) { ev <- params[[p]][[g]]; if (is.null(ev)) next
      nw <- egba_interval(ev); cc <- cur[[p]]
      if (is.null(cc)) cur[[p]] <- nw else { lo <- max(cc[1], nw[1]); hi <- min(cc[2], nw[2])
        if (lo > hi) conflicts[[length(conflicts) + 1]] <- list(rung = g, parameter = p, kept = cc, rejected = nw) else cur[[p]] <- c(lo, hi) } }
    missing <- names(cur)[vapply(cur, is.null, TRUE)]
    if (length(missing)) { rungs[[length(rungs) + 1]] <- list(rung = g, status = "NOT IDENTIFIED", missing = missing); next }
    v <- corners(cur); lo <- min(v); hi <- max(v)
    rungs[[length(rungs) + 1]] <- list(rung = g, status = if (hi < thr) lb else if (lo > thr) la else "assumption-sensitive", low = lo, high = hi,
                                      intervals = lapply(cur, function(x) x))
  }
  out <- list(expression = s$expression, threshold = thr, ladder = ladder, rungs = rungs, conflicts = conflicts,
              method = "corner enumeration (exact for expressions linear in each parameter)")
  bp <- s$breakdown_parameter; last <- rungs[[length(rungs)]]
  if (!is.null(bp) && !is.null(last$intervals)) {
    iv <- last$intervals; oth <- iv[setdiff(names(iv), bp)]; side <- s$breakdown_side %||% "high"
    worst <- function(x) { e <- c(setNames(list(x), bp)); vs <- if (length(oth)) { g <- expand.grid(oth, KEEP.OUT.ATTRS = FALSE); vapply(seq_len(nrow(g)), function(i) f(c(e, as.list(g[i, , drop = FALSE]))), 0) } else f(e); (if (side == "high") max(vs) else min(vs)) - thr }
    ab <- if (!is.null(s$breakdown_range)) as.numeric(unlist(s$breakdown_range)) else iv[[bp]]; a <- ab[1]; b <- ab[2]
    ga <- worst(a); gb <- worst(b); step <- max(abs(b - a), 1)
    for (i in 1:40) { if (ga * gb <= 0) break; a <- a - step; b <- b + step; step <- step * 2; ga <- worst(a); gb <- worst(b) }
    if (ga * gb > 0) out$breakdown <- list(parameter = bp, value = NA, note = "the bound does not cross the threshold")
    else { r <- uniroot(worst, c(a, b), tol = 1e-10)$root; out$breakdown <- list(parameter = bp, value = r, side = side, admitted_range = iv[[bp]], inside_admitted_range = r >= iv[[bp]][1] && r <= iv[[bp]][2]) }
  }
  out
}
