#!/usr/bin/env python3
"""Servidor local de la Plataforma de Calidad APAS Chile + Control de Herramientas.

  python3 server.py            -> http://127.0.0.1:8765

Solo biblioteca estándar de Python (el paquete `anthropic` es opcional: habilita la lectura con Claude).
Escucha únicamente en 127.0.0.1. No hay cuentas: quien opera se identifica con un nombre (actor) que
queda en el registro de modificaciones.

Variables de entorno: APAS_PORT (8765), APAS_HOST (127.0.0.1), APAS_DATA (app/data), APAS_ACTOR (local),
APAS_CLAUDE, APAS_CLAUDE_MODEL, ANTHROPIC_API_KEY (ver claude_bridge.py).
"""
import json
import mimetypes
import os
import re
import secrets
import sys
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import claude_bridge  # noqa: E402
from store import ALL_COLLECTIONS, ROOT, Store, dumps, now  # noqa: E402

APP_VER = '02.00.00'
VERSION_LINE = [APP_VER, '2026-11-23',
                'Diseño: la plataforma deja de ser un artefacto de claude.ai y pasa a ser una aplicación web local (servidor propio + base SQLite), '
                'en la misma aplicación que Control de Herramientas. Accesos: sin cuentas ni contraseñas; quien opera se identifica con un nombre que queda '
                'en el registro de modificaciones (modelo de permisos por usuario documentado para el futuro). Datos: importación verificada de la '
                'exportación 01.03.02 (conteos, CRC32, integridad referencial, textos DGAC byte a byte y cálculos); lectura con Claude vía API de '
                'Anthropic (clave en el entorno) o desde Claude Code; herramientas de los expedientes vinculables por P/N al maestro de herramientas.']
WEB = os.path.join(ROOT, 'web')
DIST = os.path.join(WEB, 'dist')
STATIC_DIRS = {'/pdfjs/': os.path.join(WEB, 'vendor', 'pdfjs')}
MAX_BODY = 60 * 1024 * 1024
ID_RE = re.compile(r'^[A-Za-z0-9_.:@+~-]{1,200}$')

st = None


def new_id(n=20):
    a = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return ''.join(secrets.choice(a) for _ in range(n))


def bootstrap(store):
    """Registra la versión 02.00.00 en el historial (una sola vez) y deja constancia en el registro."""
    vers = store.static('versiones')
    if vers is not None and (not vers or vers[0][0] != APP_VER):
        store.set_static('versiones', [VERSION_LINE] + vers)
        store.set_doc('log', new_id(), {'act': 'versión', 'at': now_ms(), 'det': f'Plataforma actualizada a {APP_VER} (aplicación local)', 'ref': 'sistema', 'u': 'sistema'})


def now_ms():
    t = time.time()
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(t)) + '.%03dZ' % int((t % 1) * 1000)


def render_index():
    tpl = open(os.path.join(DIST, 'index.template.html'), encoding='utf-8').read()
    js = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
    S = {'lists': st.static('catalogo_listas_faa', {}), 'dgacList': st.static('catalogo_lista_dgac', {}),
         'entries': st.rows('catalogo_entries'), 'articles': st.rows('catalogo_articles')}
    pers = dict(st.static('personal_base_meta', {}) or {}); pers['personas'] = st.rows('personal_personas')
    cfg = {'ver': APP_VER, 'actor': os.environ.get('APAS_ACTOR', 'local'), 'claude': claude_bridge.estado(),
           'importacion': st.meta_get('importacion'), 'vacia': st.is_empty()}
    rep = {'__STATIC__': js(S), '__IMPORT__': js(st.rows('semilla_proyectos')), '__PERS_DATA__': js(pers),
           '__VERSIONES__': js(st.static('versiones', [VERSION_LINE])), '__AUTHS__': js(st.static('autoridades', [])),
           '__QC021__': js(st.static('qc021_preguntas', [])), '__LOCALCFG__': js(cfg)}
    # una sola pasada: el contenido insertado nunca se vuelve a escanear
    return re.sub('|'.join(map(re.escape, rep)), lambda m: rep[m.group(0)], tpl).encode('utf-8')


class H(BaseHTTPRequestHandler):
    server_version = 'APAS/' + APP_VER
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *a):
        if os.environ.get('APAS_QUIET') != '1':
            sys.stderr.write('%s %s\n' % (time.strftime('%H:%M:%S'), fmt % a))

    # ---------------------------------------------------------- respuestas
    def send(self, code, body=b'', ctype='application/json; charset=utf-8', headers=None):
        if isinstance(body, (dict, list)):
            body = dumps(body).encode('utf-8')
        elif isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def err(self, code, msg, ecode='error'):
        self.send(code, {'error': ecode, 'message': msg})

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            raise ValueError('archivo demasiado grande')
        return self.rfile.read(n) if n else b''

    def json_body(self):
        b = self.body()
        return json.loads(b) if b else {}

    # ---------------------------------------------------------- seguridad básica local
    def guard(self):
        host = (self.headers.get('Host') or '').split(':')[0]
        if host not in ('127.0.0.1', 'localhost', '[::1]') and os.environ.get('APAS_HOST', '127.0.0.1') == '127.0.0.1':
            self.err(403, 'Host no permitido', 'forbidden'); return False
        if self.command in ('POST', 'PUT', 'PATCH', 'DELETE') and self.headers.get('X-APAS') != '1':
            self.err(403, 'Falta cabecera X-APAS (protección contra escrituras desde otros sitios)', 'forbidden'); return False
        return True

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.guard():
            return
        u = urllib.parse.urlparse(self.path)
        p = u.path
        try:
            if p in ('/', '/index.html'):
                return self.send(200, render_index(), 'text/html; charset=utf-8')
            if p in ('/herramientas', '/herramientas/'):
                import base64, herramientas
                tpl = open(os.path.join(WEB, 'herramientas', 'index.template.html'), encoding='utf-8').read()
                logo = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(WEB, 'src', 'logo.png'), 'rb').read()).decode()
                cfg = json.dumps({'ver': APP_VER, 'actor': os.environ.get('APAS_ACTOR', 'local'), 'claude': {'disponible': False}}, ensure_ascii=False)
                return self.send(200, herramientas.render_page(st, tpl.replace('__LOCALCFG__', cfg), logo), 'text/html; charset=utf-8')
            if p == '/claude-local.js':
                return self.send(200, open(os.path.join(WEB, 'claude-local.js'), 'rb').read(), 'text/javascript; charset=utf-8')
            if p == '/api/estado':
                return self.send(200, {'ver': APP_VER, 'revs': st.revs(), 'claude': claude_bridge.estado(), 'importacion': st.meta_get('importacion')})
            m = re.match(r'^/api/col/([a-z_]+)$', p)
            if m:
                c = m.group(1)
                if c not in ALL_COLLECTIONS:
                    return self.err(404, 'colección desconocida')
                with st.lock:
                    docs = [{'id': d['id'], 'data': {k: v for k, v in d.items() if k != 'id'}} for d in st.list_docs(c)]
                    rev = st.rev(c)
                return self.send(200, {'rev': rev, 'docs': docs})
            if p == '/api/watch':
                q = urllib.parse.parse_qs(u.query)
                since = json.loads(q.get('revs', ['{}'])[0])
                deadline = time.time() + 25
                with st.cond:
                    while True:
                        cur = st.revs()
                        changed = {k: v for k, v in cur.items() if since.get(k) != v}
                        if changed or time.time() >= deadline:
                            break
                        st.cond.wait(timeout=max(0.1, deadline - time.time()))
                return self.send(200, {'revs': cur})
            m = re.match(r'^/_blob/([A-Za-z0-9_-]+)$', p)
            if m:
                a = st.asset(m.group(1))
                path = st.blob_path(m.group(1))
                if not a or not os.path.exists(path):
                    return self.err(404, 'archivo no encontrado')
                data = open(path, 'rb').read()
                fn = a['filename'] or m.group(1)
                return self.send(200, data, a['content_type'] or 'application/octet-stream',
                                 {'Content-Disposition': "inline; filename*=UTF-8''" + urllib.parse.quote(fn)})
            if p.startswith('/api/herramientas'):
                import herramientas
                return herramientas.get(self, st, p, urllib.parse.parse_qs(u.query))
            for pre, d in STATIC_DIRS.items():
                if p.startswith(pre):
                    f = os.path.normpath(os.path.join(d, urllib.parse.unquote(p[len(pre):])))
                    if not f.startswith(d + os.sep) or not os.path.isfile(f):
                        return self.err(404, 'no encontrado')
                    ct = 'text/javascript' if f.endswith('.mjs') or f.endswith('.js') else (mimetypes.guess_type(f)[0] or 'application/octet-stream')
                    return self.send(200, open(f, 'rb').read(), ct, {'Cache-Control': 'max-age=3600'})
            return self.err(404, 'no encontrado')
        except Exception as e:
            return self.err(500, str(e))

    def do_POST(self):
        if not self.guard():
            return
        p = urllib.parse.urlparse(self.path).path
        try:
            m = re.match(r'^/api/col/([a-z_]+)$', p)
            if m:
                c = m.group(1); d = self.json_body(); i = new_id()
                st.set_doc(c, i, d)
                return self.send(200, {'id': i})
            if p == '/api/blob':
                data = self.body()
                fn = urllib.parse.unquote(self.headers.get('X-Filename') or '') or 'archivo'
                ct = self.headers.get('Content-Type') or 'application/octet-stream'
                aid = secrets.token_hex(16)
                a = st.put_blob(aid, data, fn, ct)
                return self.send(200, {'id': aid, 'url': '/_blob/' + aid, 'sizeBytes': a['bytes'], 'contentType': ct})
            if p == '/api/claude':
                d = self.json_body()
                try:
                    r = claude_bridge.leer(d.get('prompt'), d.get('images'), d.get('tier') or 'default')
                except claude_bridge.ClaudeError as e:
                    return self.send(422, {'error': e.code, 'message': e.message})
                return self.send(200, r)
            if p.startswith('/api/herramientas'):
                import herramientas
                return herramientas.post(self, st, p, self.json_body())
            return self.err(404, 'no encontrado')
        except (ValueError, KeyError) as e:
            return self.err(400, str(e), 'invalid_argument')
        except Exception as e:
            return self.err(500, str(e))

    def _doc(self, merge=False, delete=False):
        if not self.guard():
            return
        p = urllib.parse.urlparse(self.path).path
        m = re.match(r'^/api/doc/([a-z_]+)/(.+)$', p)
        if not m:
            return self.err(404, 'no encontrado')
        c, i = m.group(1), urllib.parse.unquote(m.group(2))
        if not ID_RE.match(i):
            return self.err(400, 'id inválido', 'invalid_argument')
        try:
            if delete:
                st.delete_doc(c, i)
            else:
                st.set_doc(c, i, self.json_body(), merge=merge)
            return self.send(200, {'ok': True})
        except KeyError as e:
            return self.err(404, str(e), 'not_found')
        except ValueError as e:
            return self.err(400, str(e), 'invalid_argument')

    def do_PUT(self):
        self._doc()

    def do_PATCH(self):
        self._doc(merge=True)

    def do_DELETE(self):
        self._doc(delete=True)


def main():
    global st
    st = Store()
    bootstrap(st)
    host, port = os.environ.get('APAS_HOST', '127.0.0.1'), int(os.environ.get('APAS_PORT', '8765'))
    if not os.path.exists(os.path.join(DIST, 'index.template.html')) or os.environ.get('APAS_REBUILD') == '1':
        import subprocess
        subprocess.run([sys.executable, os.path.join(WEB, 'build.py')], check=True)
    srv = ThreadingHTTPServer((host, port), H)
    srv.daemon_threads = True
    imp = st.meta_get('importacion')
    print(f'Plataforma de Calidad APAS Chile {APP_VER} · http://{host}:{port}/')
    print('Base: ' + st.path + (f" · importada de {imp['fuente']}" if imp else ' · VACÍA: importa con  python3 import_export.py importar <zip>'))
    ce = claude_bridge.estado()
    print('Lectura con Claude: ' + (f"API de Anthropic ({ce['modelo']})" if ce['disponible'] else 'deshabilitada · ' + ce['motivo']))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
