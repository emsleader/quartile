// Shared helpers for the bug regression tests. The example sentences come from the reports of 13 November 2026
// (the same sentences that tests/run.js has locked in since 0.14.1), mapped to the item numbers of the
// specification (Sections 3.1 to 3.4).
export { default as assert } from "node:assert/strict";
export { default as L } from "../../core/lib.js";
export { default as EV } from "../../core/evidence.js";
export { default as REG } from "../../core/registry.js";
export { default as RD } from "../../core/readiness.js";
export { default as RS } from "../../core/rstats.js";
export { parseText } from "../../core/text/parse.js";
export const BOUNDS_PAPER = "Specialist or add-on: bounds on the cost of a new service\nAbstract\nThis paper develops bounds on the incremental cost of adding a service to a host business, using filings for 56 firms. It contributes partial-identification bounds instead of point estimates.\n1. Introduction\nSmall firms add services to use idle capacity. We contribute bounds that hold under weak assumptions, citing prior work (Panzar & Willig, 1981; Teece, 1980).\nLiterature Review\nEconomies of scope and opportunity cost explain when sharing resources lowers cost (Panzar & Willig, 1981). Real options describe the value of waiting (Dixit & Pindyck, 1994).\nTheory and Propositions\nP1: shared resources lower the incremental cost when they are idle.\nData and Methods\nWe use filed accounts and advertised prices and compute partial-identification bounds; no model is estimated.\nBounds Analysis\nThe bounds show that the add-on is cheaper when idle capacity is large, and the breakdown frontier shows where the sign changes.\nImplications for small-business owners\nOwners should price the add-on from the bounds.\nLimitations\nThe bounds depend on the parameter ranges.\nConclusion\nThe add-on is cheaper under weak assumptions.";
