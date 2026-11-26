"""QC-020B Equivalency Table, Sharklet SRM 57-31-23: one section (page) per alternative tool of the QC-020A.
Edits the template XML (keeps logo, header, footer). Each section restarts page numbering and the header
uses SECTIONPAGES, so every table reads "PAGE 1 OF 1".
Uso: python3 qc020b_sharklet.py <scratchpad>"""
import sys, os, re, zipfile
from copy import deepcopy
from lxml import etree
sys.path.insert(0, os.path.dirname(__file__))
from datos_qc020b_sharklet import EQ, CMM, OEM_PN

S = sys.argv[1]
SRC = S + '/in4/qc020b.docx'
OUT = S + '/out/03._Evidence_II_-_QC-020B_Equivalency_Sharklet_SRM_57-31-23_BORRADOR.docx'
FECHA = 'Nov 26, 2026'
FIRMA = ('MATIAS MEZA HERNANDEZ', 'Quality and Capabilities Engineer')
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
w = lambda t: '{%s}%s' % (W, t)

z = zipfile.ZipFile(SRC)
partes = {i.filename: z.read(i.filename) for i in z.infolist()}
doc = etree.fromstring(partes['word/document.xml'])
body = doc.find(w('body'))
kids = list(body)
tbl1, sp1, tbl2, sp2, sp3, tbl3, plast, sect = kids
assert [k.tag for k in (tbl1, tbl2, tbl3, sect)] == [w('tbl'), w('tbl'), w('tbl'), w('sectPr')]


def limpiar_ids(e):
    for x in e.iter():
        for a in ('{%s}paraId' % W14, '{%s}textId' % W14):
            x.attrib.pop(a, None)
    return e


def poner(p, texto, sz=None):
    """Replace the runs of paragraph p with `texto` (lines split by \\n), keeping the paragraph rPr."""
    for r in p.findall(w('r')):
        p.remove(r)
    rpr = p.find(w('pPr') + '/' + w('rPr'))
    for i, linea in enumerate(texto.split('\n')):
        r = etree.SubElement(p, w('r'))
        if rpr is not None:
            r.append(deepcopy(rpr))
        if sz:
            rp = r.find(w('rPr'))
            if rp is None:
                rp = etree.SubElement(r, w('rPr'))
            for tag in ('sz', 'szCs'):
                e = rp.find(w(tag))
                if e is None:
                    e = etree.SubElement(rp, w(tag))
                e.set(w('val'), str(sz))
        if i:
            etree.SubElement(r, w('br'))
        t = etree.SubElement(r, w('t')); t.text = linea
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def celda_p(tr, i):
    return tr.findall(w('tc'))[i].find(w('p'))


def seccion(eq, ultima):
    out = []
    t1 = limpiar_ids(deepcopy(tbl1))
    for tr, v in zip(t1.findall(w('tr')), (CMM, OEM_PN, eq['desc'], eq['alt'])):
        poner(celda_p(tr, 2), v, 18)
    out += [t1, limpiar_ids(deepcopy(sp1))]
    t2 = limpiar_ids(deepcopy(tbl2))
    filas = t2.findall(w('tr'))
    modelo = filas[1]
    for f in filas[1:]:
        t2.remove(f)
    for n, (req, oem, alt) in enumerate(eq['req'], 1):
        f = deepcopy(modelo)
        f.find(w('trPr')).find(w('trHeight')).set(w('val'), '400')
        for i, v in enumerate((f'{n}.', req, oem, alt)):
            poner(celda_p(f, i), v, None if i == 0 else 18)
        t2.append(f)
    out += [t2, limpiar_ids(deepcopy(sp2))]
    t3 = limpiar_ids(deepcopy(tbl3))
    ps = t3.findall(w('tr'))[2].findall(w('tc'))[0].findall(w('p'))
    poner(ps[0], FIRMA[0]); poner(ps[1], FIRMA[1])
    out.append(t3)
    fin = limpiar_ids(deepcopy(plast))
    if not ultima:   # section break: same page setup, numbering restarts at 1
        ppr = fin.find(w('pPr'))
        if ppr is None:
            ppr = etree.Element(w('pPr')); fin.insert(0, ppr)
        ppr.append(deepcopy(sect))
    out.append(fin)
    return out


# All pages of each section use the "first page" header/footer (form header + Form QC-020B footer)
for s_ in [sect]:
    for h in s_.findall(w('headerReference')):
        if h.get(w('type')) == 'default':
            h.set('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id',
                  sect.find(w('headerReference') + f"[@{{{W}}}type='first']").get(
                      '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
    fr = s_.find(w('footerReference'))
    fd = deepcopy(fr); fd.set(w('type'), 'default'); fr.addprevious(fd)

for k in kids:
    body.remove(k)
for i, eq in enumerate(EQ):
    for e in seccion(eq, i == len(EQ) - 1):
        body.append(e)
body.append(sect)
partes['word/document.xml'] = etree.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)

# Header of the form (first-page header): date + PAGE x OF y within the section
rels = partes['word/_rels/document.xml.rels'].decode()
rid = sect.find(w('headerReference')).get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
hdr = 'word/' + re.search(r'Id="%s"[^>]*Target="([^"]+)"' % rid, rels).group(1) if re.search(r'Id="%s"[^>]*Target' % rid, rels) else \
    'word/' + re.search(r'Target="([^"]+)"[^>]*Id="%s"' % rid, rels).group(1)
h = partes[hdr].decode()
# total pages = 1 per table (each section is designed to fit one page): the NUMPAGES field becomes a fixed "1",
# because NUMPAGES counts the whole file and SECTIONPAGES is not rendered by every viewer
hx = etree.fromstring(h.encode())
ins = [t for t in hx.iter(w('instrText')) if 'NUMPAGES' in (t.text or '')][0]
r = ins.getparent(); par = r.getparent(); runs = list(par)
k = runs.index(r)
ini = max(j for j in range(k) if runs[j].find(w('fldChar')) is not None and runs[j].find(w('fldChar')).get(w('fldCharType')) == 'begin')
fin = min(j for j in range(k, len(runs)) if runs[j].find(w('fldChar')) is not None and runs[j].find(w('fldChar')).get(w('fldCharType')) == 'end')
nuevo = deepcopy(runs[ini])
for e in list(nuevo):
    if e.tag != w('rPr'): nuevo.remove(e)
etree.SubElement(nuevo, w('t')).text = '1'
runs[ini].addprevious(nuevo)
for j in range(ini, fin + 1):
    par.remove(runs[j])
h = etree.tostring(hx, xml_declaration=True, encoding='UTF-8', standalone=True).decode()
h = h.replace('<w:t xml:space="preserve">Date: </w:t>', f'<w:t xml:space="preserve">Date: {FECHA}</w:t>', 1)
partes[hdr] = h.encode()

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zo:
    for i in z.infolist():
        if not i.filename.endswith('/'):
            zo.writestr(i, partes[i.filename])
print(OUT, len(EQ), 'tablas;', 'encabezado:', hdr)
