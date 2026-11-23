"""Almacén local SQLite de la Plataforma de Calidad APAS Chile (y del Control de Herramientas).

Modelo: una tabla por colección. Cada documento se guarda como JSON tal cual (orden de claves
incluido) para que la ida y vuelta (importar -> exportar) sea exacta. La columna `ord` conserva el
orden original de cada colección; los documentos nuevos se agregan al final.
"""
import json
import os
import sqlite3
import threading
import time
import zlib

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('APAS_DATA', os.path.join(ROOT, 'data'))

# Clave en datos_completos.json -> colección (tabla) usada por la aplicación
COLLECTIONS = {
    'proyectos': 'proj', 'evidencias': 'evid', 'revisiones': 'rev', 'lecturas': 'lect',
    'entrenamiento': 'train', 'articulos_presentacion': 'art', 'snapshots_informes': 'snap',
    'config': 'cfg', 'circulares': 'circ', 'registro': 'log', 'certificados_personal': 'certs',
    'personal_ediciones': 'pers',
}
# Colecciones que existen solo dentro de la aplicación (no van en la exportación)
#  bak: respaldo interno en dos generaciones (A = último, B = anterior)
#  herr_*: Control de Herramientas (ediciones, intercambiables, historial)
APP_COLLECTIONS = ['bak', 'users', 'herr_edits', 'herr_rel', 'herr_log']
ALL_COLLECTIONS = list(COLLECTIONS.values()) + APP_COLLECTIONS
# Listas grandes de solo lectura: una fila por elemento
ROW_TABLES = ['semilla_proyectos', 'catalogo_entries', 'catalogo_articles', 'personal_personas',
              'herr_cal', 'herr_nc']
# Documentos estáticos completos
STATIC_KEYS = ['personal_base_meta', 'catalogo_listas_faa', 'catalogo_lista_dgac', 'autoridades',
               'qc021_preguntas', 'versiones', 'herr_meta']


def crc32_hex(b):
    return format(zlib.crc32(b) & 0xffffffff, '08x')


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


class Store:
    def __init__(self, data_dir=DATA_DIR):
        self.data_dir = data_dir
        self.storage = os.path.join(data_dir, 'storage')
        os.makedirs(self.storage, exist_ok=True)
        self.path = os.path.join(data_dir, 'plataforma.db')
        self.lock = threading.RLock()
        self.cond = threading.Condition(self.lock)
        self.db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA foreign_keys=ON')
        self._schema()

    # ------------------------------------------------------------------ esquema
    def _schema(self):
        x = self.db.execute
        for c in ALL_COLLECTIONS:
            x(f'CREATE TABLE IF NOT EXISTS "{c}" (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT)')
        for t in ROW_TABLES:
            x(f'CREATE TABLE IF NOT EXISTS "{t}" (ord INTEGER PRIMARY KEY, data TEXT NOT NULL)')
        x('CREATE TABLE IF NOT EXISTS static (key TEXT PRIMARY KEY, data TEXT NOT NULL)')
        x('''CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, filename TEXT, content_type TEXT, bytes INTEGER,
             crc32 TEXT, created_at TEXT, origen TEXT, ord INTEGER)''')
        x('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)')
        x('CREATE TABLE IF NOT EXISTS revs (col TEXT PRIMARY KEY, rev INTEGER NOT NULL)')

    # ------------------------------------------------------------------ utilidades
    def meta_get(self, k, default=None):
        r = self.db.execute('SELECT value FROM meta WHERE key=?', (k,)).fetchone()
        return json.loads(r[0]) if r else default

    def meta_set(self, k, v):
        self.db.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', (k, dumps(v)))

    def rev(self, col):
        r = self.db.execute('SELECT rev FROM revs WHERE col=?', (col,)).fetchone()
        return r[0] if r else 0

    def revs(self):
        return dict(self.db.execute('SELECT col, rev FROM revs').fetchall())

    def _bump(self, col):
        self.db.execute('INSERT INTO revs(col,rev) VALUES(?,1) ON CONFLICT(col) DO UPDATE SET rev=rev+1', (col,))

    def notify(self):
        with self.cond:
            self.cond.notify_all()

    def is_empty(self):
        return all(self.db.execute(f'SELECT COUNT(*) FROM "{c}"').fetchone()[0] == 0 for c in COLLECTIONS.values())

    # ------------------------------------------------------------------ documentos
    def list_docs(self, col):
        self._check(col)
        return [json.loads(d) for (d,) in self.db.execute(f'SELECT data FROM "{col}" ORDER BY ord')]

    def get_doc(self, col, id_):
        self._check(col)
        r = self.db.execute(f'SELECT data FROM "{col}" WHERE id=?', (id_,)).fetchone()
        return json.loads(r[0]) if r else None

    def set_doc(self, col, id_, data, merge=False):
        """Guarda el documento completo `{id, ...data}`. Con merge=True mezcla (update) sobre el existente."""
        self._check(col)
        with self.lock:
            cur = self.db.execute(f'SELECT data, ord FROM "{col}" WHERE id=?', (id_,)).fetchone()
            if merge:
                if not cur:
                    raise KeyError(f'{col}/{id_} no existe')
                base = json.loads(cur[0])
                base.update(data)
                doc = base
            else:
                doc = {'id': id_}
                doc.update({k: v for k, v in data.items() if k != 'id'})
            if cur:
                self.db.execute(f'UPDATE "{col}" SET data=?, updated_at=? WHERE id=?', (dumps(doc), now(), id_))
            else:
                o = self.db.execute(f'SELECT COALESCE(MAX(ord),-1)+1 FROM "{col}"').fetchone()[0]
                self.db.execute(f'INSERT INTO "{col}"(id,ord,data,updated_at) VALUES(?,?,?,?)', (id_, o, dumps(doc), now()))
            self._bump(col)
        self.notify()
        return doc

    def delete_doc(self, col, id_):
        self._check(col)
        with self.lock:
            self.db.execute(f'DELETE FROM "{col}" WHERE id=?', (id_,))
            self._bump(col)
        self.notify()

    def _check(self, col):
        if col not in ALL_COLLECTIONS:
            raise ValueError(f'colección desconocida: {col}')

    # ------------------------------------------------------------------ estáticos
    def rows(self, table):
        return [json.loads(d) for (d,) in self.db.execute(f'SELECT data FROM "{table}" ORDER BY ord')]

    def static(self, key, default=None):
        r = self.db.execute('SELECT data FROM static WHERE key=?', (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def set_static(self, key, value):
        self.db.execute('INSERT OR REPLACE INTO static(key,data) VALUES(?,?)', (key, dumps(value)))

    # ------------------------------------------------------------------ archivos
    def blob_path(self, asset_id):
        if not asset_id or not all(c.isalnum() or c in '-_' for c in asset_id):
            raise ValueError('assetId inválido')
        return os.path.join(self.storage, asset_id)

    def asset(self, asset_id):
        r = self.db.execute('SELECT id, filename, content_type, bytes, crc32, created_at, origen FROM assets WHERE id=?', (asset_id,)).fetchone()
        return dict(zip(['id', 'filename', 'content_type', 'bytes', 'crc32', 'created_at', 'origen'], r)) if r else None

    def assets(self):
        cols = ['id', 'filename', 'content_type', 'bytes', 'crc32', 'created_at', 'origen']
        return [dict(zip(cols, r)) for r in self.db.execute(f'SELECT {",".join(cols)} FROM assets ORDER BY ord')]

    def put_blob(self, asset_id, data, filename, content_type, origen='app'):
        p = self.blob_path(asset_id)
        tmp = p + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, p)
        with self.lock:
            o = self.db.execute('SELECT COALESCE(MAX(ord),-1)+1 FROM assets').fetchone()[0]
            self.db.execute('INSERT OR REPLACE INTO assets(id,filename,content_type,bytes,crc32,created_at,origen,ord) VALUES(?,?,?,?,?,?,?,COALESCE((SELECT ord FROM assets WHERE id=?),?))',
                            (asset_id, filename, content_type, len(data), crc32_hex(data), now(), origen, asset_id, o))
        return self.asset(asset_id)


def now():
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + 'Z'
