# Builds the .docx fixtures for tests/file_check (run once; the fixtures are committed).
# Needs pandoc, python-docx and node with the docx package. Every name and organisation here is fictional.
# The "clean" fixture imitates a file saved in Word: its properties are written by this script for the test
# only. Quartile itself never writes file properties.
import os, re, shutil, subprocess, zipfile, tempfile
from docx import Document
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
os.makedirs(D, exist_ok=True)
para = ("Small service firms replace expensive equipment late when bank credit is scarce. "
        "We link survey answers to filed accounts and compare firms that leased with firms that bought. ")
body = [para * 6 for _ in range(14)]
refs = ["Myers, S. C., & Majluf, N. S. (1984). Corporate financing and investment decisions. Journal of Financial Economics, 13(2), 187-221.",
        "Example, A. (2025). A fictional study of leasing. Journal of Examples, 1(1), 1-10."]

# 1. pandoc with its default reference.docx
md = os.path.join(tempfile.mkdtemp(), "p.md")
open(md, "w").write("# Leasing and replacement\n\n" + "\n\n".join(body) + "\n\n# References\n\n" + "\n\n".join(refs) + "\n")
subprocess.run(["pandoc", md, "-o", os.path.join(D, "pandoc.docx")], check=True)

# 2. python-docx default template (created 2013-12-23T23:15:00Z, TotalTime 0, Words 0)
def pydoc(path, footer=None):
    d = Document(); d.add_heading("Leasing and replacement", 1)
    for b in body: d.add_paragraph(b)
    d.add_heading("References", 1)
    for r in refs: d.add_paragraph(r)
    if footer: d.sections[0].footer.paragraphs[0].text = footer
    d.save(path)
pydoc(os.path.join(D, "python-docx.docx"))

# 3. docx-js default (creator "Un-named", empty app.xml)
js = """import { Document, Packer, Paragraph } from "docx"; import fs from "fs";
const t = JSON.parse(process.argv[1]);
fs.writeFileSync(process.argv[2], await Packer.toBuffer(new Document({ sections: [{ children: t.map(x => new Paragraph(x)) }] })));"""
subprocess.run(["node", "--input-type=module", "-e", js, __import__("json").dumps(["Leasing and replacement", *body, "References", *refs]), os.path.join(D, "docx-js.docx")], check=True, cwd=os.path.join(D, "..", "..", ".."))

# 4. a clean file with properties as Word writes them after real editing
def set_props(src, dst, creator, created, modified, total_time, words, footer=None):
    zin = zipfile.ZipFile(src); tmp = dst + ".tmp"; zout = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        data = zin.read(it.filename)
        if it.filename == "docProps/core.xml":
            data = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
                    f'<dc:title></dc:title><dc:creator>{creator}</dc:creator><cp:lastModifiedBy>{creator}</cp:lastModifiedBy><cp:revision>37</cp:revision>'
                    f'<dcterms:created xsi:type="dcterms:W3CDTF">{created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{modified}</dcterms:modified></cp:coreProperties>').encode()
        if it.filename == "docProps/app.xml":
            data = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
                    f'<Template>Normal.dotm</Template><TotalTime>{total_time}</TotalTime><Pages>6</Pages><Words>{words}</Words><Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><AppVersion>16.0000</AppVersion></Properties>').encode()
        zout.writestr(it, data)
    zout.close(); zin.close(); shutil.move(tmp, dst)
def real_words(path):
    x = zipfile.ZipFile(path).read("word/document.xml").decode()
    paras = ["".join(re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>", p)) for p in x.split("</w:p>")]
    return sum(len(p.split()) for p in paras if p.strip())
base = os.path.join(D, "_base.docx"); pydoc(base)
n = real_words(base)
set_props(base, os.path.join(D, "clean.docx"), "Ann Example", "2026-09-01T08:12:00Z", "2026-11-20T16:41:00Z", 940, n)
# 5. an anonymised version whose footer still names the author
anon = os.path.join(D, "_anon.docx"); pydoc(anon, footer="Ann Example, Example University")
set_props(anon, os.path.join(D, "anon-footer.docx"), "", "2026-09-01T08:12:00Z", "2026-11-20T16:41:00Z", 940, n)
# 6. the same file sent twice
shutil.copy(os.path.join(D, "clean.docx"), os.path.join(D, "clean-copy.docx"))
for f in ("_base.docx", "_anon.docx"): os.remove(os.path.join(D, f))
print("fixtures written to", D, "(real words:", n, ")")
