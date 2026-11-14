# Quartile survey planner, run in R (base R only).
# Sample size for each planned analysis, the completes needed per country group, the invitations needed,
# survey length, and an anonymity check on the background questions. Formulas:
#   conjoint      Johnson-Orme rule N >= 500 c / (t a)  (Orme, 2010) and a two-group test for a between-subject manipulation
#   two_group     two-sample t test (Cohen's d), power.t.test
#   cfa           RMSEA test of close fit, MacCallum, Browne & Sugawara (1996), noncentral chi-square; per group for invariance
#   regression    F test of the added predictors, Cohen's f2, noncentral F (Cohen, 1988)
#   logistic      events per variable (Peduzzi et al., 1996) and precision of the overall outcome rate (Riley et al., 2020)
#   correlation   Fisher z
# Finite population correction n / (1 + (n - 1) / N); invitations = completes / (response rate x (1 - loss)).
# k-anonymity check (Sweeney, 2002): smallest expected cell of the background questions within each group should be >= k.
args <- commandArgs(trailingOnly = FALSE)
here <- dirname(sub("^--file=", "", args[grep("^--file=", args)][1]))
if (!exists("qj")) source(file.path(here, "rstats.R"))

sp_solve <- function(fun, target, lo = 2, hi = 1e6) { if (fun(hi) < target) return(NA); while (hi - lo > 1) { m <- floor((lo + hi) / 2); if (fun(m) >= target) hi <- m else lo <- m }; hi }

sp_component <- function(c, alpha, power) {
  t <- c$type
  switch(t,
    conjoint = {
      lev <- c$levels_max %||% 4; tasks <- c$tasks %||% 8; alt <- c$alternatives %||% 2
      n <- ceiling(500 * lev / (tasks * alt))
      list(type = t, per_group = isTRUE(c$per_group), n = n, formula = "Johnson-Orme: N >= 500 c / (t a)",
           inputs = list(levels_max = lev, tasks = tasks, alternatives = alt), source = "Orme (2010), Getting Started with Conjoint Analysis") },
    two_group = {
      d <- c$d %||% 0.3
      f <- function(nn) power.t.test(n = nn, delta = d, sd = 1, sig.level = alpha)$power
      ng <- sp_solve(f, power)
      list(type = t, per_group = isTRUE(c$per_group), n = 2 * ng, n_per_arm = ng, formula = "two-sample t test, power.t.test",
           inputs = list(d = d), source = "Cohen (1988)") },
    cfa = {
      p <- c$items %||% 12; k <- c$factors %||% 3; e0 <- c$rmsea0 %||% 0.05; ea <- c$rmsea_a %||% 0.08
      df <- p * (p + 1) / 2 - (2 * p + k * (k - 1) / 2)
      if (df < 1) stop("CFA model has no degrees of freedom: add items or reduce factors.")
      f <- function(N) { c0 <- qchisq(1 - alpha, df, ncp = (N - 1) * df * e0^2); pchisq(c0, df, ncp = (N - 1) * df * ea^2, lower.tail = FALSE) }
      n <- sp_solve(f, power, lo = 10)
      n <- max(n, c$min_n %||% 0)
      list(type = t, per_group = isTRUE(c$per_group %||% TRUE), n = n, df = df, formula = "RMSEA close-fit test, noncentral chi-square",
           inputs = list(items = p, factors = k, rmsea0 = e0, rmsea_a = ea), source = "MacCallum, Browne & Sugawara (1996), Psychological Methods") },
    regression = {
      f2 <- c$f2 %||% 0.02; u <- c$predictors %||% 1; tot <- c$total_predictors %||% u
      f <- function(N) { v <- N - tot - 1; if (v < 1) return(0); pf(qf(1 - alpha, u, v), u, v, ncp = f2 * N, lower.tail = FALSE) }
      n <- sp_solve(f, power, lo = tot + 2)
      list(type = t, per_group = isTRUE(c$per_group), n = n, formula = "F test of added predictors, noncentral F, lambda = f2 N",
           inputs = list(f2 = f2, predictors_tested = u, total_predictors = tot), source = "Cohen (1988)") },
    logistic = {
      k <- c$predictors %||% 8; phi <- c$event_rate %||% 0.3; epv <- c$epv %||% 10; delta <- c$precision %||% 0.05
      n_epv <- ceiling(epv * k / min(phi, 1 - phi)); n_prec <- ceiling((qnorm(1 - alpha / 2) / delta)^2 * phi * (1 - phi))
      list(type = t, per_group = isTRUE(c$per_group), n = max(n_epv, n_prec), n_epv = n_epv, n_precision = n_prec,
           formula = "max(EPV rule, precision of the outcome rate)", inputs = list(predictors = k, event_rate = phi, epv = epv, precision = delta),
           source = "Peduzzi et al. (1996), J Clin Epidemiol; Riley et al. (2020), BMJ") },
    correlation = {
      r <- c$r %||% 0.2
      f <- function(nn) { z <- atanh(r) * sqrt(max(nn, 4) - 3); pnorm(z - qnorm(1 - alpha / 2)) + pnorm(-z - qnorm(1 - alpha / 2)) }
      list(type = t, per_group = isTRUE(c$per_group), n = sp_solve(f, power, lo = 4), formula = "Fisher z", inputs = list(r = r), source = "Cohen (1988)") },
    stop(paste0("Unknown component type '", t, "'.")))
}

q_survey_plan <- function(s) {
  alpha <- s$alpha %||% 0.05; power <- s$power %||% 0.80; loss <- s$completion_loss %||% 0.15
  groups <- s$groups; G <- length(groups); if (G < 1) stop("Give at least one group.")
  papers <- lapply(s$papers, function(p) {
    comps <- lapply(p$components, sp_component, alpha = alpha, power = power)
    pg <- max(c(0, vapply(comps, function(x) if (isTRUE(x$per_group)) x$n else 0, 0)))
    ov <- max(c(0, vapply(comps, function(x) if (!isTRUE(x$per_group)) x$n else 0, 0)))
    list(name = p$name, components = comps, items = p$items %||% 0, interviews = p$interviews %||% 0,
         per_group_needed = pg, overall_needed = ov, total_needed = max(ov, pg * G))
  })
  per_group <- max(vapply(papers, function(p) p$per_group_needed, 0))
  overall <- max(vapply(papers, function(p) p$overall_needed, 0))
  base_per_group <- max(per_group, ceiling(overall / G), ceiling((s$target_total %||% 0) / G))
  qi <- s$quasi_identifiers %||% list(); k <- s$k %||% 5
  smallest_share <- prod(vapply(qi, function(q) q$smallest_share %||% (1 / (q$categories %||% 2)), 0))
  grp <- lapply(groups, function(g) {
    n <- base_per_group; Np <- g$population; fpc <- NA; feasible <- TRUE
    if (!is.null(Np)) { fpc <- ceiling(n / (1 + (n - 1) / Np)); if (n > Np) feasible <- FALSE; n_use <- fpc } else n_use <- n
    rr <- g$response_rate %||% s$response_rate %||% 0.10; el <- s$eligibility %||% 1
    invited <- ceiling(n_use / (rr * (1 - loss) * el))
    cell <- n_use * smallest_share
    list(group = g$name, completes_needed = n_use, before_fpc = n, population = Np %||% NA, response_rate = rr,
         invitations_needed = invited, feasible_with_population = if (is.null(Np)) NA else (invited <= Np && feasible),
         smallest_expected_cell = cell, k_anonymity_ok = cell >= k)
  })
  shared <- s$shared_items %||% 0; spi <- s$seconds_per_item %||% 8
  conj_sec <- sum(vapply(s$papers, function(p) sum(vapply(p$components, function(c) if (c$type == "conjoint") (c$tasks %||% 8) * (c$seconds_per_task %||% 30) else 0, 0)), 0))
  items <- shared + sum(vapply(papers, function(p) p$items, 0))
  minutes <- (items * spi + conj_sec) / 60; maxm <- s$max_minutes %||% 20
  total <- sum(vapply(grp, function(g) g$completes_needed, 0))
  checks <- list(
    list(check = "Each paper's sample requirement is met by the shared survey", pass = all(vapply(papers, function(p) p$total_needed <= total && p$per_group_needed <= base_per_group, TRUE))),
    list(check = paste0("Survey length within ", maxm, " minutes"), pass = minutes <= maxm, value = round(minutes, 1)),
    list(check = paste0("Background questions keep every expected cell >= ", k, " (k-anonymity)"), pass = all(vapply(grp, function(g) isTRUE(g$k_anonymity_ok), TRUE))),
    list(check = "Invitations fit the known population in each group", pass = all(vapply(grp, function(g) !isFALSE(g$feasible_with_population), TRUE))))
  anonymity <- c(
    "Do not ask for names, e-mail addresses, company names, registration numbers or exact addresses in the questionnaire.",
    "Keep any invitation list separate from the answers, never link them, and delete it after fieldwork.",
    "Switch off IP-address and location recording in the survey tool.",
    "Ask size, revenue, age and staff numbers in bands, not exact values.",
    "Avoid open text that could name a firm or person; if kept, screen and redact before analysis.",
    paste0("Report no table cell with fewer than ", k, " respondents; merge categories where needed (k-anonymity, Sweeney 2002)."),
    "State anonymity in the participant information (GDPR Recital 26: anonymous data fall outside the GDPR only if no one can be re-identified).")
  list(settings = list(alpha = alpha, power = power, completion_loss = loss, eligibility = s$eligibility %||% 1, target_total = s$target_total %||% NA, groups = G, k = k),
       papers = papers, completes_per_group = base_per_group, total_completes = total,
       total_invitations = sum(vapply(grp, function(g) g$invitations_needed, 0)), groups = grp,
       survey = list(items = items, conjoint_seconds = conj_sec, minutes = round(minutes, 1)),
       pattern_checks = checks, pattern_ok = all(vapply(checks, function(x) isTRUE(x$pass), TRUE)), anonymity_rules = anonymity)
}
