"use strict";
const assert=require("node:assert/strict");
const F=require("../mcp/fercorpus.js");
const candidate={doi:"10.1234/example",title:"Survey Attrition and Firm Investment"};
const good={doi:"https://doi.org/10.1234/example",title:"Survey Attrition and Firm Investment",type:"article",
  best_oa_location:{pdf_url:"https://example.org/article.pdf",license:"cc-by",version:"publishedVersion"}};
assert.equal(F.chooseLocation(good,candidate).ok,true);
assert.equal(F.chooseLocation({...good,doi:"10.9999/wrong"},candidate).reason,"doi_mismatch");
assert.equal(F.chooseLocation({...good,title:"Completely Unrelated Healthcare Systems"},candidate).reason,"title_mismatch");
assert.equal(F.chooseLocation({...good,type:"preprint"},candidate).reason,"not_journal_article");
assert.equal(F.chooseLocation({...good,best_oa_location:{pdf_url:"https://example.org/article.pdf",license:null}},candidate).reason,"no_cc_licensed_pdf_location");
assert.equal(F.chooseLocation({...good,best_oa_location:{pdf_url:"http://example.org/article.pdf",license:"cc-by"}},candidate).reason,"no_cc_licensed_pdf_location");
assert.equal(F.getStatus().running,false);
console.log("fercorpus: access-gating tests passed");
