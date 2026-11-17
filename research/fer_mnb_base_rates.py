import requests,bs4,re,csv,os,json,hashlib,datetime
from urllib.parse import urlencode
start="01/01/2011"
end="18/11/2026"
url="https://www.mnb.hu/en/jegybanki_alapkamat_alakulasa?"+urlencode({"datefrom":start,"datetill":end,"order":"0"})
r=requests.get(url,headers={"User-Agent":"Mozilla/5.0"},timeout=60);r.raise_for_status()
os.makedirs("mnb_monetary_rates",exist_ok=True)
open("mnb_monetary_rates/SOURCE_HTML.html","wb").write(r.content)
soup=bs4.BeautifulSoup(r.text,"html.parser")
rows=[]
for tr in soup.select("tr"):
 s=[x.get_text(" ",strip=True) for x in tr.select("td")]
 if len(s)<2:continue
 date=s[0];v=s[1]
 if not re.search(r"20[12]\d",date) or not re.search(r"\d+(\.\d+)?\s*%",v):continue
 try:
  d=datetime.datetime.strptime(date,"%d %B %Y").date()
  val=float(re.search(r"\d+(?:\.\d+)?",v).group())
  if d.year>=2011 and d.year<=2026:
   rows.append(dict(effective_date=d.isoformat(),rate_percent=val,publication="MNB Central Bank Base Rate History",source_url=url,raw_date=date,raw_rate=v))
 except ValueError as e:print('PARSE WARNING',date,str(e)[:100])
rows=list({x['effective_date']:x for x in rows}.values())
rows.sort(key=lambda x:x["effective_date"])
with open("mnb_monetary_rates/MNB_Base_Rate_Decisions_2011_2026.csv","w",newline="") as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
metadata={"source_url":url,"source_sha256":hashlib.sha256(r.content).hexdigest(),"count":len(rows),"first":rows[0],"last":rows[-1],"years":sorted(set(int(x['effective_date'][:4]) for x in rows)),"retrieved_utc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
json.dump(metadata,open("mnb_monetary_rates/SOURCE_MANIFEST.json","w"),indent=2)
print(json.dumps(metadata,indent=2))
assert len(rows)>40,"unexpectedly few MNB policy rate decisions"
