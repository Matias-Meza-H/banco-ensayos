"""Port en Python de las reglas de cálculo de la plataforma (app.js / sys.js / personal/template.html).

Se usa para:
  * calcular `_calc` (avance, etapa, semáforo) al exportar desde la línea de comandos;
  * calcular `personal_vista_actual` (personal base + ediciones);
  * verificar de forma independiente que la aplicación web (que usa el código JS) y este port coinciden
    con lo que trae la exportación original.
Cada función indica la función JS de la que proviene. No cambiar una sin cambiar la otra.
"""
import copy
import datetime
import re

DONE = {'cumplido', 'aprobado', 'na'}
SEC_NAME = {'infra': 'Infraestructura', 'doc': 'Documentación técnica', 'mat': 'Materiales', 'tools': 'Herramientas y equipos',
            'train': 'Entrenamiento del personal', 'serv': 'Servicios', 'carta': 'Carta de intención del cliente',
            'dims': 'Comprobación de dimensiones hangar / aeronave', 'toolsTask': 'Herramientas por tarea'}
SEC_ORDER = ['infra', 'doc', 'mat', 'tools', 'train', 'serv']
AIR_ORDER = ['carta', 'dims', 'toolsTask', 'train']
DIMS = ['Herramientas y equipos', 'Documentación técnica', 'Entrenamiento del personal', 'Infraestructura', 'Servicios']
DIM2KEY = {'Infraestructura': 'infra', 'Documentación técnica': 'doc', 'Herramientas y equipos': 'tools', 'Entrenamiento del personal': 'train', 'Servicios': 'serv'}
SEMA = {'g': 'En orden', 'y': 'Sin avance evidenciado', 'r': 'Atrasado a la fecha prometida'}


def truthy(v):
    """Equivalente a `!!v` de JavaScript ({} y [] son verdaderos)."""
    if v is None or v is False:
        return False
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v != 0 and v == v
    if isinstance(v, str):
        return v != ''
    return True


def today_utc():
    """app.js today(): new Date().toISOString().slice(0,10) (fecha UTC)."""
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')


def secs(p):
    return p.get('sections') or []


def sec(p, k):
    return next((s for s in secs(p) if s.get('key') == k), None)


def items(s):
    return s.get('items') or []


# ---------------------------------------------------------------- upgrade / toV3 (app.js)
def air_template():
    out = [{'key': k, 'name': SEC_NAME[k], 'items': [{'id': k + '1', 'title': t, 'status': 'pendiente', 'log': []}]}
           for k, t in [('carta', 'Carta de intención del cliente'), ('dims', 'Comprobación de dimensiones hangar vs. aeronave'), ('toolsTask', 'Listado de herramientas por tarea')]]
    out.append({'key': 'train', 'name': 'Roster del personal calificado', 'items': [{'id': 'r1', 'kind': 'roster', 'title': 'Roster del personal calificado', 'curso': 'Curso Nv3 de aeronave', 'status': 'pendiente', 'log': []}]})
    return out


def to_v3(q):
    if q.get('tipo') == 'Aeronave' and not any(s.get('key') == 'carta' for s in secs(q)):
        q['sections'] = air_template(); q['model'] = 3; return q
    tr = sec(q, 'train')
    if tr and any(not i.get('kind') for i in items(tr)):
        legacy = [i for i in items(tr) if not i.get('kind')]
        keep = [i for i in items(tr) if i.get('kind')]
        curso = next((i.get('curso') for i in legacy if truthy(i.get('curso'))), None) or ('Curso Nv3 de aeronave' if q.get('tipo') == 'Aeronave' else 'Curso básico del componente según manual')
        all_done = len(legacy) > 0 and all(i.get('status') in DONE for i in legacy)
        anyc = any(i.get('status') != 'pendiente' for i in legacy)
        tr['items'] = [{'id': 'r_legacy', 'kind': 'roster', 'title': 'Roster del proyecto', 'curso': curso,
                        'status': 'cumplido' if all_done else 'en_curso' if anyc else 'pendiente', 'log': []}] + keep
    q['model'] = 3
    return q


def upgrade(p):
    if p.get('tipo') == 'Certificación extranjera' and not any(items(s) for s in secs(p)):
        if p.get('model') == 3 and not secs(p):
            return p
        q = copy.deepcopy(p); q['sections'] = []; q['model'] = 3; return q
    if p.get('tipo') == 'Aeronave' and not any(s.get('key') == 'carta' for s in secs(p)):
        return to_v3(copy.deepcopy(p))
    if p.get('model') == 3:
        return p
    if p.get('model') == 2:
        return to_v3(copy.deepcopy(p))
    q = copy.deepcopy(p)
    by_name = {s.get('name'): items(s) for s in secs(q)}
    new = []
    for k in SEC_ORDER:
        s = {'key': k, 'name': SEC_NAME[k], 'items': by_name.get(SEC_NAME[k], [])}
        if k in ('infra', 'serv'):
            s['requiere'] = None
        if k == 'mat':
            s['cerrada'] = False
        new.append(s)
    q['sections'] = new
    tr = sec(q, 'train')
    if not items(tr) and q.get('tipo') != 'Certificación extranjera':
        tr['items'] = [{'id': 't%d' % n, 'title': g, 'grupo': g, 'curso': '' if g == 'Actualización de roster' else ('Curso Nv3 de aeronave' if q.get('tipo') == 'Aeronave' else 'Curso básico del componente según manual'), 'status': 'pendiente', 'log': []}
                       for n, g in enumerate(['Técnicos', 'Inspectores', 'Certificadores', 'Actualización de roster'])]
    q['model'] = 2
    return to_v3(q)


# ---------------------------------------------------------------- avance / etapa / semáforo
def is_faa(p):
    return 'FAA' in (p.get('autoridad') or [])


def sec_done(p, s):
    if not s:
        return False
    k = s.get('key')
    if k in ('infra', 'serv'):
        if s.get('requiere') is False:
            return True
        if s.get('requiere') is True:
            return len(items(s)) > 0 and all(i.get('status') in DONE for i in items(s))
        return False
    if k == 'mat':
        return (not is_faa(p)) or truthy(s.get('cerrada')) or len(items(s)) == 0
    return len(items(s)) > 0 and all(i.get('status') in DONE for i in items(s))


def dim_done(p, k):
    dims = p.get('dims') or {}
    if p.get('model') == 2 or any(truthy(x.get('key')) for x in secs(p)):
        key = DIM2KEY[k]; s2 = sec(p, key)
        if not s2:
            return truthy(dims.get(k)) if p.get('dims') else False
        if key in ('doc', 'tools', 'train') and not items(s2):
            return (truthy(dims.get(k)) if p.get('dims') else False) and (key != 'tools' or sec_done(p, sec(p, 'mat')))
        return sec_done(p, s2) and (key != 'tools' or sec_done(p, sec(p, 'mat')))
    s = next((x for x in secs(p) if x.get('name') == k), None)
    if s and items(s):
        return all(i.get('status') in DONE for i in items(s))
    return truthy(dims.get(k)) if p.get('dims') else False


def is_air(p):
    return p.get('tipo') == 'Aeronave' and any(s.get('key') == 'carta' for s in secs(p))


def parts_of(p):
    if is_air(p):
        return [('Roster del personal calificado' if k == 'train' else SEC_NAME[k], sec_done(p, sec(p, k))) for k in AIR_ORDER]
    return [(k, dim_done(p, k)) for k in DIMS]


def progress(p):
    if p.get('tipo') == 'Certificación extranjera' and not any(items(x) for x in secs(p)):
        return 100 if truthy(p.get('aprobacion')) else 0
    parts = [d for _, d in parts_of(p)] + [truthy(p.get('solicitud')), truthy(p.get('aprobacion'))]
    return js_round(sum(1 for x in parts if x) / len(parts) * 100)


def js_round(x):
    """Math.round de JS (mitades hacia +infinito)."""
    import math
    return int(math.floor(x + 0.5))


def uses_apr(p):
    return p.get('tipo') == 'Componente' and any(a in ('FAA', 'DGAC') for a in (p.get('autoridad') or []))


def stage(p):
    if p.get('tipo') == 'Certificación extranjera' and not any(items(x) for x in secs(p)) and not truthy(p.get('solicitud')) and not truthy(p.get('aprobacion')):
        return 'Por definir'
    if truthy(p.get('aprobacion')):
        return 'Aprobado'
    apr = p.get('apr')
    if uses_apr(p) and truthy(apr) and truthy(apr.get('FAA')) and truthy(apr['FAA'].get('ok')) and 'DGAC' in (p.get('autoridad') or []):
        return 'Aprobado FAA · DGAC pendiente'
    if truthy(p.get('solicitud')):
        return 'En revisión de la autoridad'
    if all(d for _, d in parts_of(p)):
        return 'Listo para solicitar'
    if progress(p) > 0 or any(i.get('status') != 'pendiente' for s in secs(p) for i in items(s)):
        return 'En desarrollo'
    return 'En análisis'


def sema(p, snaps, hoy=None):
    hoy = hoy or today_utc()
    if truthy(p.get('aprobacion')):
        return 'g'
    if truthy(p.get('fechaEstimada')) and p['fechaEstimada'] < hoy:
        return 'r'
    pr = progress(p)
    if pr == 0:
        return 'y'
    lim = (datetime.date.fromisoformat(hoy) - datetime.timedelta(days=7)).isoformat()
    old = sorted([s for s in snaps if s.get('date', '') <= lim], key=lambda s: s.get('date', ''), reverse=True)
    old = old[0] if old else None
    if old and old.get('data') and old['data'].get(p['id']) and old['data'][p['id']].get('pct') == pr:
        return 'y'
    return 'g'


def calc(raw, snaps, hoy=None):
    p = upgrade(raw)
    return {'avance': progress(p), 'etapa': stage(p), 'semaforo': SEMA[sema(p, snaps, hoy)]}


# ---------------------------------------------------------------- personal (personal/template.html + edit.js)
EMPTY_PERS = {'rut': '', 'apellido': '', 'nombre': '', 'puesto': None, 'area': None, 'estado': 'Activo', 'grupo': 'Técnico', 'tipoLic': None, 'nLic': None, 'vencLic': None,
              'generales': {}, 'oneTime': {}, 'aeronaves': [], 'operadores': [], 'nv4': [], 'ndt': [], 'cmm': [], 'cursosEsp': None, 'obs': [], 'acAll': {}, 'opsAll': {}}
ISDATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def is_date(v):
    return isinstance(v, str) and bool(ISDATE.match(v))


def pkey(p, n):
    if truthy(p.get('_id')):
        return p['_id']
    r = re.sub(r'[^0-9kK]', '', js_str(p.get('rut') or '')).upper()
    return r or ('SINRUT%d' % n)


def js_str(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def dates(p):
    out = []
    if is_date(p.get('vencLic')): out.append(p['vencLic'])
    out += [v for v in (p.get('generales') or {}).values() if is_date(v)]
    out += [a.get('venc') for a in p.get('aeronaves') or [] if is_date(a.get('venc'))]
    out += [c.get('valor') for o in p.get('operadores') or [] for c in o.get('cursos') or [] if is_date(c.get('valor'))]
    out += [n.get('venc') for n in p.get('nv4') or [] if is_date(n.get('venc'))]
    for n in p.get('ndt') or []:
        if is_date(n.get('cert')): out.append(n['cert'])
        if is_date(n.get('prof')): out.append(n['prof'])
    out += [c.get('vencOjt') for c in p.get('cmm') or [] if is_date(c.get('vencOjt'))]
    return sorted(out)


def especialidad(p):
    pu, lic = p.get('puesto') or '', p.get('tipoLic') or ''
    if re.search('structurist', pu, re.I): return 'Estructura'
    if re.search('inspector', pu, re.I): return 'Inspector'
    if re.search('engineer', lic, re.I) or p.get('area') == 'Ingeniería': return 'Ingeniero'
    if re.search('technician|mechanic|head of line|supervisor|especialista', pu, re.I): return 'Técnico'
    if re.search('gerencia', pu, re.I): return 'Gerencia'
    if re.search('administrativo', pu, re.I): return 'Administrativo'
    return 'Sin clasificar'


def personal_vista(personas, ediciones, hoy_local=None):
    """rebuildP() + derive() + window.__persMerged() del módulo Personal."""
    hoy_local = hoy_local or datetime.date.today().isoformat()
    m = {}
    for n, p in enumerate(personas):
        m[pkey(p, n)] = p
    for d in ediciones:
        k = d['id']
        body = {kk: vv for kk, vv in d.items() if kk != 'id'}
        merged = dict(EMPTY_PERS); merged.update(m.get(k) or {}); merged.update(body); merged['_id'] = k; merged['_edit'] = True
        m[k] = merged
    out = []
    for k, p in m.items():
        q = dict(p); q['_id'] = k
        ds = dates(q)
        nom_raw = q.get('nombre') or ''
        q['nombre'] = ' '.join(x for x in [q.get('apellido'), q.get('nombre')] if truthy(x))
        q['nomRaw'] = nom_raw
        q['venc'] = ds[0] if ds else None
        q['nv'] = sum(1 for v in ds if v < hoy_local)
        q['esp'] = ' · '.join(q['esps']) if q.get('esps') else especialidad(q)
        out.append(q)
    return out
