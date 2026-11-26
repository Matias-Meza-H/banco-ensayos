"""05. Evidence II - Calibration Control, Sharklet SRM 57-31-23: control paralelo de las herramientas
calibrables del QC-020A (YES), con los datos del maestro de herramientas copiados tal cual.
Uso: python3 cal_control_sharklet.py <scratchpad>"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from xlsx_xml import Libro, excel_serial, area_impresion, anchos
S = sys.argv[1]
IDS = ['ID597', 'ID272', 'ID273', 'ID682', 'ID518', 'ID340', 'ID496', 'ID016', 'ID271', 'ID658']
D = json.load(open(S + '/build/data.json'))
cal = {}
for c in D['cal']:
    if c.get('id') in IDS and c['id'] not in cal:
        cal[c['id']] = c
PER = {'1 año': '1 YEAR', '6 meses': '6 MONTH', '3 meses': '3 MONTH', '2 años': '2 YEAR'}
L = Libro(S + '/in3/cal.xlsx'); h = L.hoja()
h.set('A1', 'CALIBRATION CONTROL SRM 57-31-23 (SHARKLET)', h.estilo('A1'))
est = {c: h.estilo(f'{c}6') for c in 'ABCDEFGHIJKL'}
# firma (filas 11-13 de la plantilla): se mueve para dejar 1 fila vacía entre la tabla y la firma
ult = 3 + len(IDS) - 1; nuevo = ult + 2
if nuevo > 11:
    h.insertar_filas(7, nuevo - 11, 6)
elif nuevo < 11:
    h.borrar_filas(nuevo, 11 - nuevo)
filas = []
for k, i in enumerate(IDS):
    c = cal[i]; r = 3 + k
    v = [c['id'], c.get('sn', ''), c.get('pn', ''), c.get('desc', ''), c.get('mfr', ''), c.get('loc', ''), c.get('st', ''),
         PER.get(c.get('per', ''), c.get('per', '')), excel_serial(c['last']) if c.get('last') else '',
         excel_serial(c['next']) if c.get('next') else '', c.get('by', ''), c.get('cert', '')]
    for col, x in zip('ABCDEFGHIJKL', v):
        h.set(f'{col}{r}', x, est[col])
    if not c.get('cert'):   # sin certificado en el maestro: se marca para confirmar
        h.set(f'L{r}', 'TBC', L.con_relleno(est['L'], 'FFF2CC'))
    filas.append(c)
h.ajustar_dimension('L'); area_impresion(L, h, 'L')
anchos(h, {'B': 14, 'C': 22, 'D': 32, 'E': 21, 'F': 17, 'I': 20, 'J': 20, 'L': 18})
out = S + '/out/05._Evidence_II_-_Calibration_Control_Sharklet_SRM_57-31-23_BORRADOR.xlsx'
L.guardar(out); print(out, len(IDS), 'herramientas')
for c in filas: print(c['id'], c.get('last'), c.get('next'), c.get('per'), c.get('cert'))
