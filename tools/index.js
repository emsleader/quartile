// Tool registry for new tools (specification Section 2: one file per tool in tools/).
// Each file default-exports { name, title, description, inputSchema, annotations?, meta?, handler }.
// inputSchema is a zod raw shape ({ field: z.string(), ... }); handler(args) returns a plain object, which is sent
// as JSON text plus structuredContent. Existing tools stay registered in mcp/server.js unchanged.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TOOL_FILES = fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && f !== "index.js" && !f.startsWith("_")).sort();
export const TOOLS = await Promise.all(TOOL_FILES.map(async f => (await import(pathToFileURL(path.join(__dirname, f)).href)).default));

const asResult = o => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }], structuredContent: o });

export function registerTools(server, { ro, ui } = {}) {
  for (const t of TOOLS) {
    if (!t || !t.name || typeof t.handler !== "function") throw new Error("tools/: each file must export { name, handler, ... }");
    server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema || {}, annotations: t.annotations || ro,
      ...(t.meta ? { _meta: ui ? ui(...t.meta) : undefined } : {}) },
      async args => { try { return asResult(await t.handler(args)); } catch (e) { return asResult({ error: e.message }); } });
  }
  return TOOLS.map(t => t.name);
}

export default { TOOLS, TOOL_FILES, registerTools };
