"use strict";
// Quartile paragraph-flow: deterministic paragraph diagnostics and one-paragraph-at-a-time drafting briefs.
// This module never generates scholarly claims or changes scientific content.
const STOP = new Set("a an the and or but to of in on at for from by with as is are was were be been being it its this that these those we our they their can may could should would have has had one two three between among into than then also not however therefore although about results result study studies paper evidence data model method methods finding findings analysis analyse analyzed observed shows show use uses using".split(/\s+/));
const wordTokens = t => (String(t || "").match(/[\p{L}\p{N}'’-]+/gu) || []);
const terms = t => [...new Set(wordTokens(t).map(x => x.toLowerCase()).filter(x => x.length >= 4 && !STOP.has(x) && !/^\d+$/.test(x)))];
const paragraphList = text => String(text || "").replace(/\r\n?/g,"\n").split(/\n\s*\n+/).map(x => x.trim()).filter(x => x && !/^#{1,6}\s/.test(x));
function sentences(text) {
  // Conservative heuristic; never used to alter, reorder or replace original wording.
  const s=String(text||"").replace(/(\d)\.(\d)/g,"$1<DECIMAL>$2");
  return s.split(/(?<=[.!?])\s+(?=[A-Z0-9“"('])/).map(x=>x.replace(/<DECIMAL>/g,".").trim()).filter(Boolean);
}
const median=values=>{if(!values.length)return 0;const a=values.slice().sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const prefix = (a,b) => {let n=0;for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])break;n++}return n;};
function paragraphMetrics(text) {
  const ss=sentences(text),lens=ss.map(x=>wordTokens(x).length),words=wordTokens(text).length;
  const starts=ss.map(s=>wordTokens(s).slice(0,2).map(x=>x.toLowerCase()).join(" ")).filter(Boolean);
  const repeatStarts=starts.filter((s,i)=>starts.indexOf(s)<i).length;
  const longCount=lens.filter(x=>x>35).length, shortCount=lens.filter(x=>x<12).length;
  const rhythm=lens.map(n=>n<=16?"short":n<=30?"medium":"long").join(" → ");
  return {words,sentences:ss.length,sentenceLengths:lens,medianSentenceWords:median(lens),
    longSentenceShare: ss.length?+(longCount/ss.length).toFixed(3):0,
    shortSentenceShare:ss.length?+(shortCount/ss.length).toFixed(3):0,
    repeatedSentenceOpenings:repeatStarts, rhythm, firstSentence: ss[0]||"",lastSentence:ss.at(-1)||""};
}
function linkAssessment(prev,next) {
  if(!prev||!next)return {status:"not_applicable",sharedAnchors:[],note:"No adjacent paragraph supplied."};
  const prevWindow=sentences(prev).slice(-2).join(" "),nextWindow=sentences(next).slice(0,2).join(" ");
  const a=terms(prevWindow),b=new Set(terms(nextWindow));
  const shared=a.filter(x=>b.has(x)).slice(0,12);
  return {status:shared.length?"lexical_link_present":"manual_semantic_check",sharedAnchors:shared,
    note:shared.length?"Shared content anchors occur across the boundary. This is not proof of coherence.":
      "No shared content anchors in boundary sentences; a valid conceptual transition may still exist. Review meaning manually."};
}
function analyse({sectionText="",sectionRole="other",previousSectionLast="",nextSectionFirst=""}={}) {
  const paras=paragraphList(sectionText);
  return {sectionRole,paragraphCount:paras.length,paragraphs:paras.map((p,i)=>({
     index:i+1,metrics:paragraphMetrics(p),
     fromPrevious:linkAssessment(i?paras[i-1]:previousSectionLast,p),
     toNext:linkAssessment(p,i+1<paras.length?paras[i+1]:nextSectionFirst)
   })),sectionTransitions:{
     inbound:linkAssessment(previousSectionLast,paras[0]||""),
     outbound:linkAssessment(paras.at(-1)||"",nextSectionFirst)
   },interpretation:"Descriptive language diagnostics only; not a journal-quality, coherence or originality score."};
}
function nextParagraphBrief({sectionRole="introduction",lockedParagraphs=[],nextParagraphPurpose="",verifiedEvidence=[],nextSectionGoal="",protectedTerms=[]}={}) {
  if(!Array.isArray(lockedParagraphs)||lockedParagraphs.some(p=>typeof p!=="string"))throw Error("lockedParagraphs must be an array of approved paragraph strings");
  if(!Array.isArray(verifiedEvidence)||verifiedEvidence.some(x=>typeof x!=="string"))throw Error("verifiedEvidence must be an array of evidence strings");
  const n=lockedParagraphs.length+1;
  const lead=lockedParagraphs.slice(-2);
  return {
    stage:"ONE_PARAGRAPH_ONLY",sectionRole,paragraphNumber:n,
    lockedParagraphCount:lockedParagraphs.length,
    precedingApprovedParagraphs:lead,
    precedingParagraphEnding:lead.length?sentences(lead.at(-1)).at(-1)||"": "",
    requestedRhetoricalFunction:nextParagraphPurpose||"REQUIRES_AUTHOR_SPECIFICATION",
    confirmedEvidenceAvailable:verifiedEvidence,
    nextSectionGoal,
    protectedTerms,
    instructions:[
      "Draft exactly one paragraph for the current section; do not produce a complete manuscript or a second paragraph.",
      "Connect its opening logically to the preceding approved paragraph, without forcing a repeated transition phrase.",
      "One main claim per paragraph; use only confirmed evidence and preserve all approved numeric results, citations, concepts and uncertainty.",
      "Do not add a new factual claim, DOI, statistic, causal inference, test or model unless expressly evidenced and authorised.",
      "Read paragraph rhythm as variable sentence lengths; do not impose numerical targets from papers whose full texts have not been measured.",
      "End with a sentence that naturally prepares the next paragraph or section, but do not add a generic slogan.",
      "Show the single proposed paragraph and a short change/evidence note; submit for author approval before locking.",
      "For edits to an existing paragraph run Quartile verify_rewrite(original,revised), and keep the original if the guard fails."
    ]
  };
}
module.exports={paragraphList,sentences,paragraphMetrics,linkAssessment,analyse,nextParagraphBrief};
