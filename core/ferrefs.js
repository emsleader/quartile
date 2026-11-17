"use strict";
// Quartile >=0.16.0 FER bibliography registry. Bibliographic metadata only; no full-text claims.
const catalog = require("../data/fer-100-reference-audit.json");
function status(){
 const rows=catalog.records;
 return {count:rows.length,doi_verified:rows.filter(r=>r.verified_doi_by_scite_on).length,year_discrepancies:rows.filter(r=>r.year_discrepancy_to_scite!==null).length,
 priority_A:rows.filter(r=>r.manuscript_priority==="A_method_direct").length,not_primary_empirical:rows.filter(r=>!r.use_as_paper_reference).length,
 previously_read_in_separate_audit:rows.filter(r=>r.fulltext_status.startsWith("previously_inspected")).length,
 fulltext_checked_within_this_corpus:0,latest_q1_verified:0,
 editorial_status:"candidate_reference_library_not_100_fulltext_reviewed",
 notices_in_scite_verification:"none reported on batch screen",
 caveats:[catalog.q1_rule,catalog.license_rule,"DOI verification is not evidence of journal quartile in 2026 or of full text having been read.","Only include references in manuscript that are actually cited for a claim confirmed in a source."]};
}
function search({query="",priority=null,theme=null,limit=20}={}){
 const s=String(query||"").toLowerCase().trim();
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("limit must be integer 1..100");
 const match=catalog.records.filter(r=>(!s||[r.id,r.title,r.doi,r.journal,r.theme].join(" ").toLowerCase().includes(s))&&(!priority||r.manuscript_priority===priority)&&(!theme||r.theme===theme));
 return {count:match.length,returned:Math.min(match.length,limit),records:match.slice(0,limit).map(r=>({id:r.id,title:r.title,doi:r.doi,doi_url:r.doi_url,journal:r.journal,year:r.catalogue_year,year_discrepancy_to_scite:r.year_discrepancy_to_scite,theme:r.theme,priority:r.manuscript_priority,fulltext_status:r.fulltext_status,current_q1_verification:r.current_q1_verification,research_type:r.research_type})),warning:"Metadata/DOI registry, not 100 fully reviewed Q1 papers. Verify actual content and venue before citation."};
}
module.exports={status,search};
