# Agreement between two screening reviewers (Cohen's kappa), base R only.
# Input: the CSV written by library_screening (action "export"): item_id, review, stage, reviewer, decision, reason, decided_at.
# Usage: Rscript scripts/screening-agreement.R screening.csv [reviewer_a reviewer_b] [out.json]
# Without reviewer names, the first two reviewers (alphabetical, "consensus" excluded) are compared.
# Output: one line of JSON per stage with n, observed agreement, expected agreement, kappa and the 2-way table.
# Kappa = (po - pe) / (1 - pe), Cohen (1960), Educational and Psychological Measurement, 20(1), 37-46.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("usage: Rscript screening-agreement.R screening.csv [reviewer_a reviewer_b] [out.json]")
d <- read.csv(args[1], stringsAsFactors = FALSE, na.strings = "")
d <- d[d$reviewer != "consensus", ]
revs <- if (length(args) >= 3) args[2:3] else sort(unique(d$reviewer))[1:2]
if (any(is.na(revs))) stop("need two reviewers in the file")
out_file <- if (length(args) == 2) args[2] else if (length(args) >= 4) args[4] else NA

esc <- function(s) gsub('"', '\\\\"', s)
results <- character(0)
for (st in sort(unique(d$stage))) {
  a <- d[d$stage == st & d$reviewer == revs[1], c("item_id", "decision")]
  b <- d[d$stage == st & d$reviewer == revs[2], c("item_id", "decision")]
  m <- merge(a, b, by = "item_id", suffixes = c("_a", "_b"))
  n <- nrow(m)
  if (n == 0) next
  lev <- sort(unique(c(m$decision_a, m$decision_b)))
  tab <- table(factor(m$decision_a, levels = lev), factor(m$decision_b, levels = lev))
  po <- sum(diag(tab)) / n
  pe <- sum(rowSums(tab) * colSums(tab)) / n^2
  kappa <- if (pe == 1) NA else (po - pe) / (1 - pe)
  cells <- character(0)
  for (i in seq_along(lev)) for (j in seq_along(lev)) cells <- c(cells, sprintf('"%s|%s": %d', esc(lev[i]), esc(lev[j]), tab[i, j]))
  results <- c(results, sprintf('{"stage": "%s", "reviewer_a": "%s", "reviewer_b": "%s", "n": %d, "observed_agreement": %.10f, "expected_agreement": %.10f, "kappa": %s, "table": {%s}, "r_version": "%s"}',
    esc(st), esc(revs[1]), esc(revs[2]), n, po, pe, if (is.na(kappa)) "null" else sprintf("%.10f", kappa), paste(cells, collapse = ", "), R.version$version.string))
}
json <- paste0("[", paste(results, collapse = ",\n"), "]")
if (!is.na(out_file)) writeLines(json, out_file) else cat(json, "\n")
