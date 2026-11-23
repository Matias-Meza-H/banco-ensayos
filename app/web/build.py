#!/usr/bin/env python3
"""Arma web/dist/index.template.html desde web/src (mismo ensamblado que la plataforma original).

Los datos NO se incrustan aquí: quedan marcadores (__STATIC__, __IMPORT__, __PERS_DATA__, __VERSIONES__,
__AUTHS__, __QC021__, __LOCALCFG__) que el servidor llena desde la base SQLite en cada carga.
"""
import base64
import json
import os

W = os.path.dirname(os.path.abspath(__file__))
src = lambda *p: open(os.path.join(W, 'src', *p), encoding='utf-8').read()

logo = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(W, 'src', 'logo.png'), 'rb').read()).decode()
t = src('template.html')
a = src('app.js').replace('const VIEWS = ', src('faa.js') + '\n' + src('sys.js') + '\n' + src('lect.js') + '\n' + src('export.js') + '\nconst VIEWS = ', 1)
lib = open(os.path.join(W, 'vendor', 'pdf-lib-1.17.1.min.js'), encoding='utf-8').read().replace('�', '\\uFFFD')
local = open(os.path.join(W, 'claude-local.js'), encoding='utf-8').read()

# ---- módulo Personal (shadow DOM), igual que la plataforma original
pt = src('personal', 'template.html')
css = pt[pt.index('<style>') + 7:pt.index('</style>')].replace(':root', ':host').replace('\nbody{', '\n:host{display:block;')
css += '\n:host([hidden]){display:none!important}[hidden]{display:none!important}\nheader{background:none;color:var(--muted);padding:12px 24px 0}header h1{display:none}header p{margin:0;opacity:1}'
body = pt[pt.index('<body>') + 6:pt.index('<script>/*__PDFLIB__*/</script>')]
js = pt[pt.index('<script>/*__PDFLIB__*/</script>') + len('<script>/*__PDFLIB__*/</script>'):]
js = js[js.index('<script>') + 8:js.rindex('</script>')]
js = js.replace('/*__REPORT__*/', src('personal', 'report.js')).replace('/*__EDIT__*/', src('personal', 'edit.js')).replace('__DATA__', '__PERS_DATA__')
assert js.count('const $ = s => document.querySelector(s);') == 1
js = js.replace('const $ = s => document.querySelector(s);', 'const $ = s => ROOT.querySelector(s);').replace('document.querySelectorAll(', 'ROOT.querySelectorAll(')
mod = "(function(){ const ROOT = document.getElementById('persHost').attachShadow({mode:'open'}); ROOT.innerHTML = " + json.dumps('<style>' + css + '</style>' + body).replace('</', '<\\/') + "; const ROOTQ = s => ROOT.querySelectorAll(s);\n" + js + "\n})();"

for ph in ('/*__PDFLIB__*/', '/*__APP__*/', '__STATIC__', '__IMPORT__', '__LOGO__'):
    assert ph in t, ph
out = t.replace('/*__PDFLIB__*/', lib).replace('/*__APP__*/', a)
out = out.replace('<script>\nconst S = __STATIC__;', '<script>window.APAS_LOCAL = __LOCALCFG__;</script>\n<script>\n' + local + '\n</script>\n<script>\nconst S = __STATIC__;', 1)
assert 'window.APAS_LOCAL = __LOCALCFG__' in out
out = out.replace('</body>', '<script>\n' + mod + '\n</script>\n</body>').replace('__LOGO__', logo)
os.makedirs(os.path.join(W, 'dist'), exist_ok=True)
open(os.path.join(W, 'dist', 'index.template.html'), 'w', encoding='utf-8').write(out)
print('web/dist/index.template.html', len(out), 'bytes')
