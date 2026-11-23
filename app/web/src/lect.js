
// ===================== LECTURA DE DOCUMENTOS CON CLAUDE (una sola entrada por expediente)
// Flujo: subir cualquier archivo -> Claude lee -> propuesta (colección lect) -> revisión campo a campo -> aplicar.
// La misma propuesta puede crearla Claude desde un chat (por = 'claude (chat …)').
const nz = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const noRef = s => !s || /^(w\/?o|without|sin)\s*ref/i.test(String(s).trim()) || /^n\/?a$/i.test(String(s).trim());
const pnKey = s => noRef(s) ? '' : nz(s).replace(/ /g, '');
function sim(a, b){ const A = new Set(nz(a).split(' ').filter(w => w.length > 2)), B = new Set(nz(b).split(' ').filter(w => w.length > 2)); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / Math.min(A.size, B.size); }
function findItem(p, sk, e){
  const s = (p.sections || []).find(x => x.key === sk); if (!s) return null;
  const k = pnKey(e.pn);
  if (sk === 'doc') return s.items.find(it => nz(it.numero) && nz(it.numero) === nz(e.numero)) || null;
  if (k){ const m = s.items.find(it => pnKey(it.pn) === k); if (m && (sk !== 'mat' || nz(m.title) === nz(e.title) || sim(m.title, e.title) >= .5)) return m; }
  let best = null, bs = 0; for (const it of s.items){ const v = nz(it.title) === nz(e.title) ? 1 : sim(it.title, e.title); if (v > bs){ bs = v; best = it; } }
  return bs >= (sk === 'mat' ? .99 : .6) && (!k || !pnKey(best.pn) || pnKey(best.pn) === k) ? best : null;
}
const FIELD_LBL = {title:'Descripción', pn:'P/N', pnAlt:'P/N equivalente / alternativo', disponible:'Disponible en CMA/MRO', uso:'Uso', calibrable:'Calibrable', calDue:'Vence calibración', numero:'N.º', revision:'Revisión', fechaRev:'Fecha de revisión', tipoManual:'Tipo', curso:'Curso', proveedor:'Proveedor', status:'Estado'};
// Convierte lo leído (entidades) en operaciones propuestas contra el expediente actual
function buildOps(p, R){
  const ops = [], add = o => ops.push({on: !o.aviso, ...o});
  const H = R.header || {};
  const fld = (ref, label, antes, nuevo, aviso) => { if (nuevo == null || String(nuevo).trim() === '' || nz(antes) === nz(nuevo)) return; add({k:'campo', ref, label, antes: antes ?? '', nuevo: String(nuevo).trim(), aviso}); };
  fld('proj.ata', 'ATA', p.ata, H.ata); fld('proj.mfr', 'Fabricante', p.mfr, H.mfr);
  fld('qc020.desc', 'Descripción de la unidad (formulario)', p.qc020?.desc, H.descripcion);
  if (H.unitPns){ const cur = (p.pns || []).join(', '), toks = s => [...String(s).toUpperCase().matchAll(/[A-Z0-9]+(?:[-\/][A-Z0-9]+)+|\d{4,}[A-Z0-9]*/g)].map(m => m[0]).sort().join(' ');
    if (toks(H.unitPns) !== toks(cur)) fld('proj.pns', 'P/N de la unidad', cur, H.unitPns); }
  fld('qc020.revisadoPor', 'Revisado por (checked by)', p.qc020?.revisadoPor, H.revisadoPor); fld('qc020.cargo', 'Cargo de quien revisa', p.qc020?.cargo, H.cargo); fld('qc020.fecha', 'Fecha de revisión del formulario', p.qc020?.fecha, H.fecha);
  const SECS = [['doc', R.manuales], ['tools', R.herramientas], ['mat', R.materiales], ['train', R.entrenamiento], ['serv', R.servicios]];
  for (const [sk, list] of SECS){
    if (!Array.isArray(list) || !list.length || !(p.sections || []).some(x => x.key === sk)) continue;
    for (const e of list){
      const c = {}; const put = (k, v) => { if (v != null && String(v).trim() !== '') c[k] = typeof v === 'string' ? v.trim() : v; };
      if (sk === 'doc'){ put('tipoManual', e.tipo || 'CMM'); put('numero', e.numero); put('revision', e.revision); put('fechaRev', e.fecha); put('title', `${e.tipo || 'CMM'} ${e.numero}`); }
      else if (sk === 'tools'){ put('title', e.descripcion); put('pn', noRef(e.oemPn) ? 'w/o Reference' : e.oemPn); put('pnAlt', e.equivPn); put('disponible', e.disponible ? String(e.disponible).toUpperCase().startsWith('Y') || /^s[ií]/i.test(e.disponible) ? 'YES' : 'NO' : null); put('uso', e.uso);
        if (e.calibrable != null) c.calibrable = !!e.calibrable; put('calDue', /^\d{4}-\d\d-\d\d$/.test(e.calDue || '') ? e.calDue : null); }
      else if (sk === 'mat'){ put('title', e.descripcion); put('pn', noRef(e.oemPn) ? 'w/o Reference' : e.oemPn); put('pnAlt', e.alternativo); put('uso', e.uso); }
      else if (sk === 'train'){ put('title', e.nombre || e.grupo); put('curso', e.curso); }
      else if (sk === 'serv'){ put('title', e.proceso); put('proveedor', e.proveedor); put('uso', e.detalle); }
      if (!c.title && !c.numero) continue;
      const m = findItem(p, sk, {title:c.title, pn:c.pn, numero:c.numero});
      if (!m){ add({k:'nuevo', sec:sk, label:c.title || c.numero, campos:c, aviso: e.aviso || null}); continue; }
      const ch = {}; Object.entries(c).forEach(([k, v]) => { const a = m[k]; if (k === 'title' && nz(a) && sim(a, v) >= .6) return; if (k === 'pn' && noRef(v) && noRef(a)) return; if (nz(a) !== nz(v)) ch[k] = {antes: a ?? '', nuevo: v}; });
      if (!Object.keys(ch).length) continue;
      let aviso = e.aviso || null;
      if (sk === 'doc' && ch.revision && /^\d+$/.test(String(m.revision || '')) && /^\d+$/.test(String(c.revision || '')) && +c.revision < +m.revision) aviso = `La revisión leída (${c.revision}) es MENOR que la registrada (${m.revision}): verifica cuál es la vigente antes de aplicar.`;
      if (sk === 'tools' && c.disponible === 'YES' && !DONE.has(m.status)) aviso = (aviso ? aviso + ' ' : '') + `En el expediente figura ${m.taller || m.logistica || m.status}${m.qtyObt != null ? ` (obtenida ${m.qtyObt}/${m.qtyReq ?? '?'})` : ''}; el documento la declara disponible. Aplicar no cierra el ítem: sigue requiriendo foto.`;
      if (ch.pn && !noRef(ch.pn.antes) && noRef(ch.pn.nuevo)) aviso = (aviso ? aviso + ' ' : '') + `Se borraría el P/N registrado (${ch.pn.antes}).`;
      add({k:'cambio', sec:sk, itemId:m.id, label:itemLabel((p.sections || []).find(x => x.key === sk), m), campos:ch, aviso});
    }
  }
  return ops;
}
function applyOps(q, ops){
  const sec = k => (q.sections || []).find(x => x.key === k); let n = 0;
  for (const o of ops){
    if (o.k === 'campo'){ const [obj, key] = o.ref.split('.');
      if (obj === 'proj') q[key] = key === 'pns' ? o.nuevo.split(/,| and | y /i).map(s => s.trim()).filter(Boolean) : o.nuevo;
      else { q[obj] = q[obj] || {}; q[obj][key] = o.nuevo; } n++; }
    else if (o.k === 'nuevo'){ const s = sec(o.sec); if (!s) continue;
      const it = {id:'r' + Math.random().toString(36).slice(2, 9), log:[{date:fmt(today()), text:'Agregado desde lectura de documento'}], status: o.sec === 'mat' || o.sec === 'doc' ? 'cumplido' : 'pendiente', ...o.campos};
      if (o.sec === 'train') it.kind = 'persona'; s.items.push(it); if (s.key === 'mat') s.cerrada = false; n++; }
    else if (o.k === 'cambio'){ const s = sec(o.sec), it = s && s.items.find(x => x.id === o.itemId); if (!it) continue;
      Object.entries(o.campos).forEach(([k, v]) => it[k] = v.nuevo); (it.log = it.log || []).push({date:fmt(today()), text:'Actualizado desde lectura de documento: ' + Object.keys(o.campos).map(k => FIELD_LBL[k] || k).join(', ')}); n++; }
  }
  return n;
}
const lectOf = pid => [...store.lect.values()].filter(l => l.projId === pid).sort((a,b) => (b.at||'').localeCompare(a.at||''));
function lectBox(p){
  const L = lectOf(p.id), pend = L.filter(l => l.estado === 'pendiente'), ad = isAdmin();
  return `<div class="box lectbox"><h3>📥 Carga y lectura de documentos ${pend.length ? chip(pend.length + ' lectura(s) por confirmar','s-warn') : ''}</h3>
    <div class="hint">Una sola entrada para todo el expediente: sube cualquier documento (PDF con tablas o escaneado, fotos, varias páginas de herramientas con sus P/N) y Claude lo lee y propone qué campos llenar, agregar o cambiar en cada sección. Nada se modifica hasta que confirmes. El archivo queda además como evidencia del capítulo que indiques.</div>
    ${canUpload() ? `<div class="evform"><button class="btn pri" id="lcUp" ${RT.sample ? '' : 'title="La lectura con Claude no está disponible en esta vista; el archivo se sube igual como evidencia"'}>📎 Subir documentos${RT.sample ? ' y leer con Claude' : ''}</button>
      <label class="log">Guardar como evidencia del capítulo <select id="lcCh"><option value="auto">que sugiera Claude</option>${QC021.map(c => `<option value="${c.ch}">${c.ch} · ${esc(c.es)}</option>`).join('')}<option value="">No guardar como evidencia</option></select></label></div>` : ''}
    ${L.length ? `<table class="items" style="margin-top:8px"><thead><tr><th>Documento leído</th><th>Por</th><th>Propuesta</th><th>Estado</th><th></th></tr></thead><tbody>
      ${L.slice(0, 8).map(l => `<tr><td>${l.fuente?.evidId ? `<a href="#" class="lnk" data-view="${esc(l.fuente.evidId)}">${esc(l.fuente.filename || 'documento')}</a>` : esc(l.fuente?.filename || '—')}${l.tipoDoc ? `<div class="log">${esc(l.tipoDoc)}</div>` : ''}</td>
        <td>${/claude/i.test(l.por || '') ? '<span class="b b-x">🤖 Claude</span> ' : ''}${esc(l.por || '')}<div class="log">${esc(new Date(l.at).toLocaleString('es-CL'))}</div></td>
        <td>${esc(lectResumen(l.ops || []))}</td><td>${chip(l.estado === 'pendiente' ? 'Por confirmar' : l.estado === 'aplicada' ? `Aplicada (${l.aplicados ?? '?'})` : 'Descartada', l.estado === 'pendiente' ? 's-warn' : l.estado === 'aplicada' ? 's-ok' : 's-na')}${l.revisadoPor ? `<div class="log">${esc(l.revisadoPor)}</div>` : ''}</td>
        <td>${l.estado === 'pendiente' && ad ? `<button class="btn sm pri" data-lrev="${esc(l.id)}">Revisar y confirmar</button>` : `<button class="btn sm" data-lrev="${esc(l.id)}">Ver</button>`}</td></tr>`).join('')}</tbody></table>` : ''}
  </div>`;
}
function lectResumen(ops){ const c = {campo:0, nuevo:0, cambio:0}, s = {}; ops.forEach(o => { c[o.k]++; if (o.sec) s[o.sec] = (s[o.sec] || 0) + 1; });
  return [c.campo && `${c.campo} dato(s) generales`, c.nuevo && `${c.nuevo} ítem(s) nuevos`, c.cambio && `${c.cambio} ítem(s) a actualizar`].filter(Boolean).join(' · ') + (Object.keys(s).length ? ' — ' + Object.entries(s).map(([k,v]) => `${SEC_DEF[k]?.name || k}: ${v}`).join(', ') : ''); }
function bindLect(p){
  if ($('#lcUp')) $('#lcUp').onclick = () => pickFiles(fs => lectUpload(p, fs, $('#lcCh').value), 'application/pdf,image/*');
  document.querySelectorAll('[data-lrev]').forEach(b => b.onclick = () => lectReview(p, store.lect.get(b.dataset.lrev)));
}
async function pdfText(blob){
  const lib = await loadPdfjs(), doc = await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise, pages = [];
  for (let i = 1; i <= doc.numPages; i++){
    const tc = await (await doc.getPage(i)).getTextContent(), rows = new Map();
    tc.items.forEach(t => { const y = Math.round(t.transform[5] / 3); if (!rows.has(y)) rows.set(y, []); rows.get(y).push([t.transform[4], t.str]); });
    pages.push([...rows.entries()].sort((a,b) => b[0] - a[0]).map(([, r]) => r.sort((a,b) => a[0] - b[0]).map(x => x[1]).join('   ').replace(/\s{4,}/g, '   |   ')).join('\n'));
  }
  return pages;
}
const LECT_PROMPT = `Eres asistente de Calidad de una estación reparadora aeronáutica (FAA Part 145 / DGAC DAN 145). Lee el documento adjunto y extrae SOLO lo que está escrito, sin inventar ni corregir. Puede ser un formulario de herramientas y materiales (QC-020: Tabla A herramientas, Tabla B materiales), un listado de herramientas con fotos y P/N, un registro de entrenamiento, un extracto de manual (portada/revisiones), etc.
Responde solo JSON con esta forma (omite lo que no aparezca):
{"tipoDocumento":"", "capituloSugerido":"I|II|III|IV|V|VI", "header":{"ata":"","mfr":"","descripcion":"","unitPns":"","revisadoPor":"","cargo":"","fecha":"YYYY-MM-DD"},
 "manuales":[{"tipo":"CMM","numero":"78-30-01","revision":"33","fecha":"Jun 30, 2026"}],
 "herramientas":[{"descripcion":"","oemPn":"","equivPn":"","disponible":"YES|NO","uso":"","calibrable":true,"calDue":"YYYY-MM-DD"}],
 "materiales":[{"descripcion":"","oemPn":"","alternativo":"","uso":""}],
 "entrenamiento":[{"nombre":"","grupo":"","curso":"","fecha":""}],
 "servicios":[{"proceso":"","proveedor":"","detalle":""}],
 "notas":"dudas de lectura o inconsistencias que veas"}
Reglas: copia descripciones y P/N tal cual (mismo texto, sin traducir). "w/o Reference" se deja así. Si una celda de P/N alternativo tiene varios, sepáralos con " / ". Una fila del documento = un elemento. Capítulos: I instalaciones, II herramientas y equipos, III materiales, IV datos técnicos/manuales, V procesos, VI personal entrenado.`;
async function lectUpload(p, files, chSel){
  for (const f of files){
    let evidId = null, ck = chSel === 'auto' ? null : chSel || null;
    try {
      flash(`Subiendo ${f.name}…`);
      const a = await RT.assets.upload(f); const ref = await RT.db.collection('evid').add({projId:p.id, itemId:null, ck, tipo:'otro', assetId:a.id, filename:f.name, contentType:a.contentType || f.type, sizeBytes:a.sizeBytes || f.size, at:new Date().toISOString(), by:RT.myId || null, por:SESSION.name, lectura:true});
      evidId = ref && ref.id;
      if (!RT.sample){ flash(`${f.name} subido como evidencia. La lectura con Claude no está disponible en esta vista.`); continue; }
      flash(`Claude está leyendo ${f.name}…`);
      const isPdf = (f.type || '').includes('pdf') || /\.pdf$/i.test(f.name); let chunks = [];
      if (isPdf){ const txt = await pdfText(f), good = txt.filter(t => t.replace(/\s/g, '').length > 80).length >= Math.ceil(txt.length / 2);
        if (good) for (let i = 0; i < txt.length; i += 3) chunks.push({text: txt.slice(i, i + 3).map((t, j) => `--- Página ${i + j + 1} ---\n${t}`).join('\n\n')});
        else { const {imgs} = await pdfImages(f, 30); for (let i = 0; i < imgs.length; i += 4) chunks.push({images: imgs.slice(i, i + 4)}); } }
      else chunks.push({images:[f]});
      const R = {header:{}, manuales:[], herramientas:[], materiales:[], entrenamiento:[], servicios:[], notas:[], tipoDocumento:'', capituloSugerido:''};
      for (const [i, c] of chunks.entries()){
        flash(`Claude está leyendo ${f.name} (${i + 1}/${chunks.length})…`);
        const r = await RT.sample.json(c.text ? LECT_PROMPT + '\n\nDOCUMENTO (texto extraído por columnas):\n' + c.text : LECT_PROMPT, {...(c.images ? {images:c.images} : {}), modelTier:'complex'});
        if (!r || typeof r !== 'object') continue;
        Object.entries(r.header || {}).forEach(([k, v]) => { if (v && !R.header[k]) R.header[k] = String(v); });
        for (const k of ['manuales','herramientas','materiales','entrenamiento','servicios']) if (Array.isArray(r[k])) R[k].push(...r[k].filter(x => x && typeof x === 'object'));
        if (r.notas) R.notas.push(String(r.notas)); R.tipoDocumento = R.tipoDocumento || r.tipoDocumento || ''; R.capituloSugerido = R.capituloSugerido || r.capituloSugerido || '';
      }
      const ops = buildOps(store.proj.get(p.id), R);
      if (!ck && /^(VI|V|IV|III|II|I)$/.test(R.capituloSugerido) && evidId) await writeDoc('evid/' + evidId, {ck:R.capituloSugerido}, 'update').catch(() => {});
      const lid = 'L' + Date.now().toString(36);
      await writeDoc('lect/' + lid, {projId:p.id, fuente:{evidId, filename:f.name}, por:SESSION.name + ' (lectura en la plataforma)', at:new Date().toISOString(), estado:'pendiente', tipoDoc:R.tipoDocumento, capitulo:R.capituloSugerido, notas:R.notas.join(' · '), ops});
      flash(`${f.name}: ${lectResumen(ops) || 'sin datos aplicables'}. Revisa y confirma en “Carga y lectura de documentos”.`);
    } catch(e){ flash(e && e.code === 'not_granted' ? 'Claude no está autorizado en esta página.' : `No se pudo leer ${f.name} (${e.code || e.message || 'error'}).`, true); }
  }
}
function lectReview(p, l){
  if (!l) return; const ad = isAdmin() && l.estado === 'pendiente', ops = JSON.parse(JSON.stringify(l.ops || []));
  const SECN = k => SEC_DEF[k]?.name || k, val = v => v === true ? 'Sí' : v === false ? 'No' : String(v ?? '');
  const row = (o, i) => {
    const det = o.k === 'campo' ? `<td>${esc(val(o.antes)) || '—'}</td><td><b>${esc(val(o.nuevo))}</b></td>`
      : o.k === 'nuevo' ? `<td>—</td><td>${Object.entries(o.campos).filter(([k]) => k !== 'title').map(([k,v]) => `<div><span class="log">${esc(FIELD_LBL[k] || k)}:</span> ${esc(val(v))}</div>`).join('')}</td>`
      : `<td>${Object.entries(o.campos).map(([k,v]) => `<div><span class="log">${esc(FIELD_LBL[k] || k)}:</span> ${esc(val(v.antes)) || '—'}</div>`).join('')}</td><td>${Object.entries(o.campos).map(([k,v]) => `<div><span class="log">${esc(FIELD_LBL[k] || k)}:</span> <b>${esc(val(v.nuevo))}</b></div>`).join('')}</td>`;
    return `<tr data-g="${esc(o.sec || 'gen')}"><td>${ad ? `<input type="checkbox" data-lo="${i}" ${o.on ? 'checked' : ''}>` : ''}</td><td>${chip(o.k === 'campo' ? 'Dato' : o.k === 'nuevo' ? 'Nuevo' : 'Cambio', o.k === 'nuevo' ? 's-ok' : o.k === 'cambio' ? 's-info' : 's-na')}</td>
      <td><b>${esc(o.label)}</b>${o.aviso ? `<div class="log" style="color:var(--bad)">⚠ ${esc(o.aviso)}</div>` : ''}</td>${det}</tr>`; };
  const groups = [['gen','Datos generales'], ...['doc','tools','mat','train','serv','infra'].map(k => [k, SECN(k)])].filter(([g]) => ops.some(o => (o.sec || 'gen') === g));
  const vw = document.createElement('div'); vw.id = 'viewer'; document.body.appendChild(vw);
  vw.innerHTML = `<div class="vbox" style="width:min(1200px,100%)"><div class="vbar"><b>Lectura: ${esc(l.fuente?.filename || '')}</b>${/claude/i.test(l.por || '') ? '<span class="b b-x">🤖 Claude</span>' : ''}<span style="margin-left:auto"></span>
      ${l.fuente?.evidId ? `<button class="btn sm" data-view="${esc(l.fuente.evidId)}">Ver documento</button>` : ''}<button class="btn sm" data-vclose>Cerrar ✕</button></div>
    <div class="vbody" style="background:var(--card,#fff)">
      <div class="note2" style="margin:0 0 8px">${esc(l.tipoDoc || 'Documento')} · leído por ${esc(l.por || '')} · ${esc(lectResumen(ops))}. ${ad ? 'Marca lo que quieres aplicar. Los puntos con ⚠ vienen desmarcados: revísalos contra el documento.' : ''}${l.notas ? `<br><b>Notas de la lectura:</b> ${esc(l.notas)}` : ''}</div>
      ${ad ? `<div class="toolbar" style="margin-bottom:6px"><button class="btn sm" data-lall="1">Marcar todo</button><button class="btn sm" data-lall="0">Desmarcar todo</button><button class="btn sm" data-lall="ok">Solo sin avisos</button></div>` : ''}
      ${groups.map(([g, n]) => `<h3 style="margin:12px 0 4px">${esc(n)} <span class="log">(${ops.filter(o => (o.sec || 'gen') === g).length})</span>${ad ? ` <button class="btn sm" data-lgrp="${g}">alternar sección</button>` : ''}</h3>
        <table class="items"><thead><tr><th style="width:26px"></th><th style="width:70px"></th><th>Elemento</th><th>Hoy en el expediente</th><th>Según el documento</th></tr></thead><tbody>${ops.map((o, i) => (o.sec || 'gen') === g ? row(o, i) : '').join('')}</tbody></table>`).join('') || '<div class="empty">La lectura no encontró datos aplicables a este expediente.</div>'}
      ${ad ? `<div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="btn pri" id="lcGo">Aplicar seleccionados</button><button class="btn" id="lcNo">Descartar lectura</button><span class="log" id="lcN"></span></div>` : ''}
    </div></div>`;
  const cnt = () => { const n = vw.querySelectorAll('[data-lo]:checked').length; if ($('#lcN')) $('#lcN').textContent = `${n} de ${ops.length} seleccionados`; };
  vw.querySelector('[data-vclose]').onclick = () => vw.remove(); cnt();
  vw.querySelectorAll('[data-lo]').forEach(i => i.onchange = cnt);
  vw.querySelectorAll('[data-lall]').forEach(b => b.onclick = () => { vw.querySelectorAll('[data-lo]').forEach(i => i.checked = b.dataset.lall === 'ok' ? !ops[+i.dataset.lo].aviso : b.dataset.lall === '1'); cnt(); });
  vw.querySelectorAll('[data-lgrp]').forEach(b => b.onclick = () => { const L = [...vw.querySelectorAll(`tr[data-g="${b.dataset.lgrp}"] [data-lo]`)], v = !L.every(i => i.checked); L.forEach(i => i.checked = v); cnt(); });
  if ($('#lcNo')) $('#lcNo').onclick = () => armed($('#lcNo'), async () => { const {id, ...r} = store.lect.get(l.id); await writeDoc('lect/' + l.id, {...r, estado:'descartada', revisadoPor:`${SESSION.name} · ${fmt(today())}`}); vw.remove(); });
  if ($('#lcGo')) $('#lcGo').onclick = async () => {
    const sel = [...vw.querySelectorAll('[data-lo]:checked')].map(i => ops[+i.dataset.lo]); if (!sel.length) return flash('No hay nada seleccionado.', true);
    $('#lcGo').disabled = true;
    try { const q = JSON.parse(JSON.stringify(store.proj.get(p.id))), n = applyOps(q, sel); await saveProj(q);
      const {id, ...r} = store.lect.get(l.id); await writeDoc('lect/' + l.id, {...r, estado:'aplicada', aplicados:n, revisadoPor:`${SESSION.name} · ${fmt(today())}`});
      logAct('aplica lectura', 'proj/' + p.id, `${n} cambios desde ${l.fuente?.filename || 'documento'}`); flash(`${n} cambio(s) aplicados al expediente.`); vw.remove();
    } catch(e){ flash('No se pudo aplicar (' + (e.code || e.message || 'error') + ').', true); $('#lcGo').disabled = false; }
  };
}

// ---------- Form QC-020 · Tools, Fixtures, Equipment and Materials Equivalency Summary (Tablas A y B)
async function buildQC020(p){
  const K = await faaKit(), {doc, F, FB, H, HB, rgb, wrap} = K, W = 792, Hh = 612, M = 36, CW = W - 2*M, LINE = rgb(.2,.2,.24), INK = rgb(.08,.08,.1), GREY = rgb(.93,.94,.96);
  const q = p.qc020 || {}, docs = (sec(p, 'doc')?.items || []).filter(it => it.numero && /^\d\d-\d\d-\d\d/.test(it.numero));
  const tools = (sec(p, 'tools')?.items || []).filter(it => it.status !== 'na'), mats = (sec(p, 'mat')?.items || []).filter(it => it.status !== 'na');
  doc.setTitle(pdfSafe(`QC-020 Equivalency Summary - ${q.desc || p.desc}`));
  let pg, y, pn = 0;
  const T = (s, x, yy, f = F, sz = 9) => pg.drawText(pdfSafe(String(s ?? '')), {x, y:yy, size:sz, font:f, color:INK});
  const C = (s, x, w, yy, f = F, sz = 9) => { const t = pdfSafe(String(s ?? '')); T(t, x + (w - f.widthOfTextAtSize(t, sz)) / 2, yy, f, sz); };
  const box = (x, yy, w, h, fill) => pg.drawRectangle({x, y:yy, width:w, height:h, borderColor:LINE, borderWidth:.6, ...(fill ? {color:fill} : {})});
  const newPage = async () => { pg = doc.addPage([W, Hh]); pn++;
    C('TOOLS, FIXTURES, EQUIPMENT AND MATERIALS EQUIVALENCY SUMMARY', M, CW, Hh - 40, HB, 12);
    T('FAA CRS# APAY048E', M, Hh - 60, HB, 8); T('DGAC CMA 655', M, Hh - 71, HB, 8);
    const {img} = await pdfLogo(doc), lw = 120, lh = lw * img.height / img.width; pg.drawImage(img, {x:W - M - lw, y:Hh - 30 - lh, width:lw, height:lh});
    { const bl = pdfSafe(BRAND_LINE); pg.drawText(bl, {x:W - M - H.widthOfTextAtSize(bl, 6.5), y:Hh - 30 - lh - 9, size:6.5, font:H, color:INK}); } // regla 2: línea de marca bajo el logo
    T('Form QC-020, Rv. 1, Date: 08-07-2024', M, 22, F, 7.5); T('Page ' + pn, W - M - 30, 22, F, 7.5); y = Hh - 86; };
  const rowsTable = async (cols, rows, title, headH = 24) => {
    const head = async () => { box(M, y - 16, CW, 16, GREY); C(title, M, CW, y - 11.5, HB, 9); y -= 16; let x = M;
      cols.forEach(c => { box(x, y - headH, c.w, headH, GREY); const L = wrap(c.h, HB, 8, c.w - 6); L.forEach((t, i) => C(t, x, c.w, y - headH/2 + (L.length - 1) * 4.5 - i * 9 - 3, HB, 8)); x += c.w; }); y -= headH; };
    await head();
    for (const r of rows){
      const L = cols.map((c, i) => wrap(r[i] ?? '', F, 8.5, c.w - 8)), h = Math.max(1, ...L.map(l => l.length)) * 10 + 8;
      if (y - h < 60){ await newPage(); await head(); }
      let x = M; cols.forEach((c, i) => { box(x, y - h, c.w, h); L[i].forEach((t, j) => C(t, x, c.w, y - h/2 + (L[i].length - 1) * 5 - j * 10 - 3, F, 8.5)); x += c.w; }); y -= h;
    }
  };
  await newPage();
  // UNIT
  const uc = [60, 150, 170, 140, CW - 520]; box(M, y - 14, CW, 14, GREY); C('UNIT', M, CW, y - 10, HB, 9); y -= 14;
  let x = M; ['1. ATA','2. MANUFACTURER','3. DESCRIPTION','4. MANUAL','5. REV. N° / DATED'].forEach((h, i) => { box(x, y - 14, uc[i], 14, GREY); C(h, x, uc[i], y - 10, HB, 8); x += uc[i]; }); y -= 14;
  const man = docs.map(d => `${d.tipoManual || 'CMM'} ${d.numero}`), rev = docs.map(d => `Rev. ${d.revision ?? '—'}${d.fechaRev ? ' / ' + d.fechaRev : ''}`);
  const uv = [[p.ata || ''], wrap(p.mfr || '', F, 9, uc[1] - 8), wrap(q.desc || p.desc || '', F, 9, uc[2] - 8), man.length ? man : (p.cmm || []), rev.length ? rev : ['']], uh = Math.max(2, ...uv.map(v => v.length)) * 11 + 8;
  x = M; uv.forEach((v, i) => { box(x, y - uh, uc[i], uh); v.forEach((t, j) => C(t, x, uc[i], y - uh/2 + (v.length - 1) * 5.5 - j * 11 - 3, F, 9)); x += uc[i]; }); y -= uh;
  box(M, y - 14, CW, 14, GREY); C('6. UNIT P/N', M, CW, y - 10, HB, 8); y -= 14; const pl = wrap((p.pns || []).join(', '), F, 9, CW - 10); box(M, y - (pl.length * 11 + 6), CW, pl.length * 11 + 6); pl.forEach((t, j) => C(t, M, CW, y - 12 - j * 11, F, 9)); y -= pl.length * 11 + 6 + 12;
  const ca = [190, 110, 140, 80, CW - 520];
  await rowsTable([{h:'7. DESCRIPTION', w:ca[0]}, {h:'8. OEM P/N', w:ca[1]}, {h:'9. EQUIVALENT P/N', w:ca[2]}, {h:'10. AVAILABLE IN CMA OR MRO', w:ca[3]}, {h:'11. USE', w:ca[4]}],
    tools.map(t => [t.title, t.pn || 'w/o Reference', t.pnAlt || '', t.disponible || (DONE.has(t.status) ? 'YES' : 'NO'), t.uso || '']), 'TABLE A)  SPECIAL TOOLS, FIXTURES AND EQUIPMENT FOR UNIT');
  y -= 14; if (y < 140){ await newPage(); }
  const cb = [190, 140, 140, CW - 470];
  await rowsTable([{h:'12. DESCRIPTION', w:cb[0]}, {h:'13. OEM P/N', w:cb[1]}, {h:'14. ALTERNATIVE', w:cb[2]}, {h:'15. USE', w:cb[3]}],
    mats.map(t => [t.title, t.pn || 'w/o Reference', t.pnAlt || '', t.uso || '']), 'TABLE B)  MATERIALS', 16);
  if (y < 130) await newPage();
  y -= 30; T('CHECKED BY:', M, y, HB, 9); y -= 40;
  pg.drawLine({start:{x:M + 40, y}, end:{x:M + 260, y}, thickness:.6, color:LINE});
  C(q.revisadoPor || '', M + 40, 220, y - 12, HB, 9); C(q.cargo || '', M + 40, 220, y - 24, F, 8.5);
  const MO = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'], dq = /^(\d{4})-(\d\d)-(\d\d)$/.exec(q.fecha || '');
  T('DATE: ' + (dq ? `${MO[+dq[2] - 1]} / ${dq[3]} / ${dq[1]}` : '____________'), W - M - 220, y - 12, HB, 9);
  return await doc.save();
}
