import requests,bs4,re,os,csv,json,hashlib,time,datetime,urllib.parse,concurrent.futures,collections
from pathlib import Path
ROOT=Path("mnb_curated");ROOT.mkdir(exist_ok=True)
rows=json.load(open("mnb_discovery/FULL_MNB_CATALOGUE.json"))["items"]
parent="https://www.mnb.hu/en/publications/reports"
I=parent+"/inflation-report/quarterly-report-on-inflation-from-1998-march-2014"
T=parent+"/trends-in-lending"
F=parent+"/financial-stability-report"
extra=[]
for year in range(2011,2015):
 for month in ['march','june','september','december']:
  if year==2014 and month!='march':continue
  extra.append(dict(family="Inflation_Report",year=year,title=f"Quarterly Report on Inflation ({month.title()} {year})",detail_url=f"{I}/quarterly-report-on-inflation-{month}-{year}",index_page="historical_archive",index_url=I))
for year in range(2013,2025):
 months=['may','november'] if year==2013 else (['february'] if year==2024 else ['february','march','may','june','august','september','november','december'])
 for month in months:
  extra.append(dict(family="Trends_in_Lending",year=year,title=f"Trends in lending, {month.title()} {year}",detail_url=f"{T}/trends-in-lending-{month}-{year}",index_page="legacy_direct_candidate",index_url=T))
for year in [2014,2015,2016]:
 for month in (['may','november'] if year<2016 else ['may']):
  extra.append(dict(family="Financial_Stability",year=year,title=f"Financial Stability Report ({month.title()} {year})",detail_url=f"{F}/financial-stability-report-{month}-{year}",index_page="legacy_direct_candidate",index_url=F))
allrows={x["detail_url"]:x for x in rows}
for x in extra:allrows.setdefault(x['detail_url'],x)
allrows=list(allrows.values())
HEADERS={"User-Agent":"Mozilla/5.0 (academic-source-audit)"}
bad_tokens=("hufonia","bubor","birs","mnbmerleg","swap-index","exchange-rate","mnb-annual-report-","publication-calendar")
def lookup(row):
 try:
  u=row['detail_url'];res=requests.get(u,timeout=37,headers=HEADERS)
  if res.status_code!=200:return None,dict(status='DETAIL_NOT_FOUND',error=f"HTTP {res.status_code}",**row)
  doc=bs4.BeautifulSoup(res.text,"html.parser")
  h=doc.find('h1');heading=h.get_text(" ",strip=True) if h else ""
  fl=row['family']
  expected= "inflation" if fl=="Inflation_Report" else "trends in lending" if fl=="Trends_in_Lending" else "financial stability" if "Financial_Stability" in fl else "survey"
  if expected not in heading.lower():
   return None,dict(status='DETAIL_WRONG_HEADING',error=heading[:150],**row)
  candidates=[]
  for a in doc.find_all('a',href=True):
   url=urllib.parse.urljoin(u,a['href']); path=urllib.parse.urlparse(url).path.lower()
   if not urllib.parse.urlparse(url).hostname or not urllib.parse.urlparse(url).hostname.endswith('mnb.hu'):continue
   ext=os.path.splitext(path)[1]
   if ext not in ('.pdf','.xlsx','.xls'):continue
   if any(t in path for t in bad_tokens):continue
   label=a.get_text(' ',strip=True).lower()
   # exclude resource files from other sections such as site-wide footer
   score=0
   if ext=='.pdf':score+=40
   if any(t in label for t in ['report','survey','trends in lending','hitelezesi','inflation']):score+=35
   if any(t in path for t in ['hitelezesi-folyamatok','inflation','financial-stability','penzugyi-stabilit','inflacio','slo-','senior-loan','jelentes']):score+=30
   if any(t in label+' '+path for t in ['flyer','summary','presentation','slide','press-release']):score-=90
   if any(t in label+' '+path for t in ['chart','figure','ábra','abra','abrak','melleklet','annex','tablazat']):score-=20
   if ext in ('.xlsx','.xls'):
    if not any(t in label+' '+path for t in ['chart','figure','ábra','abra','abrak','melleklet','annex','tablazat','slo-annex']):continue
   candidates.append(dict(url=url,ext=ext,label=label,score=score))
  dedup={c['url']:c for c in candidates}
  cs=list(dedup.values())
  pdf=sorted([x for x in cs if x['ext']=='.pdf'],key=lambda x:x['score'],reverse=True)
  if not pdf:return None,dict(status='NO_MAIN_PDF',error='No linked PDF under report heading',**row)
  excels=sorted([x for x in cs if x['ext'] in ('.xlsx','.xls')],key=lambda x:x['score'],reverse=True)[:2]
  row=dict(row);row['resolved_heading']=heading
  return [(row,x,'main' if x==pdf[0] else 'charts') for x in [pdf[0]]+excels],dict(status='PDF_LINKED',error='',**row,primary_pdf=pdf[0]['url'],pdf_label=pdf[0]['label'])
 except Exception as e:return None,dict(status='DETAIL_REQUEST_ERROR',error=str(e)[:180],**row)
tasks=[];details=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=9) as pool:
 for t,entry in pool.map(lookup,allrows):
  details.append(entry)
  if t:tasks.extend(t)
print("DETAILS",len(allrows),"PDF LINKED",sum(x['status']=='PDF_LINKED' for x in details),"FILE TASKS",len(tasks),flush=True)
def download(entry):
 row,source,kind=entry
 url=source['url'];ext=source['ext'];family=row['family'];year=row['year']
 label=re.sub('[^A-Za-z0-9_-]+','_',row['title'])[:75].strip('_')
 out=ROOT/family/str(year);out.mkdir(parents=True,exist_ok=True)
 dest=out/(label+'_'+kind+'_'+hashlib.sha1(url.encode()).hexdigest()[:9]+ext)
 error=''
 for repeat in range(2):
  try:
   resp=requests.get(url,timeout=82,headers=HEADERS,stream=True);resp.raise_for_status()
   data=bytearray()
   for chunk in resp.iter_content(chunk_size=256*1024):
    data.extend(chunk)
    if len(data)>65_000_000:raise ValueError("file exceeded 65MB policy cap")
   content=bytes(data)
   if ext=='.pdf' and not content.startswith(b'%PDF-'):raise ValueError("invalid PDF signature")
   if ext in ('.xls','.xlsx') and not (content.startswith(b'PK') or content.startswith(bytes.fromhex('D0CF11E0'))):raise ValueError("invalid spreadsheet signature")
   if len(content)<900:raise ValueError("empty file")
   dest.write_bytes(content)
   return dict(family=family,year=year,title=row['title'],kind=kind,source_url=url,detail_url=row['detail_url'],status='VERIFIED_FILE',size_bytes=len(content),sha256=hashlib.sha256(content).hexdigest(),archive_path=str(dest),error='',is_summary=('flyer' in url.lower() or 'summary' in url.lower()))
  except Exception as e:error=str(e)[:180];time.sleep(1+repeat)
 return dict(family=family,year=year,title=row['title'],kind=kind,source_url=url,detail_url=row['detail_url'],status='DOWNLOAD_FAILED',size_bytes=0,sha256='',archive_path='',error=error,is_summary=False)
with concurrent.futures.ThreadPoolExecutor(max_workers=9) as pool:
 result=list(pool.map(download,tasks))
# append initial 13 unique report PDFs later (kept separately in Drive, not claimed here)
with open(ROOT/'DOWNLOAD_MANIFEST.csv','w',newline='',encoding='utf-8') as f:
 w=csv.DictWriter(f,fieldnames=list(result[0]));w.writeheader();w.writerows(result)
fields=list({key for d in details for key in d})
with open(ROOT/'DETAIL_SOURCE_REGISTER.csv','w',newline='',encoding='utf-8') as f:
 w=csv.DictWriter(f,fieldnames=sorted(fields));w.writeheader();w.writerows(details)
main=[x for x in result if x['kind']=='main' and x['status']=='VERIFIED_FILE']
summary={
"date_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
"official_pages_considered":len(allrows),
"published_pages_with_pdf":sum(x['status']=='PDF_LINKED' for x in details),
"verified_main_pdf_files":len(main),
"main_pdf_summary_or_flyer":sum(x['is_summary'] for x in main),
"verified_associated_chart_files":sum(x['kind']=='charts' and x['status']=='VERIFIED_FILE' for x in result),
"failed_file_attempts":sum(x['status']!='VERIFIED_FILE' for x in result),
"by_year":dict(sorted(collections.Counter(x['year'] for x in main).items())),
"by_family":dict(collections.Counter(x['family'] for x in main)),
"missing_detail_entries":[{k:d.get(k) for k in ['family','year','title','detail_url','status','error']} for d in details if d['status']!='PDF_LINKED'],
"review_note":"Full revised source catalogue contains official public reports 2011-2026. Each unique publication has a main PDF and at most two specific chart-data Excel files. No global HUFONIA/BUBOR/BIRS files. No WBES microdata. MNB policy data are contextual, not causal regressors."
}
with open(ROOT/'COMPLETENESS_REPORT.json','w') as f:json.dump(summary,f,indent=2,ensure_ascii=False)
print(json.dumps({k:v for k,v in summary.items() if k!='missing_detail_entries'},indent=2),flush=True)
assert len(main)>=155,"Too few verified original reports; inspect detail errors"
