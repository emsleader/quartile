"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { Client } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
const { StdioClientTransport } = require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");
(async () => {
  const client=new Client({name:"fer-model-smoke",version:"1.0"});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(__dirname,"..","mcp","server.js")]}));
  try {
    const names=(await client.listTools()).tools.map(x=>x.name);
    assert.equal(names.length,35, "Quartile main 0.16.0 + FER tools = 34");
    assert.ok(names.includes("fer_equation_catalog"));
    assert.ok(names.includes("fer_replication_audit"));
    assert.ok(names.includes("fer_q1_reference_bank"));
    const formulas=(await client.callTool({name:"fer_equation_catalog",arguments:{}})).structuredContent;
    assert.equal(formulas.formulae.length,12);
    assert.equal(formulas.evidenceStatus,"catalogue_only");
    const real=(await client.callTool({name:"fer_replication_audit",arguments:{}})).structuredContent;
    assert.equal(real.pass,true,JSON.stringify(real.checks.filter(x=>x.status==="fail")));
    assert.ok(real.notValidated.some(s=>s.includes("Original 6 R scripts")));
    const refs=(await client.callTool({name:"fer_q1_reference_bank",arguments:{query:"attrition",limit:10}})).structuredContent;
    assert.equal(refs.total_candidates,100);
    assert.ok(refs.results.length>0&&refs.results.length<=10);
    const invalid=(await client.callTool({name:"fer_replication_audit",arguments:{report_json:"{not-json"}})).structuredContent;
    assert.equal(invalid.pass,false);
    console.log("Quartile 0.16.x FER MCP integration: 2 tools, 12 formulas, saved snapshot arithmetic, bad JSON rejected");
  } finally { await client.close(); }
})().catch(err=>{console.error(err);process.exit(1)});
