
// ===================== SISTEMA · ingreso, usuarios, registro, respaldo, compresión, autoridades, versión
const APP_VER = '01.03.02';
const CHANGELOG = [
  ['01.03.02', '2026-11-16', 'Datos: Sistema › Exportar todo: un .zip con datos_completos.json (fuente exacta), datos_completos.xlsx (una hoja por entidad), todos los archivos adjuntos y un manifiesto con conteos y CRC32, para migrar la plataforma a Claude Code.'],
  ['01.03.01', '2026-11-13', 'Evidencias: cada sección del expediente muestra cuántos datos leídos esperan confirmación, con acceso directo a la revisión.'],
  ['01.03.00', '2026-11-13', 'Evidencias: una sola entrada “Carga y lectura de documentos” por expediente: se sube cualquier documento, Claude lo lee (texto o escaneo) y propone datos generales, ítems nuevos y cambios en todas las secciones; nada se aplica sin confirmar campo por campo, con avisos de inconsistencias (revisión menor, herramienta en cotización vs. disponible). Herramientas con campo “Disponible en CMA/MRO”. Generación del formulario QC-020 (Tablas A y B) desde el expediente.'],
  ['01.02.01', '2026-11-12', 'Accesos: modo desarrollo protegido (solo el propietario escribe datos y archivos; quienes reciban acceso solo ven), sello “🤖 Cargado vía Claude” en documentos subidos desde un chat, y estado de protección en la auditoría.'],
  ['01.02.00', '2026-11-12', 'Accesos: corrección de la pestaña Bases (no guardaba agregados ni descripciones de cargo), Enter para agregar y aviso al guardar. Evidencias: espacio para la autoevaluación firmada en PDF y lectura con Claude que propone las respuestas de la tabla QC-021 para revisar antes de aplicar; carga de la presentación FAA del ELT (13 documentos comprimidos, aceptados).'],
  ['01.01.01', '2026-11-12', 'Accesos: permisos por usuario (ver, editar, subir, aprobar FAA, bases, circulares, usuarios, respaldo), perfiles Administrador, Gerencia, Colaborador limitado, Visor e Invitado de 8 horas que se elimina solo; Sistema ordenado en secciones; corrección de pestañas mezcladas. Datos: fichas del personal editables, varias especialidades por persona, pestaña Bases (cargos, áreas, especialidades, niveles, tareas OJT) como listas desplegables, registro y correlativo de circulares.'],
  ['01.00.00', '2026-11-12', 'Primera versión DEMO. Diseño: una sola plataforma (Capacidades + Personal y capacitación), ingreso con usuario y contraseña, logo y autoridades en la web y en los documentos. Accesos: usuarios internos con rol y módulos, registro de modificaciones por usuario, aprobación FAA interna y DGAC con respaldo (dual con ambas), previsualización y nuevos filtros del roster. Datos: 7 autoridades con vencimiento, respaldo automático en dos generaciones, compresión de archivos al subir.'],
];
const LOGO = '__LOGO__';
const AUTHS = [
  {id:'DGAC', pais:'Chile', aut:'DGAC', cert:'CMA #655', nac:true, sinVenc:true, det:'Centro de Mantenimiento Aeronáutico'},
  {id:'FAA', pais:'Estados Unidos', aut:'FAA', cert:'CRS #APAY048E', det:'Certificated Repair Station'},
  {id:'IDAC', pais:'República Dominicana', aut:'IDAC', cert:'655-4'},
  {id:'ANAC-AR', pais:'Argentina', aut:'ANAC', cert:'TAER #1B-707'},
  {id:'ANAC-BR', pais:'Brasil', aut:'ANAC', cert:'202601-04'},
  {id:'UAEAC', pais:'Colombia', aut:'Aerocivil (UAEAC)', cert:'OMA #243'},
  {id:'AFAC', pais:'México', aut:'AFAC', cert:'CO-267-24'},
];
const BRAND_LINE = 'DGAC CMA #655 · FAA CRS #APAY048E';
const PERMS = [['cap','Ver Capacidades'],['pers','Ver Personal y capacitación'],['cap.edit','Editar expedientes y aprobar evidencias'],['cap.upload','Subir evidencias de capacidades'],['faa','Aprobación FAA interna'],
  ['pers.edit','Editar fichas del personal'],['pers.upload','Adjuntar certificados del personal'],['pers.bases','Editar bases de personal'],['circ','Emitir y anular circulares'],['users','Administrar usuarios'],['bak','Respaldo, restauración y auditoría']];
const PRESETS = {admin:PERMS.map(p => p[0]), gerencia:['cap','pers','faa','circ'], colaborador:['cap','pers','cap.upload','pers.upload'], visor:['cap','pers'], invitado:['cap','pers']};
const UROLES = {admin:'Administrador', gerencia:'Gerencia', colaborador:'Colaborador limitado', visor:'Visor', invitado:'Invitado (8 horas)'};
const GUEST_MS = 8 * 3600e3;
const DEF_USERS = {}; // versión local sin cuentas: el usuario inicial y su credencial de la 01.03.02 se retiraron del código
const SESSION = {u:null, name:null, rol:null, mods:[], perms:[], exp:null};
const permsOf = u => u.perms || (PRESETS[u.rol] || []).filter(p => (p !== 'cap' && p !== 'pers') || !u.mods || u.mods.includes(p));
const can = p => !!SESSION.u && SESSION.perms.includes(p);
const expired = u => !!u.exp && Date.now() > new Date(u.exp).getTime();
const PERS_V = ['fichas','listados','informe','bases'];
const NOLOG = /^(snap|log|bak)(\/|$)/;

async function sha256(s){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join(''); }
const userRec = u => { const d = store.users.get(u); return d ? d : DEF_USERS[u] ? {id:u, ...DEF_USERS[u]} : null; };
const allUsers = () => { const m = new Map(Object.entries(DEF_USERS).map(([k,v]) => [k, {id:k, ...v}])); store.users.forEach((v,k) => m.set(k, v)); return [...m.values()]; };
const canFaa = () => RT.role === 'admin' && can('faa');

// ---------- registro de modificaciones (cada escritura pasa por aquí)
function logAct(act, ref, det){
  if (!RT.db0 || !SESSION.u || RT.role === 'visor') return;
  try { RT.db0.collection('log').add({at:new Date().toISOString(), u:SESSION.u, act, ref:String(ref||''), det:String(det||'').slice(0,160)}).catch(() => {}); } catch(e){}
}
const brief = (path, d) => { if (!d) return ''; const c = path.split('/')[0];
  return c === 'proj' ? (d.desc || '') : c === 'evid' ? (d.filename || '') + (d.projId ? ' · ' + d.projId : '') : c === 'rev' ? (d.status || '') : c === 'certs' ? `${d.nombre || ''} · ${d.filename || ''}` : c === 'train' ? (d.nombre || d.grupo || '') : c === 'users' ? (d.rol || '') : c === 'pers' ? [d.apellido, d.nombre].filter(Boolean).join(' ') : c === 'circ' ? (d.titulo || '') : ''; };
function wrapDb(db){
  const wdoc = (ref, path) => ({
    set: async d => { const r = await ref.set(d); if (!NOLOG.test(path)) logAct('guarda', path, brief(path, d)); return r; },
    update: async d => { const r = await ref.update(d); if (!NOLOG.test(path)) logAct('actualiza', path, Object.keys(d || {}).join(', ')); return r; },
    delete: async () => { const r = await ref.delete(); if (!NOLOG.test(path)) logAct('elimina', path, ''); return r; },
    get: () => ref.get(), onSnapshot: (...a) => ref.onSnapshot(...a) });
  return { doc: p => wdoc(db.doc(p), p),
    collection: c => { const col = db.collection(c); return {
      add: async d => { const r = await col.add(d); if (!NOLOG.test(c)) logAct('crea', c + (r && r.id ? '/' + r.id : ''), brief(c, d)); return r; },
      doc: k => wdoc(col.doc(k), c + '/' + k), onSnapshot: (...a) => col.onSnapshot(...a), get: () => col.get() }; } };
}
window.wrapDb = wrapDb;

// ---------- compresión al subir: fotos -> JPEG liviano; PDF escaneado -> páginas JPEG livianas (sin OCR)
const sniffImg = b => b && b[0] === 0x89 && b[1] === 0x50 ? 'png' : b && b[0] === 0xFF && b[1] === 0xD8 ? 'jpg' : null;
const SLIM = {imgMax:1800, imgQ:0.72, pdfW:1100, pdfQ:0.5, saved:0, n:0};
const cvBlob = (cv, q) => new Promise(r => cv.toBlob(r, 'image/jpeg', q));
async function slimImage(f){
  const bmp = await createImageBitmap(f), s = Math.min(1, SLIM.imgMax / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
  const b = await cvBlob(cv, SLIM.imgQ); return b && b.size < f.size * 0.9 ? new File([b], f.name.replace(/\.[^.]+$/, '') + '.jpg', {type:'image/jpeg'}) : f;
}
async function slimPdf(f){
  if (f.size < 400 * 1024) return f;
  const lib = await loadPdfjs(), src = await lib.getDocument({data: new Uint8Array(await f.arrayBuffer())}).promise;
  const out = await PDFLib.PDFDocument.create(); let total = 0;
  for (let i = 1; i <= src.numPages; i++){
    const pg = await src.getPage(i), v0 = pg.getViewport({scale:1}), v = pg.getViewport({scale: Math.min(2.2, SLIM.pdfW / Math.min(v0.width, v0.height))});
    const cv = document.createElement('canvas'); cv.width = Math.round(v.width); cv.height = Math.round(v.height);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    await pg.render({canvasContext:g, viewport:v}).promise;
    const b = await cvBlob(cv, SLIM.pdfQ), bytes = new Uint8Array(await b.arrayBuffer()); total += bytes.length;
    if (total > f.size * 0.9) return f; // no vale la pena: se conserva el original
    const img = await out.embedJpg(bytes), p = out.addPage([v0.width, v0.height]); p.drawImage(img, {x:0, y:0, width:v0.width, height:v0.height});
    cv.width = cv.height = 0;
  }
  const res = await out.save(); return res.length < f.size * 0.9 ? new File([res], f.name, {type:'application/pdf'}) : f;
}
async function slimUp(f){
  try { const t = (f.type || '').toLowerCase(), n = (f.name || '').toLowerCase(); let o = f;
    if (/image\/(jpe?g|png|webp)/.test(t) || /\.(jpe?g|png|webp)$/.test(n)) o = await slimImage(f);
    else if (t.includes('pdf') || n.endsWith('.pdf')) o = await slimPdf(f);
    if (o !== f){ SLIM.saved += f.size - o.size; SLIM.n++; flash(`${f.name}: ${(f.size/1048576).toFixed(2)} MB → ${(o.size/1048576).toFixed(2)} MB`); }
    return o;
  } catch(e){ return f; }
}
function wrapAssets(as){ if (!as) return as; return { upload: async f => { const o = await slimUp(f); if (o.size > 20*1024*1024) throw new Error('supera 20 MB incluso comprimido'); return as.upload(o); }, delete: id => as.delete(id) }; }
window.wrapAssets = wrapAssets; window.flash = flash; window.appCanUpload = () => (RT.role === 'admin' || RT.role === 'colaborador') && (can('pers.upload') || can('pers.edit')); window.appCan = p => can(p) && RT.role !== 'visor'; window.appCfg = k => store.cfg.get(k); window.appSaveCfg = (k, d) => writeDoc('cfg/' + k, d); window.LOGO_SRC = LOGO; window.BRAND_LINE_TXT = BRAND_LINE;

// ---------- logo y autoridades en los PDF
const _lg = new WeakMap();
async function pdfLogo(doc){ if (!_lg.has(doc)) _lg.set(doc, {img: await doc.embedPng(LOGO), f: await doc.embedFont(PDFLib.StandardFonts.Helvetica)}); return _lg.get(doc); }
async function pdfBrand(doc, pg, W, H, dark=true){ // encabezado, lado derecho
  const {img, f} = await pdfLogo(doc), w = 118, h = w * img.height / img.width, x = W - 36 - w - 8, y = H - 12 - h - 8, c = PDFLib.rgb;
  pg.drawRectangle({x, y, width:w + 16, height:h + 12, color:c(1,1,1)}); pg.drawImage(img, {x:x + 8, y:y + 6, width:w, height:h});
  const s = pdfSafe(BRAND_LINE); pg.drawText(s, {x:x + 16 + w - f.widthOfTextAtSize(s, 6.5), y:y - 9, size:6.5, font:f, color: dark ? c(0.88,0.92,0.97) : c(0.3,0.33,0.38)});
}
window.pdfBrand = pdfBrand; window.sniffImg = sniffImg;

// ---------- ingreso
let loginFails = 0, loginLock = 0;
function sessSave(){ try { SESSION.u ? sessionStorage.setItem('apas_u', SESSION.u) : sessionStorage.removeItem('apas_u'); } catch(e){} }
function setSession(r){ { const pm = permsOf(r); Object.assign(SESSION, {u:r.id, name:r.name || r.id, rol:r.rol, perms:pm, mods:pm.filter(p => p === 'cap' || p === 'pers'), exp:r.exp || null}); } sessSave(); document.body.classList.remove('locked'); $('#login').hidden = true; paintUser(); if (!location.hash) location.hash = '#inicio'; render(); window.dispatchEvent(new Event('apas-session')); }
function logout(){ logAct('salida', 'sesión', ''); Object.assign(SESSION, {u:null, name:null, rol:null, mods:[], perms:[], exp:null}); sessSave(); document.body.classList.add('locked'); showLogin(); }
function paintUser(){ const el = $('#userBox'); if (!el) return; el.innerHTML = SESSION.u ? `<span class="role">${esc(SESSION.name)} · ${esc(UROLES[SESSION.rol] || SESSION.rol)}${SESSION.exp ? ' · hasta ' + new Date(SESSION.exp).toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'}) : ''}${RT.ready && RT.role === 'visor' ? ' · solo lectura' : ''}</span><button class="btn sm" id="outBtn">Salir</button>` : '';
  if ($('#outBtn')) $('#outBtn').onclick = logout; }
function showLogin(msg){
  const L = $('#login'); L.hidden = false;
  L.innerHTML = `<form class="lbox" id="lForm" autocomplete="off"><img src="${LOGO}" alt="APAS Chile" style="width:240px;max-width:80%"><h2>Plataforma de Calidad</h2>
    <div class="lsub">Capacidades · Personal y capacitación</div>
    <label>Usuario<input id="lU" autocapitalize="none" spellcheck="false"></label><label>Contraseña<input id="lP" type="password"></label>
    <div class="lerr" id="lErr">${esc(msg || '')}</div><button class="btn pri" style="width:100%;padding:10px">Ingresar</button>
    <div class="lfoot">${BRAND_LINE}<br>DEMO Ver. ${APP_VER}</div></form>`;
  $('#lForm').onsubmit = async e => { e.preventDefault();
    if (Date.now() < loginLock){ $('#lErr').textContent = `Demasiados intentos. Espera ${Math.ceil((loginLock - Date.now())/1000)} s.`; return; }
    const u = $('#lU').value.trim().toLowerCase(), pw = $('#lP').value;
    if (RT.db0 && loaded.users !== true) await new Promise(r => { let n = 0; const t = setInterval(() => { if (loaded.users === true || ++n > 20){ clearInterval(t); r(); } }, 200); });
    const r = userRec(u);
    if (r && expired(r)){ $('#lErr').textContent = 'La cuenta de invitado ya venció (8 horas).'; return; }
    if (r && r.activo !== false && await sha256(r.salt + '|' + pw) === r.hash){ loginFails = 0; setSession(r); logAct('ingreso', 'sesión', ''); }
    else { loginFails++; if (loginFails >= 5){ loginLock = Date.now() + 30000; loginFails = 0; } $('#lErr').textContent = 'Usuario o contraseña incorrectos.'; $('#lP').value = ''; }
  };
  setTimeout(() => $('#lU') && $('#lU').focus(), 50);
}
let pendSess = null;
function initSession(){ let u = null; try { u = sessionStorage.getItem('apas_u'); } catch(e){} const r = u ? userRec(u) : null; if (r && r.activo !== false && !expired(r)) setSession(r); else { pendSess = u; showLogin(); } }
function usersChanged(){ purgeGuests();
  if (!SESSION.u && pendSess){ const r = userRec(pendSess); pendSess = null; if (r && r.activo !== false && !expired(r)) setSession(r); return; }
  if (SESSION.u){ const r = userRec(SESSION.u); if (!r || r.activo === false || expired(r)) logout(); else { const pm = permsOf(r); if (String(pm) !== String(SESSION.perms) || r.rol !== SESSION.rol){ Object.assign(SESSION, {rol:r.rol, perms:pm, mods:pm.filter(p => p === 'cap' || p === 'pers'), name:r.name || r.id}); paintUser(); render(); window.dispatchEvent(new Event('apas-session')); } } } }
function purgeGuests(){ if (RT.role !== 'admin' || !RT.db) return; store.users.forEach(u => { if (expired(u) && !u._purging){ u._purging = true; writeDoc('users/' + u.id, null, 'del').catch(() => {}); } }); }
setInterval(() => { if (SESSION.exp && Date.now() > new Date(SESSION.exp).getTime()){ logout(); showLogin('Tu acceso de invitado terminó.'); } purgeGuests(); }, 60000);

// ---------- módulos
function shell(mod){
  const ok = m => SESSION.mods.includes(m);
  document.querySelectorAll('nav.mods a').forEach(a => { a.classList.toggle('on', a.dataset.m === mod); a.hidden = a.dataset.m !== 'sys' && !ok(a.dataset.m); });
  $('nav.views').hidden = mod !== 'cap'; $('#persHost').hidden = mod !== 'pers'; $('#v-sistema').hidden = mod !== 'sys'; $('#foot').hidden = mod !== 'cap';
}
function autStrip(){ return `<div class="astrip">${AUTHS.map(a => `<span class="ach ${a.nac ? 'nac' : ''}"><b>${esc(a.aut)}</b> ${esc(a.pais)}<small>${esc(a.cert)}</small></span>`).join('')}</div>`; }

// ---------- autoridades (pestaña Capacidades › Autoridades)
function autState(a){ const v = store.cfg.get('aut')?.venc?.[a.id]; if (a.sinVenc) return ['Sin vencimiento','s-ok', null];
  if (!v) return ['Vencimiento sin registrar','s-na', null]; const d = Math.round((new Date(v) - new Date(today())) / 86400000);
  return d < 0 ? [`Vencido hace ${-d} días`, 's-bad', v] : d <= 90 ? [`Vence en ${d} días`, 's-bad', v] : d <= 180 ? [`Vence en ${Math.round(d/30)} meses`, 's-warn', v] : [`Vigente hasta ${fmt(v)}`, 's-ok', v]; }
function renderAut(){
  const ps = projects().filter(p => p.tipo === 'Certificación extranjera'), ad = isAdmin();
  const lists = Object.values(S.lists).map(l => `${l.name} Rev ${l.rev}`).join(' · ');
  const card = a => { const [t, c, v] = autState(a);
    return `<div class="acard"><div class="ah"><b>${esc(a.aut)} · ${esc(a.pais)}</b><span class="b ${a.id === 'FAA' ? 'b-FAA' : a.id === 'DGAC' ? 'b-DGAC' : 'b-x'}">${esc(a.cert)}</span></div>
      <small>${esc(a.det || 'Certificación extranjera')}</small><div style="margin-top:6px">${chip(t, c)}</div>
      ${a.id === 'FAA' ? `<div class="ax">${esc(lists)}</div>` : a.id === 'DGAC' ? `<div class="ax">Lista de Capacidad Rev ${esc(S.dgacList.rev)} (${esc(fmt(S.dgacList.date))})</div>` : ''}
      ${ad && !a.sinVenc ? `<label class="log" style="display:block;margin-top:8px">Vencimiento <input type="date" data-av="${a.id}" value="${esc(v || '')}"></label>` : ''}</div>`; };
  $('#capBody').innerHTML = `<h2 class="sec">Autoridad nacional</h2><div class="agrid">${AUTHS.filter(a => a.nac).map(card).join('')}</div>
    <h2 class="sec">Autoridades internacionales</h2><div class="agrid">${AUTHS.filter(a => !a.nac).map(card).join('')}</div>
    <h2 class="sec">Proyectos ante nuevas autoridades</h2>
    <div class="wrap"><table><thead><tr><th>Proyecto · situación actual</th><th>País</th><th>Término estimado</th><th>Autoridad</th><th>Etapa</th><th>Avance</th></tr></thead><tbody>${projRows(ps.map(p => ({...p, modeloAeronave:p.pais}))) || '<tr><td colspan="6" class="empty">Sin proyectos</td></tr>'}</tbody></table></div>
    <div class="note2">Cada autoridad extranjera tiene su propio vencimiento: regístralo en su tarjeta y el semáforo avisa a 6 y 3 meses. El proceso de habilitación ante una nueva autoridad aún no está definido.</div>`;
  $('#capBody').onclick = e => { const r = e.target.closest('tr[data-p]'); if (r) openProject(r.dataset.p); };
  $('#capBody').querySelectorAll('[data-av]').forEach(i => i.onchange = () => { const c = store.cfg.get('aut') || {}; writeDoc('cfg/aut', {venc:{...(c.venc || {}), [i.dataset.av]: i.value || null}}).then(() => flash('Vencimiento guardado.')).catch(() => flash('No se guardó.', true)); });
}

// ---------- aprobación por autoridad: FAA interna (alto cargo) + DGAC con respaldo; dual = ambas
const usesApr = p => p.tipo === 'Componente' && (p.autoridad || []).some(a => a === 'FAA' || a === 'DGAC');
function aprOf(p){ const a = p.apr || {}, leg = !p.apr && !!p.aprobacion, o = {};
  for (const k of ['FAA','DGAC']) if ((p.autoridad || []).includes(k)) o[k] = a[k] || (leg ? {ok:true, date:p.fechaAprobacion || null, legacy:true} : {ok:false}); return o; }
const aprAll = p => { const o = aprOf(p), ks = Object.keys(o); return ks.length > 0 && ks.every(k => o[k].ok); };
const dgacEv = p => evOfProj(p.id).filter(e => e.tipo === 'aprobDGAC');
function aprHtml(p, ad){
  const o = aprOf(p), ready = partsOf(p).every(x => x[1]), ev = dgacEv(p), out = [];
  if (o.FAA) out.push(o.FAA.ok ? `<span class="b s-ok">✓ FAA · ${o.FAA.legacy ? 'aprobada' : 'aprobación interna'}${o.FAA.by ? ' · ' + esc(o.FAA.by) : ''}${o.FAA.date ? ' · ' + esc(fmt(o.FAA.date)) : ''}</span>${canFaa() ? '<button class="btn sm" data-apr="FAA:0" title="Quitar aprobación FAA">×</button>' : ''}`
    : (ad || canFaa()) ? `<button class="btn sm pri" data-apr="FAA:1" ${canFaa() && ready ? '' : 'disabled'} title="${!canFaa() ? 'Requiere el permiso “Aprobación FAA interna”' : ready ? 'Aprueba la inclusión en la lista de capacidades FAA' : 'Primero debe estar completa la autoevaluación'}">Aprobar FAA (interna)</button>` : chip('○ FAA pendiente','s-na'));
  if (o.DGAC) out.push(o.DGAC.ok ? `<span class="b s-ok">✓ DGAC${o.DGAC.date ? ' · ' + esc(fmt(o.DGAC.date)) : ''}</span>${ad ? '<button class="btn sm" data-apr="DGAC:0" title="Quitar aprobación DGAC">×</button>' : ''}`
    : ad ? `<button class="btn sm" data-aprup>📎 Adjuntar aprobación DGAC (oficio o correo)</button>${ev.length ? '<button class="btn sm pri" data-apr="DGAC:1">Registrar aprobación DGAC</button>' : ''}` : chip('○ DGAC pendiente','s-na'));
  if (o.FAA && o.DGAC) out.push(o.FAA.ok && o.DGAC.ok ? '<span class="b b-x" style="font-weight:700">DUAL</span>' : chip('Dual: requiere ambas aprobaciones','s-na'));
  return `<span class="aprbox">${out.join(' ')}${ev.length ? `<span class="log" style="width:100%">Respaldo DGAC: ${ev.map(e => `<a href="#" class="lnk" data-view="${esc(e.id)}">${esc(e.filename)}</a>`).join(' · ')}</span>` : ''}</span>`;
}
function bindApr(p){
  const M = $('#eMain'), save = fn => { const q = JSON.parse(JSON.stringify(store.proj.get(p.id))); q.apr = aprOf(q); fn(q); q.aprobacion = aprAll(q); if (q.aprobacion && !q.fechaAprobacion) q.fechaAprobacion = today(); return saveProj(q); };
  M.querySelectorAll('[data-apr]').forEach(b => b.onclick = () => armed(b, () => { const [k, v] = b.dataset.apr.split(':');
    save(q => { q.apr[k] = v === '1' ? {ok:true, by:SESSION.name, user:SESSION.u, date:today(), ...(k === 'DGAC' ? {ev:dgacEv(p).map(e => e.id)} : {interna:true})} : {ok:false}; });
    logAct(v === '1' ? 'aprueba ' + k : 'quita aprobación ' + k, 'proj/' + p.id, p.desc); }));
  const up = M.querySelector('[data-aprup]'); if (up) up.onclick = () => pickFiles(files => uploadEvid(p, null, files, {tipo:'aprobDGAC'}));
}

// ---------- respaldo en dos generaciones (A = último, B = anterior). La página no tiene función para borrarlos.
let bakBusy = false, bakTry = 0;
const BAK_COLS = ['proj','evid','rev','train','art','cfg','users','circ','lect'];
function bakPayload(){ const data = {}; BAK_COLS.forEach(c => data[c] = [...store[c].values()]); data.certs = window.__certs ? [...window.__certs.values()] : []; data.pers = window.__persDocs ? [...window.__persDocs.entries()].map(([id, d]) => ({id, ...d})) : [];
  return {ver:APP_VER, at:new Date().toISOString(), by:SESSION.u, data}; }
const rawSet = (path, d) => { const q = queues[path] || Promise.resolve(); const pr = q.then(() => RT.db0.doc(path).set(d)); queues[path] = pr.catch(() => {}); return pr; };
async function doBackup(manual){
  if (bakBusy || !RT.db0 || RT.role !== 'admin' || !can('bak')) return; bakBusy = true;
  try { const A = store.bak.get('A_meta');
    if (A && Date.now() - new Date(A.at) > 20 * 3600e3){ for (let i = 0; i < A.n; i++){ const ch = store.bak.get('A_' + i); if (ch) await rawSet('bak/B_' + i, {s:ch.s}); } const {id, ...m} = A; await rawSet('bak/B_meta', m); }
    const P = bakPayload(), s = JSON.stringify(P), parts = []; for (let i = 0; i < s.length; i += 60000) parts.push(s.slice(i, i + 60000));
    for (let i = 0; i < parts.length; i++) await rawSet('bak/A_' + i, {s:parts[i]});
    await rawSet('bak/A_meta', {at:P.at, by:P.by, ver:APP_VER, n:parts.length, bytes:s.length, counts:Object.fromEntries(Object.entries(P.data).map(([k,v]) => [k, v.length])), auto:!manual});
    logAct(manual ? 'respaldo manual' : 'respaldo automático', 'bak', `${(s.length/1024).toFixed(0)} KB`); if (manual) flash('Respaldo guardado.');
  } catch(e){ if (manual) flash('No se pudo respaldar (' + (e.code || e.message) + ').', true); }
  bakBusy = false;
}
function ensureBackup(){
  if (!SESSION.u || RT.role !== 'admin' || !can('bak') || loaded.proj !== true || loaded.bak !== true || loaded.cfg !== true || !store.proj.size) return;
  const days = store.cfg.get('sys')?.bakDays || 3, A = store.bak.get('A_meta');
  if (Date.now() - bakTry < 600e3) return;
  if (!A || Date.now() - new Date(A.at) > days * 86400e3){ bakTry = Date.now(); doBackup(false); }
}
function readBak(slot){ const m = store.bak.get(slot + '_meta'); if (!m) return null; let s = ''; for (let i = 0; i < m.n; i++){ const c = store.bak.get(slot + '_' + i); if (!c) return null; s += c.s; } try { return JSON.parse(s); } catch(e){ return null; } }
async function restoreBak(slot){
  const B = readBak(slot); if (!B) return flash('El respaldo no se pudo leer.', true); let n = 0;
  for (const c of [...BAK_COLS, 'certs', 'pers']) for (const d of B.data[c] || []){ const {id, ...rest} = d; try { await rawSet(c + '/' + id, rest); n++; } catch(e){} }
  logAct('restaura respaldo ' + slot, 'bak', `${n} documentos · respaldo del ${B.at.slice(0,10)}`); flash(`Restaurado: ${n} documentos del respaldo del ${fmt(B.at.slice(0,10))}.`);
}

// ---------- auditoría rápida
function auditSys(){
  const out = [], ok = (t, d) => out.push(['ok', t, d]), wr = (t, d) => out.push(['warn', t, d]), bad = (t, d) => out.push(['bad', t, d]);
  const ps = [...store.proj.values()], ev = [...store.evid.values()];
  RT.db0 ? ok('Base de datos conectada', `${ps.length} proyectos · ${ev.length} evidencias · ${store.log.size} registros`) : bad('Base de datos no disponible', 'La página está en modo solo lectura local.');
  const orph = ev.filter(e => !store.proj.has(e.projId)); orph.length ? wr(`${orph.length} evidencia(s) apuntan a un proyecto que no existe`, orph.slice(0,3).map(e => e.filename).join(', ')) : ok('Evidencias: todas pertenecen a un proyecto existente', '');
  const lost = ev.filter(e => { const p = store.proj.get(e.projId); return p && e.itemId && !(p.sections || []).some(s => s.items.some(i => i.id === e.itemId)); });
  lost.length ? wr(`${lost.length} evidencia(s) quedaron sin ítem (el ítem fue eliminado)`, lost.slice(0,3).map(e => e.filename).join(', ')) : ok('Evidencias: todas con su ítem', '');
  const pend = ev.filter(e => revOf(e.id) === 'pendiente').length; pend ? wr(`${pend} evidencia(s) por revisar`, 'Pendientes de aprobación del administrador') : ok('Sin evidencias pendientes de revisión', '');
  const noDg = ps.filter(p => usesApr(p) && p.apr?.DGAC?.ok && !dgacEv(p).length); noDg.length ? bad(`${noDg.length} proyecto(s) con DGAC aprobada sin respaldo adjunto`, noDg.map(p => p.id).join(', ')) : ok('Aprobaciones DGAC con respaldo', '');
  const A = store.bak.get('A_meta'), B = store.bak.get('B_meta');
  !A ? wr('Aún no hay respaldo', 'Se crea solo al entrar como administrador') : (Date.now() - new Date(A.at) > 4 * 86400e3 ? wr('Último respaldo con más de 4 días', fmt(A.at.slice(0,10))) : ok('Respaldo al día', `${fmt(A.at.slice(0,10))} · ${(A.bytes/1024).toFixed(0)} KB${B ? ' · generación anterior: ' + fmt(B.at.slice(0,10)) : ' · aún sin generación anterior'}`));
  if (A && !readBak('A')) bad('El último respaldo no se puede leer', 'Genera uno nuevo');
  !store.users.get('mmeza')?.hash ? wr('El usuario inicial usa la contraseña de fábrica', 'Cámbiala en Usuarios antes de compartir la página') : ok('Usuario inicial con contraseña propia', '');
  const big = ev.filter(e => (e.sizeBytes || 0) > 3 * 1048576); big.length ? wr(`${big.length} archivo(s) pesan más de 3 MB`, big.slice(0,3).map(e => `${e.filename} (${(e.sizeBytes/1048576).toFixed(1)} MB)`).join(', ')) : ok('Sin archivos pesados (> 3 MB)', '');
  const venc = AUTHS.filter(a => !a.sinVenc && !store.cfg.get('aut')?.venc?.[a.id]); venc.length ? wr(`${venc.length} autoridad(es) sin vencimiento registrado`, venc.map(a => a.aut + ' ' + a.pais).join(', ')) : ok('Vencimientos de autoridades registrados', '');
  RT.role === 'admin' ? ok('Permiso de la plataforma: propietario (puede escribir)', '') : wr('Permiso de la plataforma: ' + RT.role, 'Con cuenta personal, las personas invitadas solo pueden ver');
  ok('Modo desarrollo protegido', 'Solo el propietario escribe datos y archivos. Quien reciba la página como “Puede ver” no puede modificarla; no invites a nadie como “Puede editar”.');
  const viaC = ev.filter(e => e.via === 'claude' || /chat/i.test(e.ruta || '')).length; if (viaC) ok(`${viaC} documento(s) cargados vía Claude desde un chat`, 'Marcados con el sello 🤖 en el expediente');
  return out;
}

// ---------- circulares: registro y correlativo (el formato oficial .docx se conecta después)
const circTipos = () => store.cfg.get('circ')?.tipos || [{k:'CIR', n:'Circular de Calidad'}];
const circList = () => [...store.circ.values()].sort((a,b) => (b.year - a.year) || String(a.tipo).localeCompare(b.tipo) || (b.n - a.n));
function circNext(tipo, year){ return Math.max(0, ...[...store.circ.values()].filter(c => c.tipo === tipo && c.year === year).map(c => c.n)) + 1; }
const circCod = (t, y, n) => `${t}-${y}-${String(n).padStart(3, '0')}`;

// ---------- pestaña Sistema
let sysLogU = '', sysAudit = null, sysTab = 'version', circFile = null;
function renderSys(force){
  const el = $('#v-sistema'), ae = document.activeElement; if (!force && ((ae && el.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ae.type !== 'checkbox') || [...el.querySelectorAll('input:not([type=checkbox]):not([type=date]),textarea')].some(i => i.value))) return;
  const W = RT.role === 'admin', cu = W && can('users'), cb = W && can('bak'), cc = W && can('circ');
  const tabs = [['circ','Circulares y documentos'], ['usuarios','Usuarios y permisos'], ...(cu || cb ? [['registro','Registro de modificaciones']] : []), ...(cb ? [['respaldo','Respaldo'], ['exportar','Exportar todo'], ['auditoria','Auditoría']] : []), ['version','Versión']];
  if (!tabs.some(t => t[0] === sysTab)) sysTab = 'version';
  const A = store.bak.get('A_meta'), B = store.bak.get('B_meta'), days = store.cfg.get('sys')?.bakDays || 3;
  const mb = v => (v / 1048576).toFixed(1) + ' MB';
  let body = '';
  if (sysTab === 'version') body = `<div class="box"><h3>Versión ${chip('DEMO Ver. ' + APP_VER, 's-info')}</h3>
    <div class="hint">Numeración <b>DISEÑO . ACCESOS . DATOS</b> — 1.º: versión web, diseño, método de ingreso y presentación · 2.º: accesos, mejoras dentro de las páginas, estructura interna, evidencias y visualización · 3.º: bancos de datos (cursos, personas, listas, nuevos tipos de evidencia). Al subir un número, los de su derecha vuelven a 00.</div>
    <table class="items"><thead><tr><th>Versión</th><th>Fecha</th><th>Cambios</th></tr></thead><tbody>${CHANGELOG.map(c => `<tr><td><b>${c[0]}</b></td><td style="white-space:nowrap">${fmt(c[1])}</td><td>${esc(c[2])}</td></tr>`).join('')}</tbody></table></div>`;
  if (sysTab === 'usuarios'){
    const pchk = (sel, dis) => PERMS.map(([k,l]) => `<label class="ynr" style="min-width:250px"><input type="checkbox" data-pm="${k}" ${sel.includes(k) ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${esc(l)}</label>`).join('');
    body = `<div class="box"><h3>Usuarios y permisos</h3>
    <div class="hint">Cada usuario tiene un perfil de partida y permisos que puedes marcar uno por uno. El <b>Invitado</b> dura 8 horas desde que se crea; al vencer no puede entrar y su cuenta se elimina sola. Con tu cuenta personal de Claude, las personas que invites a la página solo pueden ver, tengan el permiso que tengan aquí.</div>
    <table class="items"><thead><tr><th>Usuario</th><th>Nombre</th><th>Perfil</th><th>Permisos</th><th>Estado</th>${cu ? '<th></th>' : ''}</tr></thead><tbody>
    ${allUsers().map(u => { const pm = permsOf(u); return `<tr><td><b>${esc(u.id)}</b></td><td>${esc(u.name || '')}</td><td>${esc(UROLES[u.rol] || u.rol)}</td><td style="font-size:12px;max-width:420px">${pm.length === PERMS.length ? 'Todos' : pm.map(k => esc((PERMS.find(p => p[0] === k) || [k,k])[1])).join(' · ') || '—'}</td>
      <td>${u.exp ? chip(expired(u) ? 'Vencido' : 'Vence ' + new Date(u.exp).toLocaleString('es-CL', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}), expired(u) ? 's-bad' : 's-warn') : chip(u.activo === false ? 'Desactivado' : 'Activo', u.activo === false ? 's-bad' : 's-ok')}${u.base && !store.users.get(u.id)?.hash ? ' ' + chip('contraseña inicial','s-warn') : ''}</td>
      ${cu ? `<td style="white-space:nowrap"><button class="btn sm" data-upm="${esc(u.id)}">Permisos</button> <button class="btn sm" data-upw="${esc(u.id)}">Contraseña</button>${u.id !== SESSION.u ? ` <button class="btn sm" data-uact="${esc(u.id)}">${u.activo === false ? 'Activar' : 'Desactivar'}</button> <button class="btn sm" data-udel="${esc(u.id)}">Eliminar</button>` : ''}</td>` : ''}</tr>
      <tr hidden data-pmrow="${esc(u.id)}"><td colspan="6"><div style="display:flex;flex-wrap:wrap;gap:4px 10px">${pchk(pm)}</div><button class="btn sm pri" data-pmsave="${esc(u.id)}" style="margin-top:8px">Guardar permisos</button></td></tr>`; }).join('')}</tbody></table>
    ${cu ? `<h3 style="margin-top:16px">Nuevo usuario</h3><div class="form" id="uForm"><label class="fld">Usuario<input id="nuU" placeholder="sin espacios"></label><label class="fld">Nombre y apellido<input id="nuN"></label><label class="fld">Contraseña (mín. 6)<input id="nuP" type="password"></label>
      <label class="fld">Perfil<select id="nuR">${Object.entries(UROLES).map(([k,l]) => `<option value="${k}" ${k === 'visor' ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div id="nuPm" style="display:flex;flex-wrap:wrap;gap:4px 10px;margin:8px 0">${pchk(PRESETS.visor)}</div><button class="btn pri" id="nuS">Crear usuario</button>` : '<div class="note2">Necesitas el permiso “Administrar usuarios” para crear o modificar usuarios.</div>'}</div>`;
  }
  if (sysTab === 'circ'){
    const y = +today().slice(0,4), tp = circTipos(), L = circList();
    body = `<div class="box"><h3>Circulares y documentos de calidad ${chip(L.length + ' registrados','s-na')}</h3>
    <div class="hint">Control documental: cada circular recibe su correlativo al emitirse (TIPO-AÑO-N.º), queda en el registro con fecha y usuario, y no se puede borrar: solo anular, dejando el motivo. El número anulado no se reutiliza. El formato oficial se conectará cuando adjuntes el .docx; por ahora se registra, se numera y se puede adjuntar el archivo emitido.</div>
    ${cc ? `<div class="form"><label class="fld">Tipo<select id="ciT">${tp.map(t => `<option value="${esc(t.k)}">${esc(t.n)} (${esc(t.k)})</option>`).join('')}</select></label>
      <label class="fld">Fecha de emisión<input type="date" id="ciF" value="${today()}"></label><label class="fld">Título / materia<input id="ciTi"></label><label class="fld">Dirigida a<input id="ciD" placeholder="Ej.: todo el personal técnico"></label>
      <label class="fld" style="grid-column:1/-1">Resumen<textarea id="ciR" rows="2"></textarea></label></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><button class="btn" id="ciA">📎 Adjuntar archivo (opcional)</button><span class="log" id="ciAn">${circFile ? esc(circFile.name) : 'Sin archivo'}</span>
        <span style="margin-left:auto" class="log">Próximo correlativo: <b id="ciNx">${esc(circCod(tp[0].k, y, circNext(tp[0].k, y)))}</b></span><button class="btn pri" id="ciS">Emitir y registrar</button></div>
      <details style="margin-top:10px"><summary class="log" style="cursor:pointer">Tipos de documento</summary><div class="evform" style="margin-top:6px"><input id="ctK" placeholder="Prefijo (ej. COM)" style="width:130px"><input id="ctN" placeholder="Nombre (ej. Comunicado de Calidad)" style="flex:1;min-width:200px"><button class="btn sm" id="ctS">Agregar tipo</button></div></details>` : ''}
    <div class="wrap" style="margin-top:12px"><table class="items"><thead><tr><th>Código</th><th>Fecha</th><th>Título / materia</th><th>Dirigida a</th><th>Emitida por</th><th>Estado</th><th>Archivo</th>${cc ? '<th></th>' : ''}</tr></thead><tbody>
    ${L.map(c => `<tr ${c.estado === 'Anulada' ? 'style="opacity:.6"' : ''}><td><b>${esc(c.cod)}</b></td><td style="white-space:nowrap">${esc(fmt(c.fecha))}</td><td>${esc(c.titulo)}${c.resumen ? `<div class="log">${esc(c.resumen)}</div>` : ''}</td><td>${esc(c.dirigido || '—')}</td><td>${esc(c.por || '')}</td>
      <td>${chip(c.estado, c.estado === 'Anulada' ? 's-bad' : 's-ok')}${c.motivo ? `<div class="log">${esc(c.motivo)}</div>` : ''}</td><td>${c.assetId ? `<a href="#" class="lnk" data-viewx='${esc(JSON.stringify({assetId:c.assetId, filename:c.filename, contentType:c.contentType}))}'>${esc(c.filename)}</a>` : '—'}</td>
      ${cc ? `<td>${c.estado !== 'Anulada' ? `<button class="btn sm" data-cian="${esc(c.id)}">Anular</button>` : ''}</td>` : ''}</tr>`).join('') || '<tr><td colspan="8" class="empty">Aún no hay circulares registradas</td></tr>'}</tbody></table></div></div>`;
  }
  if (sysTab === 'registro'){
    const logs = [...store.log.values()].sort((a,b) => (b.at||'').localeCompare(a.at||'')), lu = [...new Set(logs.map(l => l.u))].sort();
    body = `<div class="box"><h3>Registro de modificaciones ${chip(logs.length + ' registros','s-na')}<span style="margin-left:auto"><select id="lgU"><option value="">Todos los usuarios</option>${lu.map(u => `<option ${u === sysLogU ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></span></h3>
    <div class="hint">Cada cambio queda con fecha, usuario y objeto. No se puede editar ni borrar desde la página.</div>
    <div class="wrap" style="max-height:560px;overflow:auto"><table class="items"><thead><tr><th>Fecha (hora local)</th><th>Usuario</th><th>Acción</th><th>Objeto</th><th>Detalle</th></tr></thead><tbody>
    ${logs.filter(l => !sysLogU || l.u === sysLogU).slice(0, 400).map(l => `<tr><td style="white-space:nowrap">${esc(new Date(l.at).toLocaleString('es-CL'))}</td><td><b>${esc(l.u)}</b></td><td>${esc(l.act)}</td><td>${esc(l.ref)}</td><td>${esc(l.det || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Sin registros todavía</td></tr>'}</tbody></table></div></div>`;
  }
  if (sysTab === 'respaldo'){
    const evB = [...store.evid.values()].reduce((s,e) => s + (e.sizeBytes || 0), 0), ceB = window.__certs ? [...window.__certs.values()].reduce((s,e) => s + (e.sizeBytes || 0), 0) : 0;
    const bk = (m, slot, lbl) => m ? `<tr><td><b>${lbl}</b></td><td>${esc(fmt(m.at.slice(0,10)))} ${esc(m.at.slice(11,16))} UTC</td><td>${esc(m.by || '—')} · ${m.auto ? 'automático' : 'manual'}</td><td>${(m.bytes/1024).toFixed(0)} KB · ${Object.entries(m.counts || {}).filter(([,v]) => v).map(([k,v]) => `${k} ${v}`).join(' · ')}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-bdl="${slot}">⬇ Descargar</button> <button class="btn sm" data-brs="${slot}">Restaurar</button></td></tr>` : `<tr><td><b>${lbl}</b></td><td colspan="4" class="empty">Aún no existe</td></tr>`;
    body = `<div class="box"><h3>Respaldo ${chip(A ? 'Último: ' + fmt(A.at.slice(0,10)) : 'Sin respaldo', A ? 's-ok' : 's-warn')}
      <span style="margin-left:auto;display:flex;gap:6px;align-items:center"><label class="log">Frecuencia <select id="bkDays"><option value="1" ${days == 1 ? 'selected' : ''}>Diario</option><option value="3" ${days == 3 ? 'selected' : ''}>Cada 3 días</option></select></label><button class="btn sm pri" id="bkNow">Respaldar ahora</button></span></h3>
    <div class="hint">Se guarda solo al entrar con permiso de respaldo cuando el último tiene más de ${days} día(s). Siempre hay dos generaciones: el nuevo reemplaza al último y el último pasa a “anterior”. La página no tiene ninguna función para borrarlos. Incluye proyectos, evidencias (registro), revisiones, entrenamiento, usuarios, autoridades, circulares, fichas editadas y certificados del personal; los archivos mismos permanecen en el almacén de la plataforma. Descarga una copia a tu equipo de vez en cuando: es la única que queda fuera de la plataforma.</div>
    <table class="items"><thead><tr><th>Generación</th><th>Fecha</th><th>Por</th><th>Contenido</th><th></th></tr></thead><tbody>${bk(A,'A','Último')}${bk(B,'B','Anterior')}</tbody></table></div>
    <div class="box"><h3>Almacenamiento</h3><div class="kpis"><div class="kpi" style="cursor:default"><b>${mb(evB)}</b><span>${store.evid.size} evidencias de capacidades</span></div><div class="kpi" style="cursor:default"><b>${mb(ceB)}</b><span>${window.__certs ? window.__certs.size : 0} certificados del personal</span></div><div class="kpi" style="cursor:default"><b>${mb(SLIM.saved)}</b><span>ahorrados al comprimir en esta sesión (${SLIM.n} archivos)</span></div></div>
    <div class="hint">Al subir, las fotos se reducen a ${SLIM.imgMax} px (JPEG) y los PDF escaneados se rehacen como páginas de imagen liviana, sin OCR. Si la versión comprimida no es al menos 10% más liviana, se conserva el original.</div></div>`;
  }
  if (sysTab === 'exportar') body = `<div class="box"><h3>Exportación completa</h3>
    <div class="hint">Genera un .zip con TODO lo que muestra la plataforma, para migrarla (por ejemplo a Claude Code) o guardarla fuera: <b>datos_completos.json</b> (fuente exacta), <b>datos_completos.xlsx</b> (una hoja por entidad), <b>archivos/</b> con todos los adjuntos y un <b>manifiesto</b> con conteos y CRC32 para verificar. No incluye usuarios ni contraseñas de la página.</div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="btn pri" id="exGo">⬇ Exportar todo (.zip)</button><span class="log" id="exSt"></span></div></div>`;
  if (sysTab === 'auditoria') body = `<div class="box"><h3>Auditoría del sistema <span style="margin-left:auto"><button class="btn sm pri" id="auRun">Ejecutar auditoría</button></span></h3>
    ${sysAudit ? `<table class="items"><tbody>${sysAudit.map(([k,t,d]) => `<tr><td style="width:28px"><span class="dot ${k === 'ok' ? 'g' : k === 'warn' ? 'y' : 'r'}"></span></td><td><b>${esc(t)}</b>${d ? `<div class="log">${esc(d)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty" style="padding:4px 0">Revisa la integridad de los datos, respaldos, usuarios y permisos.</div>'}</div>`;
  el.innerHTML = `<div class="tabs" style="margin-top:0">${tabs.map(([k,l]) => `<button class="tab ${k === sysTab ? 'on' : ''}" data-stab="${k}">${l}</button>`).join('')}</div>${body}`;
  el.querySelectorAll('[data-stab]').forEach(b => b.onclick = () => { sysTab = b.dataset.stab; renderSys(true); });
  const blur = () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); };
  const mkUser = async (id, base, pw) => { const salt = Math.random().toString(36).slice(2) + Date.now().toString(36); const {id:_, base:__, _purging, ...rest} = base; return writeDoc('users/' + id, {...rest, salt, hash: await sha256(salt + '|' + pw), mod:new Date().toISOString(), por:SESSION.u}); };
  const readPm = box => [...box.querySelectorAll('[data-pm]:checked')].map(i => i.dataset.pm);
  if ($('#nuR')) $('#nuR').onchange = e => { const sel = PRESETS[e.target.value] || []; $('#nuPm').querySelectorAll('[data-pm]').forEach(i => i.checked = sel.includes(i.dataset.pm)); };
  if ($('#nuS')) $('#nuS').onclick = async () => { const id = $('#nuU').value.trim().toLowerCase(), pw = $('#nuP').value, rol = $('#nuR').value;
    if (!/^[a-z0-9._-]{3,20}$/.test(id)) return flash('Usuario: 3 a 20 letras, números, punto o guion.', true); if (userRec(id)) return flash('Ese usuario ya existe.', true); if (pw.length < 6) return flash('La contraseña debe tener al menos 6 caracteres.', true);
    try { await mkUser(id, {name:$('#nuN').value.trim() || id, rol, perms:readPm($('#nuPm')), activo:true, creado:new Date().toISOString(), ...(rol === 'invitado' ? {exp:new Date(Date.now() + GUEST_MS).toISOString()} : {})}, pw); blur(); flash('Usuario creado: ' + id + (rol === 'invitado' ? ' · vence en 8 horas' : '')); renderSys(true); } catch(e){ flash('No se pudo crear (' + (e.code || e.message) + ').', true); } };
  el.querySelectorAll('[data-upm]').forEach(b => b.onclick = () => { const r = el.querySelector(`[data-pmrow="${b.dataset.upm}"]`); r.hidden = !r.hidden; });
  el.querySelectorAll('[data-pmsave]').forEach(b => b.onclick = async () => { const u = userRec(b.dataset.pmsave), {id, base, _purging, ...rest} = u; const pm = readPm(b.parentElement);
    if (id === SESSION.u && !pm.includes('users')) return flash('No puedes quitarte a ti mismo el permiso de administrar usuarios.', true);
    try { await writeDoc('users/' + id, {...rest, perms:pm}); flash('Permisos guardados.'); } catch(e){ flash('No se pudo guardar.', true); } });
  el.querySelectorAll('[data-upw]').forEach(b => b.onclick = () => { const w = document.createElement('span'); w.innerHTML = ` <input type="password" placeholder="nueva contraseña" style="width:150px"> <button class="btn sm pri">Guardar</button>`; b.replaceWith(w);
    w.querySelector('button').onclick = async () => { const pw = w.querySelector('input').value; if (pw.length < 6) return flash('Mínimo 6 caracteres.', true); try { await mkUser(b.dataset.upw, userRec(b.dataset.upw), pw); blur(); flash('Contraseña actualizada.'); renderSys(true); } catch(e){ flash('No se pudo guardar.', true); } }; w.querySelector('input').focus(); });
  el.querySelectorAll('[data-uact]').forEach(b => b.onclick = () => armed(b, async () => { const u = userRec(b.dataset.uact), {id, base, _purging, ...rest} = u; await writeDoc('users/' + id, {...rest, activo: u.activo === false}); }));
  el.querySelectorAll('[data-udel]').forEach(b => b.onclick = () => armed(b, async () => { if (DEF_USERS[b.dataset.udel]) return flash('El usuario inicial no se elimina; puedes desactivarlo.', true); await writeDoc('users/' + b.dataset.udel, null, 'del'); }));
  // circulares
  const nx = () => { if ($('#ciNx')) $('#ciNx').textContent = circCod($('#ciT').value, +($('#ciF').value || today()).slice(0,4), circNext($('#ciT').value, +($('#ciF').value || today()).slice(0,4))); };
  if ($('#ciT')){ $('#ciT').onchange = nx; $('#ciF').onchange = nx; }
  if ($('#ciA')) $('#ciA').onclick = () => pickFiles(fs => { circFile = fs[0] || null; $('#ciAn').textContent = circFile ? circFile.name : 'Sin archivo'; }, 'application/pdf,image/*,.docx');
  if ($('#ciS')) $('#ciS').onclick = async () => { const tipo = $('#ciT').value, fecha = $('#ciF').value || today(), year = +fecha.slice(0,4), titulo = $('#ciTi').value.trim();
    if (!titulo) return flash('Falta el título o materia.', true);
    const n = circNext(tipo, year), cod = circCod(tipo, year, n); if (store.circ.has(cod)) return flash('Ese correlativo ya existe; vuelve a intentar.', true);
    $('#ciS').disabled = true;
    try { let file = {}; if (circFile){ const a = await RT.assets.upload(circFile); file = {assetId:a.id, filename:circFile.name, contentType:a.contentType || circFile.type, sizeBytes:a.sizeBytes || circFile.size}; }
      await writeDoc('circ/' + cod, {tipo, year, n, cod, fecha, titulo, dirigido:$('#ciD').value.trim(), resumen:$('#ciR').value.trim(), estado:'Emitida', por:SESSION.name, user:SESSION.u, at:new Date().toISOString(), ...file});
      circFile = null; blur(); flash('Registrada: ' + cod); renderSys(true);
    } catch(e){ flash('No se pudo registrar (' + (e.code || e.message) + ').', true); $('#ciS').disabled = false; } };
  if ($('#ctS')) $('#ctS').onclick = async () => { const k = $('#ctK').value.trim().toUpperCase(), n = $('#ctN').value.trim(); if (!/^[A-Z]{2,5}$/.test(k) || !n) return flash('Prefijo de 2 a 5 letras y un nombre.', true); const tp = circTipos(); if (tp.some(t => t.k === k)) return flash('Ese prefijo ya existe.', true);
    await writeDoc('cfg/circ', {tipos:[...tp, {k, n}]}); blur(); flash('Tipo agregado.'); renderSys(true); };
  el.querySelectorAll('[data-cian]').forEach(b => b.onclick = () => { const w = document.createElement('span'); w.innerHTML = `<input placeholder="Motivo de la anulación" style="width:200px"> <button class="btn sm">Anular</button>`; b.replaceWith(w); w.querySelector('input').focus();
    w.querySelector('button').onclick = async () => { const m = w.querySelector('input').value.trim(); if (!m) return flash('Indica el motivo.', true); const c = store.circ.get(b.dataset.cian), {id, ...rest} = c; await writeDoc('circ/' + id, {...rest, estado:'Anulada', motivo:`${m} (${SESSION.name}, ${fmt(today())})`}); blur(); renderSys(true); }; });
  el.querySelectorAll('[data-viewx]').forEach(a => a.onclick = e => { e.preventDefault(); openViewer(JSON.parse(a.dataset.viewx)); });
  if ($('#exGo')) $('#exGo').onclick = () => exportAll($('#exGo'));
  if ($('#bkNow')) $('#bkNow').onclick = () => doBackup(true);
  if ($('#bkDays')) $('#bkDays').onchange = e => { const c = store.cfg.get('sys') || {}; const {id, ...r} = c; writeDoc('cfg/sys', {...r, bakDays:+e.target.value}); e.target.blur(); };
  el.querySelectorAll('[data-bdl]').forEach(b => b.onclick = async () => { const B2 = readBak(b.dataset.bdl); if (!B2) return flash('No se pudo leer el respaldo.', true); const name = `Respaldo_APAS_${B2.at.slice(0,10)}_v${APP_VER}.json`, blob = new Blob([JSON.stringify(B2)], {type:'application/json'});
    try { if (RT.dl) await RT.dl.save({filename:name, data:blob}); else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); } flash('Respaldo descargado: ' + name); logAct('descarga respaldo', 'bak', name); } catch(e){ flash('No se pudo descargar.', true); } });
  el.querySelectorAll('[data-brs]').forEach(b => b.onclick = () => armed(b, () => restoreBak(b.dataset.brs)));
  if ($('#auRun')) $('#auRun').onclick = () => { sysAudit = auditSys(); logAct('auditoría', 'sistema', `${sysAudit.filter(x => x[0] !== 'ok').length} observaciones`); renderSys(true); };
  if ($('#lgU')) $('#lgU').onchange = e => { sysLogU = e.target.value; e.target.blur(); renderSys(true); };
}
