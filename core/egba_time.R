# Quartile EGBA-Time, base R. Rules:
# stage-sum bounds from evidence grades (intersection in ladder order), optional direct total interval,
# censoring for pending routes (latency >= elapsed), interval answers with their own unit, classification against
# the action window (surely on time / surely late / undetermined / not usable / not identified), temporal margin,
# and Manski worst-case bounds on the share of routes usable in time with 95% Wilson intervals for each endpoint.
EGT_UNIT <- c(days = 1, weeks = 7, months = 30.4375)
EGT_NOT_USABLE <- c("refused", "withdrawn", "abandoned", "conditions_unmet")

egt_iv <- function(ev, uf) {
  if (is.list(ev) && !is.null(ev$low)) { f <- if (!is.null(ev$unit)) EGT_UNIT[[ev$unit]] / uf else 1; x <- c(as.numeric(ev$low), as.numeric(ev$high)) }
  else { f <- 1; x <- as.numeric(unlist(ev)) }
  sort(x) * f
}
egt_admit <- function(grades, ladder, uf, where, env) {
  cur <- NULL
  for (g in ladder) { ev <- grades[[g]]; if (is.null(ev)) next
    nw <- egt_iv(ev, uf)
    if (is.null(cur)) cur <- nw else { lo <- max(cur[1], nw[1]); hi <- min(cur[2], nw[2])
      if (lo > hi) env$conflicts[[length(env$conflicts) + 1]] <- list(where = where, grade = g, kept = cur, rejected = nw) else cur <- c(lo, hi) } }
  cur
}
egt_wilson <- function(k, n, z = 1.959964) {
  if (n == 0) return(c(NA, NA)); p <- k / n; den <- 1 + z^2 / n; c0 <- (p + z^2 / (2 * n)) / den
  h <- z * sqrt(p * (1 - p) / n + z^2 / (4 * n^2)) / den; c(max(0, c0 - h), min(1, c0 + h))
}

q_egba_time <- function(s) {
  ladder <- unlist(s$ladder %||% list("A", "B", "C", "D", "E", "S", "I")); unit <- s$unit %||% "days"; uf <- EGT_UNIT[[unit]]
  cap <- as.numeric(s$max_latency %||% 365); env <- new.env(); env$conflicts <- list()
  counts <- list(`surely on time` = 0, `surely late` = 0, undetermined = 0, `not usable` = 0, `not identified` = 0)
  routes <- lapply(seq_along(s$routes), function(i) {
    r <- s$routes[[i]]; rid <- r$id %||% paste0("route", i); status <- r$status %||% "completed"
    stages <- r$stages %||% list(); st <- list(); missing <- character(0)
    if (length(stages) && is.null(names(stages))) stop(paste0(rid, ": stages must be named, e.g. stages = {approval: {A: [10, 20]}}"))
    for (nm in names(stages)) { iv <- egt_admit(stages[[nm]], ladder, uf, paste0(rid, "/", nm), env); if (is.null(iv)) missing <- c(missing, nm); st[nm] <- list(iv) }
    L <- if (length(stages) && !length(missing)) c(sum(vapply(st, `[`, 0, 1)), sum(vapply(st, `[`, 0, 2))) else NULL
    if (!is.null(r$total)) { T <- egt_admit(r$total, ladder, uf, paste0(rid, "/total"), env)
      if (!is.null(T)) { if (is.null(L)) L <- T else { lo <- max(L[1], T[1]); hi <- min(L[2], T[2])
        if (lo > hi) env$conflicts[[length(env$conflicts) + 1]] <- list(where = paste0(rid, "/total"), grade = "total", kept = L, rejected = T) else L <- c(lo, hi) } } }
    if (identical(status, "pending") && !is.null(r$elapsed)) { e <- as.numeric(r$elapsed)
      if (is.null(L)) L <- c(e, cap) else if (L[2] < e) { env$conflicts[[length(env$conflicts) + 1]] <- list(where = paste0(rid, "/censoring"), grade = "elapsed", kept = c(e, cap), rejected = L); L <- c(e, cap) } else L <- c(max(L[1], e), L[2]) }
    W <- if (is.null(r$window)) NULL else { w <- as.numeric(unlist(r$window)); if (length(w) == 1) c(w, w) else sort(w) }
    label <- if (status %in% EGT_NOT_USABLE) "not usable" else if (is.null(L) || is.null(W)) "not identified" else if (L[2] <= W[1]) "surely on time" else if (L[1] > W[2]) "surely late" else "undetermined"
    counts[[label]] <<- counts[[label]] + 1
    rec <- list(id = rid, status = status, missing_stages = missing, latency = L, window = W, label = label, ex_ante = status %in% c("screened_out", "not_attempted"))
    if (!is.null(L) && !is.null(W)) { rec$margin <- c(W[1] - L[2], W[2] - L[1]); rec$window_needed_surely_on_time <- L[2] }
    rec
  })
  K <- length(routes); lo_k <- counts[["surely on time"]]; hi_k <- lo_k + counts[["undetermined"]] + counts[["not identified"]]
  list(unit = unit, ladder = ladder, routes = routes, counts = counts,
       share_usable_in_time = list(routes = K, lower = lo_k / K, upper = hi_k / K, lower_wilson95 = egt_wilson(lo_k, K), upper_wilson95 = egt_wilson(hi_k, K),
                                   rule = "Manski worst-case: undetermined and not-identified routes counted as late for the lower bound and on time for the upper bound"),
       conflicts = env$conflicts)
}
