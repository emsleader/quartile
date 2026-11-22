// Item 10: the CHANGELOG names every tool (CI runs the same check).
import { assert } from "./_lib.js";
import { execFileSync } from "node:child_process";
const out = execFileSync(process.execPath, ["scripts/check-changelog.js"], { encoding: "utf8" });
assert.match(out, /CHANGELOG lists all \d+ tools/);
