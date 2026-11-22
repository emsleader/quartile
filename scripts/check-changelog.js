// CI check (specification 3.4, item 10): every MCP tool must be named in CHANGELOG.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = fs.readFileSync(path.join(ROOT, "mcp", "server.js"), "utf8");
const names = new Set([...server.matchAll(/registerTool\("([a-z0-9_]+)"/g)].map(m => m[1]));
const { TOOLS } = await import("../tools/index.js");
for (const t of TOOLS) names.add(t.name);
const log = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
const missing = [...names].filter(n => !new RegExp("`" + n + "`").test(log));
if (missing.length) { console.error("Tools missing from CHANGELOG.md (write them as `name`): " + missing.join(", ")); process.exit(1); }
console.log(`CHANGELOG lists all ${names.size} tools.`);
