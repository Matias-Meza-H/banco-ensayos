"""Actualiza la base de personal (personal_base) con un Master List - Training Control nuevo.

No reconstruye la base: compara campo por campo y solo cambia los valores que la planilla trae
distintos, manteniendo la estructura y las reglas de la base actual (niveles Nv1-Nv4, motores SÍ/NO,
767 con vencimiento del recurrente, Avianca 'x' = NO, cargos normalizados). Reglas:
  - una fecha nueva o distinta reemplaza el valor de la base;
  - un 'N/A' / 'x' / '✘' de la planilla NO borra una fecha de la base (se informa como conflicto);
  - personas nuevas se agregan con la misma forma que las de su grupo;
  - quien ya no aparece en la planilla NO se borra: se informa (decide el usuario);
  - nv4, cursos por CMM sin código, OJT y observaciones se mantienen.
Uso: python3 actualizar_personal.py <datos_completos.json> <MasterList.xlsx> <salida_personal_base.json> <salida_cambios.json>
"""
import sys, json, re, datetime, copy
import openpyxl

src, xlsx, out_base, out_diff = sys.argv[1:5]
D = json.load(open(src, encoding='utf-8'))
base = copy.deepcopy(D['personal_base'])
P = base['personas']
NR = lambda r: re.sub(r'[^0-9K]', '', str(r or '').upper())
idx = {NR(p['rut']): p for p in P if NR(p['rut'])}
wb = openpyxl.load_workbook(xlsx, data_only=True)
cambios, conflictos, informes = [], [], []
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
isd = lambda v: isinstance(v, str) and bool(ISO.match(v))


def val(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.date().isoformat() if isinstance(v, datetime.datetime) else v.isoformat()
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def nivel(v):
    m = re.match(r'^Level\s+(I{1,3}|IV)$', str(v or '').strip())
    return {'I': 'Nv1', 'II': 'Nv2', 'III': 'Nv3', 'IV': 'Nv4'}[m.group(1)] if m else None


def quien(p):
    return f"{p['apellido']} {p['nombre']} ({p['rut']})"


def setv(p, ruta, obj, k, nuevo, permitir_vacio=False):
    """Cambia obj[k] por `nuevo` si corresponde según las reglas; registra el cambio."""
    viejo = obj.get(k)
    if nuevo is None or nuevo == viejo or str(nuevo) == str(viejo):
        return
    if isd(nuevo) and isd(viejo) and nuevo < viejo:   # un vencimiento que retrocede: se informa, no se aplica
        conflictos.append({'persona': quien(p), 'campo': ruta, 'base': viejo, 'planilla': nuevo, 'motivo': 'la fecha retrocede'})
        return
    if not isd(nuevo) and viejo is None and not permitir_vacio:
        return  # sin fecha en la planilla y sin registro en la base: se mantiene la forma de la base
    if not isd(nuevo) and isd(viejo) and not permitir_vacio:
        conflictos.append({'persona': quien(p), 'campo': ruta, 'base': viejo, 'planilla': nuevo})
        return
    if not isd(nuevo) and viejo is not None and not permitir_vacio:
        return  # N/A vs NO vs null: misma información (sin fecha), se respeta la forma de la base
    obj[k] = nuevo
    cambios.append({'persona': quien(p), 'campo': ruta, 'antes': viejo, 'ahora': nuevo})


# ------------------------------------------------------------------ AIRCRAFT
ws = wb['AIRCRAFT']
C = lambda r, col: val(ws[f'{col}{r}'].value)
GEN = [('J', 'MPM/RSQCM'), ('K', 'Regulación'), ('L', 'Factores Humanos'), ('M', 'SMS'), ('O', 'Familiarización'),
       ('P', 'Téc. Inspección'), ('Q', 'Certificación interna'), ('R', 'Inglés'), ('BG', 'TICA')]
AC = [('Airbus A319/A320/A321', 'S', 'T', [('U', 'CFM56-5'), ('V', 'V2500'), ('W', 'PW1100'), ('X', 'LEAP-1A')]),
      ('Boeing 737NG', 'Y', 'Z', [('AA', 'CFM56-7')]),
      ('Boeing 737 MAX', 'AB', 'AC', [('AD', 'LEAP-1B')]),
      ('Boeing 767', 'AE', 'AI', [('AF', 'CF6-80C2'), ('AG', 'PW4000')])]
OPS = [('JetSMART Chile (JAT)', [('AQ', 'Special Ops'), ('AR', 'MCM')]),
       ('JetSMART Argentina (JES)', [('AS', 'Special Ops'), ('AT', 'MCM')]),
       ('Sky Airline (SKU)', [('AU', 'Special Ops'), ('AV', 'MCM')]),
       ('Avianca (AVA)', [('AW', 'Policies & Procedures'), ('AX', 'Special Ops'), ('AY', 'EWIS'), ('AZ', 'SFAR'), ('BA', 'Inspector'),
                          ('BB', 'Incoming Inspection'), ('BC', 'PTL Due Date')]),
       ('DAP', [('AO', 'MCM'), ('AP', 'OP.ESP')]),
       ('Servicios Aéreos NG', [('BD', 'MCM'), ('BE', 'SMS')])]


def opval(op, v):
    if v in ('x', '✘', 'X'):
        return 'NO'
    return v


# personas de la base sin RUT: se completa el RUT si la planilla trae a alguien con el mismo apellido y nombre
for p in P:
    if NR(p['rut']) and 'SIN RUT' not in str(p['rut']):
        continue
    for r in range(5, ws.max_row + 1):
        if str(C(r, 'B') or '').strip().lower() == p['apellido'].strip().lower() and str(C(r, 'C') or '').strip().lower() == p['nombre'].strip().lower() and C(r, 'D'):
            cambios.append({'persona': quien(p), 'campo': 'RUT', 'antes': p['rut'], 'ahora': C(r, 'D')}); p['rut'] = C(r, 'D'); idx[NR(p['rut'])] = p; break

vistos, filas_dup = set(), []
nuevos_aircraft = []
for r in range(5, ws.max_row + 1):
    rut = C(r, 'D')
    if not rut or len(NR(rut)) < 6:
        continue
    k = NR(rut)
    if k in vistos:
        filas_dup.append((r, C(r, 'A'), C(r, 'B'), rut)); continue   # filas .1 (Nv4 / segunda especialidad): se mantienen
    vistos.add(k)
    p = idx.get(k)
    if p is None:
        nuevos_aircraft.append(r); continue
    adm = p.get('grupo') == 'Administrativo'
    # licencia
    if not adm:
        if C(r, 'G') not in (None, 'x'):
            tl = ' / '.join(x.strip() for x in C(r, 'G').split('\n') if x.strip())
            if p.get('tipoLic') is None:
                setv(p, 'Tipo de licencia', p, 'tipoLic', tl, permitir_vacio=True)
            elif tl != p['tipoLic'] and not set(tl.split(' / ')) <= set(p['tipoLic'].split(' / ')):
                conflictos.append({'persona': quien(p), 'campo': 'Tipo de licencia', 'base': p['tipoLic'], 'planilla': tl, 'motivo': 'distinto a la base'})
        if isinstance(C(r, 'H'), (int, float)):
            setv(p, 'N° licencia', p, 'nLic', int(C(r, 'H')), permitir_vacio=True)
        setv(p, 'Venc. licencia', p, 'vencLic', C(r, 'I') if isd(C(r, 'I')) else None)
    for col, key in GEN:
        if key in p['generales'] or isd(C(r, col)):
            setv(p, f'General · {key}', p['generales'], key, C(r, col) if isd(C(r, col)) else None)
    # aeronaves
    if not adm:
        for ac, cn, cv, engs in AC:
            nv, venc = nivel(C(r, cn)), C(r, cv)
            if ac == 'Boeing 767' and not isd(venc):
                venc = None
            a = p['acAll'].setdefault(ac, {'nivel': None, 'venc': None})
            e = next((x for x in p['aeronaves'] if x['aeronave'] == ac), None)
            if nv and a.get('nivel', '') and str(a.get('nivel')).startswith('Nv') and nv < a['nivel']:
                conflictos.append({'persona': quien(p), 'campo': f'{ac} · nivel', 'base': a['nivel'], 'planilla': nv, 'motivo': 'el nivel baja'})
            elif nv and nv != a.get('nivel'):
                setv(p, f'{ac} · nivel', a, 'nivel', nv, permitir_vacio=True)
            elif not nv and isd(a.get('venc')) and C(r, cn) in ('✘', 'x'):
                conflictos.append({'persona': quien(p), 'campo': f'{ac} · nivel', 'base': f"{a.get('nivel')} / {a.get('venc')}", 'planilla': C(r, cn)})
            if isd(venc):
                setv(p, f'{ac} · venc.', a, 'venc', venc)
            if nv and e is None:
                e = {'aeronave': ac, 'nivel': a['nivel'], 'venc': a['venc'], 'motores': [{'motor': m, 'valor': 'NO'} for _, m in engs]}
                p['aeronaves'].append(e)
                cambios.append({'persona': quien(p), 'campo': f'{ac}', 'antes': None, 'ahora': 'curso agregado'})
            if e is not None:
                e['nivel'], e['venc'] = a['nivel'], a['venc']
                for col, m in engs:
                    v = {'✔': 'SÍ', '✘': 'NO'}.get(C(r, col))
                    if v is None:
                        continue
                    me = next((x for x in e['motores'] if x['motor'] == m), None)
                    if me is None:
                        e['motores'].append({'motor': m, 'valor': v}); cambios.append({'persona': quien(p), 'campo': f'{ac} · motor {m}', 'antes': None, 'ahora': v})
                    elif me['valor'] == 'SÍ' and v == 'NO':
                        conflictos.append({'persona': quien(p), 'campo': f'{ac} · motor {m}', 'base': 'SÍ', 'planilla': 'NO', 'motivo': 'pierde el motor'})
                    elif me['valor'] != v and me['valor'] in ('SÍ', 'NO'):
                        setv(p, f'{ac} · motor {m}', me, 'valor', v, permitir_vacio=True)
    # operadores
    for op, cursos in OPS:
        o = p.setdefault('opsAll', {}).setdefault(op, {})
        for col, cu in cursos:
            v = opval(op, C(r, col))
            if v is None:
                continue
            if not (isd(v) or v in ('NO', 'N/A')):
                informes.append(f"{quien(p)} · {op} · {cu}: valor '{v}' en la planilla (no es fecha): no se cargó")
                continue
            if isd(v) or cu not in o or o.get(cu) is None:
                setv(p, f'{op} · {cu}', o, cu, v, permitir_vacio=o.get(cu) is None)
        lst = next((x for x in p['operadores'] if x['operador'] == op), None)
        if lst is None and any(isd(o.get(cu)) for _, cu in cursos):
            p['operadores'].append({'operador': op, 'cursos': [{'curso': cu, 'valor': o.get(cu)} for _, cu in cursos]})
        elif lst is not None:
            for c in lst['cursos']:
                if c['curso'] in o:
                    c['valor'] = o[c['curso']]

# ------------------------------------------------------------------ NDT
ws = wb['NDT']
MET = [('UT', 'L', 'M', 'N'), ('MT', 'O', 'P', 'Q'), ('ET', 'R', 'S', 'T'), ('PT', 'U', 'V', 'W')]
for r in range(5, ws.max_row + 1):
    rut = val(ws[f'C{r}'].value)
    p = idx.get(NR(rut)) if rut else None
    if p is None:
        if rut and len(NR(rut)) > 5: informes.append(f'NDT: {rut} no está en la base')
        continue
    for met, cn, cc, cp in MET:
        nv, cert, prof = nivel(val(ws[f'{cn}{r}'].value)), val(ws[f'{cc}{r}'].value), val(ws[f'{cp}{r}'].value)
        if not nv:
            continue
        e = next((x for x in p['ndt'] if x['metodo'] == met), None)
        if e is None:
            e = {'metodo': met, 'nivel': nv, 'cert': cert, 'prof': prof}; p['ndt'].append(e)
            cambios.append({'persona': quien(p), 'campo': f'NDT {met}', 'antes': None, 'ahora': f'{nv} cert {cert} prof {prof}'}); continue
        setv(p, f'NDT {met} · nivel', e, 'nivel', nv, permitir_vacio=True)
        setv(p, f'NDT {met} · certificado', e, 'cert', cert if isd(cert) else None)
        setv(p, f'NDT {met} · proficiencia anual', e, 'prof', prof if isd(prof) else None)

# ------------------------------------------------------------------ WORKSHOP (cursos generales y CMM)
ws = wb['WORKSHOP']
ata = {c: str(ws.cell(5, c).value) for c in range(14, ws.max_column + 1) if ws.cell(5, c).value}
for r in range(6, ws.max_row + 1):
    rut = val(ws.cell(r, 4).value)
    p = idx.get(NR(rut)) if rut else None
    if p is None:
        continue
    for c, key in [(9, 'MPM/RSQCM'), (10, 'Regulación'), (11, 'Factores Humanos'), (12, 'SMS'), (13, 'Inglés')]:
        v = val(ws.cell(r, c).value)
        if isd(v):
            setv(p, f'General · {key}', p['generales'], key, v)
    for c, code in ata.items():
        v = val(ws.cell(r, c).value)
        if not isd(v):
            continue
        e = next((x for x in p['cmm'] if x['curso'].split(' ')[0] == code), None)
        if e is None:
            informes.append(f"CMM {code} realizado {v} para {quien(p)}: no está en la base y falta su código CMM-xxx (no se agregó)")
        else:
            setv(p, f"CMM {e['cmm']} ({code}) · realizado", e, 'realizado', v)

# ------------------------------------------------------------------ personas nuevas (AIRCRAFT)
ws = wb['AIRCRAFT']
modelo_adm = next(p for p in P if p['grupo'] == 'Administrativo' and NR(p['rut']) == NR('13.715.053-0'))
nuevos = []
for r in nuevos_aircraft:
    ap, no, rut = C(r, 'B'), C(r, 'C'), C(r, 'D')
    # RUT de la base sin número (Belmar): se completa
    sin = next((p for p in P if not NR(p['rut']) or 'SIN RUT' in str(p['rut'])), None)
    if sin and sin['apellido'].strip().lower() == str(ap).strip().lower():
        cambios.append({'persona': quien(sin), 'campo': 'RUT', 'antes': sin['rut'], 'ahora': rut}); sin['rut'] = rut; idx[NR(rut)] = sin; continue
    dup = next((p for p in P if p['apellido'].strip().lower() == str(ap).strip().lower() and p['nombre'].strip().lower() == str(no).strip().lower()), None)
    if dup:
        informes.append(f'Fila {r}: {ap} {no} {rut} repite a {quien(dup)} con otro RUT (probable error de tipeo en la planilla): no se agregó'); continue
    if C(r, 'F') not in ('x', 'Engineer', None):
        informes.append(f'Fila {r}: {ap} {no} {rut} ({C(r, "F")}) es nuevo y no es administrativo: revisar antes de agregar'); continue
    p = {'rut': rut.upper() if rut.endswith('k') else rut, 'apellido': ap, 'nombre': no, 'puesto': 'Administrativo',
         'area': {'administration': 'Administración', 'Engineer': 'Ingeniería'}.get(C(r, 'E'), C(r, 'E')),
         'estado': 'Activo', 'grupo': 'Administrativo', 'tipoLic': 'x', 'nLic': 'x', 'vencLic': 'N/A',
         'generales': {}, 'oneTime': copy.deepcopy(modelo_adm['oneTime']), 'aeronaves': [], 'operadores': [], 'nv4': [], 'ndt': [], 'cmm': [],
         'cursosEsp': None, 'obs': [], 'opsAll': {}, 'ojt': copy.deepcopy(modelo_adm['ojt'])}
    for col, key in GEN[:4]:
        p['generales'][key] = C(r, col) if isd(C(r, col)) else None
    for k in ('Familiarización', 'Inglés', 'TICA'):
        p['generales'][k] = C(r, dict((b, a) for a, b in GEN)[k]) if isd(C(r, dict((b, a) for a, b in GEN)[k])) else ('N/A' if k != 'Familiarización' else None)
    for op, cursos in OPS:
        p['opsAll'][op] = {cu: (opval(op, C(r, col)) if C(r, col) is not None else 'N/A') for col, cu in cursos}
        if any(isd(v) for v in p['opsAll'][op].values()):
            p['operadores'].append({'operador': op, 'cursos': [{'curso': cu, 'valor': p['opsAll'][op][cu]} for _, cu in cursos]})
    P.append(p); idx[NR(rut)] = p; nuevos.append(quien(p))
    cambios.append({'persona': quien(p), 'campo': '(persona)', 'antes': None, 'ahora': 'agregada'})

# quienes ya no están en la planilla
todos = set(vistos)
for sh, col, r0 in [('NDT', 3, 5), ('WORKSHOP', 4, 6)]:
    w = wb[sh]
    todos |= {NR(w.cell(r, col).value) for r in range(r0, w.max_row + 1) if w.cell(r, col).value}
ausentes = [quien(p) for p in P if NR(p['rut']) not in todos]
for r, n, ap, rut in filas_dup:
    pass

# aeronaves definidas en la plataforma sin columna en la planilla (A220, A330): quedan en la ficha, vacías
AC_PLATAFORMA = ['Airbus A319/A320/A321', 'Airbus A220', 'Airbus A330', 'Boeing 737NG', 'Boeing 737 MAX', 'Boeing 767', 'BAe146']
for p in P:
    if 'acAll' in p:
        p['acAll'] = {ac: p['acAll'].get(ac, {'nivel': None, 'venc': None}) for ac in AC_PLATAFORMA} | {k: v for k, v in p['acAll'].items() if k not in AC_PLATAFORMA}

fecha = val(wb['AIRCRAFT']['I3'].value)
base['fuente'] = xlsx.split('/')[-1]
base['actualizado'] = f"Actualizado al {'-'.join(reversed(fecha.split('-')))}   ·   Fechas = vencimiento   ·   Solo personal activo"
json.dump(base, open(out_base, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump({'cambios': cambios, 'conflictos': conflictos, 'informes': informes, 'nuevos': nuevos, 'ausentes': ausentes,
           'filas_repetidas_planilla': [list(map(str, x)) for x in filas_dup]}, open(out_diff, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{len(cambios)} cambios · {len(conflictos)} conflictos (no aplicados) · {len(nuevos)} nuevas · {len(ausentes)} ausentes · {len(informes)} avisos')
