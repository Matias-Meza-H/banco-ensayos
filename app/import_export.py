#!/usr/bin/env python3
"""Importación / exportación / verificación de la Plataforma de Calidad APAS Chile.

Uso:
  python3 import_export.py importar  <Exportacion_...zip | carpeta>  [--reemplazar]
  python3 import_export.py verificar <Exportacion_...zip | carpeta>
  python3 import_export.py exportar  [salida.zip] [--actor nombre]

`importar` es idempotente: con la misma exportación deja la base exactamente igual. Si la base ya tiene
datos, se niega a reemplazarlos salvo con --reemplazar (y antes copia la base a data/antes_de_importar_<fecha>.db).
Al terminar imprime el reporte de verificación completo (conteos, CRC32, integridad referencial, textos
literales DGAC, cálculos y la ida y vuelta).
"""
import argparse
import datetime
import io
import json
import os
import shutil
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import calc  # noqa: E402
from store import COLLECTIONS, Store, crc32_hex, dumps, now  # noqa: E402

APP_VER = '02.00.00'
EXPORT_ORDER = ['_meta', 'proyectos', 'evidencias', 'revisiones', 'lecturas', 'entrenamiento', 'articulos_presentacion', 'snapshots_informes',
                'config', 'circulares', 'registro', 'certificados_personal', 'personal_ediciones', 'personal_base', 'personal_vista_actual',
                'catalogo', 'semilla_proyectos', 'autoridades', 'qc021_preguntas', 'versiones', 'archivos']
CONTEO_COL = {'proj': 'proyectos', 'evid': 'evidencias', 'rev': 'revisiones', 'art': 'articulos_presentacion', 'snap': 'snapshots_informes',
              'train': 'entrenamiento', 'cfg': 'config', 'circ': 'circulares', 'lect': 'lecturas', 'log': 'registro'}


# ============================================================ lectura de la exportación
class Fuente:
    """Lee una exportación desde el .zip o desde una carpeta ya descomprimida."""

    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path) if os.path.isfile(path) else None

    def read(self, name):
        if self.zip:
            return self.zip.read(name)
        with open(os.path.join(self.path, name), 'rb') as f:
            return f.read()

    def names(self):
        if self.zip:
            return [n for n in self.zip.namelist() if not n.endswith('/')]
        out = []
        for d, _, fs in os.walk(self.path):
            out += [os.path.relpath(os.path.join(d, f), self.path).replace(os.sep, '/') for f in fs]
        return out


class Reporte:
    def __init__(self):
        self.lineas, self.errores, self.avisos = [], 0, 0

    def ok(self, t):
        self.lineas.append('  ✔ ' + t)

    def err(self, t):
        self.errores += 1; self.lineas.append('  ✘ ' + t)

    def aviso(self, t):
        self.avisos += 1; self.lineas.append('  ⚠ ' + t)

    def titulo(self, t):
        self.lineas.append('\n' + t)

    def imprimir(self):
        print('\n'.join(self.lineas))
        print(f'\nResultado: {self.errores} error(es), {self.avisos} aviso(s).')


# ============================================================ importar
def importar(st, fuente, reemplazar=False, actor='import_export.py'):
    rep = Reporte()
    man = json.loads(fuente.read('manifiesto.json'))
    raw = fuente.read('datos_completos.json')
    rep.titulo('1. Archivo de datos')
    if len(raw) != man['json_bytes'] or crc32_hex(raw) != man['json_crc32']:
        rep.err(f'datos_completos.json no coincide con el manifiesto (bytes {len(raw)}/{man["json_bytes"]}, CRC32 {crc32_hex(raw)}/{man["json_crc32"]}). Importación detenida.')
        return rep
    rep.ok(f'datos_completos.json: {len(raw)} bytes, CRC32 {crc32_hex(raw)} = manifiesto')
    D = json.loads(raw)

    # archivos: verificar ANTES de tocar la base
    rep.titulo('2. Archivos adjuntos (bytes y CRC32 contra el manifiesto)')
    blobs = {}
    for a in man['archivos']:
        if not a.get('archivo'):
            rep.err(f'{a["assetId"]}: el manifiesto lo marca como fallido en el origen ({a.get("error")})'); continue
        b = fuente.read(a['archivo'])
        if len(b) != a['bytes'] or crc32_hex(b) != a['crc32']:
            rep.err(f'{a["archivo"]}: bytes {len(b)}/{a["bytes"]}, CRC32 {crc32_hex(b)}/{a["crc32"]}')
        else:
            blobs[a['assetId']] = (b, a)
    if rep.errores:
        rep.err('Importación detenida: hay archivos que no cuadran con el manifiesto.')
        return rep
    rep.ok(f'{len(blobs)} de {len(man["archivos"])} archivos con bytes y CRC32 idénticos al manifiesto')

    if not st.is_empty() and not reemplazar:
        rep.err('La base ya tiene datos. Usa --reemplazar para sobrescribirla (se guarda una copia antes).')
        return rep
    if not st.is_empty():
        copia = os.path.join(st.data_dir, 'antes_de_importar_%s.db' % datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
        st.db.execute('VACUUM INTO ?', (copia,))
        rep.aviso(f'La base tenía datos: copia guardada en {copia}')

    with st.lock:
        st.db.execute('BEGIN')
        try:
            for key, col in COLLECTIONS.items():
                st.db.execute(f'DELETE FROM "{col}"')
                for n, d in enumerate(D[key]):
                    if key == 'proyectos':
                        d = {k: v for k, v in d.items() if k != '_calc'}
                    st.db.execute(f'INSERT INTO "{col}"(id,ord,data,updated_at) VALUES(?,?,?,?)', (d['id'], n, dumps(d), None))
            pb = D['personal_base']
            st.set_static('personal_base_meta', {k: v for k, v in pb.items() if k != 'personas'})
            rows = {'semilla_proyectos': D['semilla_proyectos'], 'catalogo_entries': D['catalogo']['entries'],
                    'catalogo_articles': D['catalogo']['articles'], 'personal_personas': pb['personas']}
            for t, lst in rows.items():
                st.db.execute(f'DELETE FROM "{t}"')
                st.db.executemany(f'INSERT INTO "{t}"(ord,data) VALUES(?,?)', [(n, dumps(x)) for n, x in enumerate(lst)])
            st.set_static('catalogo_listas_faa', D['catalogo']['listas_faa'])
            st.set_static('catalogo_lista_dgac', D['catalogo']['lista_dgac'])
            for k in ('autoridades', 'qc021_preguntas', 'versiones'):
                st.set_static(k, D[k])
            st.db.execute('DELETE FROM assets')
            for n, a in enumerate(man['archivos']):
                if a['assetId'] not in blobs:
                    continue
                b, _ = blobs[a['assetId']]
                p = st.blob_path(a['assetId'])
                if not (os.path.exists(p) and os.path.getsize(p) == len(b) and crc32_hex(open(p, 'rb').read()) == a['crc32']):
                    with open(p + '.tmp', 'wb') as f:
                        f.write(b)
                    os.replace(p + '.tmp', p)
                st.db.execute('INSERT INTO assets(id,filename,content_type,bytes,crc32,created_at,origen,ord) VALUES(?,?,?,?,?,?,?,?)',
                              (a['assetId'], a['nombres'][0], a.get('tipo') or '', a['bytes'], a['crc32'], None, json.dumps(a['referenciadoPor'], ensure_ascii=False), n))
            st.meta_set('importacion', {'fuente': os.path.basename(fuente.path), 'generado': D['_meta'].get('generado'), 'version_origen': D['_meta'].get('version'),
                                        'importado': now(), 'json_crc32': man['json_crc32'], 'conteos': man['conteos']})
            st.meta_set('export_meta_origen', D['_meta'])
            for c in list(COLLECTIONS.values()):
                st._bump(c)
            st.db.execute('COMMIT')
        except Exception:
            st.db.execute('ROLLBACK')
            raise
    st.notify()
    rep.titulo('3. Importación')
    rep.ok('Colecciones, catálogo, personal, semillas, autoridades, preguntas QC-021, versiones y archivos cargados en ' + st.path)
    verificar(st, fuente, rep)
    return rep


# ============================================================ exportar (mismo formato que Sistema › Exportar todo)
def safe_name(s):
    import re
    return re.sub(r'[\\/:*?"<>|]+', '_', str(s))[:120]


def construir_export(st, actor='local', hoy=None):
    proj = st.list_docs('proj')
    snaps = st.list_docs('snap')
    proyectos = []
    for raw in proj:
        try:
            c = calc.calc(raw, snaps, hoy)
        except Exception:
            c = {'avance': None, 'etapa': None, 'semaforo': None}
        d = dict(raw); d['_calc'] = c
        proyectos.append(d)
    coll = {c: st.list_docs(c) for c in COLLECTIONS.values()}
    pb_meta = st.static('personal_base_meta', {})
    personas = st.rows('personal_personas')
    personal_base = dict(pb_meta); personal_base['personas'] = personas
    vista = calc.personal_vista(personas, coll['pers'])
    # índice de archivos en el mismo orden que export.js
    refs = {}

    def add(i, origen, nombre):
        if not i:
            return
        r = refs.setdefault(i, {'nombres': [], 'origen': []})
        if (nombre or i) not in r['nombres']:
            r['nombres'].append(nombre or i)
        if origen not in r['origen']:
            r['origen'].append(origen)
    for e in coll['evid']: add(e.get('assetId'), 'evid/' + e['id'], e.get('filename'))
    for c in coll['certs']: add(c.get('assetId'), 'certs/' + c['id'], c.get('filename'))
    for c in coll['circ']: add(c.get('assetId'), 'circ/' + c['id'], c.get('filename'))
    for p in coll['proj']:
        for f in p.get('fotos') or []: add(f, 'proj/' + p['id'] + '/fotos', 'foto')
    for a in coll['art']:
        for f in a.get('fotos') or []: add(f, 'art/' + a['id'] + '/fotos', 'foto')
    for a in st.assets():
        if a['id'] not in refs: add(a['id'], 'sin_referencia', a['filename'] or a['id'])
    archivos, files, fail = [], [], 0
    for aid, r in refs.items():
        nombre = r['nombres'][0]
        path = f'archivos/{aid}_{safe_name(nombre)}'
        a = st.asset(aid)
        try:
            b = open(st.blob_path(aid), 'rb').read()
            files.append((path, b))
            archivos.append({'assetId': aid, 'archivo': path, 'bytes': len(b), 'crc32': crc32_hex(b), 'tipo': (a or {}).get('content_type') or '',
                             'nombres': r['nombres'], 'referenciadoPor': r['origen']})
        except Exception as ex:
            fail += 1
            archivos.append({'assetId': aid, 'archivo': None, 'error': str(ex), 'nombres': r['nombres'], 'referenciadoPor': r['origen']})
    conteos = {c: len(coll[c]) for c in ['proj', 'evid', 'rev', 'art', 'snap', 'train', 'cfg', 'circ', 'lect', 'log']}
    conteos.update({'certs': len(coll['certs']), 'pers_editadas': len(coll['pers']), 'personal_base': len(personas), 'personal_vista': len(vista),
                    'catalogo_entries': st.db.execute('SELECT COUNT(*) FROM catalogo_entries').fetchone()[0],
                    'catalogo_articles': st.db.execute('SELECT COUNT(*) FROM catalogo_articles').fetchone()[0],
                    'semilla_proyectos': st.db.execute('SELECT COUNT(*) FROM semilla_proyectos').fetchone()[0],
                    'archivos': sum(1 for a in archivos if a['archivo']), 'archivos_fallidos': fail})
    D = {
        '_meta': {'generado': now(), 'version': APP_VER, 'por': actor, 'plataforma': 'Plataforma de Calidad · APAS Chile (local)', 'artefacto': 'aplicación local (Claude Code)',
                  'nota': 'Fuente exacta para migrar. La versión local no usa cuentas. El Excel es una vista legible; ante diferencia manda este JSON.', 'conteos': conteos},
        'proyectos': proyectos, 'evidencias': coll['evid'], 'revisiones': coll['rev'], 'lecturas': coll['lect'], 'entrenamiento': coll['train'],
        'articulos_presentacion': coll['art'], 'snapshots_informes': coll['snap'], 'config': coll['cfg'], 'circulares': coll['circ'], 'registro': coll['log'],
        'certificados_personal': coll['certs'], 'personal_ediciones': coll['pers'], 'personal_base': personal_base, 'personal_vista_actual': vista,
        'catalogo': {'listas_faa': st.static('catalogo_listas_faa'), 'lista_dgac': st.static('catalogo_lista_dgac'), 'entries': st.rows('catalogo_entries'), 'articles': st.rows('catalogo_articles')},
        'semilla_proyectos': st.rows('semilla_proyectos'), 'autoridades': st.static('autoridades'), 'qc021_preguntas': st.static('qc021_preguntas'),
        'versiones': st.static('versiones'), 'archivos': archivos}
    return D, files


def json_js(D):
    """Igual a JSON.stringify(D, null, 1) de la plataforma."""
    return json.dumps(D, ensure_ascii=False, indent=1).encode('utf-8')


def exportar(st, salida, actor='local'):
    D, files = construir_export(st, actor)
    js = json_js(D)
    man = {'conteos': D['_meta']['conteos'], 'json_crc32': crc32_hex(js), 'json_bytes': len(js), 'xlsx_bytes': 0, 'archivos': D['archivos']}
    xlsx = construir_xlsx(D)
    man['xlsx_bytes'] = len(xlsx) if xlsx else 0
    leeme = (f'EXPORTACIÓN COMPLETA · Plataforma de Calidad APAS Chile (local Ver. {APP_VER})\nGenerada: {D["_meta"]["generado"]} por {actor}\n\n'
             '- datos_completos.json: fuente exacta (todas las colecciones, catálogo FAA/DGAC, personal base + ediciones, semillas, autoridades, preguntas QC-021, versiones).\n'
             '- datos_completos.xlsx: vista legible (una hoja por entidad).\n- archivos/: todos los adjuntos, nombrados <assetId>_<nombre>.\n'
             '- manifiesto.json: conteos y CRC32 para verificar la importación.\n')
    with zipfile.ZipFile(salida, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('datos_completos.json', js)
        if xlsx:
            z.writestr('datos_completos.xlsx', xlsx)
        z.writestr('LEEME.txt', leeme)
        z.writestr('manifiesto.json', json.dumps(man, ensure_ascii=False, indent=1))
        for name, b in files:
            z.writestr(name, b)
    return D, man


def construir_xlsx(D):
    try:
        import openpyxl
    except ImportError:
        return None
    wb = openpyxl.Workbook(); wb.remove(wb.active)

    def flat(o, pre='', out=None):
        out = {} if out is None else out
        for k, v in (o or {}).items():
            key = pre + '.' + k if pre else k
            if isinstance(v, dict): flat(v, key, out)
            elif isinstance(v, list): out[key] = ' | '.join('' if x is None else str(x) for x in v) if all(not isinstance(x, (dict, list)) for x in v) else json.dumps(v, ensure_ascii=False)
            else: out[key] = v
        return out

    def hoja(nombre, objs, first=()):
        F = [flat(o) for o in objs]
        keys = list(dict.fromkeys(list(first) + [k for o in F for k in o]))
        ws = wb.create_sheet(nombre[:31]); ws.append(keys)
        for o in F:
            ws.append([str(o.get(k))[:32000] if isinstance(o.get(k), str) else o.get(k) for k in keys])
    hoja('Proyectos', [{k: v for k, v in p.items() if k not in ('sections', 'se')} for p in D['proyectos']], ['id', 'tipo', 'desc'])
    hoja('Evidencias', D['evidencias']); hoja('Revisiones', D['revisiones']); hoja('Lecturas', D['lecturas'])
    hoja('Personal (vista actual)', D['personal_vista_actual']); hoja('Catalogo entries', D['catalogo']['entries'])
    hoja('Circulares', D['circulares']); hoja('Registro', D['registro']); hoja('Archivos', D['archivos'])
    buf = io.BytesIO(); wb.save(buf); return buf.getvalue()


# ============================================================ verificar
def verificar(st, fuente, rep=None):
    rep = rep or Reporte()
    man = json.loads(fuente.read('manifiesto.json'))
    raw = fuente.read('datos_completos.json')
    O = json.loads(raw)
    rep.titulo('4. Conteos en la base vs. manifiesto')
    D, files = construir_export(st, 'verificación', hoy=None)
    mc = man['conteos']
    for k, v in D['_meta']['conteos'].items():
        (rep.ok if mc.get(k) == v else rep.err)(f'{k}: base {v} · manifiesto {mc.get(k)}')

    rep.titulo('5. Archivos en el almacén local (storage/<assetId>)')
    malos, sin_destino = 0, 0
    for a in man['archivos']:
        try:
            b = open(st.blob_path(a['assetId']), 'rb').read()
            if len(b) != a['bytes'] or crc32_hex(b) != a['crc32']:
                malos += 1; rep.err(f'{a["assetId"]}: almacén {len(b)} bytes/{crc32_hex(b)} vs manifiesto {a["bytes"]}/{a["crc32"]}')
        except FileNotFoundError:
            sin_destino += 1; rep.err(f'{a["assetId"]}: no está en el almacén')
    (rep.ok if not malos else rep.err)(f'{len(man["archivos"]) - malos - sin_destino} archivos con bytes y CRC32 = manifiesto')
    (rep.ok if not sin_destino else rep.err)(f'{sin_destino} archivos sin destino')
    rep.ok('/_blob/<assetId> se resuelve a ' + os.path.join(st.storage, '<assetId>'))

    rep.titulo('6. Integridad referencial')
    P = {p['id']: p for p in D['proyectos']}
    items = {(p['id'], it.get('id')) for p in D['proyectos'] for s in p.get('sections') or [] for it in s.get('items') or []}
    assets = {a['id'] for a in st.assets()}
    ev_ids = {e['id'] for e in D['evidencias']}
    e1 = [e['id'] for e in D['evidencias'] if e.get('projId') not in P]
    e2 = [e['id'] for e in D['evidencias'] if e.get('itemId') and (e['projId'], e['itemId']) not in items]
    (rep.ok if not e1 else rep.err)(f'evidencia.projId: {len(D["evidencias"]) - len(e1)}/{len(D["evidencias"])} existen' + (f' · faltan: {e1}' if e1 else ''))
    (rep.ok if not e2 else rep.err)(f'evidencia.itemId no nulo: todos existen en su proyecto' if not e2 else f'itemId inexistente en: {e2}')
    refa = set()

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'assetId' and v: refa.add(v)
                if k == 'fotos' and isinstance(v, list): refa.update(x if isinstance(x, str) else (x or {}).get('assetId') for x in v)
                walk(v)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk({k: v for k, v in D.items() if k != 'archivos'}); refa.discard(None)
    falt = sorted(refa - assets)
    (rep.ok if not falt else rep.err)(f'assetId referenciados: {len(refa)}, todos con archivo' if not falt else f'assetId sin archivo: {falt}')
    for l in D['lecturas']:
        miss = [o.get('itemId') for o in l.get('ops') or [] if o.get('itemId') and (l['projId'], o['itemId']) not in items]
        (rep.ok if not miss else rep.err)(f'lectura {l["id"]} ({l["projId"]}, {l.get("estado")}, {len(l.get("ops") or [])} ops): ' + ('todos los itemId existen' if not miss else f'itemId inexistentes {miss}'))
    huerf = [r['id'] for r in D['revisiones'] if r['id'] not in ev_ids]
    if huerf:
        rep.aviso(f'{len(huerf)} revisión(es) sin evidencia (la evidencia fue eliminada en la plataforma; se conservan tal cual): {huerf}')

    rep.titulo('7. Textos literales DGAC (verb) byte a byte')
    vo = [json.dumps(e['verb'], ensure_ascii=False).encode() for e in O['catalogo']['entries'] if e.get('verb')]
    vd = [json.dumps(e['verb'], ensure_ascii=False).encode() for e in D['catalogo']['entries'] if e.get('verb')]
    (rep.ok if vo == vd else rep.err)(f'{len(vd)} textos verb idénticos byte a byte' if vo == vd else 'los textos verb difieren')

    rep.titulo('8. Cálculos (port Python) vs. exportación original')
    gen = O['_meta']['generado'][:10]
    dif = []
    for p in D['proyectos']:
        o = next((x for x in O['proyectos'] if x['id'] == p['id']), None)
        c = calc.calc({k: v for k, v in p.items() if k != '_calc'}, D['snapshots_informes'], gen)
        if o and o.get('_calc') != c:
            dif.append((p['id'], o.get('_calc'), c))
    (rep.ok if not dif else rep.err)(f'avance, etapa y semáforo de {len(D["proyectos"])} proyectos = _calc (calculados al {gen}, fecha de la exportación)' if not dif else f'{len(dif)} proyectos difieren: {dif[:5]}')
    hoy = calc.today_utc()
    if hoy != gen:
        cambios = [p['id'] for p in D['proyectos'] if p['_calc'] != next(x for x in O['proyectos'] if x['id'] == p['id'])['_calc']]
        if cambios:
            rep.aviso(f'Con la fecha de hoy ({hoy}) cambia el semáforo/etapa de {len(cambios)} proyecto(s): {cambios} (el semáforo depende de la fecha)')
    ov = O['personal_vista_actual']
    vista_gen = calc.personal_vista(D['personal_base']['personas'], D['personal_ediciones'], gen)
    dp = [i for i, (a, b) in enumerate(zip(vista_gen, ov)) if a != b]
    (rep.ok if len(vista_gen) == len(ov) and not dp else rep.err)(
        f'personal base + ediciones = personal_vista_actual: {len(ov)} personas idénticas, una a una (al {gen})' if not dp and len(vista_gen) == len(ov) else f'{len(dp)} personas difieren: {dp[:5]}')

    rep.titulo('9. Ida y vuelta (base -> exportación) vs. original, sin _meta ni _calc')
    def strip(x):
        x = json.loads(json.dumps(x))
        x.pop('_meta', None)
        for p in x['proyectos']: p.pop('_calc', None)
        x.pop('personal_vista_actual', None)
        return x
    a, b = strip(O), strip(D)
    keys_dif = [k for k in EXPORT_ORDER if k in a and a.get(k) != b.get(k)]
    (rep.ok if not keys_dif else rep.err)('colecciones idénticas' if not keys_dif else f'difieren: {keys_dif}')
    # vista actual se compara al día de la exportación (depende de la fecha)
    D2 = json.loads(json.dumps(D)); D2['personal_vista_actual'] = vista_gen
    for p in D2['proyectos']:
        p['_calc'] = next(x for x in O['proyectos'] if x['id'] == p['id'])['_calc']
    D2['_meta'] = O['_meta']
    same = json_js(D2) == raw
    (rep.ok if same else rep.err)('JSON regenerado byte a byte idéntico al original (reponiendo _meta y _calc del original)' if same else 'el JSON regenerado no es byte a byte igual')
    if not same:
        s1, s2 = json_js(D2), raw
        i = next((i for i in range(min(len(s1), len(s2))) if s1[i] != s2[i]), min(len(s1), len(s2)))
        rep.lineas.append('     primera diferencia en byte %d: %r vs %r' % (i, s1[max(0, i - 60):i + 60], s2[max(0, i - 60):i + 60]))
    return rep


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    a = sp.add_parser('importar'); a.add_argument('fuente'); a.add_argument('--reemplazar', action='store_true')
    b = sp.add_parser('verificar'); b.add_argument('fuente')
    c = sp.add_parser('exportar'); c.add_argument('salida', nargs='?'); c.add_argument('--actor', default=os.environ.get('APAS_ACTOR', 'local'))
    h = sp.add_parser('herramientas', help='importa el maestro de herramientas desde Inventario_de_Herramientas.xlsx'); h.add_argument('xlsx')
    ap.add_argument('--datos', default=None, help='carpeta de datos (por defecto app/data)')
    args = ap.parse_args()
    st = Store(args.datos) if args.datos else Store()
    if args.cmd == 'importar':
        rep = importar(st, Fuente(args.fuente), args.reemplazar); rep.imprimir(); sys.exit(1 if rep.errores else 0)
    if args.cmd == 'verificar':
        rep = verificar(st, Fuente(args.fuente)); rep.imprimir(); sys.exit(1 if rep.errores else 0)
    if args.cmd == 'herramientas':
        import herramientas
        print('Maestro de herramientas importado:', herramientas.importar_excel(st, args.xlsx)); return
    if args.cmd == 'exportar':
        salida = args.salida or f'Exportacion_Plataforma_Calidad_APAS_{datetime.date.today().isoformat()}_v{APP_VER}.zip'
        D, man = exportar(st, salida, args.actor)
        print(f'Exportación: {salida} · {man["json_bytes"]} bytes JSON · CRC32 {man["json_crc32"]} · {man["conteos"]["archivos"]} archivos')


if __name__ == '__main__':
    main()
