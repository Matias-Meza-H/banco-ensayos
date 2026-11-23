"""Control de Herramientas dentro de la aplicación local, con base compartida con la Plataforma de Calidad.

* `importar_excel(st, xlsx)`: carga el maestro desde Inventario_de_Herramientas.xlsx (hojas Her Cal, Her No Cal,
  Mant Prevent, Control Software y Location Control) a las tablas herr_cal / herr_nc / static herr_meta.
  Los cambios hechos en la app (custodia, datos, intercambiables, historial) viven en las colecciones
  herr_edits / herr_rel / herr_log y se aplican encima, por clave `k` (C-<ID>, M-<n>, N-<ACH>).
* Vínculo por P/N con los expedientes: `indice(st)` cruza las herramientas de cada expediente
  (sections[key='tools'].items: pn y pnAlt) con el maestro, por P/N normalizado.
"""
import datetime
import json
import os
import re

from store import dumps

# ------------------------------------------------------------------ importación desde el Excel
PER = {'1 YE': '1 año', '1YE': '1 año', '6 MO': '6 meses', '3 MO': '3 meses', '2 YE': '2 años', '3 YE': '3 años', '1 MO': '1 mes', '12 MO': '1 año', '1 AÑO': '1 año'}


def _s(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    return re.sub(r'\s+', ' ', str(v)).strip()


def _d(v):
    return v.strftime('%Y-%m-%d') if isinstance(v, datetime.datetime) else ''


def _per(v):
    t = _s(v).upper()
    if not t:
        return ''
    if 'NO REQUIERE' in t:
        return 'No requiere'
    return PER.get(t, _s(v))


def leer_excel(path):
    import openpyxl  # solo para importar el maestro
    wb = openpyxl.load_workbook(path, data_only=True)
    locmap = {}
    for r in wb['Location Control'].iter_rows(values_only=True):
        v = [x for x in r if x is not None]
        if len(v) >= 2 and str(v[0]).startswith('NSV') and not str(v[1]).startswith('HTA'):
            locmap[_s(v[0])] = _s(v[1])
    sw = {}
    for r in wb['Control Software'].iter_rows(min_row=4, values_only=True):
        if r[0] and r[12] not in (None, ''):
            sw[_s(r[0])] = _s(r[12])
    cal, seen = [], {}

    def key(k):
        seen[k] = seen.get(k, 0) + 1
        return k if seen[k] == 1 else f'{k}-{seen[k]}'
    for i, r in enumerate(wb['Her Cal'].iter_rows(min_row=3, values_only=True)):
        if not any([r[1], r[3], r[4]]):
            continue
        idv = _s(r[1])
        x = dict(k=key('C-' + (re.sub(r'[^A-Za-z0-9_-]', '', idv) or 'r%d' % i)), asset=_s(r[0]), id=idv, sn=_s(r[2]), pn=_s(r[3]), desc=_s(r[4]), mfr=_s(r[5]),
                 sw=_s(r[6]) or sw.get(idv, ''), loc=_s(r[7]), st='SERV' if _s(r[8]).upper() == 'SERV' else 'NO SERV', per=_per(r[9]), last=_d(r[10]), next=_d(r[11]),
                 by=_s(r[12]), cert=_s(r[13]), ach=_s(r[15]), lastBy=_s(r[16]), check=_s(r[17]), fam=_s(r[18]), prog='Calibración')
        cal.append({a: b for a, b in x.items() if b != ''})
    for i, r in enumerate(wb['Mant Prevent'].iter_rows(min_row=4, values_only=True)):
        if not any([r[3], r[4], r[5]]):
            continue
        if r[8] is None and _s(r[6]).startswith('ACH'):
            x = dict(k='M-%d' % i, pn=_s(r[2]), desc=_s(r[3]), loc=_s(r[5]), ach=_s(r[6]), prog='Mant. preventiva')
        else:
            x = dict(k='M-%d' % i, asset=_s(r[1]), id=_s(r[2]).strip('- '), sn=_s(r[3]), pn=_s(r[4]), desc=_s(r[5]), mfr=_s(r[6]), loc=_s(r[7]),
                     st='SERV' if _s(r[8]).upper() == 'SERV' else 'NO SERV', per=_per(r[9]), last=_d(r[10]), next=_d(r[11]), by=_s(r[12]),
                     cert=_s(r[13]).replace('-0-', ''), ach=_s(r[14]), prog='Mant. preventiva')
        cal.append({a: b for a, b in x.items() if b != ''})
    nc, seen, rels = [], {}, {}

    def pns(v):
        t = _s(v).replace('\n', ' ')
        if not t or t.upper() in ('N/A', 'NA', '-'):
            return []
        return [p for p in re.split(r'[\s/,;]+', t) if len(p) >= 3 and p.upper() not in ('N/A', 'O', 'OR', 'Y')]
    for i, r in enumerate(wb['Her No Cal'].iter_rows(min_row=5, values_only=True)):
        if not any([r[2], r[3]]) or not isinstance(r[3], str) and r[2] is None:
            continue
        ach = _s(r[6])
        sn = _s(r[1])
        x = dict(k=key('N-' + (re.sub(r'[^A-Za-z0-9_-]', '', ach) or 'r%d' % (i + 5))), sn='' if sn.upper() in ('S/N', 'NSN') else sn, pn=_s(r[2]), desc=_s(r[3]), oem=_s(r[4]),
                 loc=_s(r[5]), ach=ach, qty=_s(r[7]), apl=_s(r[9]), doc=_s(r[10]), alt=_s(r[11]) if _s(r[11]).upper() != 'N/A' else '',
                 ci=_s(r[12]) if _s(r[12]) != 'XX' else '', cn=_s(r[13]) if _s(r[13]).upper() != 'UNAVAILABLE' else '')
        nc.append({a: b for a, b in x.items() if b != ''})
        a = _s(r[2]).upper()
        for p in pns(r[11]):
            b = p.upper()
            if a and b != a:
                pair = sorted([a, b])
                rels['|'.join(pair)] = dict(a=pair[0], b=pair[1], t='full', src='Excel (Alternative Part)')
    return dict(cal=cal, nc=nc, rels=list(rels.values()), locmap=locmap, fuente=os.path.basename(path))


def importar_excel(st, path):
    D = leer_excel(path)
    with st.lock:
        st.db.execute('BEGIN')
        try:
            for t, lst in (('herr_cal', D['cal']), ('herr_nc', D['nc'])):
                st.db.execute(f'DELETE FROM "{t}"')
                st.db.executemany(f'INSERT INTO "{t}"(ord,data) VALUES(?,?)', [(n, dumps(x)) for n, x in enumerate(lst)])
            st.set_static('herr_meta', {'rels': D['rels'], 'locmap': D['locmap'], 'fuente': D['fuente'], 'importado': datetime.datetime.now().isoformat(timespec='seconds')})
            st._bump('herr_maestro')
            st.db.execute('COMMIT')
        except Exception:
            st.db.execute('ROLLBACK')
            raise
    st.notify()
    return {'calibrables': len(D['cal']), 'no_calibrables': len(D['nc']), 'relaciones_excel': len(D['rels']), 'ubicaciones': len(D['locmap'])}


# ------------------------------------------------------------------ reglas (las mismas de la página Control de Herramientas)
norm_pn = lambda s: re.sub(r'\s+', '', str(s or '')).upper()
CAL_RE = re.compile(r'CALIBRAC|METROCAL|\bSMI\b|CALMANREP|/DTS', re.I)


def seed_cust(loc):
    return 'En calibración' if CAL_RE.search(loc or '') else 'En APAS'


def seed_cond(loc):
    return 'Perdida' if re.search('MISSING|EXTRAVIAD', loc or '', re.I) else 'Scrap' if re.search('SCRAP', loc or '', re.I) else ''


def efectivo(st):
    ed = {d['id']: {k: v for k, v in d.items() if k != 'id'} for d in st.list_docs('herr_edits')}
    hoy = datetime.date.today().isoformat()
    out = []
    for kind, t in (('cal', 'herr_cal'), ('nc', 'herr_nc')):
        for b in st.rows(t):
            i = dict(b); i.update(ed.get(b['k'], {}))
            i['_kind'] = kind
            i['_cond'] = i['cond'] if i.get('cond') is not None else seed_cond(i.get('loc'))
            if kind == 'cal':
                i['_cust'] = i.get('cust') or seed_cust(i.get('loc'))
                i['_vigente'] = not i.get('next') or i['next'] >= hoy
                i['_disp'] = i.get('st') == 'SERV' and i['_cust'] == 'En APAS' and i['_vigente'] and i['_cond'] not in ('Perdida', 'Scrap', 'Rota / dañada')
            out.append(i)
    return out


def relaciones(st):
    meta = st.static('herr_meta', {}) or {}
    rel = {}
    for r in meta.get('rels', []):
        rel['|'.join(sorted([r['a'], r['b']]))] = r
    for d in st.list_docs('herr_rel'):
        k = '|'.join(sorted([d.get('a', ''), d.get('b', '')]))
        if d.get('deleted'):
            rel.pop(k, None)
        else:
            rel[k] = d
    return list(rel.values())


def indice(st):
    """P/N normalizado -> resumen de unidades del maestro, y vínculos expediente -> maestro."""
    items = efectivo(st)
    by = {}
    for i in items:
        n = norm_pn(i.get('pn'))
        if n:
            by.setdefault(n, []).append(i)
    rels = relaciones(st)
    rel_of = {}
    for r in rels:
        rel_of.setdefault(r['a'], []).append({'pn': r['b'], 't': r.get('t'), 'rol': 'a'})
        rel_of.setdefault(r['b'], []).append({'pn': r['a'], 't': r.get('t'), 'rol': 'b'})

    def resumen(n):
        u = by.get(n, [])
        cal = [x for x in u if x['_kind'] == 'cal']
        return {'cal': len(cal), 'disp': sum(1 for x in cal if x['_disp']), 'enCal': sum(1 for x in cal if x['_cust'] == 'En calibración'),
                'nc': sum(1 for x in u if x['_kind'] == 'nc'), 'ids': [x.get('id') or x.get('ach') or x['k'] for x in u][:12]}
    vinc = []
    for p in st.list_docs('proj'):
        for s in p.get('sections') or []:
            if s.get('key') not in ('tools', 'toolsTask'):
                continue
            for it in s.get('items') or []:
                pns = [x for x in [it.get('pn')] + re.split(r'\s*/\s*', it.get('pnAlt') or '') if x]
                for pn in pns:
                    n = norm_pn(pn)
                    if not n or n.startswith('W/O'):
                        continue
                    r = resumen(n)
                    alts = [a for a in rel_of.get(n, []) if by.get(a['pn'])]
                    if r['cal'] or r['nc'] or alts:
                        vinc.append({'projId': p['id'], 'itemId': it.get('id'), 'pn': pn, 'pnN': n, **r, 'intercambiables': alts})
    return {'vinculos': vinc}


# ------------------------------------------------------------------ HTTP
def get(h, st, path, q):
    if path == '/api/herramientas/indice':
        return h.send(200, indice(st))
    if path == '/api/herramientas/expedientes':
        n = norm_pn((q.get('pn') or [''])[0])
        return h.send(200, [v for v in indice(st)['vinculos'] if v['pnN'] == n or any(a['pn'] == n for a in v['intercambiables'])])
    return h.err(404, 'no encontrado')


def post(h, st, path, body):
    return h.err(404, 'no encontrado')


def render_page(st, tpl, logo):
    meta = st.static('herr_meta', None)
    D = {'cal': st.rows('herr_cal'), 'nc': st.rows('herr_nc'), 'rels': (meta or {}).get('rels', []), 'locmap': (meta or {}).get('locmap', {}),
         'fuente': (meta or {}).get('fuente', 'sin maestro importado')}
    js = json.dumps(D, ensure_ascii=False).replace('</', '<\\/')
    return re.sub('__DATA__|__LOGO__', lambda m: js if m.group(0) == '__DATA__' else logo, tpl)
