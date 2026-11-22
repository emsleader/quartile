import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { TOOLS as NEW_TOOLS } from "../tools/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
(async () => {
  const client=new Client({name:"fer-model-smoke",version:"1.0"});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(__dirname,"..","mcp","server.js")]}));
  try {
    const names=(await client.listTools()).tools.map(x=>x.name);
    assert.equal(names.length,35+NEW_TOOLS.length, "35 tools in mcp/server.js plus the new tools in tools/");
    assert.ok(names.includes("fer_equation_catalog"));
    assert.ok(names.includes("fer_replication_audit"));
    assert.ok(names.includes("fer_literature_index"));
    const lit=(await client.callTool({name:"fer_literature_index",arguments:{query:"investment",limit:4}})).structuredContent;
    assert.equal(lit.returned,4);
    assert.ok(lit.warning.includes("does not establish"));
    const formulas=(await client.callTool({name:"fer_equation_catalog",arguments:{}})).structuredContent;
    assert.equal(formulas.formulae.length,12);
    assert.equal(formulas.evidenceStatus,"catalogue_only");
    const real=(await client.callTool({name:"fer_replication_audit",arguments:{}})).structuredContent;
    assert.equal(real.pass,true,JSON.stringify(real.checks.filter(x=>x.status==="fail")));
    assert.ok(real.notValidated.some(s=>s.includes("Original 6 R scripts")));
    const invalid=(await client.callTool({name:"fer_replication_audit",arguments:{report_json:"{not-json"}})).structuredContent;
    assert.equal(invalid.pass,false);
    console.log("Quartile 0.16.x FER MCP integration: 2 tools, 12 formulas, saved snapshot arithmetic, bad JSON rejected");
  } finally { await client.close(); }
})().catch(err=>{console.error(err);process.exit(1)});
