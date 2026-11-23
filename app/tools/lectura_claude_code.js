#!/usr/bin/env node
// Lectura con Claude · opción b: Claude Code lee el documento en la terminal y deja una PROPUESTA pendiente.
//
// Flujo (lo ejecuta Claude Code cuando el usuario le pasa un documento):
//   1. Claude Code lee el documento y escribe lo leído en un JSON con la MISMA forma que pide la plataforma
//      (LECT_PROMPT de web/src/lect.js): {tipoDocumento, capituloSugerido, header, manuales, herramientas,
//      materiales, entrenamiento, servicios, notas}. Se copia tal cual: fechas, P/N y revisiones sin corregir.
//   2. node tools/lectura_claude_code.js --proyecto P001 --archivo doc.pdf --lectura leido.json [--url http://127.0.0.1:8765]
//      - sube el documento como evidencia (sello 🤖: via:'claude', actor 'claude (Code)'),
//      - arma las operaciones con buildOps() — el mismo código de la plataforma —, comparando por P/N o descripción,
//      - guarda la lectura como PENDIENTE: no modifica el expediente. El usuario la revisa en
//        Expedientes › Carga y lectura de documentos y elige qué aplicar (lo inconsistente viene desmarcado con ⚠).
const fs = require('fs'), path = require('path'), vm = require('vm');
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const URL0 = (arg('url') || process.env.APAS_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const ACTOR = 'claude (Code)';
const H = {'X-APAS': '1'};

async function api(method, p, body, headers){
  const r = await fetch(URL0 + p, {method, headers: {...H, ...(headers || {}), ...(body && !(body instanceof Buffer) ? {'Content-Type': 'application/json'} : {})}, body: body instanceof Buffer ? body : body ? JSON.stringify(body) : undefined});
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p}: ${(j && j.message) || r.status}`);
  return j;
}

// buildOps y sus dependencias, tomados del código de la plataforma (sin copiarlos a mano)
function cargarBuildOps(){
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'web', 'src', f), 'utf8');
  const lect = src('lect.js'), app = src('app.js');
  const cut = (t, from, to) => { const a = t.indexOf(from), b = t.indexOf(to, a); if (a < 0 || b < 0) throw new Error('No se encontró ' + from); return t.slice(a, b); };
  const code = [
    "const isDate = v => typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(v);",
    "const fmt = v => isDate(v) ? v.split('-').reverse().join('-') : (v ?? '');",
    "const today = () => new Date().toISOString().slice(0, 10);",
    "const DONE = new Set(['cumplido','aprobado','na']);",
    cut(app, 'function itemLabel(s, it){', '\nfunction renderExpList'),
    cut(lect, 'const nz = ', 'const lectOf ='),
    'globalThis.buildOps = buildOps;'].join('\n');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx); return ctx.buildOps;
}

(async () => {
  const pid = arg('proyecto'), file = arg('archivo'), lect = arg('lectura'), ck = arg('capitulo');
  if (!pid || !lect){ console.error('Uso: --proyecto P001 --lectura leido.json [--archivo documento.pdf] [--capitulo II] [--url ...]'); process.exit(2); }
  const R = JSON.parse(fs.readFileSync(lect, 'utf8'));
  ['manuales','herramientas','materiales','entrenamiento','servicios'].forEach(k => { if (!Array.isArray(R[k])) R[k] = []; });
  R.header = R.header || {};
  const projs = await api('GET', '/api/col/proj'), d = projs.docs.find(x => x.id === pid);
  if (!d) throw new Error('No existe el proyecto ' + pid);
  const p = {id: d.id, ...d.data};
  const buildOps = cargarBuildOps();
  const ops = buildOps(p, R);
  const now = new Date().toISOString();
  let evidId = null, filename = R.archivo || null;
  if (file){
    const buf = fs.readFileSync(file); filename = path.basename(file);
    const ct = /\.pdf$/i.test(file) ? 'application/pdf' : /\.png$/i.test(file) ? 'image/png' : /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'application/octet-stream';
    const a = await api('POST', '/api/blob', buf, {'Content-Type': ct, 'X-Filename': encodeURIComponent(filename)});
    const cap = ck || (/^(VI|V|IV|III|II|I)$/.test(R.capituloSugerido || '') ? R.capituloSugerido : null);
    evidId = (await api('POST', '/api/col/evid', {projId: pid, itemId: null, ck: cap, tipo: 'otro', assetId: a.id, filename, contentType: ct, sizeBytes: a.sizeBytes,
      at: now, by: null, por: ACTOR, lectura: true, via: 'claude', ruta: 'Claude Code (terminal)'})).id;
    await api('POST', '/api/col/log', {at: now, u: ACTOR, act: 'crea', ref: 'evid/' + evidId, det: `${filename} · ${pid} · cargado vía Claude Code`});
  }
  const lid = 'L' + Date.now().toString(36);
  await api('PUT', '/api/doc/lect/' + lid, {projId: pid, fuente: {evidId, filename}, por: ACTOR, at: now, estado: 'pendiente', tipoDoc: R.tipoDocumento || '', capitulo: R.capituloSugerido || '',
    notas: Array.isArray(R.notas) ? R.notas.join(' · ') : (R.notas || ''), ops});
  await api('POST', '/api/col/log', {at: now, u: ACTOR, act: 'guarda', ref: 'lect/' + lid, det: `Lectura pendiente de confirmar · ${pid} · ${ops.length} propuestas`});
  const c = k => ops.filter(o => o.k === k).length;
  console.log(`Lectura ${lid} guardada como PENDIENTE en ${pid}: ${c('nuevo')} ítems nuevos, ${c('cambio')} cambios, ${c('campo')} datos generales; ${ops.filter(o => o.aviso).length} con aviso ⚠ (van desmarcados).`);
  console.log('Revísala en Expedientes › ' + pid + ' › Carga y lectura de documentos. Nada se aplica sin confirmar.');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
