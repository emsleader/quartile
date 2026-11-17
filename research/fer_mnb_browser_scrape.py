import json,re,urllib.parse,time,os
from collections import Counter
from playwright.sync_api import sync_playwright
roots={
"Trends_in_Lending":"https://www.mnb.hu/en/financial-stability/publications/trends-in-lending",
"Financial_Stability":"https://www.mnb.hu/en/publications/reports/financial-stability-report",
"Inflation_Report":"https://www.mnb.hu/en/publications/reports/inflation-report"
}
os.makedirs("mnb_discovery",exist_ok=True)
allrows=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
 page=browser.new_page(viewport={"width":1365,"height":900},locale="en-US")
 for family,root in roots.items():
  try:
   page.goto(root,wait_until="domcontentloaded",timeout=75000); page.wait_for_timeout(1700)
   print("FAMILY",family,page.title(),flush=True)
   for page_number in range(1,31):
    rawlinks=page.locator("a.cb-file").evaluate_all("(els)=>els.map(a=>({title:(a.innerText||'').trim(),url:a.href}))")
    parsed=[]
    for a in rawlinks:
     title=a["title"]; href=a["url"]
     if not any(x in title.lower() for x in ["trends in lending,","financial stability report (","report on financial stability (","inflation report ("]):continue
     yrs=[int(x) for x in re.findall(r"20[012]\d",title)]
     year=next((y for y in yrs if 2011<=y<=2026),None)
     if year:parsed.append(dict(family=family,year=year,title=title,detail_url=href,index_page=page_number,index_url=root))
    print("PAGE",family,page_number,len(parsed),"TOP",parsed[0]["title"] if parsed else "",flush=True)
    allrows.extend(parsed)
    nxt=page_number+1
    target=page.locator(f"ul.pagination a._page[data-page='{nxt}']")
    if target.count()==0:
     print("STOP NO NEXT",family,nxt,flush=True);break
    first_before=rawlinks[0]['title'] if rawlinks else ""
    try:
     target.first.click(timeout=12500); page.wait_for_timeout(1600)
     after=page.locator("a.cb-file").first.inner_text(timeout=8000)
     if after==first_before:
      print("STOP DID NOT CHANGE",family,page_number,flush=True);break
    except Exception as e:
     print("PAGER ERROR",family,page_number,str(e)[:270],flush=True);break
  except Exception as e: print("FAMILY ERROR",family,str(e)[:450],flush=True)
 browser.close()
# Static archives, no pagination needed
import requests,bs4
for family,root in {
"Financial_Stability_Archive_2013":"https://www.mnb.hu/en/publications/reports/financial-stability-report/report-on-financial-stability-from-2000-to-november-2013-1",
"Lending_Survey":"https://www.mnb.hu/en/financial-stability/publications/lending-survey"
}.items():
 try:
  r=requests.get(root,timeout=60);soup=bs4.BeautifulSoup(r.text,"html.parser")
  for a in soup.select("a[href]"):
   title=a.get_text(" ",strip=True); url=urllib.parse.urljoin(root,a["href"])
   if not any(x in title.lower() for x in ["report on financial stability (","senior loan officer survey","senior loan officer opinion survey"]):continue
   yrs=[int(x) for x in re.findall(r"20[012]\d",title)]
   year=next((y for y in yrs if 2011<=y<=2026),None)
   if year:allrows.append(dict(family=family,year=year,title=title,detail_url=url,index_page=1,index_url=root))
 except Exception as e: print("STATIC ERROR",family,str(e),flush=True)
unique={}
for r in allrows:unique[(r["family"],r["detail_url"])]=r
rows=sorted(unique.values(),key=lambda r:(r["year"],r["family"],r["title"]))
json.dump({"items":rows,"sites":roots,"total_unique":len(rows)},open("mnb_discovery/FULL_MNB_CATALOGUE.json","w"),indent=2,ensure_ascii=False)
import csv
with open("mnb_discovery/FULL_MNB_CATALOGUE.csv","w",newline="",encoding="utf-8") as f:
 w=csv.DictWriter(f,fieldnames=['family','year','title','detail_url','index_page','index_url']);w.writeheader();w.writerows(rows)
print("COMPLETE FOUND",len(rows),"FAMILIES",dict(Counter(x["family"] for x in rows)),"YEARS",dict(sorted(Counter(x["year"] for x in rows).items())),flush=True)
