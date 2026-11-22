# Small JSON writer for the validation scripts (base R only; jsonlite is not installed and CRAN is blocked).
# Usage in a script: source(file.path(here, "_json.R")); write_validation(name, module, fun, cases, pick = NULL)
# A case is list(args = list(...), expected = <number | logical | string | named list>).

here_dir <- function() {
  f <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))
  if (length(f)) dirname(normalizePath(f[1])) else getwd()
}

to_json <- function(x) {
  if (is.null(x)) return("null")
  if (is.list(x)) {
    nm <- names(x)
    if (!is.null(nm) && all(nzchar(nm))) {
      return(paste0("{", paste0('"', nm, '": ', vapply(x, to_json, ""), collapse = ", "), "}"))
    }
    return(paste0("[", paste(vapply(x, to_json, ""), collapse = ", "), "]"))
  }
  if (length(x) != 1) return(to_json(as.list(x)))
  if (is.logical(x)) return(if (is.na(x)) "null" else if (x) "true" else "false")
  if (is.character(x)) return(paste0('"', gsub('"', '\\\\"', x), '"'))
  if (is.numeric(x)) {
    if (!is.finite(x)) return("null")
    if (x == round(x) && abs(x) < 1e15) return(format(x, scientific = FALSE))
    return(sprintf("%.17g", x))
  }
  stop("cannot write value")
}

write_validation <- function(name, module, fun, cases, pick = NULL, note = NULL) {
  obj <- list(module = module, `function` = fun)
  if (!is.null(pick)) obj$pick <- pick
  obj$r_version <- R.version.string
  obj$packages <- "base R (stats) only; scrutiny is not installed and CRAN is blocked, so GRIM, GRIMMER and DEBIT are checked by brute-force enumeration"
  if (!is.null(note)) obj$note <- note
  obj$cases <- cases
  out <- file.path(here_dir(), paste0(name, ".json"))
  writeLines(to_json(obj), out)
  cat(sprintf("%s: %d cases written to %s\n", name, length(cases), out))
}
