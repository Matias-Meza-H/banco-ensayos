import openpyxl, json, re, sys, datetime, collections
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
def s(v):
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): v = int(v)
    if isinstance(v, datetime.datetime): return v.strftime('%Y-%m-%d')
    return re.sub(r'\s+', ' ', str(v)).strip()
def d(v):
    if isinstance(v, datetime.datetime): return v.strftime('%Y-%m-%d')
    return ''
# location names
locmap = {}
for r in wb['Location Control'].iter_rows(values_only=True):
    v = [x for x in r if x is not None]
    if len(v) >= 2 and str(v[0]).startswith('NSV') and not str(v[1]).startswith('HTA'):
        locmap[s(v[0])] = s(v[1])
# software
sw = {}
for r in wb['Control Software'].iter_rows(min_row=4, values_only=True):
    if r[0] and r[12] not in (None, ''): sw[s(r[0])] = s(r[12])
PER = {'1 YE':'1 año','1YE':'1 año','6 MO':'6 meses','3 MO':'3 meses','2 YE':'2 años','3 YE':'3 años','1 MO':'1 mes','12 MO':'1 año','1 AÑO':'1 año'}
def per(v):
    t = s(v).upper()
    if not t: return ''
    if 'NO REQUIERE' in t: return 'No requiere'
    return PER.get(t, s(v))
cal = []
seen = collections.Counter()
for i, r in enumerate(wb['Her Cal'].iter_rows(min_row=3, values_only=True)):
    if not any([r[1], r[3], r[4]]): continue
    idv = s(r[1])
    k = 'C-' + (re.sub(r'[^A-Za-z0-9_-]', '', idv) or 'r%d' % i)
    seen[k] += 1
    if seen[k] > 1: k += '-%d' % seen[k]
    x = dict(k=k, asset=s(r[0]), id=idv, sn=s(r[2]), pn=s(r[3]), desc=s(r[4]), mfr=s(r[5]), sw=s(r[6]) or sw.get(idv, ''),
             loc=s(r[7]), st='SERV' if s(r[8]).upper() == 'SERV' else 'NO SERV', per=per(r[9]), last=d(r[10]), next=d(r[11]),
             by=s(r[12]), cert=s(r[13]), ach=s(r[15]), lastBy=s(r[16]), check=s(r[17]), fam=s(r[18]), prog='Calibración')
    cal.append({a: b for a, b in x.items() if b != ''})
for i, r in enumerate(wb['Mant Prevent'].iter_rows(min_row=4, values_only=True)):
    if not any([r[3], r[4], r[5]]): continue
    idv = s(r[2]).strip('- ')
    if r[8] is None and s(r[6]).startswith('ACH'):
        x = dict(k='M-%d' % i, pn=s(r[2]), desc=s(r[3]), loc=s(r[5]), ach=s(r[6]), prog='Mant. preventiva')
        cal.append({a: b for a, b in x.items() if b != ''}); continue
    x = dict(k='M-%d' % i, asset=s(r[1]), id=idv, sn=s(r[3]), pn=s(r[4]), desc=s(r[5]), mfr=s(r[6]), loc=s(r[7]),
             st='SERV' if s(r[8]).upper() == 'SERV' else 'NO SERV', per=per(r[9]), last=d(r[10]), next=d(r[11]),
             by=s(r[12]), cert=s(r[13]).replace('-0-', ''), ach=s(r[14]), prog='Mant. preventiva')
    cal.append({a: b for a, b in x.items() if b != ''})
nc = []
seen = collections.Counter()
rels = {}
def pns(v):
    t = s(v).replace('\n', ' ')
    if not t or t.upper() in ('N/A', 'NA', '-'): return []
    return [p for p in re.split(r'[\s/,;]+', t) if len(p) >= 3 and p.upper() not in ('N/A', 'O', 'OR', 'Y')]
for i, r in enumerate(wb['Her No Cal'].iter_rows(min_row=5, values_only=True)):
    if not any([r[2], r[3]]) or not isinstance(r[3], str) and r[2] is None: continue
    ach = s(r[6])
    k = 'N-' + (re.sub(r'[^A-Za-z0-9_-]', '', ach) or 'r%d' % (i + 5))
    seen[k] += 1
    if seen[k] > 1: k += '-%d' % seen[k]
    sn = s(r[1]); 
    if sn.upper() in ('S/N', 'NSN'): sn = ''
    x = dict(k=k, sn=sn, pn=s(r[2]), desc=s(r[3]), oem=s(r[4]), loc=s(r[5]), ach=ach, qty=s(r[7]), apl=s(r[9]), doc=s(r[10]),
             alt=s(r[11]) if s(r[11]).upper() != 'N/A' else '', ci=s(r[12]) if s(r[12]) != 'XX' else '', cn=s(r[13]) if s(r[13]).upper() != 'UNAVAILABLE' else '')
    nc.append({a: b for a, b in x.items() if b != ''})
    a = s(r[2]).upper()
    for p in pns(r[11]):
        b = p.upper()
        if a and b != a:
            key = '|'.join(sorted([a, b]))
            rels[key] = dict(a=sorted([a, b])[0], b=sorted([a, b])[1], t='full', src='Excel (Alternative Part)')
json.dump(dict(cal=cal, nc=nc, rels=list(rels.values()), locmap=locmap, fuente='Inventario_de_Herramientas.xlsx'), open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(cal), len(nc), len(rels), len(locmap))
