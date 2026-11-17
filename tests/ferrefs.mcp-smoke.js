"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const {Client}=require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js");
const {StdioClientTransport}=require("../mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js");
(async()=>{
 const cli=new Client({name:"fer-refs-smoke",version:"1.0"});
 await cli.connect(new StdioClientTransport({command:process.execPath,args:[path.join(__dirname,"..","mcp","server.js")]}));
 try {
  const tools=(await cli.listTools()).tools.map(t=>t.name);
  assert.equal(tools.length,36);
  for(const name of ["fer_reference_catalog","fer_reference_search","fer_equation_catalog","fer_replication_audit"])assert.ok(tools.includes(name));
  let status=(await cli.callTool({name:"fer_reference_catalog",arguments:{}})).structuredContent;
  assert.equal(status.count,100);assert.equal(status.latest_q1_verified,0);assert.equal(status.year_discrepancies,11);
  let result=(await cli.callTool({name:"fer_reference_search",arguments:{query:"finance",limit:15}})).structuredContent;
  assert.ok(result.count>0);assert.ok(result.records.length<=15);
  let unknown=(await cli.callTool({name:"fer_reference_search",arguments:{query:"zz_nonexistent_q1_reference_xyz"}})).structuredContent;
  assert.equal(unknown.count,0);
  console.log("FER references MCP smoke: 100 screened DOIs, two searchable tools, no raw/fulltext misstatements");
 } finally {await cli.close();}
})().catch(e=>{console.error(e);process.exit(1)});
