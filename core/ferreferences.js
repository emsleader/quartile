"use strict";
const B=require("../data/fer-q1-100-validated-metadata.json");
const norm=s=>String(s||"").toLocaleLowerCase("en").trim();
function catalogue(opts={}){
 const q=norm(opts.query), g=norm(opts.group), limit=Math.max(1,Math.min(Number(opts.limit)||25,100));
 let out=B.items.filter(p=>(!q||[p.title,p.journal,p.doi,p.group_name,...p.topic_tags].some(x=>norm(x).includes(q)))&&(!g||norm(p.group_name).includes(g)||p.topic_tags.some(t=>norm(t).includes(g))));
 out.sort((a,b)=>b.relevance_heuristic-a.relevance_heuristic||a.id.localeCompare(b.id));
 return {kind:"fer_q1_reference_bank",total_candidates:B.items.length,matched:out.length,returned:Math.min(limit,out.length),published_fulltext_read_count:0,metadata_do_is_scite_verified:100,notice:"DOI verification does not establish full-text access, article evidence, 2025 Q1 journal ranking, or a claim-source match; the selection is a topical metadata index.",results:out.slice(0,limit)};
}
module.exports={catalogue,all:()=>B.items,meta:()=>({source:B.source,doiVerified:B.scite_verified_dois,q1Caveat:B.rank_2025_warning,candidateCount:B.items.length})};
