"""QC-020A Sharklet SRM 57-31-23 sobre la plantilla, editando el XML (conserva logo, encabezado y pie).
Uso: python3 qc020a_sharklet.py <scratchpad>"""
import sys, math, os
sys.path.insert(0, os.path.dirname(__file__))
from xlsx_xml import Libro, ajustar_a_ancho
from datos_sharklet import A, B
S = sys.argv[1]
L = Libro(S + '/in2/qc020a.xlsx'); h = L.hoja()
TBC, NO = 'FFF2CC', 'FCE4D6'

def alto(textos):  # textos: [(texto, ancho_col)] -> alto de fila estimado (Arial, ajuste de texto)
    ln = max(sum(max(1, math.ceil(len(p) / (w * 0.85))) for p in str(t).split('\n')) for t, w in textos if t)
    return max(21, round(ln * 13.5 + 8, 2))

# Encabezado
h.set('A3', 57, h.estilo('A3')); h.set('B3', 'Airbus', h.estilo('B3'))
h.set('C3', 'Sharklet (LH & RH)\nComposite panels / Tip Cap', h.estilo('C3'))
h.set('D3', 'SRM 57-31-23', h.estilo('D3')); h.set('F3', 'Rev. Date: Aug 01/2025', h.estilo('F3'))
h.set('A5', 'TBC - Sharklet panel P/N (refer to SRM Chapter 57-31-23 Identification)', L.con_relleno(h.estilo('A5'), TBC))

# Tabla A (filas 9..)
cache = {}
def st(ref, color):
    s = h.estilo(ref)
    if not color: return s
    k = (s, color)
    if k not in cache: cache[k] = L.con_relleno(s, color)
    return cache[k]
r = 9
for d, o, e, av, u in A:
    color = NO if av == 'NO' else TBC if av == 'TBC' else None
    for col, v in zip('ABCDEF', (d, o, e, av, u, None)):
        h.set(f'{col}{r}', v, st(f'{col}{r}', color))
    h.alto(r, alto([(d, 26.6), (o, 25), (e, 26), (u, 41.9)])); r += 1
finA = r - 1
# Tabla B (filas 107..)
r = 107
for d, o, a, u in B:
    for col, v in zip('ABCD', (d, o, a, u)):
        h.set(f'{col}{r}', v, h.estilo(f'A{r}') if col == 'C' else h.estilo(f'{col}{r}'))  # C sin ajuste de texto en la plantilla
    h.alto(r, alto([(d, 26.6), (o, 25), (a, 26), (u, 59.9)])); r += 1
finB = r - 1

# Compactar: de abajo hacia arriba para no mover lo que falta borrar
h.borrar_filas(140, 2)                      # filas vacías bajo la firma
h.borrar_filas(finB + 1, 133 - finB)        # Tabla B sin usar (queda la fila 134 como separador)
h.borrar_filas(finA + 1, 103 - finA)        # Tabla A sin usar (queda la fila 104 como separador)
h.alto(finA + 1, 15); h.alto(finA + 1 + 2 + len(B) + 1, 15)   # separadores de 1 fila
h.ajustar_dimension("F"); ajustar_a_ancho(h)
out = S + '/out/03._Evidence_II_-_QC-020A_Sharklet_SRM_57-31-23_BORRADOR.xlsx'
L.guardar(out); print(out, len(A), 'herramientas,', len(B), 'materiales')
