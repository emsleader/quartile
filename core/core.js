const Core = (() => {
  const HEDGES = ["may","might","could","suggest","suggests","suggested","suggesting","appear to","appears to","appeared to","likely","unlikely","possibly","possible","potentially","potential","indicate","indicates","indicated","tend to","tends to","perhaps","seem","seems","seemed","presumably","arguably","plausibly","partially","partly","to some extent"];
  const CAUSAL = ["cause","causes","caused","causing","causal","causally","lead to","leads to","led to","leading to","result in","results in","resulted in","drive","drives","drove","driven by","determine","determines","determined by","due to","because of","produce","produces","produced","effect of","effects of","impact of","impacts","impacted","attributable to","contribute to","contributes to","contributed to","responsible for"];
  const NEGATIONS = ["not","no","never","neither","nor","without","none","cannot","n't"];
  const AI_WORDS = ["delve","delves","crucial","pivotal","landscape","underscore","underscores","highlight","highlights","showcase","showcases","robust","intricate","tapestry","testament","multifaceted","notably","furthermore","moreover","additionally","comprehensive","leverage","leverages","foster","fosters","navigate","navigating","realm","holistic","seamless","seamlessly","meticulous","meticulously","vibrant","garner","enhance","enhances","interplay","nuanced","paramount","overarching","unprecedented","groundbreaking"];
  const AI_PHRASES = ["it is important to note","it is worth noting","plays a crucial role","plays a key role","plays a pivotal role","in today's","in the realm of","not only","shed light on","sheds light on","a growing body of","in conclusion","serves as a","stands as a","in the context of","a wide range of","paves the way","at the same time","this study aims to fill","to the best of our knowledge"];
  const DEFAULT_TERMS = ["whole-body electromyostimulation","WB-EMS","technological dependence","device dependence","operational reliance","service integration","financial flexibility"];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function splitParagraphs(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const blocks = []; let cur = [];
    const REFH = /^(\d+\.?\s*)?(references|reference list|bibliography|works cited|literature cited)\s*:?$/i, ENDREF = /^(#+\s*)?(appendix|appendices|tables?|figures?|notes|endnotes|supplementary)\b/i;
    let inRefs = false; const meta = [];
    const push = (t, kind) => { blocks.push(t); meta.push(kind); };
    const flush2 = () => { if (cur.isMd) { if (cur.length) push("⟦TABLE⟧ " + cur.join(" || "), "table"); cur = []; return; } if (cur.length) { push(cur.join(" ").replace(/\s+/g, " ").trim(), inRefs ? "ref" : "p"); cur = []; } };
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { flush2(); continue; }
      if (/^⟦TABLE⟧/.test(l)) { flush2(); push(l, "table"); continue; }
      if (/^\|.*\|$/.test(l) && !inRefs) { if (!(cur.length && cur.isMd)) { flush2(); cur = []; cur.isMd = true; } if (!/^\|[\s:|-]+\|$/.test(l)) cur.push(l.replace(/^\|\s*|\s*\|$/g, "").replace(/\s*\|\s*/g, " | ")); continue; }
      if (cur.isMd) flush2();
      if (REFH.test(l.replace(/^#+\s*/, "").replace(/[*_`]+/g, "").trim())) { flush2(); push(l, "h"); inRefs = true; continue; }
      if (inRefs && (/^#{1,6}\s/.test(l) || (ENDREF.test(l) && isHeading(l)) || (isHeading(l) && !/(19|20)\d{2}/.test(l)))) { flush2(); push(l, "h"); inRefs = false; continue; }
      if (inRefs) { flush2(); push(l, "ref"); continue; }
      if (isHeading(l)) { flush2(); push(l, "h"); continue; }
      cur.push(l);
    }
    flush2();
    return blocks.map((t, i) => ({ id: "p" + (i + 1), text: t, isHeading: meta[i] === "h", isRef: meta[i] === "ref", isTable: meta[i] === "table" })).filter(b => b.text);
  }
  function isHeading(t) {
    if (/^#{1,6}\s/.test(t)) return true;
    if (/^[\s\-=|+_:]+$/.test(t) || /^⟦TABLE⟧/.test(t)) return false;
    const words = t.split(/\s+/).length;
    return words <= 12 && !/[.!?:;]$/.test(t) && !/\(\d{4}\)/.test(t);
  }

  function countPhrase(text, phrase) {
    const p = phrase === "n't" ? "n't" : phrase;
    const re = phrase === "n't" ? /n['’]t\b/gi : new RegExp("\\b" + reEsc(p).replace(/\s+/g, "\\s+") + "\\b", "gi");
    return (text.match(re) || []).length;
  }
  function countList(text, list) {
    const out = {}; let total = 0;
    for (const w of list) { const n = countPhrase(text, w); if (n) { out[w] = n; total += n; } }
    return { total, items: out };
  }

  function numbers(text) {
    // Statistics and numeric values, normalized. Years inside citations are also captured; they are compared as numbers too.
    const clean = text.replace(/\[(\d+(?:\s*[–,-]\s*\d+)*)\]/g, " ").replace(/\b10\.\d{4,9}\/[^\s,;)]+/g, " ");
    const re = /(?:\b[pPtFrRzβbBnNdM]\s*(?:\([^)]{0,12}\))?\s*)?[<>=≤≥]?\s*[-−–]?(?:\d+(?:[.,]\d+)*|[.,]\d+)\s*%?/g;
    return (clean.match(re) || []).map(s => s.replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/,(?=\d{3}\b)/g, "")).filter(s => /\d/.test(s) && !/^(?:19|20)\d{2}$/.test(s));
  }
  const PART = "(?:(?:van|von|de|der|den|da|di|le|la|du|dos|del)\\s+)?", SN = "[\\p{Lu}](?:[\\p{Ll}]|['’][\\p{L}])[\\p{L}'’-]*";
  const stripP = n => n.replace(/^(?:van|von|de|der|den|da|di|le|la|du|dos|del)\s+/i, "");
  function citations(text) {
    const keys = []; let m;
    const par = /\(([^()]*?(?:(?:19|20)\d{2}[a-z]?|n\.d\.(?:-[a-z])?)[^()]*)\)/gu;
    const partRe = new RegExp("^(?:e\\.g\\.,?|see(?:\\s+also)?|cf\\.|i\\.e\\.,?)?\\s*(" + PART + "(?:" + SN + "|[\\p{Lu}]{2,}(?=,)|[\\p{Lu}](?=\\s[\\p{Lu}])))[^\\d;]*?((?:19|20)\\d{2}[a-z]?|n\\.d\\.(?:-[a-z])?)", "u");
    while ((m = par.exec(text))) m[1].split(";").forEach(part => { const mm = part.trim().match(partRe); if (mm) keys.push(stripP(mm[1]) + " " + mm[2]); });
    const nar = new RegExp("(?<![\\p{L}])(" + PART + SN + ")((?:,\\s*" + SN + ")*,?\\s+(?:and|&|–|-)\\s+" + PART + SN + "|\\s+et\\s+al\\.?)?\\s+\\(((?:19|20)\\d{2}[a-z]?)(?:[,;][^)]*)?\\)", "gu");
    while ((m = nar.exec(text))) keys.push(stripP(m[1]) + " " + m[3]);
    const br = /\[(\d+(?:\s*[–,-]\s*\d+)*)\]/g;
    while ((m = br.exec(text))) keys.push("[" + m[1].replace(/\s+/g, "") + "]");
    const doi = /\b10\.\d{4,9}\/[^\s,;)]+/g;
    while ((m = doi.exec(text))) keys.push(m[0]);
    return keys;
  }
  function termCounts(text, terms) {
    const out = {};
    for (const t of terms) { if (!t.trim()) continue; out[t] = countPhrase(text, t.trim()); }
    return out;
  }
  function multisetDiff(a, b) {
    const ca = new Map(), cb = new Map();
    a.forEach(x => ca.set(x, (ca.get(x) || 0) + 1)); b.forEach(x => cb.set(x, (cb.get(x) || 0) + 1));
    const missing = [], added = [];
    for (const [k, v] of ca) { const d = v - (cb.get(k) || 0); for (let i = 0; i < d; i++) missing.push(k); }
    for (const [k, v] of cb) { const d = v - (ca.get(k) || 0); for (let i = 0; i < d; i++) added.push(k); }
    return { missing, added };
  }

  function sentences(text) {
    return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 2);
  }
  function words(text) { return text.match(/[\p{L}\p{N}'’-]+/gu) || []; }

  function diagnostics(text) {
    const w = words(text), nW = Math.max(w.length, 1), per1k = n => +(n * 1000 / nW).toFixed(1);
    const sents = sentences(text), lens = sents.map(s => words(s).length);
    const mean = lens.reduce((a, b) => a + b, 0) / Math.max(lens.length, 1);
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(lens.length, 1));
    const aiW = countList(text, AI_WORDS), aiP = countList(text, AI_PHRASES);
    const dashes = (text.match(/—|\s–\s|\s--\s/g) || []).length;
    const passive = (text.match(/\b(?:is|are|was|were|been|being|be)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/gi) || []).length;
    const notBut = (text.match(/\bnot\s+(?:only|just|merely|simply)\b[^.]{0,120}\bbut\b|\bnot\s+\w+(?:\s+\w+){0,6},?\s+but\s+(?:rather\s+)?/gi) || []).length;
    let repeatedOpenings = 0;
    for (let i = 2; i < sents.length; i++) {
      const f = s => (s.match(/^[\p{L}]+/u) || [""])[0].toLowerCase();
      if (f(sents[i]) && f(sents[i]) === f(sents[i - 1]) && f(sents[i]) === f(sents[i - 2])) repeatedOpenings++;
    }
    const longS = lens.filter(l => l > 40).length;
    const paraStarts = {};
    const findings = [];
    if (aiW.total) findings.push({ k: "Stock words common in AI text", v: aiW.total + " (" + per1k(aiW.total) + "/1k words)", detail: Object.entries(aiW.items).map(([a, b]) => a + "×" + b).join(", "), sev: per1k(aiW.total) > 8 ? "high" : "med" });
    if (aiP.total) findings.push({ k: "Formulaic phrases", v: aiP.total, detail: Object.entries(aiP.items).map(([a, b]) => '"' + a + '"×' + b).join(", "), sev: aiP.total > 3 ? "high" : "med" });
    if (notBut) findings.push({ k: "\"Not X but Y\" contrasts", v: notBut, detail: "Check whether the negative half answers a claim anyone made.", sev: notBut > 2 ? "high" : "med" });
    if (dashes) findings.push({ k: "Dashes used as connectors", v: dashes + " (" + per1k(dashes) + "/1k)", detail: "Replace with commas, colons or full stops where the clause relation is clear.", sev: per1k(dashes) > 5 ? "high" : "low" });
    if (repeatedOpenings) findings.push({ k: "Three sentences in a row with the same opening word", v: repeatedOpenings, detail: "", sev: "med" });
    if (lens.length >= 5 && sd < 5) findings.push({ k: "Uniform sentence length", v: "SD " + sd.toFixed(1) + " words", detail: "Very even rhythm reads as mechanical. Mix short and long sentences.", sev: "med" });
    if (longS) findings.push({ k: "Sentences over 40 words", v: longS, detail: "Consider splitting for readability.", sev: "low" });
    if (per1k(passive) > 25) findings.push({ k: "Heavy passive voice", v: per1k(passive) + "/1k", detail: "Methods sections may need passive; elsewhere name the actor.", sev: "low" });
    return { words: w.length, sentences: sents.length, meanLen: +mean.toFixed(1), sdLen: +sd.toFixed(1), findings };
  }

  function knowledgeFacts(text, terms) {
    return {
      numbers: numbers(text), citations: [...new Set(citations(text))],
      hedges: countList(text, HEDGES), causal: countList(text, CAUSAL),
      terms: termCounts(text, terms), acronyms: [...new Set((text.match(/\b[A-Z][A-Z0-9-]{1,9}\b/g) || []))]
    };
  }

  function compare(orig, rev, terms) {
    const flags = [];
    const n = multisetDiff(numbers(orig), numbers(rev));
    if (n.missing.length) flags.push({ sev: "high", type: "Numbers removed or changed", guard: true, detail: n.missing.join("  ") });
    if (n.added.length) flags.push({ sev: "high", type: "Numbers added or changed", guard: true, detail: n.added.join("  ") });
    const c = multisetDiff(citations(orig), citations(rev));
    if (c.missing.length) flags.push({ sev: "high", type: "Citations missing", guard: true, detail: c.missing.join("; ") });
    if (c.added.length) flags.push({ sev: "high", type: "Citations added", guard: true, detail: c.added.join("; ") });
    const to = termCounts(orig, terms), tr = termCounts(rev, terms);
    const drift = Object.keys(to).filter(k => to[k] !== tr[k]).map(k => k + " " + to[k] + "→" + tr[k]);
    if (drift.length) flags.push({ sev: "high", type: "Protected terminology changed", guard: true, detail: drift.join("; ") });
    const ho = countList(orig, HEDGES).total, hr = countList(rev, HEDGES).total;
    if (hr < ho) flags.push({ sev: "high", type: "Hedging reduced (claim may be stronger)", detail: ho + "→" + hr + " hedges" });
    const co = countList(orig, CAUSAL), cr = countList(rev, CAUSAL);
    const newCausal = Object.keys(cr.items).filter(k => cr.items[k] > (co.items[k] || 0));
    if (newCausal.length) flags.push({ sev: "high", type: "New causal wording", guard: true, detail: newCausal.join(", ") + " (check correlation is not now stated as causation)" });
    const no = countList(orig, NEGATIONS).total, nr = countList(rev, NEGATIONS).total;
    if (no !== nr) flags.push({ sev: "med", type: "Negations changed", detail: no + "→" + nr });
    const capsOf = t => { const out = new Set(); sentences(t).forEach(se => { const ws = se.match(/[\p{L}][\p{L}'’-]*/gu) || []; ws.slice(1).forEach(w => { if (/^\p{Lu}/u.test(w) && w.length > 2) out.add(w); }); }); (t.match(/\b[A-Z]{2,}[A-Z0-9-]*\b/g) || []).forEach(w => out.add(w)); return out; };
    const origLower = orig.toLowerCase(), newNames = [...capsOf(rev)].filter(w => !origLower.includes(w.toLowerCase()));
    if (newNames.length) flags.push({ sev: "high", type: "New name or term not in the original", detail: newNames.slice(0, 8).join(", "), guard: true });
    const so = sentences(orig).length, sr = sentences(rev).length;
    if (sr > so + 1) flags.push({ sev: "med", type: "Sentences added", detail: so + "→" + sr + " sentences; check that no new claim was introduced" });
    const wo = words(orig).length, wr = words(rev).length;
    if (wo > 0 && Math.abs(wr - wo) / wo > 0.35) flags.push({ sev: "med", type: "Large length change", detail: wo + "→" + wr + " words" });
    return flags;
  }

  function wordDiff(a, b) {
    const A = a.split(/(\s+)/).filter(x => x !== ""), B = b.split(/(\s+)/).filter(x => x !== "");
    if (A.length * B.length > 4e6) return { left: esc(a), right: esc(b) };
    const m = A.length, n = B.length, dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0, L = "", R = "";
    while (i < m && j < n) {
      if (A[i] === B[j]) { L += esc(A[i]); R += esc(B[j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { L += /^\s+$/.test(A[i]) ? A[i] : "<del>" + esc(A[i]) + "</del>"; i++; }
      else { R += /^\s+$/.test(B[j]) ? B[j] : "<ins>" + esc(B[j]) + "</ins>"; j++; }
    }
    while (i < m) { L += /^\s+$/.test(A[i]) ? A[i] : "<del>" + esc(A[i]) + "</del>"; i++; }
    while (j < n) { R += /^\s+$/.test(B[j]) ? B[j] : "<ins>" + esc(B[j]) + "</ins>"; j++; }
    return { left: L, right: R };
  }

  function parseJSON(text) {
    if (text == null) throw new Error("empty response");
    if (typeof text === "object") return text;
    let t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    try { return JSON.parse(t); } catch (e) {}
    const s = Math.min(...["{", "["].map(c => { const k = t.indexOf(c); return k < 0 ? 1e9 : k; }));
    const e = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (s < 1e9 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error("Could not read JSON from the model response");
  }

  function normDoi(d) { return d ? String(d).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").trim() : ""; }
  function csv(rows) { return rows.map(r => r.map(v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n"); }

  const GAP_CLICHES = ["little research","few studies","scant attention","remains unexplored","remain unexplored","received little attention","know comparatively little","know little about","paucity of research","dearth of research","under-researched","underexplored","gap in the literature","limited research","largely ignored"];
  const WEAK_CLOSERS = ["useful insights","valuable insights","future research should","agenda for further research","avenues for future research","paves the way","important implications","sheds light on","shed light on","contributes to the literature"];
  const BG_OPENER = /^(in recent years|over the (past|last)|in today['’]?s|with the (rise|growth|advent|development)|it is (well )?known|nowadays|in the modern|since the|recently,)/i;
  const IDENT = ["natural experiment","quasi-natural","exogenous","instrumental variable","difference-in-differences","regression discontinuity","randomi","event study","exogenously","plausibly exogenous"];
  const STRONG_CAUSAL = ["cause","causes","caused","leads to","led to","results in","resulted in","drives","determines","impact of","effect of","effects of","attributable to"];

  const isCaption = t => /^(#+\s*)?(table|figure|fig\.|exhibit|panel)\s+[\dA-Z]+[.:]?(\s|$)/i.test((t || "").replace(/[*_`]+/g, "").trim());
  function headingLevel(t) { const h = (t.match(/^(#+)\s/) || [])[1]; const num = (t.replace(/^#+\s*/, "").match(/^(\d+(?:\.\d+)*)[.\s]/) || [])[1]; const byNum = num ? num.split(".").filter(Boolean).length : 0; return Math.max(h ? h.length : 1, byNum || 1); }
  // Assign a role to each section. A sub-heading whose own words give no role takes the role of its nearest parent heading.
  function sectionRoles(secs) {
    const stack = []; const out = [];
    for (const x of secs) {
      if (x.id === "_start") { if (x.paras.length) out.push({ ...x, role: "opening" }); continue; }
      const lvl = headingLevel(x.raw || x.title); let role = detectRole(x.title);
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].role : null;
      if (parent && (role === "other" || (["methods", "results"].includes(parent) && ["methods", "results"].includes(role)))) role = parent;
      stack.push({ lvl, role });
      if (x.paras.length) out.push({ ...x, role });
    }
    return out;
  }
  function detectRole(title) {
    const t = (title || "").replace(/[*_`]+/g, "").trim().toLowerCase();
    if (/^(#+\s*)?(\d+\.?\s*)?(references|reference list|bibliography|works cited|literature cited)/.test(t)) return "references";
    if (/declaration|disclosure|funding|acknowledg|conflict of interest|competing interest|ai-assisted|use of ai|generative ai|data availability|ethic|author contribution/.test(t)) return "declarations";
    if (/abstract|summary/.test(t)) return "abstract";
    if (/introduc/.test(t)) return "introduction";
    if (/literature|theor|background|hypothes|framework|prior|proposition/.test(t)) return "literature";
    if (/boundar|rival|alternative explanation/.test(t)) return "discussion";
    const lead = t.replace(/^#+\s*/, "").replace(/^(\d+(\.\d+)*\.?|[ivx]+\.)\s*/, "");
    if (/^(data|methods?|methodology|materials|sample|research (design|method)|empirical (strategy|design|setting)|measur|variables|study design|identification)\b/.test(lead) || /\b(data and (methods?|sample)|methodology|research design)\b/.test(t)) return "methods";
    if (/^(results?|findings|empirical (results|analysis|evidence)|analysis|estimat|robustness)\b/.test(lead) || /\b(results|findings)\b/.test(t)) return "results";
    if (/discussion|implication/.test(t)) return "discussion";
    if (/conclu|limitation|future/.test(t)) return "conclusion";
    return "other";
  }
  function ruleChecks(sections, paraText) {
    // sections: [{title, role, paras:[ids]}]; paraText(id) -> text
    sections = sections.filter(s => !["references", "declarations"].includes(s.role));
    const out = []; const all = sections.flatMap(s => s.paras.map(paraText)).join(" ");
    const hasIdent = IDENT.some(w => countPhrase(all, w) > 0);
    const opening = sections.find(s => s.role === "abstract") || sections[0];
    const conceptual = !sections.some(s => ["methods", "results"].includes(s.role)) && /\b(conceptual|propositions?|theoretical framework)\b/i.test(all);
    if (opening) {
      const t = opening.paras.map(paraText).join(" "), first = sentences(t)[0] || t.slice(0, 200);
      if (BG_OPENER.test(first.trim())) out.push({ rule: 1, sev: "med", where: opening.title, detail: "Opens with background (\"" + first.slice(0, 60) + "...\"). Put the finding or question first." });
      if (!conceptual && !/\d/.test(t.replace(/\(?(19|20)\d{2}\)?/g, ""))) out.push({ rule: 5, sev: "low", where: opening.title, detail: "No number in the opening. Q1 abstracts usually report one or two key results." });
      if (!conceptual && !/\b\d[\d,]*\s+(?:[a-z-]+\s+){0,2}(firms|companies|enterprises|establishments|smes|studios|observations|respondents|households|banks|plants|employees|records|firm-years|countries|businesses)\b|\bn\s*=\s*\d/i.test(t)) out.push({ rule: 2, sev: "low", where: opening.title, detail: "The sample is not described by size in the opening." });
    }
    for (const sec of sections) {
      if (["references", "declarations"].includes(sec.role)) continue;
      const t = sec.paras.map(paraText).join(" ");
      for (const g of GAP_CLICHES) { const n = countPhrase(t, g); if (n) out.push({ rule: 3, sev: "med", where: sec.title, detail: "\"" + g + "\": name the exact contradiction or omission in prior work instead." }); }
      if (!hasIdent && ["abstract","results","discussion","conclusion"].includes(sec.role) || (!hasIdent && sec === opening)) {
        const SAFE = /\b(not|no|neither|nor|cannot|can't|never|without|whether|if|would|could|might|may|establish\w*|identif\w*|estimat\w*|test\w*|examin\w*|isolat\w*|future|hypothes\w*|proposition\w*)\b/i;
        const STAT = /\b(marginal|fixed|random|interaction|main|treatment|time|year|wave|period|country|firm|industry|sector|spillover|size|net)\s+effects?\b|\beffect sizes?\b/gi;
        const bad = sentences(t).filter(se => { const s2 = se.replace(STAT, ""); return words(s2).length >= 7 && STRONG_CAUSAL.some(w => countPhrase(s2, w) > 0) && !SAFE.test(s2); });
        if (bad.length) out.push({ rule: 4, sev: "high", where: sec.title, detail: "Causal wording without an identification design named anywhere in the text, e.g. \"" + bad[0].slice(0, 110) + "\". Use \"associated with\" unless the design identifies causation." });
      }
      if (["discussion","conclusion"].includes(sec.role) || sec === sections[sections.length - 1]) {
        if (!sec.paras.length) continue;
        const last = paraText(sec.paras[sec.paras.length - 1]) || "";
        const hits = WEAK_CLOSERS.filter(w => countPhrase(last, w) > 0);
        if (hits.length) out.push({ rule: 9, sev: "low", where: sec.title, detail: "Generic closing (" + hits.join(", ") + "). End on a specific finding or implication." });
      }
    }
    const we = countPhrase(all, "we"), thisStudy = countPhrase(all, "this study") + countPhrase(all, "this paper") + countPhrase(all, "the authors") + countPhrase(all, "the researcher");
    if (thisStudy > 4 && we === 0) out.push({ rule: 7, sev: "low", where: "Whole text", detail: thisStudy + " uses of \"this study/paper\" and no \"we\". Leading Q1 authors write in active voice with \"we\"." });
    return out;
  }
  function parseRef(t) {
    const doi = (t.match(/\b10\.\d{4,9}\/[^\s,;]+[^\s,;.)]/) || [""])[0];
    const yearM = t.match(/\((\d{4}[a-z]?|n\.d\.(?:-[a-z])?)\)/) || t.match(/\b((?:19|20)\d{2}[a-z]?)\b/);
    const year = yearM ? yearM[1] : "";
    const num = (t.match(/^\[(\d+)\]|^(\d+)\.\s/) || []).slice(1).find(Boolean) || "";
    const body = t.replace(/^\[\d+\]\s*|^\d+\.\s+/, "");
    let surname = (body.match(/^(?:(?:van|von|de|der|den|da|di|le|la|du|dos|del)\s+)?([\p{Lu}][\p{L}'’-]+)/u) || ["", ""])[1];
    if (!surname) surname = (body.match(/^([\p{Lu}][\p{L}'’-]*)/u) || ["", ""])[1];
    let title = "";
    const afterYear = yearM ? body.slice(body.indexOf(yearM[0]) + yearM[0].length).replace(/^[\s.,:)]+/, "") : "";
    if (afterYear) title = (afterYear.match(/^[“"]?([^.?!“”"]{8,250}[?!]?)/) || ["", ""])[1].trim();
    if (!title) { const q = body.match(/[“"]([^”"]{8,250})[”"]/); if (q) title = q[1]; }
    return { text: t, num, surname, year, title, doi };
  }
  function citeKey(s, y) { return (s || "").toLowerCase() + " " + (y || ""); }
  const AI_TELLS = ["delve","crucial","pivotal","landscape","underscore","underscores","showcase","tapestry","testament","multifaceted","notably","furthermore","moreover","additionally","comprehensive","leverage","foster","navigate","realm","holistic","seamless","meticulous","vibrant","interplay","nuanced","paramount","it is important to note","it is worth noting","plays a crucial role","plays a key role","plays a pivotal role","in today's","in the realm of","shed light on","sheds light on","a growing body of","paves the way","serves as a","stands as a","not only","in conclusion","overall,"];
  function prose(text) { return String(text).replace(/\([^()]*(?:19|20)\d{2}[a-z]?[^()]*\)/g, " ").replace(/([^.!?\s]\s+)[A-Z][\p{L}'’-]+/gu, "$1"); }
  function aiTells(text) { const t = prose(text); const c = countList(t, AI_TELLS).total + (t.match(/—|\s–\s|\s--\s/g) || []).length; const w = Math.max(words(text).length, 1); return { count: c, per1k: +(c * 1000 / w).toFixed(1) }; }
  function similar(a, b) { const t = x => new Set((x || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2)); const A = t(a), B = t(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / Math.max(A.size, B.size); }
  function deskScreen(o) {
    // o: {sections:[{title,role,paras}], text(id), refs:[{year,...}], verified:{}, guidelines, journal, year}
    const secs = o.sections.filter(s => !["references", "declarations"].includes(s.role));
    const body = secs.flatMap(s => s.paras.map(o.text)).join(" ");
    const W = words(body).length, has = r => o.sections.some(s => s.role === r);
    const abs = o.sections.find(s => s.role === "abstract") || o.sections[0];
    const absW = abs ? words(abs.paras.map(o.text).join(" ")).length : 0;
    const contrib = (body.match(/\b(we|this (paper|study|article)|the paper|the study|I)\s+(contribute|show|find|demonstrate|document|propose|develop|offer|extend|identify|provide)s?\b|\bcontributions?\b/gi) || []).length;
    const empirical = (body.match(/\b(data ?set|dataset|sample|regression|estimat\w+|survey|panel|observations|respondents|interviews?|coefficients?|significant at)\b/gi) || []).length;
    const conceptual = !has("methods") && !has("results") && /\b(conceptual|propositions?|theoretical framework)\b/i.test(body);
    const cites = citations(body).filter(c => !c.startsWith("10.")).length, perK = +(cites * 1000 / Math.max(W, 1)).toFixed(1);
    const introCites = (() => { const s = o.sections.find(x => x.role === "introduction"); return s ? citations(s.paras.map(o.text).join(" ")).length : 0; })();
    const yrs = (o.refs || []).map(r => parseInt(r.year)).filter(y => y > 1900), Y = o.year || new Date().getFullYear();
    const recent = yrs.length ? Math.round(100 * yrs.filter(y => y >= Y - 5).length / yrs.length) : 0;
    const qs = Object.values(o.verified || {}).map(v => v.q).filter(Boolean), q12 = qs.length ? Math.round(100 * qs.filter(q => q <= 2).length / qs.length) : null;
    const d = diagnostics(body), ai = aiTells(body);
    const C = [];
    const add = (criterion, checks) => { const fails = checks.filter(c => c.s === "fail").length, warns = checks.filter(c => c.s === "warn").length; C.push({ criterion, status: fails ? "fail" : warns ? "warn" : "ok", checks }); };
    add("Original and substantive contribution", [
      { s: contrib >= 3 ? "ok" : contrib ? "warn" : "fail", t: `Contribution statements: ${contrib}`, fix: "State the contribution explicitly in the abstract, the introduction and the conclusion (what the paper adds that prior work does not)." },
      { s: conceptual ? "warn" : empirical >= 10 ? "ok" : "warn", t: conceptual ? "Conceptual paper: no data, methods or results section" : `Empirical markers: ${empirical}`, fix: conceptual ? "Many finance and economics journals desk-reject conceptual papers. Target journals that publish conceptual work, or add an empirical test." : "Describe the data, sample and estimation clearly; editors look for new evidence." }]);
    add("Well structured", [
      { s: has("abstract") ? "ok" : "fail", t: "Abstract " + (has("abstract") ? "present (" + absW + " words)" : "missing"), fix: "Add a labelled abstract." },
      { s: !absW ? "warn" : absW < 120 || absW > 300 ? "warn" : "ok", t: `Abstract length ${absW} words`, fix: "Most journals ask for 150 to 250 words; check the guidelines." },
      { s: has("introduction") ? "ok" : "fail", t: "Introduction " + (has("introduction") ? "present" : "missing"), fix: "Add an introduction that states the question, gap and contribution." },
      { s: has("literature") ? "ok" : "warn", t: "Literature or theory section " + (has("literature") ? "present" : "not found"), fix: "Add a section that positions the paper in prior work and develops hypotheses or propositions." },
      { s: conceptual || (has("methods") && has("results")) ? "ok" : "fail", t: conceptual ? "Conceptual: methods/results not required" : "Methods " + (has("methods") ? "present" : "missing") + ", results " + (has("results") ? "present" : "missing"), fix: "Separate data and method from results." },
      { s: has("conclusion") || has("discussion") ? "ok" : "fail", t: "Discussion or conclusion " + (has("conclusion") || has("discussion") ? "present" : "missing"), fix: "End with discussion, limitations and conclusion." },
      { s: W < 4000 ? "warn" : W > 14000 ? "warn" : "ok", t: `Length ${W.toLocaleString()} words (excluding references)`, fix: "Q1 articles are usually 7,000 to 12,000 words; check the journal's limit." }]);
    add("Well written", [
      { s: ai.per1k > 6 ? "fail" : ai.per1k > 3 ? "warn" : "ok", t: `AI-style patterns: ${ai.per1k} per 1,000 words`, fix: "Run Standard editing to remove stock phrases and staged openers." },
      { s: d.findings.filter(f => f.sev === "high").length ? "warn" : "ok", t: `Style issues flagged high: ${d.findings.filter(f => f.sev === "high").length}`, fix: "See Writing diagnostics in step 1." },
      { s: d.sdLen < 5 && d.sentences > 20 ? "warn" : "ok", t: `Sentence length mean ${d.meanLen}, SD ${d.sdLen}`, fix: "Vary sentence length; very even rhythm reads as mechanical." }]);
    add("Anchored in the literature", [
      { s: yrs.length >= 40 ? "ok" : yrs.length >= 25 ? "warn" : "fail", t: `References: ${yrs.length}`, fix: "Q1 papers in finance and management usually cite 40 to 80 sources. Thin reference lists are a common desk-rejection reason." },
      { s: !yrs.length ? "fail" : recent >= 25 ? "ok" : "warn", t: `Published in the last 5 years: ${recent}%`, fix: "Cite recent work from the target journal and its peers to show the paper joins a current conversation." },
      { s: perK >= 6 ? "ok" : perK >= 3 ? "warn" : "fail", t: `In-text citations: ${perK} per 1,000 words`, fix: "Support claims in the introduction and literature review with citations." },
      { s: introCites >= 5 ? "ok" : "warn", t: `Citations in the introduction: ${introCites}`, fix: "The introduction should name the prior papers the contribution responds to." },
      ...(q12 === null ? [] : [{ s: q12 >= 60 ? "ok" : "warn", t: `References in Q1 or Q2 journals: ${q12}% (of ${qs.length} found)`, fix: "Draw more on Q1 and Q2 journal articles." }])]);
    const g = (o.guidelines || "").toLowerCase(), fit = [];
    if (g) {
      const wl = g.match(/(?:maximum|max\.?|not exceed|up to|no more than|limit(?:ed)? (?:of|to))[^.]{0,40}?(\d{1,2}[,.]?\d{3})\s*words/);
      if (wl) { const lim = parseInt(wl[1].replace(/[,.]/g, "")); fit.push({ s: W <= lim ? "ok" : "fail", t: `Word limit ${lim.toLocaleString()}; manuscript ${W.toLocaleString()}`, fix: "Cut to the journal's limit before submission." }); }
      const al = g.match(/abstract[^.]{0,60}?(\d{2,3})\s*words/);
      if (al) { const lim = parseInt(al[1]); fit.push({ s: absW <= lim ? "ok" : "fail", t: `Abstract limit ${lim}; abstract ${absW}`, fix: "Shorten the abstract." }); }
      if (/structured abstract|purpose[^.]{0,40}design\/methodology/.test(g)) fit.push({ s: /purpose/i.test(abs ? abs.paras.map(o.text).join(" ") : "") ? "ok" : "fail", t: "Structured abstract required", fix: "Use the headings the journal asks for (Purpose, Design/methodology/approach, Findings, Originality/value)." });
      const full = o.allText || body;
      if (/\bempirical\b/.test(g) && conceptual) fit.push({ s: "fail", t: "The journal describes its scope as empirical research; this paper is conceptual", fix: "Choose a journal that publishes conceptual or theory papers, or add an empirical analysis." });
      if (/\bjel\b/.test(g)) fit.push({ s: /\bJEL\b/.test(full) || /\b[A-Z]\d{2}\b(,\s*[A-Z]\d{2})+/.test(full) ? "ok" : "fail", t: "JEL codes required", fix: "Add JEL classification codes under the keywords." });
      const kw = g.match(/(\d)\s*(?:to|-|–)\s*(\d)\s*keywords/); if (kw) { const kl = (full.match(/key\s?words?\s*[:.]\s*([^\n]+)/i) || ["", ""])[1], kn = kl ? kl.split(/[;,]/).filter(x => x.trim()).length : 0; fit.push({ s: kn >= +kw[1] && kn <= +kw[2] ? "ok" : kn ? "warn" : "fail", t: `Keywords required (${kw[1]} to ${kw[2]}); found ${kn}`, fix: "Adjust the keyword list to the journal's range." }); }
      if (false) fit.push({ s: /keywords?/i.test(body) ? "ok" : "fail", t: `Keywords required (${kw[1]} to ${kw[2]})`, fix: "Add keywords." });
      const scopeWords = [...new Set(g.match(/[a-z]{5,}/g) || [])].filter(w => !/^(should|would|their|which|these|those|where|other|about|being|journal|articles?|papers?|authors?|submission|manuscripts?|please|words|research|including)$/.test(w));
      const bodyL = body.toLowerCase(), hit = scopeWords.filter(w => bodyL.includes(w)).length;
      fit.push({ s: scopeWords.length && hit / scopeWords.length >= 0.35 ? "ok" : "warn", t: `Overlap with the pasted guidelines and scope: ${scopeWords.length ? Math.round(100 * hit / scopeWords.length) : 0}% of their key terms`, fix: "Use the journal's own terms for its scope where they honestly describe the paper." });
    } else fit.push({ s: "warn", t: o.journal ? `Target: ${o.journal}; guidelines not pasted` : "No target journal or guidelines given", fix: "Paste the journal's aims, scope and author guidelines in step 6 to check fit and formal requirements." });
    add("Fit to the journal", fit);
    const fails = C.filter(c => c.status === "fail").length, warns = C.filter(c => c.status === "warn").length;
    const decisive = C.flatMap(c => c.checks.filter(k => k.s === "fail").map(k => c.criterion + ": " + k.t)).concat(C.flatMap(c => c.checks.filter(k => k.s === "warn").map(k => c.criterion + ": " + k.t))).slice(0, 3);
    return { risk: fails >= 2 ? "high" : fails === 1 || warns >= 3 ? "medium" : "low", reasons: decisive, criteria: C, words: W };
  }
  // ---- consistency checks (Paperpal-style, deterministic) ----
  const UKUS = [["organisation","organization"],["organisations","organizations"],["organisational","organizational"],["optimisation","optimization"],["optimise","optimize"],["analyse","analyze"],["analysed","analyzed"],["analysing","analyzing"],["behaviour","behavior"],["behaviours","behaviors"],["behavioural","behavioral"],["favour","favor"],["favourable","favorable"],["centre","center"],["modelling","modeling"],["modelled","modeled"],["labour","labor"],["defence","defense"],["utilise","utilize"],["utilised","utilized"],["recognise","recognize"],["recognised","recognized"],["emphasise","emphasize"],["emphasised","emphasized"],["minimise","minimize"],["maximise","maximize"],["prioritise","prioritize"],["realise","realize"],["realised","realized"],["characterise","characterize"],["characterised","characterized"],["summarise","summarize"],["categorise","categorize"],["standardised","standardized"],["capitalise","capitalize"],["capitalisation","capitalization"],["internationalisation","internationalization"],["globalisation","globalization"],["colour","color"],["endeavour","endeavor"],["travelled","traveled"],["fulfil","fulfill"],["enrol","enroll"]];
  const ABBR_OK = new Set(["USA","US","UK","EU","GDP","CEO","CFO","OECD","IMF","UN","ROA","ROE","OLS","GMM","R&D","NASDAQ","NYSE","IPO","DOI","ISSN","AI","IT","HR","USD","EUR","HUF","COVID","SPSS","PLS","SEM","AMOS","II","III","IV","VI","JEL","APA","CA","NA","OK","PhD","MBA","DBA"]);
  const STD_ABBR = new Set(["GDP","OECD","EU","US","USA","UK","UN","IMF","JEL","SME","CEO","CFO","ICT","IT","AI","R&D","OLS","GMM","VAT","ISO","COVID","USD","EUR","HUF","ID","PhD","MBA","DBA","NGO","IPO"]);
  function consistency(paras) {
    const out = []; const body = paras.filter(p => !p.isHeading && !p.isRef && !p.isTable);
    const all = body.map(p => p.text).join("\n");
    const occ = (re) => { const r = []; body.forEach(p => { let m; const rr = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); while ((m = rr.exec(p.text))) r.push({ pid: p.id, m }); }); return r; };
    // UK/US spelling
    let uk = 0, us = 0; const ukHits = [], usHits = [];
    UKUS.forEach(([a, b]) => { occ(new RegExp("\\b" + a + "\\b", "gi")).forEach(h => { uk++; ukHits.push({ ...h, from: h.m[0], to: matchCase(h.m[0], b) }); }); occ(new RegExp("\\b" + b + "\\b", "gi")).forEach(h => { us++; usHits.push({ ...h, from: h.m[0], to: matchCase(h.m[0], a) }); }); });
    if (uk && us) { const minority = uk >= us ? usHits : ukHits, keep = uk >= us ? "British" : "American";
      minority.forEach(h => out.push({ pid: h.pid, category: "consistency", severity: "med", quote: h.from, replacement: h.to, problem: `Mixed spelling: the text is mostly ${keep} (${Math.max(uk, us)} vs ${Math.min(uk, us)}). "${h.from}" breaks the pattern.`, suggestion: `Use "${h.to}".` })); }
    // repeated words
    occ(/\b(\w{2,})\s+\1\b/gi).forEach(h => { if (/^(that|had|is)$/i.test(h.m[1])) return; out.push({ pid: h.pid, category: "grammar", severity: "high", quote: h.m[0], replacement: h.m[1], problem: `Repeated word "${h.m[1]}".`, suggestion: "Delete the duplicate." }); });
    // hyphenation consistency
    const hyph = new Map(); (all.match(/\b[a-z]+-[a-z]+\b/g) || []).forEach(w => hyph.set(w, (hyph.get(w) || 0) + 1));
    hyph.forEach((n, w) => { const sp = w.replace("-", " "), solid = w.replace("-", "");
      const nextAfter = new Set((all.match(new RegExp("\\b" + w + "\\s+([a-z]+)", "g")) || []).map(x => x.split(/\s+/).pop()));
      occ(new RegExp("\\b(" + sp + "|" + solid + ")\\s+([a-z]+)", "g")).forEach(h => { if (!nextAfter.has(h.m[2])) return; const q = h.m[1] + " " + h.m[2]; out.push({ pid: h.pid, category: "consistency", severity: "low", quote: q, replacement: w + " " + h.m[2], problem: `"${w} ${h.m[2]}" is hyphenated elsewhere but written "${q}" here.`, suggestion: `Use "${w} ${h.m[2]}" consistently.` }); }); });
    // per cent styles
    const pc = { "%": (all.match(/\d\s?%/g) || []).length, percent: (all.match(/\bpercent\b/gi) || []).length, "per cent": (all.match(/\bper cent\b/gi) || []).length };
    if (Object.values(pc).filter(Boolean).length > 1) out.push({ scope: "doc", category: "consistency", severity: "low", problem: `Percentages written in more than one way (${Object.entries(pc).filter(e => e[1]).map(e => e[0] + " ×" + e[1]).join(", ")}).`, suggestion: "Use one form; most business journals use the % sign with numerals.", author: true });
    // abbreviations
    const defs = new Map(); occ(/\b([A-Za-z][A-Za-z\-]+(?:\s+[A-Za-z&\-]+){1,7})\s*[(\[]([A-Z][A-Za-z&]{1,9}s?)[)\]]/g).forEach(h => { const ab = h.m[2]; if (!defs.has(ab)) defs.set(ab, { pid: h.pid, long: h.m[1], pos: all.indexOf(h.m[0]) }); else out.push({ pid: h.pid, category: "consistency", severity: "low", quote: h.m[0], replacement: ab, problem: `"${ab}" is defined again; it was already defined earlier.`, suggestion: `Use "${ab}" alone after the first definition.` }); });
    const abUse = new Map(); (all.match(/\b[A-Z]{2,6}s?\b/g) || []).forEach(a => abUse.set(a.replace(/s$/, ""), (abUse.get(a.replace(/s$/, "")) || 0) + 1));
    abUse.forEach((n, ab) => { if (ABBR_OK.has(ab) || n < 2) return; const d = defs.get(ab) || defs.get(ab + "s");
      const first = all.search(new RegExp("\\b" + ab + "s?\\b"));
      if (!d && !STD_ABBR.has(ab.replace(/s$/, ""))) out.push({ scope: "doc", category: "consistency", severity: n >= 10 ? "low" : "med", problem: `"${ab}" is used ${n} times but never spelled out.`, suggestion: `If ${ab} is an abbreviation, write it out in full at first use, followed by (${ab}). If it is a name, ignore this.`, author: true });
      else if (d && first < d.pos) out.push({ scope: "doc", category: "consistency", severity: "med", problem: `"${ab}" is used before it is defined (${d.long} (${ab})).`, suggestion: "Move the definition to the first use.", author: true }); });
    // tables, figures, hypotheses
    const capT = new Set((paras.filter(p => /^(#+\s*)?Table\s+\d+/i.test(p.text)).map(p => +p.text.match(/Table\s+(\d+)/i)[1])));
    const capF = new Set((paras.filter(p => /^(#+\s*)?(Figure|Fig\.)\s+\d+/i.test(p.text)).map(p => +p.text.match(/(?:Figure|Fig\.)\s+(\d+)/i)[1])));
    const refT = new Set((all.match(/\bTables?\s+(\d+)/g) || []).map(x => +x.match(/\d+/)[0])), refF = new Set((all.match(/\b(?:Figures?|Fig\.)\s+(\d+)/g) || []).map(x => +x.match(/\d+/)[0]));
    refT.forEach(n => { if (capT.size && !capT.has(n)) out.push({ scope: "doc", category: "consistency", severity: "high", problem: `Table ${n} is referred to in the text but there is no Table ${n}.`, suggestion: "Correct the number or add the table.", author: true }); });
    capT.forEach(n => { if (![...body].some(p => new RegExp("\\bTables?\\s+" + n + "\\b").test(p.text) && !/^[*_]*Table\s+\d+[*_]*\s*([.:]|$)/.test(p.text))) out.push({ scope: "doc", category: "consistency", severity: "med", problem: `Table ${n} is never referred to in the text.`, suggestion: `Refer to Table ${n} where its content is discussed.`, author: true }); });
    refF.forEach(n => { if (capF.size && !capF.has(n)) out.push({ scope: "doc", category: "consistency", severity: "high", problem: `Figure ${n} is referred to but not present.`, suggestion: "Correct the number or add the figure.", author: true }); });
    ["H", "P"].forEach(L => { const nums = [...new Set((all.match(new RegExp("\\b" + L + "(\\d{1,2})[a-c]?\\b", "g")) || []).map(x => +x.slice(1).replace(/[a-c]$/, "")))].sort((a, b) => a - b);
      if (nums.length >= 2) for (let k = nums[0]; k < nums[nums.length - 1]; k++) if (!nums.includes(k)) out.push({ scope: "doc", category: "consistency", severity: "high", problem: `${L === "H" ? "Hypotheses" : "Propositions"} jump from ${L}${k - 1} to ${L}${k + 1}: ${L}${k} is missing.`, suggestion: "Renumber or add the missing one.", author: true }); });
    return out;
  }
  function matchCase(src, w) { return src[0] === src[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w; }
  // ---- citation style (APA 7) ----
  function citeStyle(paras) {
    const out = [], refs = paras.filter(p => p.isRef).map(p => p.text);
    if (!refs.length) return out;
    const apa = refs.filter(r => /^[^()]{3,200}\(\d{4}[a-z]?\)\./.test(r)).length / refs.length > 0.6;
    const body = paras.filter(p => !p.isHeading && !p.isRef && !p.isTable);
    if (apa) {
      body.forEach(p => {
        let m; const nar = /\b((?:van |von |de )?[A-Z][\p{L}'’-]+)((?:,\s*[A-Z][\p{L}'’-]+)+,?\s+(?:and|&)\s+[A-Z][\p{L}'’-]+)\s+\((\d{4}[a-z]?)\)/gu;
        while ((m = nar.exec(p.text))) out.push({ pid: p.id, category: "citation style", severity: "med", quote: m[0], replacement: `${m[1]} et al. (${m[3]})`, problem: "APA 7: works with three or more authors are cited as \"First author et al.\" from the first citation.", suggestion: `Use "${m[1]} et al. (${m[3]})".` });
        const par = /\(([^()]*?)\)/g;
        while ((m = par.exec(p.text))) m[1].split(";").forEach(part => { const mm = part.trim().match(/^((?:van |von |de )?[A-Z][\p{L}'’-]+)((?:,\s*[A-Z][\p{L}'’-]+)+,?\s*(?:and|&)\s*[A-Z][\p{L}'’-]+),\s*(\d{4}[a-z]?)$/u); if (mm) out.push({ pid: p.id, category: "citation style", severity: "med", quote: part.trim(), replacement: `${mm[1]} et al., ${mm[3]}`, problem: "APA 7: three or more authors take \"et al.\" in every citation.", suggestion: `Use "${mm[1]} et al., ${mm[3]}".` }); });
        const andPar = /\(([A-Z][\p{L}'’-]+) and ([A-Z][\p{L}'’-]+), (\d{4})\)/gu;
        while ((m = andPar.exec(p.text))) out.push({ pid: p.id, category: "citation style", severity: "low", quote: m[0], replacement: `(${m[1]} & ${m[2]}, ${m[3]})`, problem: "APA 7 uses \"&\" inside parentheses.", suggestion: "Replace \"and\" with \"&\"." });
      });
    }
    const keys = refs.map(r => r.replace(/^[\[\d\].\s]+/, "").toLowerCase());
    for (let k = 1; k < keys.length; k++) if (apa && keys[k].localeCompare(keys[k - 1]) < 0) { out.push({ scope: "doc", category: "citation style", severity: "low", problem: `Reference list is not in alphabetical order near "${refs[k].slice(0, 50)}".`, suggestion: "Sort the reference list alphabetically by first author.", author: true }); break; }
    const seen = new Map(); refs.forEach(r => { const k = r.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60); if (seen.has(k)) out.push({ scope: "doc", category: "citation style", severity: "med", problem: "Duplicate reference: " + r.slice(0, 70), suggestion: "Remove the duplicate.", author: true }); seen.set(k, 1); });
    refs.forEach(r => { if (/\b\d+\s*\(\d+\)\s*,\s*\d+/.test(r) && !/10\.\d{4,9}\//.test(r)) out.push({ scope: "doc", category: "citation style", severity: "low", problem: "Journal article without a DOI: " + r.slice(0, 70), suggestion: "Add the DOI as https://doi.org/... (APA 7 and most business journals require it).", author: true }); });
    return out;
  }
  // ---- business research checks (MBA / DBA / management and finance) ----
  const THEORIES = ["financing hierarchy","pecking-order","credit rationing","asymmetric information","information asymmetry","relationship lending","resource-based view","resource based view","agency theory","transaction cost","institutional theory","dynamic capabilities","stakeholder theory","real options","pecking order","trade-off theory","signalling theory","signaling theory","upper echelons","contingency theory","technology acceptance","utaut","diffusion of innovation","social exchange","stewardship theory","legitimacy theory","prospect theory","behavioral theory of the firm","behavioural theory of the firm","knowledge-based view","financial constraints theory","life cycle theory","balanced scorecard","levers of control","cybernetic","goal-setting theory","expectancy theory","organizational learning","absorptive capacity","effectuation","bricolage"];
  function bizChecks(paras, secs) {
    const out = [], body = paras.filter(p => !p.isRef && !p.isTable).map(p => p.text).join(" "), L = body.toLowerCase();
    const has = re => re.test(L), n = re => (L.match(re) || []).length;
    const quant = n(/\b(regression|coefficient|panel data|fixed effects?|ols|logit|probit|gmm|estimat\w+|significant at)\b/g) >= 4;
    const secondary = has(/\b(enterprise surveys?|wbes|world bank enterprise|orbis|amadeus|compustat|crsp|census|administrative (data|records)|household survey|labou?r force survey|panel file|\.dta\b|secondary data)\b/);
    const survey = !secondary && n(/\b(questionnaire|likert|structural equation|pls-sem|cb-sem|measurement model|survey instrument|we surveyed|respondents? (rated|answered|completed))\b/g) >= 2;
    const qual = n(/\b(interviews?|interviewees|case stud(y|ies)|thematic analysis|coding|grounded theory|focus groups?)\b/g) >= 4;
    const roles = new Set((secs || []).map(x => x.role));
    // a paper that says it is conceptual, states propositions and has no results section is conceptual, even if it discusses regressions
    const declaredConceptual = has(/\b(this|our|the present) (conceptual|theoretical) (paper|article|study)|\bconceptual (paper|article|framework|model)\b|\bpropositions?\s*(p?\d|\(p\d)/) && !roles.has("results");
    const review = has(/\b(systematic (literature )?review|scoping review|meta-analysis|prisma)\b/) && !quant;
    const conceptual = declaredConceptual || (!quant && !survey && !qual && has(/\b(conceptual|propositions?)\b/));
    const method = declaredConceptual ? "conceptual" : review ? "review" : survey ? "survey" : quant ? "quantitative" : qual ? "qualitative" : conceptual ? "conceptual" : "unclear";
    const need = (cond, sev, problem, suggestion) => { if (!cond) out.push({ scope: "doc", category: "business research", severity: sev, problem, suggestion, author: true }); };
    const th = THEORIES.filter(t => L.includes(t));
    need(th.length > 0, "high", "No named theory. Business and management reviewers expect the argument to rest on an explicit theory (for example agency theory, resource-based view, real options).", "Name the theory in the introduction and use it to derive hypotheses or propositions.");
    need(has(/\b(managerial|practical) (implications?|relevance|contributions?)|implications for (managers|practice|practitioners|policy|policymakers|regulators|the|ministries|banks|lenders)|policy (implications?|recommendations?|relevance)|for practitioners\b/), "med", "No managerial or practical implications.", "Add a short section on what managers or policymakers should do differently, grounded in the findings.");
    need(has(/\b(limitations?|caveats?|boundar(y|ies))\b/), "med", "Limitations are not discussed.", "Add a limitations paragraph stated as conditions on the findings.");
    need(has(/\b(future (research|studies|work|tests?)|further research|research agenda|programme for testing|program for testing)\b/), "low", "No direction for future research.", "Name one or two specific next studies.");
    if (method === "quantitative" || method === "survey") {
      need(has(/\b(descriptive statistics|summary statistics|means?|standard deviations?|weighted (estimates|means?|shares?|percentages?)|descriptive (comparisons?|estimates|benchmark))\b/), "med", "Descriptive statistics are not reported.", "Report means, standard deviations and a correlation matrix.");
      need(has(/\b(correlation matrix|pearson|correlations?)\b/), "low", "No correlation matrix mentioned.", "Include a correlation table.");
      need(has(/\b(vif|variance inflation|multicollinearity|collinear\w*)\b/), "low", "Multicollinearity is not checked.", "Report VIF values.");
      need(has(/\b(robust\w*|sensitivity (analys[ie]s|specifications?|tests?|checks?)|alternative (measures?|specifications?|samples?|estimators?)|placebo)\b/), "med", "No robustness checks.", "Add alternative measures, samples or estimators.");
    }
    if (method === "quantitative") {
      need(has(/\b(endogeneity|reverse causality|instrumental variables?|2sls|heckman|selection bias|omitted variables?|simultaneity|causal (effect|relation|explanation|interpretation)|not causal|does not identify|associational)\b/), "high", "Endogeneity is not addressed. This is one of the most common reasons business and finance reviewers reject empirical papers.", "Discuss reverse causality and omitted variables; use lags, fixed effects, instruments or a natural experiment where possible.");
      need(has(/\b(clustered|robust standard errors?|heteroskedasticity|heteroscedasticity|design-based|survey-design standard errors?|delta-method|bootstrap\w*|sampling design)\b/), "med", "Standard errors: clustering or heteroskedasticity-robust errors are not mentioned.", "State how standard errors are computed.");
      need(has(/\b(fixed effects?|industry dumm\w+|year dumm\w+|time dumm\w+|controls? for|controlling for|adjusting for|sector controls?|industry controls?)\b/), "low", "No fixed effects or industry/year controls mentioned.", "Control for industry and year, or explain why not.");
    }
    if (method === "survey") {
      need(has(/\b(cronbach|composite reliability|\bcr\b)/), "high", "Reliability (Cronbach's alpha or composite reliability) is not reported.", "Report alpha and CR for every construct.");
      need(has(/\b(ave|average variance extracted|convergent validity)\b/), "high", "Convergent validity (AVE) is not reported.", "Report AVE for each construct.");
      need(has(/\b(discriminant validity|fornell|htmt|heterotrait)\b/), "high", "Discriminant validity is not tested.", "Report HTMT or the Fornell-Larcker criterion.");
      need(has(/\b(common method (bias|variance)|harman|marker variable)\b/), "high", "Common method bias is not addressed.", "Test with Harman's single factor and a marker variable, and describe procedural remedies.");
      need(has(/\b(response rate|non-?response bias)\b/), "med", "Response rate and non-response bias are not reported.", "Report the response rate and compare early and late respondents.");
    }
    if (method === "qualitative") {
      need(has(/\b(purposive|theoretical sampling|snowball|sampling)\b/), "med", "Sampling logic is not explained.", "Explain how cases or interviewees were selected.");
      need(has(/\b(saturation)\b/), "low", "Data saturation is not discussed.", "State when no new themes emerged.");
      need(has(/\b(nvivo|atlas\.ti|coding (scheme|procedure)|first-order|second-order|gioia)\b/), "med", "The coding procedure is not described.", "Describe the coding steps (for example the Gioia method) and show a data structure.");
      need(has(/\b(trustworthiness|credibility|inter-?coder|inter-?rater)\b/), "med", "Trustworthiness or inter-coder reliability is not addressed.", "Report inter-coder agreement or credibility checks.");
    }
    if (method === "conceptual") {
      need(has(/\bproposition\s*\d|\bp\d\b/), "med", "Propositions are not numbered or stated formally.", "State each proposition formally and number it (P1, P2...).");
      need(has(/\b(boundar(y|ies)|scope conditions?)\b/), "med", "Boundary conditions are not stated.", "Say where the framework should not apply.");
      need(has(/\b(testable|test(ed|ing)? empirically|empirical test|operationali[sz])\w*/), "low", "It is not explained how the framework could be tested.", "Describe the data and design that would test each proposition.");
    }
    if (has(/\b(finance|financial|cash|leverage|investment|banking|stock|capital structure|liquidity)\b/) && !/\bJEL\b/.test(paras.map(p => p.text).join(" "))) out.push({ scope: "doc", category: "business research", severity: "low", problem: "No JEL codes. Finance and economics journals usually require them.", suggestion: "Add two to four JEL codes under the keywords (for example G32, G31, M41).", author: true });
    // construct naming consistency
    [["firm performance", "company performance", "organizational performance", "organisational performance", "business performance"], ["SMEs", "small and medium-sized enterprises", "small firms", "small businesses"], ["financial flexibility", "financial slack"]].forEach(set => { const used = set.filter(t => L.includes(t.toLowerCase())); if (used.length > 1) out.push({ scope: "doc", category: "terminology", severity: "med", problem: `Several names for what may be one construct: ${used.map(u => '"' + u + '"').join(", ")}.`, suggestion: "If they mean the same construct, pick one term and use it throughout; if they differ, define each.", author: true }); });
    return { method, theories: th, issues: out };
  }
  return { isCaption, headingLevel, sectionRoles, consistency, citeStyle, bizChecks, deskScreen, parseRef, citeKey, aiTells, similar, detectRole, ruleChecks, HEDGES, CAUSAL, DEFAULT_TERMS, esc, splitParagraphs, numbers, citations, termCounts, multisetDiff, diagnostics, knowledgeFacts, compare, wordDiff, parseJSON, normDoi, csv, countList, words };
})();

if (typeof module !== "undefined") module.exports = Core;
