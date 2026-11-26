"""Edición de un .xlsx a nivel XML, conservando todo lo que openpyxl pierde
(logo del encabezado vía legacyDrawingHF, printerSettings, estilos tal cual).

Uso: x = Libro(ruta); h = x.hoja(); h.set('A1', 'texto'); h.borrar_filas(25, 79); x.guardar(salida)
"""
import re, zipfile, datetime
from copy import deepcopy
from lxml import etree

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
N = {'m': NS, 'xdr': XDR}
q = lambda t: '{%s}%s' % (NS, t)


def col_num(c):
    n = 0
    for ch in c:
        n = n * 26 + ord(ch) - 64
    return n


def col_let(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def split(ref):
    m = re.match(r'^\$?([A-Z]+)\$?(\d+)$', ref)
    return m.group(1), int(m.group(2))


def excel_serial(d):
    if isinstance(d, str):
        d = datetime.date.fromisoformat(d)
    return (d - datetime.date(1899, 12, 30)).days


class Libro:
    def __init__(self, ruta):
        z = zipfile.ZipFile(ruta)
        self.orden = [i for i in z.infolist()]
        self.partes = {i.filename: z.read(i.filename) for i in self.orden}
        self.xml = {}
        self.estilos = self._x('xl/styles.xml')

    def _x(self, p):
        if p not in self.xml:
            self.xml[p] = etree.fromstring(self.partes[p])
        return self.xml[p]

    def hoja(self, p='xl/worksheets/sheet1.xml'):
        dib = None
        rels = 'xl/worksheets/_rels/' + p.split('/')[-1] + '.rels'
        if rels in self.partes:
            for m in re.finditer(rb'Type="[^"]*/drawing" Target="\.\./drawings/([^"]+)"', self.partes[rels]):
                dib = self._x('xl/drawings/' + m.group(1).decode())
        return Hoja(self, self._x(p), dib)

    # estilo: clona el xf `s` con un relleno sólido nuevo
    def con_relleno(self, s, rgb):
        st = self.estilos
        fills = st.find(q('fills'))
        f = etree.SubElement(fills, q('fill'))
        pf = etree.SubElement(f, q('patternFill'), patternType='solid')
        etree.SubElement(pf, q('fgColor'), rgb='FF' + rgb)
        etree.SubElement(pf, q('bgColor'), indexed='64')
        fills.set('count', str(len(fills)))
        xfs = st.find(q('cellXfs'))
        nx = deepcopy(xfs[int(s)])
        nx.set('fillId', str(len(fills) - 1)); nx.set('applyFill', '1')
        xfs.append(nx); xfs.set('count', str(len(xfs)))
        return str(len(xfs) - 1)

    def guardar(self, salida):
        for p, x in self.xml.items():
            self.partes[p] = etree.tostring(x, xml_declaration=True, encoding='UTF-8', standalone=True)
        with zipfile.ZipFile(salida, 'w', zipfile.ZIP_DEFLATED) as z:
            for i in self.orden:
                z.writestr(i, self.partes[i.filename])


class Hoja:
    def __init__(self, libro, x, dib):
        self.L, self.x, self.dib = libro, x, dib
        self.sd = x.find(q('sheetData'))

    def fila(self, r, crear=True):
        for e in self.sd:
            n = int(e.get('r'))
            if n == r:
                return e
            if n > r:
                if not crear:
                    return None
                nuevo = etree.Element(q('row'), r=str(r)); e.addprevious(nuevo); return nuevo
        if not crear:
            return None
        return etree.SubElement(self.sd, q('row'), r=str(r))

    def celda(self, ref, crear=True):
        c, r = split(ref)
        f = self.fila(r, crear)
        if f is None:
            return None
        for e in f:
            cc = split(e.get('r'))[0]
            if cc == c:
                return e
            if col_num(cc) > col_num(c):
                if not crear:
                    return None
                n = etree.Element(q('c'), r=ref); e.addprevious(n); return n
        if not crear:
            return None
        return etree.SubElement(f, q('c'), r=ref)

    def estilo(self, ref):
        c = self.celda(ref, False)
        return c.get('s', '0') if c is not None else '0'

    def set(self, ref, v, s=None):
        c = self.celda(ref)
        for ch in list(c):
            c.remove(ch)
        for a in ('t',):
            if a in c.attrib:
                del c.attrib[a]
        if s is not None:
            c.set('s', str(s))
        if v is None or v == '':
            return
        if isinstance(v, (datetime.date,)):
            v = excel_serial(v)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            etree.SubElement(c, q('v')).text = repr(v) if isinstance(v, float) else str(v)
        else:
            c.set('t', 'inlineStr')
            is_ = etree.SubElement(c, q('is'))
            t = etree.SubElement(is_, q('t')); t.text = str(v)
            if t.text != t.text.strip() or '\n' in t.text:
                t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

    def alto(self, r, h):
        f = self.fila(r)
        f.set('ht', str(h)); f.set('customHeight', '1')

    # ---------------------------------------------------------- filas
    def borrar_filas(self, ini, n):
        """Borra las filas ini..ini+n-1 y sube todo lo de abajo (celdas, combinadas, formatos, dibujo)."""
        fin = ini + n - 1
        for e in list(self.sd):
            r = int(e.get('r'))
            if ini <= r <= fin:
                self.sd.remove(e)
            elif r > fin:
                self._mover_fila(e, r - n)
        self._ajustar_rangos(lambda r: None if ini <= r <= fin else (r - n if r > fin else r))
        if self.dib is not None:
            for a in self.dib.iter('{%s}from' % XDR, '{%s}to' % XDR):
                rr = a.find('xdr:row', N); r = int(rr.text) + 1
                if r > fin:
                    rr.text = str(r - n - 1)
                elif r >= ini:
                    rr.text = str(ini - 1); a.find('xdr:rowOff', N).text = '0'

    def insertar_filas(self, ini, n, modelo):
        """Inserta n filas en ini copiando el formato de la fila `modelo` (antes del desplazamiento)."""
        m = self.fila(modelo, False)
        for e in reversed(list(self.sd)):
            r = int(e.get('r'))
            if r >= ini:
                self._mover_fila(e, r + n)
        self._ajustar_rangos(lambda r: r + n if r >= ini else r)
        if self.dib is not None:
            for a in self.dib.iter('{%s}from' % XDR, '{%s}to' % XDR):
                rr = a.find('xdr:row', N)
                if int(rr.text) + 1 >= ini:
                    rr.text = str(int(rr.text) + n)
        for k in range(n):
            nueva = deepcopy(m)
            self._mover_fila(nueva, ini + k)
            for c in nueva:
                for ch in list(c):
                    c.remove(ch)
                c.attrib.pop('t', None)
            sig = [e for e in self.sd if int(e.get('r')) > ini + k]
            if sig:
                sig[0].addprevious(nueva)
            else:
                self.sd.append(nueva)

    def _mover_fila(self, e, nr):
        e.set('r', str(nr))
        for c in e:
            col = split(c.get('r'))[0]
            c.set('r', f'{col}{nr}')

    def _ajustar_rangos(self, f):
        def rango(ref):
            if ':' in ref:
                a, b = ref.split(':'); (ca, ra), (cb, rb) = split(a), split(b)
                # recorta: busca la primera/última fila que sobrevive
                rs = [f(r) for r in range(ra, rb + 1)]
                rs = [r for r in rs if r is not None]
                if not rs:
                    return None
                return f'{ca}{min(rs)}:{cb}{max(rs)}'
            c, r = split(ref); r2 = f(r)
            return None if r2 is None else f'{c}{r2}'
        mc = self.x.find(q('mergeCells'))
        if mc is not None:
            for m in list(mc):
                n = rango(m.get('ref'))
                if n is None or (':' in n and n.split(':')[0] == n.split(':')[1]):
                    mc.remove(m)
                else:
                    m.set('ref', n)
            mc.set('count', str(len(mc)))
            if not len(mc):
                self.x.remove(mc)
        for tag in ('conditionalFormatting', 'dataValidations/{%s}dataValidation' % NS):
            for e in self.x.findall(q(tag) if '/' not in tag else q('dataValidations') + '/' + tag.split('/', 1)[1]):
                partes = [rango(p) for p in e.get('sqref').split()]
                partes = [p for p in partes if p]
                if partes:
                    e.set('sqref', ' '.join(partes))
                else:
                    e.getparent().remove(e)

    def ajustar_dimension(self, ultima_col='F'):
        filas = [int(e.get('r')) for e in self.sd]
        d = self.x.find(q('dimension'))
        if d is not None and filas:
            d.set('ref', f'A1:{ultima_col}{max(filas)}')


def ajustar_a_ancho(h):
    """Imprime en 1 página de ancho (alto libre)."""
    x = h.x
    sp = x.find(q('sheetPr'))
    if sp is None:
        sp = etree.Element(q('sheetPr')); x.insert(0, sp)
    pp = sp.find(q('pageSetUpPr'))
    if pp is None:
        pp = etree.Element(q('pageSetUpPr'))
        # pageSetUpPr va después de tabColor/outlinePr
        sp.append(pp)
    pp.set('fitToPage', '1')
    ps = x.find(q('pageSetup'))
    ps.set('fitToWidth', '1'); ps.set('fitToHeight', '0')
    ps.attrib.pop('scale', None)


def area_impresion(libro, h, ultima_col):
    """Ajusta el área de impresión (si existe) a la última fila usada."""
    wb = libro._x('xl/workbook.xml')
    filas = [int(e.get('r')) for e in h.sd]
    for d in wb.iter(q('definedName')):
        if d.get('name') == '_xlnm.Print_Area':
            hoja = d.text.split('!')[0]
            d.text = f'{hoja}!$A$1:${ultima_col}${max(filas)}'


def anchos(h, cols):
    """cols: {'C': 20, ...} fija el ancho de esas columnas."""
    cs = h.x.find(q('cols'))
    for k, w in cols.items():
        n = col_num(k)
        e = next((c for c in cs if int(c.get('min')) == n == int(c.get('max'))), None)
        if e is None:
            e = etree.Element(q('col'), min=str(n), max=str(n))
            sig = [c for c in cs if int(c.get('min')) > n]
            (sig[0].addprevious(e) if sig else cs.append(e))
        e.set('width', str(w)); e.set('customWidth', '1')
