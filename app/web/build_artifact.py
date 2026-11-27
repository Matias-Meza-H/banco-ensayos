#!/usr/bin/env python3
"""Arma la versión ARTEFACTO de claude.ai (una sola página con todo, sin contraseña).

  python3 web/build_artifact.py <datos_completos.json> <herramientas data.json> <salida.html>

Diferencias con la versión local (web/build.py):
  * usa las capacidades reales de claude.ai (db, assets, downloads, user, sample): no incluye claude-local.js;
  * los datos estáticos (catálogo, semillas, personal base, versiones, autoridades, QC-021) se incrustan desde la
    exportación verificada, igual que hacía la plataforma 01.03.02;
  * Control de Herramientas va dentro de la misma página, como módulo en un shadow DOM (#herrHost, rutas #h-…),
    con sus colecciones herr_edits / herr_rel / herr_log y el vínculo por P/N calculado en el navegador;
  * sin pantalla de ingreso: el artefacto es privado; lo ven solo el dueño y quienes él invite con "Compartir",
    y solo el dueño escribe (reglas de la base).
"""
import base64
import json
import os
import re
import sys

W = os.path.dirname(os.path.abspath(__file__))
APP_VER = '02.03.00'
LINE_0200 = ['02.00.00', '2026-11-23', 'Diseño: la plataforma deja de ser un artefacto de claude.ai y pasa a ser una aplicación web local (servidor propio + base SQLite), en la misma aplicación que Control de Herramientas. Accesos: sin cuentas ni contraseñas; quien opera se identifica con un nombre que queda en el registro de modificaciones (modelo de permisos por usuario documentado para el futuro). Datos: importación verificada de la exportación 01.03.02 (conteos, CRC32, integridad referencial, textos DGAC byte a byte y cálculos); lectura con Claude vía API de Anthropic (clave en el entorno) o desde Claude Code; herramientas de los expedientes vinculables por P/N al maestro de herramientas.']
LINE_0201 = ['02.01.00', '2026-11-24', 'Accesos: la plataforma vuelve a publicarse como un artefacto privado de claude.ai, ahora con todo en una sola página y sin contraseña: Capacidades, Personal y capacitación, Control de Herramientas y Sistema. Solo la ve el dueño y quienes él invite con “Compartir”; solo el dueño modifica datos. Control de Herramientas queda como módulo con su ficha vinculada por P/N a los expedientes. Datos: migración verificada de la exportación del 23-11-2026 (43 proyectos, 18 evidencias con sus archivos, 17 revisiones, lectura pendiente de P001, registro, fotos de avance, personal y catálogo).']
LINE_0202 = ['02.02.00', '2026-11-26', 'Evidencias: la ficha de cada herramienta y equipo suma “Uso común” (texto para la columna 11. USE del QC-020), etiquetas de uso (#composite, #metal, #estructura, #curado…, más etiquetas libres) y foto como evidencia física (liviana: JPEG máx. 1800 px). Se busca por #etiqueta, se filtra y se usa como criterio en Fabricación de archivos. Datos: primeras herramientas etiquetadas desde el 04 Evidences CMM 71-61-00.']
LINE_020201 = ['02.02.01', '2026-11-27', 'Datos: base de personal actualizada con el Master List - Training Control al 26-11-2026, campo por campo y con la misma estructura: 66 valores (cursos generales, niveles de aeronave, RUT faltante) y 7 personas nuevas (administración / ingeniería). No se aplicaron las fechas que retroceden, los niveles que bajan ni los motores que se pierden (quedan informados para revisión); nadie se borró.']
LINE_0203 = [APP_VER, '2026-11-27', 'Personal: las fichas suman las aeronaves Airbus A220 (motor PW1500G) y Airbus A330 (motores CF6-80E, PW4000, RR Trent 700), con nivel, vencimiento y motores, en la ficha, la edición, los listados con filtro por aeronave/motor, el Excel y la exportación. Datos: quedan vacías (sin curso) en todas las fichas hasta que se carguen.']


def sub(t, old, new, n=1):
    c = t.count(old)
    assert c == n, (old[:90], c)
    return t.replace(old, new)


def main(datos, herr, out):
    D = json.load(open(datos, encoding='utf-8'))
    H = json.load(open(herr, encoding='utf-8'))
    src = lambda *p: open(os.path.join(W, 'src', *p), encoding='utf-8').read()
    js = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
    logo = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(W, 'src', 'logo.png'), 'rb').read()).decode()

    # ------------------------------------------------ plataforma
    sysjs = src('sys.js')
    sysjs = sub(sysjs, "const APP_VER = '02.00.00';", f"const APP_VER = '{APP_VER}';")
    sysjs = sub(sysjs, "chip('Ver. ' + APP_VER + ' · local', 's-info')", "chip('Ver. ' + APP_VER, 's-info')")
    sysjs = sub(sysjs, "Opera: <b>${esc(SESSION.name)}</b> · versión local</span>", "Opera: <b>${esc(SESSION.name)}</b> · sin contraseña</span>")
    sysjs = sub(sysjs, "ok('Aplicación local sin cuentas', `Servidor solo en este equipo (127.0.0.1). Opera: ${SESSION.name}. Cada escritura queda en el registro con ese nombre.`);",
                "ok('Artefacto privado sin contraseña', `Lo ven solo el dueño y quienes él invite con Compartir de Claude; solo el dueño modifica datos. Opera: ${SESSION.name}.`);")
    sysjs = sub(sysjs, "(window.APAS_LOCAL && window.APAS_LOCAL.claude && window.APAS_LOCAL.claude.disponible) ? ok('Lectura con Claude disponible', 'API de Anthropic · modelo ' + window.APAS_LOCAL.claude.modelo) : wr('Lectura con Claude no disponible en la web', (window.APAS_LOCAL && window.APAS_LOCAL.claude && window.APAS_LOCAL.claude.motivo || '') + ' Alternativa: pedir la lectura a Claude Code (ver README).');",
                "RT.sample ? ok('Lectura con Claude disponible', 'Capacidad de claude.ai en esta página') : wr('Lectura con Claude no disponible en esta vista', 'Abre la página directamente en claude.ai con tu cuenta.');")
    sysjs = sub(sysjs, "chip('Versión local sin cuentas', 's-info')", "chip('Sin contraseña · artefacto privado', 's-info')")
    sysjs = sub(sysjs, "Esta versión corre en un equipo local (servidor en 127.0.0.1) y <b>no tiene cuentas ni contraseñas</b>. Quien opera se identifica con su nombre (arriba a la derecha, “Cambiar nombre”); ese nombre queda en cada línea del registro de modificaciones. Lo que carga Claude desde la terminal queda con el actor <b>claude (Code)</b> y el sello 🤖.",
                "Esta plataforma es un <b>artefacto privado de claude.ai, sin contraseña</b>. Solo la ven tu cuenta y las personas que invites con el botón <b>Compartir</b> de Claude; ellas solo pueden ver: <b>solo el dueño modifica datos y archivos</b> (reglas de la base). Quien opera aparece arriba a la derecha (“Cambiar nombre”) y ese nombre queda en cada línea del registro. Lo que carga Claude desde un chat queda con el sello 🤖.")
    sysjs = sub(sysjs, "a.hidden = a.dataset.m !== 'sys' && a.dataset.m !== 'ext' && !ok(a.dataset.m); });",
                "a.hidden = a.dataset.m !== 'sys' && a.dataset.m !== 'herr' && !ok(a.dataset.m); });")
    sysjs = sub(sysjs, "$('#persHost').hidden = mod !== 'pers';", "$('#persHost').hidden = mod !== 'pers'; $('#herrHost').hidden = mod !== 'herr';")

    appjs = src('app.js')
    appjs = sub(appjs, "· Ver. ${APP_VER} (local)`;", "· Ver. ${APP_VER}`;")
    appjs = sub(appjs, "  let mod = PERS_V.includes(h) ? 'pers' : h === 'sistema' ? 'sys' : 'cap';",
                "  let mod = h.startsWith('h-') ? 'herr' : PERS_V.includes(h) ? 'pers' : h === 'sistema' ? 'sys' : 'cap';")
    appjs = sub(appjs, "if (SESSION.u && mod !== 'sys' && !SESSION.mods.includes(mod)){", "if (SESSION.u && mod !== 'sys' && mod !== 'herr' && !SESSION.mods.includes(mod)){")
    # vínculo por P/N: lo calcula el módulo Herramientas en el navegador
    appjs = sub(appjs, "  try { const j = await (await fetch('/api/herramientas/indice')).json(); const m = new Map();",
                "  try { if (!window.__HERR || !store.proj.size){ HERR.at = 0; return; } const j = {vinculos: window.__HERR.indice([...store.proj.values()])}; const m = new Map();")
    appjs = sub(appjs, "  if (!force && Date.now() - HERR.at < 30000) return; HERR.at = Date.now();", "  HERR.at = Date.now(); // en el artefacto el cruce es local e inmediato")
    appjs = sub(appjs, "<a class=\"lnk\" target=\"_blank\" href=\"/herramientas/?q=${encodeURIComponent(v.pn)}#${v.cal ? 'calibrables' : 'no-calibrables'}\">ver ↗</a>",
                "<a class=\"lnk\" href=\"#h-${v.cal ? 'calibrables' : 'no-calibrables'}\" data-q=\"${esc(v.pn)}\" onclick=\"window.__HERR && window.__HERR.buscar(this.dataset.q)\">ver en Control de Herramientas</a>")
    # al abrir un expediente desde la ficha de una herramienta
    appjs = sub(appjs, "try { const op = localStorage.getItem('apas_open_proj'); if (op){ eCur = op; localStorage.removeItem('apas_open_proj'); } } catch(e){}",
                "window.__abrirProyecto = id => { eCur = id; editMode = false; location.hash = 'expedientes'; render(); };")

    a = appjs.replace('const VIEWS = ', src('faa.js') + '\n' + sysjs + '\n' + src('lect.js') + '\n' + src('export.js').replace("plataforma:'Plataforma de Calidad · APAS Chile (local)', artefacto:'aplicación local (Claude Code)',", "plataforma:'Plataforma de Calidad · APAS Chile', artefacto:'artefacto privado 02.01 (todo en uno)',").replace('(local Ver. ${APP_VER})', '(Ver. ${APP_VER})') + '\nconst VIEWS = ', 1)
    lib = open(os.path.join(W, 'vendor', 'pdf-lib-1.17.1.min.js'), encoding='utf-8').read().replace('�', '\\uFFFD')

    # ------------------------------------------------ módulo Personal (igual que la plataforma)
    pt = src('personal', 'template.html')
    css = pt[pt.index('<style>') + 7:pt.index('</style>')].replace(':root', ':host').replace('\nbody{', '\n:host{display:block;')
    css += '\n:host([hidden]){display:none!important}[hidden]{display:none!important}\nheader{background:none;color:var(--muted);padding:12px 24px 0}header h1{display:none}header p{margin:0;opacity:1}'
    body = pt[pt.index('<body>') + 6:pt.index('<script>/*__PDFLIB__*/</script>')]
    pj = pt[pt.index('<script>/*__PDFLIB__*/</script>') + len('<script>/*__PDFLIB__*/</script>'):]
    pj = pj[pj.index('<script>') + 8:pj.rindex('</script>')]
    pers = dict(D['personal_base'])
    pj = pj.replace('/*__REPORT__*/', src('personal', 'report.js')).replace('/*__EDIT__*/', src('personal', 'edit.js')).replace('__DATA__', js(pers))
    pj = sub(pj, 'const $ = s => document.querySelector(s);', 'const $ = s => ROOT.querySelector(s);').replace('document.querySelectorAll(', 'ROOT.querySelectorAll(')
    mod_pers = "(function(){ const ROOT = document.getElementById('persHost').attachShadow({mode:'open'}); ROOT.innerHTML = " + json.dumps('<style>' + css + '</style>' + body).replace('</', '<\\/') + "; const ROOTQ = s => ROOT.querySelectorAll(s);\n" + pj + "\n})();"

    # ------------------------------------------------ módulo Control de Herramientas
    ht = open(os.path.join(W, 'herramientas', 'index.template.html'), encoding='utf-8').read()
    hcss = ht[ht.index('<style>') + 7:ht.index('</style>')]
    hcss = hcss.replace(':root:not([data-theme="light"])', ':host').replace(':root[data-theme="dark"]', ':host-context([data-theme="dark"])').replace(':root', ':host')
    hcss = hcss.replace('\nbody{', '\n:host{display:block;')
    hcss += '\n:host([hidden]){display:none!important}\nheader{display:none!important}nav.views{background:var(--bg);border-bottom:1px solid var(--line)}nav.views a{color:var(--muted);margin-top:0}nav.views a.on{background:none;color:var(--accent);box-shadow:inset 0 -3px 0 var(--accent)}'
    hbody = ht[ht.index('</head><body>') + len('</head><body>'):ht.index('<script>window.APAS_LOCAL')]
    for v in ['dashboard', 'calibrables', 'no-calibrables', 'archivos', 'vencimientos']:
        hbody = sub(hbody, f'href="#{v}"', f'href="#h-{v}"')
    hbody = hbody.replace('__LOGO__', logo)
    hjs = ht[ht.index('<script>\nconst D = __DATA__;') + 8:ht.rindex('</script>')]
    hjs = sub(hjs, 'const D = __DATA__;', 'const D = ' + js(H) + ';')
    hjs = sub(hjs, 'const $ = (s, r = document) => r.querySelector(s);', 'const $ = (s, r = ROOT) => r.querySelector(s);')
    hjs = hjs.replace('document.querySelectorAll(', 'ROOT.querySelectorAll(').replace('document.querySelector(', 'ROOT.querySelector(')
    for c in ('edits', 'rel', 'log'):
        hjs = hjs.replace(f"collection('{c}')", f"collection('herr_{c}')")
    hjs = sub(hjs, "  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';",
              "  const h = location.hash.slice(1); if (!h.startsWith('h-')) return; const v = VIEWS.includes(h.slice(2)) ? h.slice(2) : 'dashboard';")
    hjs = sub(hjs, "function go(v){ if (location.hash.slice(1) === v) route(); else location.hash = v; }",
              "function go(v){ if (location.hash.slice(1) === 'h-' + v) route(); else location.hash = 'h-' + v; }")
    hjs = sub(hjs, "{ const q0 = new URLSearchParams(location.search).get('q'); if (q0){ ['cal','nc'].forEach(k => LISTS[k].search(q0)); } }\n", '')
    # "Expedientes que usan este P/N": se calcula con los proyectos de la plataforma (misma página)
    hjs = sub(hjs, "  fetch('/api/herramientas/expedientes?pn=' + encodeURIComponent(it.pn || '')).then(r => r.json()).then(L => { const el = $('#fExp'); if (!el) return;",
              "  Promise.resolve(window.__HERR.expedientes(it._pnN)).then(L => { const el = $('#fExp'); if (!el) return;")
    hjs = sub(hjs, "el.querySelectorAll('[data-proj]').forEach(a => a.onclick = () => { try { localStorage.setItem('apas_open_proj', a.dataset.proj); } catch(e){} }); })",
              "el.querySelectorAll('[data-proj]').forEach(a => a.onclick = e => { e.preventDefault(); closeFicha(); window.__abrirProyecto && window.__abrirProyecto(a.dataset.proj); }); })")
    hjs += r"""
// ---- puente con la Plataforma (misma página): vínculo por P/N
window.__HERR = {
  buscar(q){ ['cal','nc'].forEach(k => LISTS[k].search(q)); },
  _proyectos: () => (typeof window.__platProyectos === 'function' ? window.__platProyectos() : []),
  _resumen(n){ const u = [...CAL, ...NC].filter(i => i._pnN === n), cal = u.filter(i => i._kind === 'cal');
    return {cal: cal.length, disp: cal.filter(available).length, enCal: cal.filter(i => i._cust === 'En calibración').length, nc: u.filter(i => i._kind === 'nc').length}; },
  indice(projs){ const out = [];
    for (const p of projs) for (const s of p.sections || []) { if (s.key !== 'tools' && s.key !== 'toolsTask') continue;
      for (const it of s.items || []) for (const pn of [it.pn, ...String(it.pnAlt || '').split(/\s*\/\s*/)].filter(Boolean)) {
        const n = normPN(pn); if (!n || n.startsWith('W/O')) continue; const r = this._resumen(n), alts = (REL.get(n) || []).filter(x => [...CAL, ...NC].some(i => i._pnN === x.o)).map(x => ({pn: x.o, t: x.t}));
        if (r.cal || r.nc || alts.length) out.push({projId: p.id, itemId: it.id, pn, pnN: n, ...r, intercambiables: alts}); } }
    return out; },
  expedientes(n){ const rel = new Set([n, ...(REL.get(n) || []).map(x => x.o)]); return this.indice(this._proyectos()).filter(v => rel.has(v.pnN)); },
};
route();
"""
    mod_herr = "(function(){ const ROOT = document.getElementById('herrHost').attachShadow({mode:'open'}); ROOT.innerHTML = " + json.dumps('<style>' + hcss + '</style>' + hbody).replace('</', '<\\/') + ";\n" + hjs + "\n})();"

    # ------------------------------------------------ ensamblado
    t = src('template.html')
    t = sub(t, '<a href="/herramientas/" data-m="ext">Control de Herramientas ↗</a>', '<a href="#h-dashboard" data-m="herr">Control de Herramientas</a>')
    t = sub(t, '<div id="persHost" hidden></div>', '<div id="persHost" hidden></div>\n<div id="herrHost" hidden></div>')
    S = {'lists': D['catalogo']['listas_faa'], 'dgacList': D['catalogo']['lista_dgac'], 'entries': D['catalogo']['entries'], 'articles': D['catalogo']['articles']}
    versiones = [LINE_0203, LINE_020201, LINE_0202, LINE_0201, LINE_0200] + D['versiones']
    shim = """<script>
// Artefacto sin contraseña: quien opera = nombre guardado en este navegador o el nombre de la cuenta de Claude.
window.APAS_ACTOR = () => { try { return localStorage.getItem('apas_actor') || window.__claudeName || 'propietario'; } catch(e){ return window.__claudeName || 'propietario'; } };
window.APAS_SET_ACTOR = n => { try { localStorage.setItem('apas_actor', n); } catch(e){} };
window.__platProyectos = () => (typeof store !== 'undefined' ? [...store.proj.values()] : []);
(async () => { try { if (!window.claude) return; const u = await window.claude.use('user'); const me = u && await u.me(); let saved = null; try { saved = localStorage.getItem('apas_actor'); } catch(e){}
  if (me && me.name && !saved){ window.__claudeName = me.name; if (typeof SESSION !== 'undefined' && SESSION.u){ Object.assign(SESSION, {u: me.name, name: me.name}); paintUser(); } } } catch(e){} })();
</script>
"""
    out_html = t.replace('/*__PDFLIB__*/', lib).replace('/*__APP__*/', a)
    rep = {'__STATIC__': js(S), '__IMPORT__': js(D['semilla_proyectos']), '__VERSIONES__': js(versiones), '__AUTHS__': js(D['autoridades']),
           '__QC021__': js(D['qc021_preguntas']), '__LOGO__': logo}
    out_html = re.sub('|'.join(map(re.escape, rep)), lambda m: rep[m.group(0)], out_html)
    out_html = out_html.replace("La versión local no usa cuentas.", "Esta versión no usa cuentas ni contraseñas.").replace("logAct('ingreso', 'sesión', 'aplicación local')", "logAct('ingreso', 'sesión', 'artefacto sin contraseña')")
    out_html = sub(out_html, '<script>\nconst S = ', shim + '<script>\nconst S = ')
    # proyectos cargados -> recalcula vínculos de herramientas
    out_html = out_html.replace('</body>', '<script>\n' + mod_pers + '\n</script>\n<script>\n' + mod_herr + '\n</script>\n</body>')
    assert '__' + 'LOCALCFG__' not in out_html and '/api/herramientas' not in out_html and 'claude-local' not in out_html
    open(out, 'w', encoding='utf-8').write(out_html)
    print(out, len(out_html), 'bytes')


if __name__ == '__main__':
    main(*sys.argv[1:4])
