import requests,bs4,json,re,urllib.parse,os,time,sys
roots={
"Trends_in_Lending":"https://www.mnb.hu/en/financial-stability/publications/trends-in-lending",
"Financial_Stability":"https://www.mnb.hu/en/publications/reports/financial-stability-report",
"Financial_Stability_Archive_2013":"https://www.mnb.hu/en/publications/reports/financial-stability-report/report-on-financial-stability-from-2000-to-november-2013-1",
"Inflation_Report":"https://www.mnb.hu/en/publications/reports/inflation-report",
"Lending_Survey":"https://www.mnb.hu/en/financial-stability/publications/lending-survey"
}
os.makedirs("mnb_discovery",exist_ok=True)
rows=[]
for fam,root in roots.items():
 for page in range(1,27):
  url=root+ (("?page="+str(page)) if page>1 else "")
  try:
   r=requests.get(url,timeout=32,headers={"User-Agent":"Mozilla/5.0 (compatible; ResearchSourceDownloader/1.0)"})
   soup=bs4.BeautifulSoup(r.text,"html.parser")
   links=[]
   for a in soup.find_all("a",href=True):
    title=a.get_text(" ",strip=True); h=urllib.parse.urljoin(r.url,a["href"])
    if any(x in title.lower() for x in ["trends in lending,","financial stability report (","report on financial stability (","inflation report (","senior loan officer survey","senior loan officer opinion survey"]):
     year=next((int(y) for y in re.findall(r"\b20[012]\d\b",title) if 2011<=int(y)<=2026),None)
     if year and ("mnb.hu" in urllib.parse.urlparse(h).netloc):
      links.append(dict(family=fam,year=year,title=title,detail_url=h,index_url=url))
   raw=len(r.content)
   print(f"INDEX {fam} page={page} http={r.status_code} bytes={raw} found={len(links)} titles={[x['title'] for x in links[:3]]}")
   if page==1:
    with open("mnb_discovery/"+fam+".html","w") as f:f.write(r.text)
    with open("mnb_discovery/"+fam+"_anchors_first.txt","w") as f:
     f.write("\n".join(a.get_text(" ",strip=True)+" | "+urllib.parse.urljoin(r.url,a["href"]) for a in soup.find_all("a",href=True) if any(p in a.get_text(" ",strip=True).lower() for p in ["previous","next","2","trends in lending","inflation report","financial stability report","senior loan"])))
   if r.status_code!=200:break
   if page>1 and not links:break
   rows.extend(links)
   if fam in ["Financial_Stability_Archive_2013","Lending_Survey"]: break
  except Exception as e:
   print("ERROR",fam,page,str(e));break
uniq={}
for x in rows:
 k=(x["family"],x["detail_url"])
 uniq[k]=x
allrows=list(uniq.values())
json.dump({"families":roots,"pages":allrows},open("mnb_discovery/PUBLICATION_INVENTORY.json","w"),ensure_ascii=False,indent=2)
from collections import Counter
print("TOTAL UNIQUE",len(allrows),Counter(x["family"] for x in allrows),Counter(x["year"] for x in allrows))
