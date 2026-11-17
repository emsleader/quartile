import os,csv,json,requests,bs4,re,hashlib,urllib.parse,time,concurrent.futures,collections
src="mnb_discovery/FULL_MNB_CATALOGUE.json"
catalogue=json.load(open(src))['items']
ROOT="mnb_official_full"
os.makedirs(ROOT,exist_ok=True)
HEADER={"User-Agent":"Mozilla/5.0 academic archival source access"}
def candidate_links(row):
 name=row["title"];url=row["detail_url"]
 try:
  h=requests.get(url,timeout=40,headers=HEADER)
  if h.status_code!=200: raise ValueError("detail HTTP "+str(h.status_code))
  soup=bs4.BeautifulSoup(h.text,"html.parser")
  candidates=[]
  for el in soup.select("a[href],iframe[src],embed[src]"):
   href=el.get("href") or el.get("src") or ""; full=urllib.parse.urljoin(h.url,href)
   u=urllib.parse.urlparse(full)
   if not (u.hostname or '').endswith('mnb.hu'):continue
   ext=os.path.splitext(u.path.lower())[1]
   if ext not in ('.pdf','.xlsx','.xls','.zip'):continue
   label=(el.get_text(" ",strip=True) or el.get("title","") or os.path.basename(u.path))[:300]
   if ext=='.zip':continue
   candidates.append(dict(url=full,label=label,ext=ext))
  # remove site unrelated navigation documents, only links from current page (normally few)
  d={};[d.setdefault(x['url'],x) for x in candidates]
  candidates=list(d.values())
  def priority(x):
   label=x["label"].lower();url=x["url"].lower()
   score=(10 if x["ext"]=='.pdf' else 5)
   if any(key in label for key in ["report","survey","trends in lending","financial stability","hitelezési folyamatok","inflation"]):score+=15
   if any(key in label for key in ["figures","charts","chart","ábra","presentation","slide","summary","flyer"]):score-=15
   if 'letoltes' in url:score+=2
   return -score
  candidates.sort(key=priority)
  # preserve one main report, plus all downloadable original chart spreadsheets
  primary_pdf=next((x for x in candidates if x['ext']=='.pdf'),None)
  extras=[x for x in candidates if x['ext'] in ('.xlsx','.xls')][:5]
  chosen=([primary_pdf] if primary_pdf else [])+extras
  if not chosen:
   return [],dict(family=row['family'],year=row['year'],title=name,detail_url=url,status='NO_PDF_FOUND',error='No directly linked PDF in detail page',primary_url='',primary_label='',http=h.status_code,candidates=json.dumps(candidates[:8]))
  return [(row,link,'main' if link==primary_pdf else 'data') for link in chosen],dict(family=row['family'],year=row['year'],title=name,detail_url=url,status='LINK_FOUND',error='',primary_url=primary_pdf['url'] if primary_pdf else '',primary_label=primary_pdf['label'] if primary_pdf else '',http=h.status_code,candidates=json.dumps(candidates[:8]))
 except Exception as e:
  return [],dict(family=row["family"],year=row["year"],title=name,detail_url=url,status='DETAIL_FAILED',error=str(e)[:400],primary_url='',primary_label='',http='',candidates='[]')
all_candidates=[];detail_manifest=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
 for items,log in ex.map(candidate_links,catalogue):
  all_candidates.extend(items);detail_manifest.append(log)
print("DETAIL CATALOGUED",len(catalogue),"FOUND",sum(x['status']=='LINK_FOUND' for x in detail_manifest),"DOWNLOAD TASKS",len(all_candidates),flush=True)
seen={}
def retrieve(x):
 row,link,kind=x
 u=link['url'];ext=link['ext'];family=row['family'];yr=row['year']
 name=re.sub(r'[^A-Za-z0-9_-]+','_',row['title'])[:84].strip('_')
 suffix=hashlib.sha1(u.encode()).hexdigest()[:7]
 outdir=os.path.join(ROOT,family,str(yr));os.makedirs(outdir,exist_ok=True)
 dest=os.path.join(outdir,f'{name}_{kind}_{suffix}{ext}')
 error=''
 for attempt in range(3):
  try:
   req=requests.get(u,timeout=75,headers=HEADER,stream=True,allow_redirects=True)
   req.raise_for_status()
   chunks=[];n=0
   for chunk in req.iter_content(chunk_size=1024*256):
    if not chunk:continue
    chunks.append(chunk);n+=len(chunk)
    if n>50_000_000:raise ValueError("File >50MB limit, marked rather than truncating")
   content=b''.join(chunks)
   if ext=='.pdf' and not content.startswith(b'%PDF-'):raise ValueError('No PDF signature')
   if ext in ('.xlsx','.xls') and not (content.startswith(b'PK') or content.startswith(b'\xd0\xcf\x11\xe0')):raise ValueError('Not an Excel binary file')
   if len(content)<800:raise ValueError('Too few bytes')
   with open(dest,'wb') as f:f.write(content)
   return dict(family=family,year=yr,title=row['title'],kind=kind,detail_url=row['detail_url'],file_url=u,status='VERIFIED_FILE',size=len(content),sha256=hashlib.sha256(content).hexdigest(),path=dest,error='')
  except Exception as e:error=str(e)[:350];time.sleep(attempt+1)
 return dict(family=family,year=yr,title=row['title'],kind=kind,detail_url=row['detail_url'],file_url=u,status='DOWNLOAD_FAILED',size=0,sha256='',path='',error=error)
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
 logs=list(ex.map(retrieve,all_candidates))
fields=['family','year','title','kind','detail_url','file_url','status','size','sha256','path','error']
with open(ROOT+'/DOWNLOAD_MANIFEST.csv','w',newline='',encoding='utf-8') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(logs)
detailfields=list(detail_manifest[0].keys())
with open(ROOT+'/DETAIL_MANIFEST.csv','w',newline='',encoding='utf-8') as f:
 w=csv.DictWriter(f,fieldnames=detailfields);w.writeheader();w.writerows(detail_manifest)
counts=collections.Counter((r['family'],r['status']) for r in logs)
byyear=collections.Counter((r['year'],r['family']) for r in logs if r['status']=='VERIFIED_FILE' and r['kind']=='main')
summary={"catalogued_publications":len(catalogue),"linked_publications":sum(x['status']=='LINK_FOUND' for x in detail_manifest),"verified_files":sum(r['status']=='VERIFIED_FILE' for r in logs),"verified_main_pdfs":sum(r['status']=='VERIFIED_FILE' and r['kind']=='main' for r in logs),"failed_file_attempts":sum(r['status']!='VERIFIED_FILE' for r in logs),"no_direct_pdf":sum(x['status']!='LINK_FOUND' for x in detail_manifest),"by_family_status":{str(k):v for k,v in counts.items()},"main_pdf_by_year_family":{str(k):v for k,v in sorted(byyear.items())}}
json.dump(summary,open(ROOT+'/COMPLETENESS_REPORT.json','w'),indent=2)
print(json.dumps(summary,indent=2),flush=True)
assert summary['verified_main_pdfs']>=10,'insufficient verified PDFs'
