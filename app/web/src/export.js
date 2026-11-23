
// ===================== EXPORTACIÓN COMPLETA (para migrar a Claude Code)
// Genera un .zip: datos_completos.json (exacto) + datos_completos.xlsx (legible) + archivos/ (todos los adjuntos) + manifiesto.json + LEEME.txt
const EXP_COLS = ['proj','evid','rev','art','snap','train','cfg','circ','lect','log'];
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files){ // files: [{name, data:Uint8Array}] -> Blob (sin compresión, UTF-8)
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files){
    const nm = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + f.data.length;
  }
  const csz = cen.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], {type:'application/zip'});
}
// --- xlsx mínimo (texto en línea, números como número)
const xEsc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const colL = n => { let s = ''; n++; while (n){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
let XTRUNC = 0;
function sheetXml(rows){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' +
    rows.map((r, i) => `<row r="${i + 1}">` + r.map((v, j) => { if (v == null || v === '') return ''; const ref = colL(j) + (i + 1);
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      let s = typeof v === 'object' ? JSON.stringify(v) : String(v); if (s.length > 32000){ s = s.slice(0, 32000) + ' …[TRUNCADO: ver datos_completos.json]'; XTRUNC++; }
      return `<c r="${ref}" t="inlineStr"${i === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xEsc(s)}</t></is></c>`; }).join('') + '</row>').join('') + '</sheetData></worksheet>';
}
function buildXlsxBook(sheets){ // [{name, rows}]
  const enc = new TextEncoder(), names = [], used = new Set();
  sheets.forEach(s => { let n = s.name.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31), k = 2; while (used.has(n.toLowerCase())) n = s.name.slice(0, 28) + ' ' + k++; used.add(n.toLowerCase()); names.push(n); });
  const F = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => `<sheet name="${xEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)])];
  return zipStore(F.map(([name, s]) => ({name, data:enc.encode(s)})));
}
function flat(o, pre = '', out = {}){
  for (const [k, v] of Object.entries(o || {})){
    const key = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else if (Array.isArray(v)) out[key] = v.every(x => x == null || typeof x !== 'object') ? v.join(' | ') : JSON.stringify(v);
    else out[key] = v;
  }
  return out;
}
function tableOf(objs, first = []){ const F = objs.map(o => flat(o)), keys = [...new Set([...first, ...F.flatMap(o => Object.keys(o))])]; return [keys, ...F.map(o => keys.map(k => o[k] ?? ''))]; }

async function exportAll(btn){
  const st = t => { if ($('#exSt')) $('#exSt').textContent = t; };
  btn.disabled = true; XTRUNC = 0;
  try {
    st('Reuniendo datos…');
    const coll = {}; EXP_COLS.forEach(c => coll[c] = [...store[c].values()].map(d => JSON.parse(JSON.stringify(d))));
    const certs = window.__certs ? [...window.__certs.values()].map(d => JSON.parse(JSON.stringify(d))) : [];
    const persEd = window.__persDocs ? [...window.__persDocs.entries()].map(([id, d]) => ({id, ...JSON.parse(JSON.stringify(d))})) : [];
    const persBase = window.__persData ? JSON.parse(JSON.stringify(window.__persData)) : null;
    const persMerged = window.__persMerged ? window.__persMerged() : [];
    const proyectos = coll.proj.map(raw => { const p = upgrade(raw); let av = null, et = null, se = null; try { av = progress(p); } catch(e){} try { et = stage(p)?.[0] ?? null; } catch(e){} try { se = SEMA[sema(p)]?.[1] ?? null; } catch(e){} return {...raw, _calc:{avance:av, etapa:et, semaforo:se}}; });
    // archivos
    const refs = new Map(), addRef = (id, origen, nombre) => { if (!id) return; if (!refs.has(id)) refs.set(id, {assetId:id, nombres:new Set(), origen:new Set()}); refs.get(id).nombres.add(nombre || id); refs.get(id).origen.add(origen); };
    coll.evid.forEach(e => addRef(e.assetId, 'evid/' + e.id, e.filename));
    certs.forEach(c => addRef(c.assetId, 'certs/' + c.id, c.filename));
    coll.circ.forEach(c => addRef(c.assetId, 'circ/' + c.id, c.filename));
    coll.proj.forEach(p => (p.fotos || []).forEach(f => addRef(f, 'proj/' + p.id + '/fotos', 'foto')));
    coll.art.forEach(a => (a.fotos || []).forEach(f => addRef(f, 'art/' + a.id + '/fotos', 'foto')));
    let listed = []; try { if (RT.assets && RT.assets.list) listed = (await RT.assets.list()).assets || []; } catch(e){}
    listed.forEach(a => { const id = a.id || a.opaque_id; if (id && !refs.has(id)) addRef(id, 'sin_referencia', a.name || id); });
    const files = [], manif = [], safe = s => String(s).replace(/[\\\/:*?"<>|]+/g, '_').slice(0, 120);
    let i = 0, fail = 0;
    for (const r of refs.values()){
      i++; st(`Descargando archivos ${i}/${refs.size}…`);
      const nombre = [...r.nombres][0], path = `archivos/${r.assetId}_${safe(nombre)}`;
      try { const res = await fetch(assetUrl(r.assetId)); if (!res.ok) throw new Error('HTTP ' + res.status); const b = new Uint8Array(await res.arrayBuffer());
        files.push({name:path, data:b}); manif.push({assetId:r.assetId, archivo:path, bytes:b.length, crc32:crc32(b).toString(16).padStart(8, '0'), tipo:res.headers.get('content-type') || '', nombres:[...r.nombres], referenciadoPor:[...r.origen]});
      } catch(e){ fail++; manif.push({assetId:r.assetId, archivo:null, error:String(e.message || e), nombres:[...r.nombres], referenciadoPor:[...r.origen]}); }
    }
    st('Armando JSON y Excel…');
    const D = {
      _meta:{generado:new Date().toISOString(), version:APP_VER, por:SESSION.u, plataforma:'Plataforma de Calidad · APAS Chile (DEMO)', artefacto:'dd6a27f0-b738-4584-ad17-568ab4f7879c',
        nota:'Fuente exacta para migrar. Excluye usuarios y contraseñas de la página (la versión en Code no usa cuentas). El Excel es una vista legible; ante diferencia manda este JSON.',
        conteos:{...Object.fromEntries(EXP_COLS.map(c => [c, coll[c].length])), certs:certs.length, pers_editadas:persEd.length, personal_base:persBase ? persBase.personas.length : 0, personal_vista:persMerged.length, catalogo_entries:S.entries.length, catalogo_articles:S.articles.length, semilla_proyectos:IMPORT.length, archivos:manif.filter(m => m.archivo).length, archivos_fallidos:fail}},
      proyectos, evidencias:coll.evid, revisiones:coll.rev, lecturas:coll.lect, entrenamiento:coll.train, articulos_presentacion:coll.art, snapshots_informes:coll.snap,
      config:coll.cfg, circulares:coll.circ, registro:coll.log, certificados_personal:certs, personal_ediciones:persEd, personal_base:persBase, personal_vista_actual:persMerged,
      catalogo:{listas_faa:S.lists, lista_dgac:S.dgacList, entries:S.entries, articles:S.articles}, semilla_proyectos:IMPORT, autoridades:AUTHS, qc021_preguntas:QC021, versiones:CHANGELOG, archivos:manif};
    const json = new TextEncoder().encode(JSON.stringify(D, null, 1));
    // Excel
    const items = [], qc = [];
    proyectos.forEach(p => { (upgrade(p).sections || []).forEach(s => (s.items || []).forEach((it, n) => items.push({projId:p.id, proyecto:p.desc, seccion:s.key, seccionNombre:s.name, orden:n + 1, ...it, log:(it.log || []).map(l => `${l.date || ''} ${l.text}`).join(' || ')})));
      const se = p.se || (typeof SE_SEED !== 'undefined' && SE_SEED[p.id]) || null; if (se && se.ans) QC021.forEach(c => c.q.forEach(([l, q]) => { const v = se.ans[c.ch + '.' + l]; qc.push({projId:p.id, capitulo:c.ch, letra:l, pregunta:q, respuesta:Array.isArray(v) ? v[0] : '', ref:Array.isArray(v) ? v[1] : '', origen:p.se ? 'guardada' : 'semilla ELT'}); })); });
    const lops = []; coll.lect.forEach(l => (l.ops || []).forEach((o, n) => lops.push({lecturaId:l.id, projId:l.projId, estado:l.estado, fuente:l.fuente?.filename, n:n + 1, tipo:o.k, seccion:o.sec || 'general', elemento:o.label, itemId:o.itemId || '', propuesta:o.campos || o.nuevo, antes:o.antes ?? '', aviso:o.aviso || '', marcadoPorDefecto:o.on})));
    const revOfId = id => coll.rev.find(r => r.id === id);
    const evRows = coll.evid.map(e => ({...e, revision:revOfId(e.id)?.status || 'pendiente', comentarioRevision:revOfId(e.id)?.comment || '', archivoEnZip:manif.find(m => m.assetId === e.assetId)?.archivo || ''}));
    const sheets = [
      {name:'LEEME', rows:[['Campo','Valor'], ...Object.entries(flat(D._meta)).map(([k, v]) => [k, v])]},
      {name:'Proyectos', rows:tableOf(proyectos.map(p => { const {sections, se, ...r} = p; return r; }), ['id','tipo','desc','area','autoridad','limitacion','estadoTexto'])},
      {name:'Items expediente', rows:tableOf(items, ['projId','proyecto','seccion','orden','id','title','status'])},
      {name:'Autoevaluacion QC-021', rows:tableOf(qc)},
      {name:'Autoevaluacion encabezados', rows:tableOf(proyectos.filter(p => p.se).map(p => ({projId:p.id, hdr:p.se.hdr, qcm:p.se.qcm, am:p.se.am, annex:p.se.annex, div:p.se.div})))},
      {name:'Evidencias', rows:tableOf(evRows, ['id','projId','itemId','ck','cmm','tipo','filename','revision'])},
      {name:'Lecturas (propuestas)', rows:tableOf(lops)},
      {name:'Entrenamiento', rows:tableOf(coll.train)},
      {name:'Personal (vista actual)', rows:tableOf(persMerged, ['_id','apellido','nombre','rut','puesto','area','estado','esps'])},
      {name:'Personal ediciones', rows:tableOf(persEd)},
      {name:'Certificados personal', rows:tableOf(certs)},
      {name:'Catalogo entries', rows:tableOf(S.entries)},
      {name:'Catalogo articles', rows:tableOf(S.articles)},
      {name:'Articulos presentacion', rows:tableOf(coll.art)},
      {name:'Circulares', rows:tableOf(coll.circ)},
      {name:'Config y bases', rows:tableOf(coll.cfg)},
      {name:'Autoridades', rows:tableOf(AUTHS)},
      {name:'Registro', rows:tableOf(coll.log.sort((a, b) => (a.at || '').localeCompare(b.at || '')))},
      {name:'Snapshots informes', rows:tableOf(coll.snap)},
      {name:'Archivos', rows:tableOf(manif)},
      {name:'Versiones', rows:[['version','fecha','cambios'], ...CHANGELOG]}];
    const xlsx = new Uint8Array(await buildXlsxBook(sheets).arrayBuffer());
    const leeme = `EXPORTACIÓN COMPLETA · Plataforma de Calidad APAS Chile (DEMO Ver. ${APP_VER})\nGenerada: ${D._meta.generado} por ${SESSION.u}\n\n- datos_completos.json: fuente exacta (todas las colecciones, catálogo FAA/DGAC, personal base + ediciones, semillas, autoridades, preguntas QC-021, versiones).\n- datos_completos.xlsx: vista legible (una hoja por entidad; objetos anidados en notación a.b.c; listas de objetos como JSON). Celdas > 32.000 caracteres truncadas: ${XTRUNC}.\n- archivos/: todos los adjuntos, nombrados <assetId>_<nombre>. El JSON los referencia por assetId (campo assetId, fotos[]); 'archivos' en el JSON trae ruta, bytes y CRC32 de cada uno.\n- manifiesto.json: conteos y CRC32 para verificar la importación.\n\nConteos: ${JSON.stringify(D._meta.conteos)}\n`;
    const all = [{name:'datos_completos.json', data:json}, {name:'datos_completos.xlsx', data:xlsx}, {name:'LEEME.txt', data:new TextEncoder().encode(leeme)},
      {name:'manifiesto.json', data:new TextEncoder().encode(JSON.stringify({conteos:D._meta.conteos, json_crc32:crc32(json).toString(16).padStart(8, '0'), json_bytes:json.length, xlsx_bytes:xlsx.length, archivos:manif}, null, 1))}, ...files];
    const zip = zipStore(all), name = `Exportacion_Plataforma_Calidad_APAS_${today()}_v${APP_VER}.zip`;
    st(`Listo: ${(zip.size / 1048576).toFixed(1)} MB · ${manif.filter(m => m.archivo).length} archivos${fail ? ` · ${fail} no se pudieron descargar` : ''}. Descargando…`);
    if (RT.dl) await RT.dl.save({filename:name, data:zip}); else { const a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = name; a.click(); }
    logAct('exportación completa', 'sistema', `${name} · ${(zip.size / 1048576).toFixed(1)} MB`); flash('Exportación generada: ' + name);
  } catch(e){ console.error(e); st('Error: ' + (e.message || e)); flash('No se pudo exportar (' + (e.message || e) + ').', true); }
  btn.disabled = false;
}
