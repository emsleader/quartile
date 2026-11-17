"use strict";
const index = require("../data/fer-literature-100-candidates.json");
function search({query="",topic_group,year_from,year_to,offset=0,limit=20}={}){
 const q=String(query||"").toLowerCase().trim();
 const off=Math.max(0,Math.floor(Number(offset)||0)),lim=Math.max(1,Math.min(100,Math.floor(Number(limit)||20)));
 const matches=index.papers.filter(p=>(!q||[p.title,p.journal,p.doi].some(x=>String(x||"").toLowerCase().includes(q)))&&(!topic_group||p.topic_group===String(topic_group))&&(!year_from||p.year>=Number(year_from))&&(!year_to||p.year<=Number(year_to)));
 return {indexVersion:index.version,doiVerifiedTotal:index.count,matched:matches.length,offset:off,returned:matches.slice(off,off+lim).length,warning:index.guardrail,papers:matches.slice(off,off+lim)};
}
module.exports={search,index};
