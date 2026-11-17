#!/usr/bin/env node
// Optional command: OPENALEX_API_KEY=... QUARTILE_CORPUS=/private/path node scripts/fer-corpus-ci.js
// Reads the source-verified FER bibliography and measures only CC-licensed DOI-matched full texts.
const os=require("node:os"),path=require("node:path"),fs=require("node:fs");
if(!process.env.QUARTILE_CORPUS)process.env.QUARTILE_CORPUS=fs.mkdtempSync(path.join(os.tmpdir(),"quartile-fer-"));
const FER=require("../mcp/fercorpus.js");
(async()=>{
 const status=await FER.run({maxPapers:100,onlyMissing:true,analyse:true});
 const out=path.resolve(process.env.QUARTILE_CORPUS);
 console.log(JSON.stringify({status,outputDir:out},null,2));
 if(status.phase!=="completed")process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
