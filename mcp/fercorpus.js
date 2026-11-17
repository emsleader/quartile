"use strict";
// Targeted, licence-checked full-text acquisition for Quartile's 100 FER Q1 metadata candidates.
// Raw full texts stay in QUARTILE_CORPUS; only derived measurements and provenance are exported.
// No automatic invocation: the user must explicitly run fer_corpus_build (or CLI).
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const CP=require("./corpus.js");
const MANIFEST=path.resolve(__dirname,"../data/fer-q1-100-candidates.json");
const LICENSES=new Set(["cc-by","cc-by-sa","cc-by-nc","cc-by-nc-sa","cc0","public-domain"]);
const state={running:false,phase:"idle",done:0,total:0,downloaded:0,alreadyPresent:0,skipped:0,errors:0,startedAt:null,finishedAt:null,issue:null,examples:[]};
const normDOI=d=>String(d||"").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"").toLowerCase().trim();
const normTitle=s=>new Set(String(s||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(w=>w.length>=4));
function titleSimilarity(a,b) {
  const x=normTitle(a),y=normTitle(b);if(!x.size||!y.size)return 0;
  return [...x].filter(w=>y.has(w)).length/Math.max(1,Math.min(x.size,y.size));
}
function chooseLocation(work, candidate) {
  if(normDOI(work?.doi)!==normDOI(candidate?.doi)) return {ok:false,reason:"doi_mismatch"};
  if(titleSimilarity(work?.title,candidate?.title)<0.65)return {ok:false,reason:"title_mismatch"};
  if(work?.type!=="article")return {ok:false,reason:"not_journal_article"};
  const locations=[work.best_oa_location,...(work.locations||[])].filter(Boolean);
  for(const loc of locations){
    const lic=String(loc.license||"").toLowerCase().trim();
    // A purported OA link without a recognised reuse licence is not automatically mineable.
    if(!loc.pdf_url||!LICENSES.has(lic))continue;
    if(!/^https:\/\//i.test(loc.pdf_url))continue;
    return {ok:true,pdf_url:loc.pdf_url,licence:lic,version:loc.version||"unconfirmed",landing_page_url:loc.landing_page_url||null};
  }
  return {ok:false,reason:"no_cc_licensed_pdf_location"};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function loadOpenAlex(doi,key){
 const url="https://api.openalex.org/works/https://doi.org/"+encodeURI(doi)+"?api_key="+encodeURIComponent(key);
 for(let i=0;i<3;i++){
   const res=await fetch(url,{headers:{"User-Agent":"Quartile FER research corpus https://github.com/emsleader/quartile"}});
   if(res.status===401||res.status===403||res.status===429)throw Error("OpenAlex access refused (HTTP "+res.status+"); check key/quota");
   if(res.ok)return res.json();
   if(res.status===404)return null;
   if(i<2)await pause(1200*(i+1));
 }
 return null;
}
async function fetchPdf(url,dest) {
 const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),60000);
 try{
   const res=await fetch(url,{redirect:"follow",signal:ctrl.signal,headers:{"Accept":"application/pdf","User-Agent":"Quartile research corpus (open access; noncommercial text mining)"}});
   if(!res.ok)return {ok:false,reason:"http_"+res.status};
   const arr=Buffer.from(await res.arrayBuffer());
   if(arr.length<20000||arr.length>30_000_000||arr.subarray(0,5).toString()!=="%PDF-")return {ok:false,reason:"invalid_pdf_bytes"};
   const tmp=dest+".tmp";fs.writeFileSync(tmp,arr);fs.renameSync(tmp,dest);
   return {ok:true,size:arr.length,sha256:crypto.createHash("sha256").update(arr).digest("hex")};
 }catch(e){return {ok:false,reason:e.name==="AbortError"?"timeout":"download_error"}}
 finally{clearTimeout(tm)}
}
function rootDir(){
 const f=process.env.QUARTILE_CORPUS||(process.env.RENDER?"/tmp/quartile-corpus":null);
 if(!f)throw Error("Set QUARTILE_CORPUS to a private writable folder first.");
 return path.resolve(f);
}
function getStatus(){return {...state,examples:state.examples.slice(-8)};}
async function run({maxPapers=100,onlyMissing=true,analyse=true}={}){
 if(state.running)throw Error("FER acquisition is already running");
 const key=process.env.OPENALEX_API_KEY;
 if(!key)throw Error("OPENALEX_API_KEY is required to check legal OA locations. No download attempted.");
 const root=rootDir(),mf=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
 const papers=mf.papers.slice(0,Math.min(Math.max(1,maxPapers),100));
 fs.mkdirSync(path.join(root,"fer"),{recursive:true});
 const reg=path.join(root,"fer-corpus-access.json"),idxFile=path.join(root,"corpus-index.json");
 let index;try{index=JSON.parse(fs.readFileSync(idxFile,"utf8"))}catch(e){index={papers:[]}};
 let prior={};try{prior=JSON.parse(fs.readFileSync(reg,"utf8"))}catch(e){}
 const records=prior.records||{};
 Object.assign(state,{running:true,phase:"access_check",done:0,total:papers.length,downloaded:0,alreadyPresent:0,skipped:0,errors:0,startedAt:new Date().toISOString(),finishedAt:null,issue:null,examples:[]});
 try{
   for(const p of papers){
     const filename=p.id+"-"+p.doi.replace(/[^a-z0-9.-]/gi,"_")+".pdf";
     const rel=path.join("fer",filename),dest=path.join(root,rel);
     if(onlyMissing&&fs.existsSync(dest)&&index.papers.some(q=>q.doi===p.doi&&q.file===rel)){
       state.alreadyPresent++;records[p.id]={...(records[p.id]||{}),status:"already_present"};
     }else{
       try{
         const work=await loadOpenAlex(p.doi,key);
         if(!work){records[p.id]={status:"not_found_in_openalex"};state.skipped++;}
         else{
           const chosen=chooseLocation(work,p);
           if(!chosen.ok){records[p.id]={status:chosen.reason};state.skipped++;}
           else{
             const dl=await fetchPdf(chosen.pdf_url,dest);
             if(!dl.ok){records[p.id]={status:dl.reason,doi:p.doi};state.skipped++;}
             else {
               records[p.id]={status:"pdf_verified",doi:p.doi,license:chosen.licence,version:chosen.version,source:chosen.pdf_url,sha256:dl.sha256,bytes:dl.size};
               const old=index.papers.findIndex(q=>q.doi===p.doi&&q.field==="fer");
               const row={doi:p.doi,title:p.title,year:p.year,journal:p.journal,field:"fer",license:chosen.licence,version:chosen.version,source:chosen.pdf_url,file:rel};
               if(old>=0)index.papers[old]=row;else index.papers.push(row);
               state.downloaded++;
             }
           }
         }
       }catch(e){records[p.id]={status:"error",reason:String(e.message).slice(0,180)};state.errors++;}
     }
     state.done++;
     const rec=records[p.id];if(rec.status!=="pdf_verified"&&rec.status!=="already_present"&&state.examples.length<8)state.examples.push({id:p.id,status:rec.status});
     fs.writeFileSync(idxFile,JSON.stringify(index,null,2));
     fs.writeFileSync(reg,JSON.stringify({date:new Date().toISOString(),recordCount:papers.length,records},null,2));
     if(state.done<papers.length)await pause(250);
   }
   if(analyse&&state.downloaded+state.alreadyPresent>0){
     state.phase="fulltext_measurement";
     await CP.analyse();
   }
   state.phase="completed";
 }catch(e){state.phase="failed";state.issue=String(e.message).slice(0,300)}
 finally{state.running=false;state.finishedAt=new Date().toISOString()}
 return getStatus();
}
function start(options){
 if(state.running)return getStatus();
 // Deliberately report validation errors immediately; work starts only after a real tool invocation.
 if(!process.env.OPENALEX_API_KEY)throw Error("OPENALEX_API_KEY must be configured before starting.");
 rootDir();state.running=true;
 queueMicrotask(()=>{state.running=false;run(options).catch(e=>{state.running=false;state.phase="failed";state.issue=e.message})});
 return {phase:"queued",total:Math.min(options?.maxPapers||100,100),note:"Check fer_corpus_status. On Render free hosting, temporary files may disappear after restart; persistent storage or GitHub Actions is recommended."};
}
module.exports={chooseLocation,titleSimilarity,start,run,getStatus};
