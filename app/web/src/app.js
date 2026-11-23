// ===================== helpers
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const fmt = v => isDate(v) ? v.split('-').reverse().join('-') : (v ?? '');
const norm = p => String(p || '').toUpperCase().replace(/P\/N/g, '').replace(/\s+/g, '');
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const LEVEL = {'1':'Test','2':'Inspection/Check','3':'Repair','4':'Overhaul'};
const ENT = new Map(S.entries.map(e => [e.id, e]));
const DIMS = ['Herramientas y equipos','Documentación técnica','Entrenamiento del personal','Infraestructura','Servicios'];
const ELEMENTS = ['Documentación técnica','Herramientas y equipos','Entrenamiento del personal','Infraestructura','Servicios','Materiales','Procesos'];
const ST = {pendiente:['Pendiente','s-na'], en_curso:['En curso','s-warn'], cumplido:['Cumplido','s-info'], aprobado:['Aprobado','s-ok'], rechazado:['Rechazado','s-bad'], na:['No aplica','s-na']};
const DONE = new Set(['cumplido','aprobado','na']);

// ===================== runtime
const RT = {user:null, db:null, assets:null, dl:null, role:'visor', ready:false};
const store = {proj:new Map(), evid:new Map(), rev:new Map(), art:new Map(), snap:new Map(), train:new Map(), users:new Map(), log:new Map(), bak:new Map(), cfg:new Map(), circ:new Map(), lect:new Map()};
const loaded = {proj:false, snap:false};
const assetUrl = id => (window.__assetUrl ? window.__assetUrl(id) : '/_blob/' + id);
(async () => {
  if (window.claude){
    try { RT.user = await window.claude.use('user'); } catch(e){}
    try { RT.db0 = await window.claude.use('db'); RT.db = RT.db0 ? wrapDb(RT.db0) : null; } catch(e){}
    try { RT.assets = wrapAssets(await window.claude.use('assets')); } catch(e){}
    try { RT.dl = await window.claude.use('downloads'); } catch(e){}
    try { RT.sample = await window.claude.use('sample'); const lim = RT.sample ? await RT.sample.limits().catch(() => null) : null; if (!lim || !lim.images) RT.sample = null; } catch(e){ RT.sample = null; }
    let owner = false, canW = null;
    try { owner = RT.user ? !!(await RT.user.isOwner()) : false; } catch(e){}
    try { canW = RT.user ? await RT.user.can('data.write') : null; } catch(e){}
    RT.role = owner ? 'admin' : (RT.db && canW !== false && RT.assets ? 'colaborador' : 'visor');
  }
  RT.ready = true;
  paintUser();
  if (RT.db){
    for (const col of ['proj','evid','rev','art','snap','train','users','log','bak','cfg','circ','lect']){
      const t = setTimeout(() => { if (col === 'proj' && !loaded.proj) { loaded.proj = 'timeout'; render(); } }, 10000);
      RT.db.collection(col).onSnapshot(snap => {
        if (!snap.metadata.fromCache) clearTimeout(t);
        store[col].clear(); snap.docs.forEach(d => store[col].set(d.id, {id:d.id, ...d.data()}));
        if (col === 'proj') loaded.proj = true; if (col === 'snap') loaded.snap = true; if (!snap.metadata.fromCache) loaded[col] = loaded[col] || true;
        if (col === 'users' && !snap.metadata.fromCache) usersChanged();
        if (col === 'cfg') window.dispatchEvent(new Event('apas-cfg'));
        if (col === 'log' && !location.hash.includes('sistema')) return;
        render(); ensureSnapshot(); ensureBackup();
      }, e => { clearTimeout(t); if (col === 'proj') loaded.proj = 'error'; render(); });
    }
  } else { loaded.proj = 'nodb'; render(); }
})();
const isAdmin = () => RT.role === 'admin' && can('cap.edit');
const canUpload = () => (RT.role === 'admin' || RT.role === 'colaborador') && (can('cap.upload') || can('cap.edit'));
// one write at a time per document
const queues = {};
function writeDoc(path, data, mode='set'){
  const q = queues[path] || Promise.resolve();
  const p = q.then(() => mode === 'set' ? RT.db.doc(path).set(data) : mode === 'del' ? RT.db.doc(path).delete() : RT.db.doc(path).update(data));
  queues[path] = p.catch(() => {});
  return p;
}
function saveProj(p){ const {id, ...rest} = p; rest.updatedAt = new Date().toISOString(); return writeDoc('proj/' + id, rest).catch(e => flash('No se guardó el cambio (' + (e.code || e.message) + ').', true)); }
let flashT;
function flash(t, err){ let m = $('#flash'); if (!m){ m = document.createElement('div'); m.id = 'flash'; m.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:50;max-width:90%'; document.body.appendChild(m); }
  m.className = 'msg' + (err ? ' err' : ''); m.textContent = t; m.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => m.hidden = true, 4500); }

// ===================== project logic
const projDb = () => [...store.proj.values()].sort((a,b) => String(a.id).localeCompare(String(b.id)));
const projects = () => (loaded.proj === true && store.proj.size > 0) ? projDb() : IMPORT;
const getProj = id => store.proj.get(id) || (fromSheetFn() ? IMPORT.find(p => p.id === id) : null);
function fromSheetFn(){ return !(loaded.proj === true && store.proj.size > 0); }
function dimDone(p, k){
  if (p.model === 2 || (p.sections || []).some(x => x.key)){
    const key = DIM2KEY[k], S2 = sec(p, key);
    if (!S2) return !!(p.dims && p.dims[k]);
    if ((key === 'doc' || key === 'tools' || key === 'train') && !S2.items.length) return !!(p.dims && p.dims[k]) && (key !== 'tools' || secDone(p, sec(p, 'mat')));
    return secDone(p, S2) && (key !== 'tools' || secDone(p, sec(p, 'mat')));
  }
  const s = (p.sections || []).find(x => x.name === k);
  if (s && s.items.length) return s.items.every(i => DONE.has(i.status));
  return !!(p.dims && p.dims[k]);
}
const AIR_ORDER = ['carta','dims','toolsTask','train'];
const isAir = p => p.tipo === 'Aeronave' && (p.sections || []).some(s => s.key === 'carta');
function partsOf(p){
  if (isAir(p)) return AIR_ORDER.map(k => [SEC_DEF[k].name + (k === 'train' ? '' : ''), secDone(p, sec(p, k)), k]).map(([n,d,k]) => [k === 'train' ? 'Roster del personal calificado' : n, d]);
  return DIMS.map(k => [k, dimDone(p, k)]);
}
function progress(p){
  if (p.tipo === 'Certificación extranjera' && !(p.sections||[]).some(x => x.items.length)) return p.aprobacion ? 100 : 0;
  const parts = partsOf(p).map(x => x[1]).concat([!!p.solicitud, !!p.aprobacion]);
  return Math.round(parts.filter(Boolean).length / parts.length * 100);
}
function stage(p){
  if (p.tipo === 'Certificación extranjera' && !(p.sections||[]).some(x => x.items.length) && !p.solicitud && !p.aprobacion) return ['Por definir','s-na'];
  if (p.aprobacion) return ['Aprobado','s-ok'];
  if (usesApr(p) && p.apr && p.apr.FAA && p.apr.FAA.ok && (p.autoridad||[]).includes('DGAC')) return ['Aprobado FAA · DGAC pendiente','s-info'];
  if (p.solicitud) return ['En revisión de la autoridad','s-info'];
  if (partsOf(p).every(x => x[1])) return ['Listo para solicitar','s-ok'];
  if (progress(p) > 0 || (p.sections||[]).some(s => s.items.some(i => i.status !== 'pendiente'))) return ['En desarrollo','s-warn'];
  return ['En análisis','s-na'];
}
const bar = v => `<div class="pct"><div class="bar"><i style="width:${v}%"></i></div>${v}%</div>`;
const authBadges = a => (a || []).map(x => `<span class="b ${x==='FAA'?'b-FAA':x==='DGAC'?'b-DGAC':'b-x'}">${esc(x)}</span>`).join('');
const evidOf = (pid, iid) => [...store.evid.values()].filter(e => e.projId === pid && (iid == null || e.itemId === iid)).sort((a,b) => (a.at||'').localeCompare(b.at||''));
const revOf = eid => store.rev.get(eid)?.status || 'pendiente';

// ===================== DASHBOARD
// pseudo articles for DGAC entries without P/N (aircraft, engines, services)
const ART = S.articles.map(a => ({...a, desc: ENT.get(a.e[0]).desc, mfr: a.e.map(i => ENT.get(i).mfr).find(Boolean) || '', ata: a.e.map(i => ENT.get(i).ata).find(Boolean) || '',
  dual: a.auth.length === 2}));
S.entries.filter(e => e.auth === 'DGAC' && !e.pns.length).forEach(e => ART.push({k:'X'+e.id, pn:'', e:[e.id], auth: e.dual ? ['FAA','DGAC'] : ['DGAC'], desc:e.desc, mfr:e.mfr, ata:'', dual:!!e.dual, hab:e.list}));
ART.forEach(a => a.text = fold([a.pn, a.desc, a.mfr, a.ata, ...a.e.map(i => (ENT.get(i).list||'') + ' ' + (ENT.get(i).manual||''))].join(' ')));
const nFAA = ART.filter(a => a.pn && a.auth.includes('FAA')).length, nDGAC = ART.filter(a => a.pn && a.auth.includes('DGAC')).length, nDual = ART.filter(a => a.dual).length;
const hab = c => S.entries.filter(e => e.auth === 'DGAC' && e.list === c).length;

let tab = 'proc', tile = 'ALL', aShow = 60, pTab = 'proc';
const fromSheet = () => !(loaded.proj === true && store.proj.size > 0);
// capability groups (one per approved line: authority + list + description + ATA)
const GROUPS = (() => {
  const m = new Map();
  for (const e of S.entries){
    const k = [e.auth, e.list, e.desc, e.ata || e.manual || ''].join('|');
    if (!m.has(k)) m.set(k, {k, auth:e.auth, list:e.list, desc:e.desc, mfr:e.mfr, ata:e.ata, manual:e.manual, ents:[], pns:[]});
    const g = m.get(k); g.ents.push(e.id); if (!g.mfr && e.mfr) g.mfr = e.mfr;
    e.pns.forEach(p => { if (!g.pns.includes(p)) g.pns.push(p); });
  }
  const artBy = new Map(ART.map(a => [a.k, a]));
  for (const g of m.values()){
    g.arts = g.pns.map(p => artBy.get(norm(p))).filter(Boolean);
    g.dual = g.arts.some(a => a.dual);
    g.text = fold([g.desc, g.mfr, g.ata, g.manual, g.list, ...g.pns].join(' '));
  }
  return [...m.values()].sort((a,b) => a.desc.localeCompare(b.desc));
})();
const TILES = [
  {id:'ALL', label:'Todas', sub:'capacidades aprobadas de componentes', n:ART.filter(a => a.hab !== 'Aeronave' && a.hab !== 'Motor').length, color:'accent', f:() => true, grp:'Autoridad'},
  {id:'FAA', label:'FAA', sub:'P/N aprobados', n:nFAA, color:'faa', f:a => a.auth.includes('FAA') && a.pn, grp:'Autoridad'},
  {id:'DGAC', label:'DGAC', sub:'P/N aprobados', n:nDGAC, color:'dgac', f:a => a.auth.includes('DGAC') && a.pn, grp:'Autoridad'},
  {id:'DUAL', label:'Dual', sub:'FAA y DGAC', n:nDual, color:'dual', f:a => a.dual, grp:'Autoridad'},
  ...Object.keys(S.lists).map(l => ({id:'L:' + l, label:l, sub:'FAA · Limited ' + l, n:ART.filter(a => a.e.some(i => ENT.get(i).list === l)).length, color:'faa', f:a => a.e.some(i => ENT.get(i).list === l), grp:'Listas FAA'})),
  ...['Accesorio','Servicio especializado'].map(c => ({id:'D:' + c, label:{'Accesorio':'Accesorios','Aeronave':'Aeronaves','Motor':'Motores','Servicio especializado':'Servicios'}[c], sub:'DGAC · CMA 655',
    n:c === 'Accesorio' ? ART.filter(a => a.pn && a.e.some(i => ENT.get(i).list === c)).length : hab(c), color:'dgac', f:a => a.e.some(i => ENT.get(i).list === c), grp:'Lista DGAC'})),
];
const groupMatch = (g, t) => {
  if (t.id === 'ALL') return !(g.auth === 'DGAC' && (g.list === 'Aeronave' || g.list === 'Motor'));
  if (t.id === 'FAA') return g.auth === 'FAA';
  if (t.id === 'DGAC') return g.auth === 'DGAC' && g.pns.length;
  if (t.id === 'DUAL') return g.dual;
  if (t.id.startsWith('L:')) return g.auth === 'FAA' && g.list === t.id.slice(2);
  if (t.id.startsWith('D:')) return g.auth === 'DGAC' && g.list === t.id.slice(2);
};
function alerts(ps){
  const open = ps.filter(p => !p.aprobacion && p.tipo !== 'Certificación extranjera');
  const zero = open.filter(p => progress(p) === 0);
  const late = open.filter(p => p.fechaEstimada && p.fechaEstimada < today());
  const pend = [...store.evid.values()].filter(e => revOf(e.id) === 'pendiente');
  const ready = open.filter(p => stage(p)[0] === 'Listo para solicitar');
  const behind = open.filter(p => { const ex = expected(p); return ex != null && progress(p) < ex - 15 && progress(p) > 0; });
  return {zero, late, pend, ready, open, behind};
}
function renderDash(){
  const ps = projects(), A = alerts(ps);
  const avg = A.open.length ? Math.round(A.open.reduce((s,p) => s + progress(p), 0) / A.open.length) : 0;
  const al = (cls, n, txt, act) => n ? `<button class="kpi" data-al="${act}" style="border-color:var(--${cls});background:var(--${cls}-bg)"><b style="color:var(--${cls})">${n}</b><span>${txt}</span></button>` : '';
  $('#kA').innerHTML = (al('bad', A.zero.length, 'componentes SIN AVANCE (0%)', 'zero') + al('bad', A.late.length, 'con fecha estimada vencida', 'late')
    + al('warn', A.pend.length, 'evidencias por revisar', 'pend') + al('ok', A.ready.length, 'listos para solicitar a la autoridad', 'ready')) || '<div class="box" style="margin:0">Sin alertas.</div>';
  $('#kA').previousElementSibling.textContent = 'Alertas';
  $('#kB').previousElementSibling.textContent = 'Resumen';
  const kb = (val, lbl, small, color) => `<div class="kpi" style="cursor:default"><b ${color?`style="color:var(--${color})"`:''}>${val}</b><span>${lbl}</span>${small?`<small>${small}</small>`:''}</div>`;
  $('#kB').innerHTML = kb(nFAA, 'P/N aprobados FAA', '4 capability lists', 'faa') + kb(nDGAC, 'P/N aprobados DGAC', `Lista CMA 655 · Rev ${S.dgacList.rev}`, 'dgac') + kb(nDual, 'P/N dual', 'mismo P/N FAA y DGAC', 'dual')
    + kb(A.open.filter(p => p.tipo === 'Componente').length, 'componentes en proceso', `avance promedio ${avg}%`) + kb(ps.filter(p => p.tipo === 'Certificación extranjera').length, 'certificaciones extranjeras', 'Canadá · Japón · Ecuador · Uruguay · EASA');
  document.querySelectorAll('#kA [data-al]').forEach(b => b.onclick = () => {
    if (b.dataset.al === 'pend'){ location.hash = '#expedientes'; return; }
    tab = 'proc'; pTab = 'proc'; procFilter = b.dataset.al; renderDash(); $('#tabBody').scrollIntoView({behavior:'smooth'}); });
  const T = [['proc','Proyectos de capacidad'],['aprob','Capacidades aprobadas']];
  $('#tabs').innerHTML = T.map(([id,l]) => `<button class="tab ${tab===id?'on':''}" data-t="${id}">${l}</button>`).join('');
  document.querySelectorAll('#tabs .tab').forEach(b => b.onclick = () => { tab = b.dataset.t; renderDash(); });
  if (tab === 'aprob') renderAprob(); else renderProjTab();
  const ib = importBanner(); if (ib && !$('#impBox')) $('#kB').insertAdjacentHTML('afterend', ib);
}
function renderAprob(){
  const max = Math.max(...TILES.map(t => t.n));
  const dia = n => Math.round(84 + 110 * Math.sqrt(n / max));
  const groups = [...new Set(TILES.map(t => t.grp))];
  const prev = $('#aQ') ? $('#aQ').value : '';
  $('#capBody').innerHTML = `<div class="box"><div style="display:flex;flex-wrap:wrap;gap:22px;align-items:flex-end">${groups.map(g => `<div><div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${g}</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${TILES.filter(t => t.grp === g).map(t => { const d = dia(t.n); return `<button class="bub ${tile===t.id?'on':''}" data-tile="${esc(t.id)}" title="${esc(t.sub)}"
        style="width:${d}px;height:${d}px;--c:var(--${t.color});--cb:var(--${t.color === 'accent' ? 'soft' : t.color + '-bg'})"><b style="font-size:${Math.max(14, Math.round(d/5.5))}px">${t.n}</b><span>${esc(t.label)}</span></button>`; }).join('')}</div></div>`).join('')}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px">El tamaño de cada círculo es proporcional a la cantidad de P/N (o habilitaciones) aprobados.</div></div>
    <div class="toolbar"><b id="aT"></b><input id="aQ" type="search" placeholder="Filtrar dentro de esta selección…" value="${esc(prev)}" style="max-width:360px;margin-left:auto"><span class="count" id="aC" style="margin-left:0"></span></div>
    <div class="wrap"><table><thead><tr><th>Capacidad</th><th>P/N</th><th>Fabricante</th><th>ATA / manual</th><th>Lista</th></tr></thead><tbody id="aB"></tbody></table></div><div id="aMore"></div>`;
  const t = TILES.find(x => x.id === tile);
  const go = () => {
    const q = fold($('#aQ').value).split(/\s+/).filter(Boolean);
    const rows = GROUPS.filter(g => groupMatch(g, t) && (!q.length || q.every(w => g.text.includes(w) || g.pns.some(p => norm(p).includes(norm(w))))));
    $('#aT').textContent = `${t.label} · ${t.sub}`;
    $('#aC').textContent = `${rows.length} capacidad${rows.length===1?'':'es'} · ${rows.reduce((s,g) => s + Math.max(1, g.pns.length), 0)} P/N`;
    $('#aB').innerHTML = rows.slice(0, aShow).map(g => {
      const pnHtml = g.pns.length ? g.pns.slice(0, 8).map(p => { const a = ART.find(x => x.k === norm(p)); return `<button class="pn ${a && a.dual ? 'dual' : ''}" data-a="${esc(norm(p))}">${esc(p)}</button>`; }).join('') + (g.pns.length > 8 ? `<button class="pn more2" data-g="${esc(g.k)}">+${g.pns.length - 8} más</button>` : '') : '<span style="color:var(--muted)">— (habilitación)</span>';
      return `<tr ${g.pns.length ? '' : `data-xg="X${esc(g.ents[0])}" style="cursor:pointer"`}><td style="min-width:180px"><b>${esc(g.desc)}</b>${g.dual ? ' <span class="b b-DUAL">DUAL</span>' : ''}</td><td>${pnHtml}</td><td>${esc(g.mfr || '—')}</td><td class="mono">${esc(g.ata || g.manual || '—')}</td>
        <td style="white-space:nowrap"><span class="b b-${g.auth}">${g.auth}</span> ${esc(g.auth === 'FAA' ? g.list : g.list)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Sin resultados</td></tr>';
    $('#aMore').innerHTML = rows.length > aShow ? `<button class="more" id="aM">Mostrar más (${rows.length - aShow} restantes)</button>` : '';
    if ($('#aM')) $('#aM').onclick = () => { aShow += 100; go(); };
  };
  document.querySelectorAll('[data-tile]').forEach(b => b.onclick = () => { tile = b.dataset.tile; aShow = 60; renderAprob(); });
  $('#aQ').oninput = () => { aShow = 60; go(); };
  $('#aB').onclick = e => {
    const m = e.target.closest('[data-g]'); if (m){ const g = GROUPS.find(x => x.k === m.dataset.g); m.parentElement.innerHTML = g.pns.map(p => `<button class="pn" data-a="${esc(norm(p))}">${esc(p)}</button>`).join(''); return; }
    const b = e.target.closest('[data-a]'); if (b) { openArticle(b.dataset.a); return; }
    const tr = e.target.closest('tr'); if (tr) { const first = tr.querySelector('[data-a]'); if (first) openArticle(first.dataset.a); else if (tr.dataset.xg) openArticle(tr.dataset.xg); }
  };
  go();
}
let procFilter = '';
function renderProjTab(){
  const ps = projects();
  if (!ps.length){ $('#tabBody').innerHTML = `<div class="box empty">${loaded.proj === false ? 'Cargando proyectos…' : 'Sin proyectos.'}</div>`; return; }
  const sub = [['proc','En proceso'],['hist','Aprobados']];
  const lists = {proc: ps.filter(p => !p.aprobacion && p.tipo === 'Componente'), hist: ps.filter(p => p.aprobacion && p.tipo === 'Componente')};
  if (!lists[pTab]) pTab = 'proc';
  let list = lists[pTab];
  const A = alerts(ps);
  if (pTab === 'proc' && procFilter === 'zero') list = list.filter(p => A.zero.includes(p));
  if (pTab === 'proc' && procFilter === 'late') list = list.filter(p => A.late.includes(p));
  if (pTab === 'proc' && procFilter === 'ready') list = list.filter(p => A.ready.includes(p));
  const fl = {zero:'sin avance (0%)', late:'con fecha estimada vencida', ready:'listos para solicitar'}[procFilter];
  $('#tabBody').innerHTML = `<div class="toolbar">${sub.map(([id,l]) => `<button class="tab ${pTab===id?'on':''}" data-pt="${id}" style="font-size:12.5px;padding:5px 12px">${l} (${lists[id].length})</button>`).join('')}
      ${fl && pTab === 'proc' ? `<span class="b s-bad" style="cursor:pointer" id="clrF">Filtro: ${fl} ✕</span>` : ''}
      ${fromSheet() ? '<span class="count">Datos de la planilla Excel (aún no cargados en la base de la página)</span>' : ''}</div>
    <div class="wrap"><table><thead><tr><th>Componente / proyecto</th><th>P/N</th><th>Área solicitante</th><th>Fecha ingreso</th><th>Estimada</th><th>Autoridad</th><th>Etapa</th><th>Avance</th></tr></thead><tbody>
    ${list.sort((a,b) => progress(a) - progress(b) || String(a.fechaSolicitud||'').localeCompare(String(b.fechaSolicitud||''))).map(p => { const [s,c] = stage(p), v = progress(p), late = !p.aprobacion && p.fechaEstimada && p.fechaEstimada < today();
      const zero = v === 0 && !p.aprobacion && p.tipo !== 'Certificación extranjera';
      return `<tr class="click" data-p="${esc(p.id)}" ${zero ? 'style="background:var(--bad-bg)"' : ''}><td><b>${esc(p.desc)}</b>${zero ? ' <span class="b s-bad">SIN AVANCE</span>' : ''}</td>
        <td class="mono">${esc((p.pns||[])[0] || '—')}${(p.pns||[]).length > 1 ? ` <span style="color:var(--muted)">+${p.pns.length-1}</span>` : ''}</td><td>${esc(p.area || '—')}</td><td>${esc(fmt(p.fechaSolicitud) || '—')}</td>
        <td ${late ? 'style="color:var(--bad);font-weight:600"' : ''}>${esc(fmt(p.fechaEstimada) || '—')}${late ? ' ⚠' : ''}</td>
        <td>${authBadges(p.autoridad)}</td><td><span class="b ${c}">${esc(s)}</span></td><td>${bar(v)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Sin proyectos</td></tr>'}
    </tbody></table></div>`;
  document.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { pTab = b.dataset.pt; procFilter = ''; renderProjTab(); });
  if ($('#clrF')) $('#clrF').onclick = () => { procFilter = ''; renderProjTab(); };
  $('#tabBody').onclick = e => { const el = e.target.closest('tr[data-p]'); if (el) openProject(el.dataset.p); };
}


// ===================== visor de evidencias (PDF / imagen) dentro de la página
let pdfjsP = null;
function loadPdfjs(){
  if (!pdfjsP) pdfjsP = import(new URL('pdfjs/pdf.min.mjs', location.href).href).then(m => { m.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', location.href).href; return m; });
  return pdfjsP;
}
async function openViewer(o){ // o: {assetId, filename, contentType}
  const url = assetUrl(o.assetId), isImg = (o.contentType||'').startsWith('image/'), isPdf = (o.contentType||'').includes('pdf') || /\.pdf$/i.test(o.filename||'');
  let vw = document.getElementById('viewer');
  if (!vw){ vw = document.createElement('div'); vw.id = 'viewer'; document.body.appendChild(vw);
    vw.addEventListener('click', e => { if (e.target.id === 'viewer' || e.target.closest('[data-vclose]')) vw.remove(); }); }
  vw.innerHTML = `<div class="vbox"><div class="vbar"><b title="${esc(o.filename||'')}">${esc(o.filename || 'Documento')}</b><span style="margin-left:auto"></span>
    ${RT.dl ? '<button class="btn sm" id="vDl">⬇ Descargar</button>' : ''}<button class="btn sm" data-vclose>Cerrar ✕</button></div><div class="vbody" id="vBody"><div class="empty">Cargando…</div></div></div>`;
  const body = vw.querySelector('#vBody');
  let blobP = null; const getBlob = () => blobP || (blobP = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }));
  const dl = vw.querySelector('#vDl'); if (dl) dl.onclick = async () => { try { await RT.dl.save({filename:o.filename || 'evidencia', data: await getBlob()}); flash('Descarga iniciada'); } catch(e){ flash('No se pudo descargar: ' + e.message); } };
  try {
    if (isImg){ body.innerHTML = `<img src="${esc(url)}" alt="" style="max-width:100%;display:block;margin:auto">`; return; }
    if (!isPdf){ body.innerHTML = '<div class="empty">Este tipo de archivo no se puede previsualizar. Usa “Descargar”.</div>'; return; }
    const [lib, blob] = await Promise.all([loadPdfjs(), getBlob()]);
    const doc = await lib.getDocument({data: new Uint8Array(await blob.arrayBuffer())}).promise;
    body.innerHTML = `<div class="log" style="margin-bottom:6px">${doc.numPages} página(s)</div>`;
    const w = Math.min(body.clientWidth - 8, 1000);
    for (let i = 1; i <= doc.numPages; i++){
      if (!document.body.contains(body)) return;
      const pg = await doc.getPage(i), v0 = pg.getViewport({scale:1}), sc = w / v0.width, dpr = window.devicePixelRatio || 1, v = pg.getViewport({scale: sc * dpr});
      const cv = document.createElement('canvas'); cv.width = v.width; cv.height = v.height; cv.style.width = (v.width / dpr) + 'px'; cv.className = 'vpage';
      body.appendChild(cv); await pg.render({canvasContext: cv.getContext('2d'), viewport: v}).promise;
    }
  } catch(e){ body.innerHTML = `<div class="empty">No se pudo mostrar el archivo (${esc(e.message || e)}). ${RT.dl ? 'Puedes descargarlo con “Descargar”.' : ''}</div>`; }
}
document.addEventListener('click', e => {
  const t0 = (e.composedPath && e.composedPath()[0]) || e.target; const t = t0.closest ? t0.closest('[data-view],[data-viewa]') : null; if (!t) return;
  e.preventDefault(); e.stopPropagation();
  if (t.dataset.viewa) return openViewer({assetId:t.dataset.viewa, filename:'Foto', contentType:'image/*'});
  const ev = store.evid.get(t.dataset.view); if (ev) openViewer(ev);
}, true);

// ===================== presentable drawers
const field = (l, v) => `<div class="f"><span>${l}</span><b>${v || '—'}</b></div>`;
function gallery(ids, editKey){
  if (!ids || !ids.length) return '<div class="empty" style="padding:4px 0">Sin fotos de presentación.</div>';
  return `<div class="gallery">${ids.map(id => `<figure><img src="${esc(assetUrl(id))}" alt="Foto" data-viewa="${esc(id)}" style="cursor:zoom-in">${editKey && isAdmin() ? `<button class="rm" data-rm="${esc(id)}" data-key="${esc(editKey)}">Quitar</button>` : ''}</figure>`).join('')}</div>`;
}
function openDrawer(html){ $('#panel').innerHTML = html; $('#ov').classList.add('open'); $('#panel').scrollTop = 0; $('#panel .x').onclick = closeDrawer; }
function closeDrawer(){ $('#ov').classList.remove('open'); curDrawer = null; }
$('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeDrawer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
let curDrawer = null;
function openArticle(key){
  const a = ART.find(x => x.k === key); if (!a) return; curDrawer = ['a', key];
  const pres = store.art.get(key) || {};
  const ents = a.e.map(i => ENT.get(i));
  const rel = new Set(); ents.forEach(e => e.pns.forEach(p => { if (norm(p) !== a.k) rel.add(p); }));
  const proj = projects().filter(p => (p.pns||[]).some(x => norm(x) === a.k));
  const faaAir = a.hab && a.dual ? `<div class="box"><h3><span class="b b-FAA">FAA</span> Aprobación de aeronave</h3><div class="note2" style="margin:0">Capacidad dual (FAA y DGAC) informada por Calidad. El alcance FAA de esta aeronave no está cargado en la página.</div></div>` : '';
  const blocks = faaAir + ents.map(e => e.auth === 'FAA' ? `<div class="box"><h3><span class="b b-FAA">FAA</span> Repair Station Capabilities List · ${esc(S.lists[e.list].name)}</h3><div class="grid">
      ${field('Función / nivel', esc(e.level.replace(/\b([1-4])\b/g, (m,d) => `${d} ${LEVEL[d]}`)))}${field('ATA / manual', esc(e.ata))}${field('Fecha de inclusión', esc(fmt(e.added)))}
      ${field('Revisión en que se incluyó', esc(e.rev))}${field('Lista vigente', `Rev ${esc(S.lists[e.list].rev)} · ${esc(fmt(S.lists[e.list].date))}`)}${field('Fabricante', esc(e.mfr))}</div></div>`
    : `<div class="box"><h3><span class="b b-DGAC">DGAC</span> ${esc(S.dgacList.name)}</h3><div class="grid">${field('Categoría', esc(e.list))}${e.manual ? field('Manual / norma', esc(e.manual)) : ''}
      ${e.modeloAeronave ? field('Modelo de aeronave', esc(e.modeloAeronave)) : ''}${e.motores ? field('Modelo de motores', esc(e.motores)) : ''}${e.modeloMotor ? field('Modelo de motor', esc(e.modeloMotor)) : ''}
      ${field('Lista vigente', `Rev ${esc(S.dgacList.rev)} · ${esc(fmt(S.dgacList.date))} · pág. ${e.page}`)}</div>
      ${e.verb ? `<div class="verb"><div class="vh">Texto literal de la Lista de Capacidad DGAC (sin modificaciones)</div><div class="vm"><span>Marca: <b>${esc(e.verb.marca || '—')}</b></span><span>Modelo: <b>${esc(e.verb.modelo || '—')}</b></span></div><div class="vt">${esc(e.verb.texto)}</div></div>`
        : `<div class="f" style="margin-top:10px"><span>Limitación aprobada</span><b>${esc(e.lim)}</b></div>`}
      ${e.nota ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">Nota: ${esc(e.nota)}</div>` : ''}</div>`).join('');
  openDrawer(`<div class="phead"><div><h2>${esc(a.pn || a.desc)}</h2><div class="sub">${esc(a.pn ? a.desc : (a.hab || ''))}${a.mfr ? ' · ' + esc(a.mfr) : ''}${a.ata ? ' · ATA ' + esc(a.ata) : ''}</div>
      <div style="margin-top:8px">${a.dual ? '<span class="b b-DUAL">DUAL</span>' : ''}${authBadges(a.auth)}</div></div><button class="x" aria-label="Cerrar">×</button></div>
    <div class="pbody">
      <div class="box"><h3>Presentación ${isAdmin() ? '<button class="btn sm" id="edArt" style="margin-left:auto">Editar</button>' : ''}</h3>
        ${gallery(pres.fotos, 'art:' + key)}
        <div class="grid" style="margin-top:10px">${a.hab === 'Aeronave' || a.hab === 'Motor' ? '' : field('Aeronaves que usan el componente', esc(pres.aplicabilidad))}${field('Notas', esc(pres.notas))}</div></div>
      ${blocks}
      ${rel.size ? `<div class="box"><h3>P/N del mismo grupo aprobado (${rel.size})</h3><div class="mono" style="font-size:12.5px;line-height:1.9">${[...rel].map(esc).join(' · ')}</div></div>` : ''}
      ${isAdmin() && !fromSheetFn() ? `<button class="btn pri" id="toUpd" style="margin-bottom:12px">${projDb().some(p => p.catKey === (groupOfArticle(key)||{}).k) ? 'Abrir expediente de actualización →' : '+ Crear expediente de actualización (evidencias históricas / nuevas)'}</button>` : ''}
      ${proj.length ? `<div class="box"><h3>Proyectos relacionados</h3>${proj.map(p => `<div><a href="#" data-op="${esc(p.id)}">${esc(p.desc)}</a> <span class="b ${stage(p)[1]}">${esc(stage(p)[0])}</span></div>`).join('')}</div>` : ''}
    </div>`);
  $('#panel').querySelectorAll('[data-op]').forEach(x => x.onclick = ev => { ev.preventDefault(); openProject(x.dataset.op); });
  if ($('#edArt')) $('#edArt').onclick = () => editPresentation('art', key, pres);
  if ($('#toUpd')) $('#toUpd').onclick = () => openUpdateExp(groupOfArticle(key));
  bindGalleryRemove();
}
function openProject(id){
  const p = getProj(id); if (!p) return; curDrawer = ['p', id];
  const [s, c] = stage(p), pct = progress(p);
  const dims = partsOf(p).map(([k,d]) => `<span class="b ${d?'s-ok':'s-na'}">${d?'✓':'○'} ${esc(k)}</span>`).join('')
    + `<span class="b ${p.solicitud?'s-ok':'s-na'}">${p.solicitud?'✓':'○'} Solicitud a la autoridad</span><span class="b ${p.aprobacion?'s-ok':'s-na'}">${p.aprobacion?'✓':'○'} Aprobación de la autoridad</span>`;
  openDrawer(`<div class="phead"><div><h2>${esc(p.desc)}</h2><div class="sub">${esc(p.tipo)}${p.rating ? ' · ' + esc(p.rating) : ''}${p.limitacion ? ' · ' + esc(p.limitacion) : ''}</div>
      <div style="margin-top:8px"><span class="b ${c}">${esc(s)}</span>${authBadges(p.autoridad)}</div></div><button class="x" aria-label="Cerrar">×</button></div>
    <div class="pbody">
      <div class="box"><h3>Avance</h3>${p.estadoTexto ? `<div style="margin-bottom:8px"><b>Situación actual:</b> ${esc(p.estadoTexto)}</div>` : ''}${bar(pct)}<div class="dims" style="margin-top:10px">${dims}</div></div>
      ${p.tipo === 'Aeronave' ? `<div class="box"><h3>Aeronave</h3><div class="grid">${field('Modelo de aeronave', esc(p.modeloAeronave))}${field('Modelo de motores', esc(p.motores))}</div></div>` : ''}
      <div class="box"><h3>Presentación ${isAdmin() && !fromSheetFn() ? '<button class="btn sm" id="edPr" style="margin-left:auto">Editar</button>' : ''}</h3>${gallery(p.fotos, 'proj:' + id)}
        <div class="grid" style="margin-top:10px">${field('Aeronaves que usan el componente', esc(p.aplicabilidad))}</div></div>
      <div class="box"><h3>Datos</h3><div class="grid">${field('P/N', esc((p.pns||[]).join('\n')))}${field('Manual (CMM / AMM)', esc([...(p.cmm||[]), p.manualRev].filter(Boolean).join('\n')))}
        ${field('Fabricante', esc(p.mfr))}${field('Área / solicitante', esc(p.area))}${field('Fecha de ingreso', esc(fmt(p.fechaSolicitud)))}${field('Fecha estimada de término', esc(fmt(p.fechaEstimada)))}
        ${field('Fecha de aprobación', esc(fmt(p.fechaAprobacion)))}${field('Autoridad objetivo', esc((p.autoridad||[]).join(', ')))}</div></div>
      ${!fromSheetFn() ? `<button class="btn pri" id="toExp">Abrir expediente →</button>` : ''}
    </div>`);
  if ($('#edPr')) $('#edPr').onclick = () => editPresentation('proj', id, p);
  if ($('#toExp')) $('#toExp').onclick = () => { closeDrawer(); eCur = id; location.hash = '#expedientes'; route(); };
  bindGalleryRemove();
}
function bindGalleryRemove(){
  $('#panel').querySelectorAll('[data-rm]').forEach(b => b.onclick = async ev => { ev.preventDefault();
    const [kind, key] = b.dataset.key.split(/:(.*)/s); const id = b.dataset.rm;
    if (kind === 'art'){ const cur = store.art.get(key) || {}; const {id:_, ...rest} = cur; await writeDoc('art/' + key, {...rest, fotos:(cur.fotos||[]).filter(x => x !== id)}).catch(()=>flash('No se pudo quitar.', true)); }
    else { const p = store.proj.get(key); await saveProj({...p, fotos:(p.fotos||[]).filter(x => x !== id)}); }
    try { await RT.assets.delete(id); } catch(e){} });
}
function editPresentation(kind, key, cur){
  const html = `<div class="box" id="edBox"><h3>Editar presentación</h3><div class="form">
    <label class="fld">Aeronaves que usan el componente<textarea id="edApl">${esc(cur.aplicabilidad||'')}</textarea></label>
    ${kind === 'art' ? `<label class="fld">Notas<textarea id="edNot">${esc(cur.notas||'')}</textarea></label>` : ''}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="edPh">+ Agregar fotos</button><button class="btn pri" id="edSave">Guardar</button></div>
    <div style="font-size:12px;color:var(--muted);margin-top:6px">Fotos de presentación (no son evidencias). Imágenes de hasta 20 MB.</div></div>`;
  $('.pbody').insertAdjacentHTML('afterbegin', html);
  $('#edSave').onclick = async () => {
    if (kind === 'art'){ const c = store.art.get(key) || {}; const {id:_, ...rest} = c; await writeDoc('art/' + key, {...rest, fotos:c.fotos||[], aplicabilidad:$('#edApl').value.trim(), notas:$('#edNot').value.trim()}).catch(()=>flash('No se guardó.', true)); }
    else { const p = store.proj.get(key); await saveProj({...p, aplicabilidad:$('#edApl').value.trim()}); }
    flash('Presentación guardada.');
  };
  $('#edPh').onclick = () => pickFiles(async files => {
    for (const f of files){ if (!f.type.startsWith('image/')) { flash('Solo imágenes para presentación.', true); continue; }
      try { const a = await RT.assets.upload(f);
        if (kind === 'art'){ const c = store.art.get(key) || {}; const {id:_, ...rest} = c; await writeDoc('art/' + key, {...rest, fotos:[...(c.fotos||[]), a.id]}); }
        else { const p = store.proj.get(key); await saveProj({...p, fotos:[...(p.fotos||[]), a.id]}); }
      } catch(e){ flash('No se pudo subir ' + f.name, true); } }
    flash('Fotos agregadas.');
  }, 'image/*');
}
let pickCb = null;
function pickFiles(cb, accept){ pickCb = cb; const fi = $('#fileIn'); fi.accept = accept || 'image/*,application/pdf'; fi.value = ''; fi.click(); }
$('#fileIn').onchange = () => { const fs = [...$('#fileIn').files]; if (pickCb && fs.length) pickCb(fs); };

// ===================== EXPEDIENTES (autoevaluación)
const SEC_DEF = {
  infra:{name:'Infraestructura', hint:'Condicional: solo si el manual exige infraestructura especial (extractores, filtros de partículas, protección anticorrosión, mesones antiestáticos, etc.).', ev:['foto','otro']},
  doc:{name:'Documentación técnica', hint:'Manual aplicable y vigente. Evidencia: extracto del PDF (portada e índice). La sube y aprueba el líder del proyecto.', ev:['extracto','otro']},
  mat:{name:'Materiales', hint:'Solo FAA. Listado de materiales requeridos por el manual (descripción, P/N y alternativos, uso). No requiere evidencia física.', ev:[]},
  tools:{name:'Herramientas y equipos', hint:'Cada herramienta debe quedar ON HAND con foto. Si es calibrable: registrar la fecha de calibración (due date) y la foto debe mostrar el sticker o label que la respalde; se valida contra la fecha en que se subió la foto. Si es alternativa: formulario de intercambiabilidad. Excepción: orden de compra con fecha estimada de arribo, autorizada por un gerente o jefe de área.', ev:['foto','intercambiabilidad','oc','otro']},
  train:{name:'Entrenamiento del personal', hint:'Aeronaves: curso Nv3 de la aeronave. Componentes: curso básico del componente según el manual. Registra el roster completo o a cada persona con sus funciones; evidencia: registro del curso, certificado o roster.', ev:['registro','otro']},
  serv:{name:'Servicios', hint:'Condicional: procesos que se externalizan (welding process, heat treatment, chemical process, plating, NDT…). Detalla el servicio, el proveedor y su respaldo.', ev:['respaldo','otro']},
};
SEC_DEF.carta = {name:'Carta de intención del cliente', hint:'Carta de un cliente interesado en realizar trabajos con APAS Chile en esta aeronave. Requiere aprobación del administrador.', ev:['carta','otro']};
SEC_DEF.dims = {name:'Comprobación de dimensiones hangar / aeronave', hint:'Verificación de que la aeronave cabe y se puede trabajar en el hangar (planos, mediciones, fotos). Requiere aprobación del administrador.', ev:['dimensiones','foto','otro']};
SEC_DEF.toolsTask = {name:'Herramientas por tarea', hint:'Listado de herramientas por tarea de mantenimiento a realizar. Requiere aprobación del administrador.', ev:['listado','otro']};
const SEC_ORDER = ['infra','doc','mat','tools','train','serv'];
const secOrder = p => isAir(p) ? AIR_ORDER : SEC_ORDER;
const tipoLabel = t => t === 'Certificación extranjera' ? 'Autoridad' : t;
const EVT = {qc020:'QC-020 Tablas A y B (herramientas y materiales)', autoeval:'Autoevaluación firmada (PDF)', aprobDGAC:'Aprobación DGAC (oficio o correo)', carta:'Carta de intención', dimensiones:'Comprobación de dimensiones', listado:'Listado herramientas x tarea', foto:'Foto', calibracion:'Certificado de calibración', intercambiabilidad:'Formulario de intercambiabilidad', oc:'Orden de compra autorizada', extracto:'Extracto del manual (portada + índice)', registro:'Registro de curso / roster', respaldo:'Respaldo del proveedor', otro:'Otro'};
const ROLES = ['Técnico','Inspector','Certificador','Ingeniero','Estructurista','Aviónico','Otro'];
const SERVS = ['Welding process','Heat treatment','Chemical process','Plating','NDT','Shot peening','Painting','Otro'];
const LOGIS = ['Pendiente','Cotización','En compra','Fabricación','Traslado','En espera','ON HAND'];
const MANUALS = ['CMM','SRM','OMM','ACMM','AMM','EM','EMM','IPC','OHM','SPM','NTM','SB','AD','Otro'];
// convert legacy (model 1) projects on the fly
function upgrade(p){
  if (p.tipo === 'Certificación extranjera' && !(p.sections || []).some(s => s.items && s.items.length)){ if (p.model === 3 && !(p.sections||[]).length) return p; const q = JSON.parse(JSON.stringify(p)); q.sections = []; q.model = 3; return q; }
  if (p.tipo === 'Aeronave' && !(p.sections || []).some(s => s.key === 'carta')) return toV3(JSON.parse(JSON.stringify(p)));
  if (p.model === 3) return p;
  if (p.model === 2) return toV3(JSON.parse(JSON.stringify(p)));
  const q = JSON.parse(JSON.stringify(p)); const byName = Object.fromEntries((q.sections || []).map(s => [s.name, s.items]));
  q.sections = SEC_ORDER.map(k => ({key:k, name:SEC_DEF[k].name, items:(byName[SEC_DEF[k].name] || []), ...(k === 'infra' || k === 'serv' ? {requiere:null} : {}), ...(k === 'mat' ? {cerrada:false} : {})}));
  const tr = q.sections.find(s => s.key === 'train');
  if (!tr.items.length && q.tipo !== 'Certificación extranjera') tr.items = ['Técnicos','Inspectores','Certificadores','Actualización de roster'].map((g,k) => ({id:'t'+k+Date.now().toString(36), title:g, grupo:g, curso: g === 'Actualización de roster' ? '' : (q.tipo === 'Aeronave' ? 'Curso Nv3 de aeronave' : 'Curso básico del componente según manual'), status:'pendiente', log:[]}));
  q.model = 2; return toV3(q);
}
function airTemplate(){
  return [['carta','Carta de intención del cliente'],['dims','Comprobación de dimensiones hangar vs. aeronave'],['toolsTask','Listado de herramientas por tarea']].map(([k,t]) => ({key:k, name:SEC_DEF[k].name, items:[{id:k + '1', title:t, status:'pendiente', log:[]}]}))
    .concat([{key:'train', name:'Roster del personal calificado', items:[{id:'r1', kind:'roster', title:'Roster del personal calificado', curso:'Curso Nv3 de aeronave', status:'pendiente', log:[]}]}]);
}
function toV3(q){
  if (q.tipo === 'Aeronave' && !(q.sections || []).some(s => s.key === 'carta')) { q.sections = airTemplate(); q.model = 3; return q; }
  const tr = (q.sections || []).find(s => s.key === 'train');
  if (tr && tr.items.some(i => !i.kind)){
    const legacy = tr.items.filter(i => !i.kind), keep = tr.items.filter(i => i.kind);
    const curso = legacy.map(i => i.curso).find(Boolean) || (q.tipo === 'Aeronave' ? 'Curso Nv3 de aeronave' : 'Curso básico del componente según manual');
    const allDone = legacy.length && legacy.every(i => DONE.has(i.status)), any = legacy.some(i => i.status !== 'pendiente');
    const log = legacy.flatMap(i => (i.log || []).map(l => ({...l, text: `${i.grupo || i.title}: ${l.text || ''}`.trim()})));
    legacy.forEach(i => { if (i.taller) log.push({date:null, text:`${i.grupo || i.title} (planilla): ${i.taller}`}); });
    tr.items = [{id:'r' + Date.now().toString(36), kind:'roster', title:'Roster del proyecto', curso, status: allDone ? 'cumplido' : any ? 'en_curso' : 'pendiente', log}, ...keep];
  }
  q.model = 3; return q;
}
const sec = (p, k) => (p.sections || []).find(s => s.key === k);
const isFAA = p => (p.autoridad || []).includes('FAA');
function secDone(p, s){
  if (!s) return false;
  if (s.key === 'infra' || s.key === 'serv'){ if (s.requiere === false) return true; if (s.requiere === true) return s.items.length > 0 && s.items.every(i => DONE.has(i.status)); return false; }
  if (s.key === 'mat') return !isFAA(p) || s.cerrada || s.items.length === 0;
  return s.items.length > 0 && s.items.every(i => DONE.has(i.status));
}
const DIM2KEY = {'Infraestructura':'infra','Documentación técnica':'doc','Herramientas y equipos':'tools','Entrenamiento del personal':'train','Servicios':'serv'};
function evOk(pid, iid, tipo){ return evidOf(pid, iid).some(e => (e.tipo || 'otro') === tipo && revOf(e.id) !== 'rechazada'); }
function evApproved(pid, iid, tipo){ return evidOf(pid, iid).some(e => (e.tipo || 'otro') === tipo && revOf(e.id) === 'aprobada'); }
// "a prueba de errores": what is still missing for an item
function warnings(p, s, it){
  const w = [], has = t => evOk(p.id, it.id, t);
  if (it.status === 'na') return w;
  if (s.key === 'tools'){
    if (it.logistica === 'ON HAND' && !has('foto')) w.push('ON HAND sin foto');
    if (it.calibrable){
      const photos = evidOf(p.id, it.id).filter(e => e.tipo === 'foto' && revOf(e.id) !== 'rechazada');
      const due = it.calDue || it.calVence || photos.map(e => e.dueSticker).filter(isDate).pop();
      if (!isDate(due)) w.push('Falta la fecha de calibración (due date del sticker)');
      if (!photos.length) w.push('Falta foto con el sticker de calibración visible');
      else if (isDate(due)){ const up = photos.map(e => (e.fechaDoc || e.at || '').slice(0,10)).sort().pop(); if (up && due < up) w.push(`Calibración vencida al momento de la foto (due ${fmt(due)}, foto ${fmt(up)})`); }
      const ia = photos.map(e => e.iaCheck).filter(Boolean).pop();
      if (ia && ia.due && isDate(due) && ia.due !== due) w.push(`El sticker leído por Claude (${fmt(ia.due)}) no coincide con la fecha registrada`);
    }
    if (it.pnAlt && !has('intercambiabilidad')) w.push('Alternativo sin formulario de intercambiabilidad');
    if (it.logistica !== 'ON HAND' && DONE.has(it.status) && !evApproved(p.id, it.id, 'oc')) w.push('Marcado cumplido sin estar ON HAND ni OC autorizada');
    const oc = evidOf(p.id, it.id).filter(e => e.tipo === 'oc');
    if (oc.some(e => !e.autorizadoPor)) w.push('OC sin autorización de gerente/jefe de área');
    if (it.calibrable == null) w.push('Indicar si es calibrable');
  }
  if (s.key === 'doc'){ if (!has('extracto')) w.push('Falta extracto del manual (portada + índice)'); if (!it.revision && !['SB','AD'].includes(String(it.tipoManual||'').toUpperCase())) w.push('Sin revisión del manual'); }
  if (s.key === 'train'){ if (!has('registro')) w.push(it.kind === 'persona' ? 'Sin registro de curso de la persona' : 'Sin roster / registro del curso'); if (it.kind === 'persona' && !(it.roles||[]).length) w.push('Indicar funciones de la persona'); }
  if (s.key === 'serv'){ if (!it.proveedor) w.push('Sin proveedor'); if (!has('respaldo')) w.push('Sin respaldo del proveedor'); }
  if (s.key === 'infra' && !has('foto')) w.push('Sin foto');
  if (s.key === 'mat' && !it.pn) w.push('Sin P/N');
  if (['carta','dims','toolsTask'].includes(s.key)){ if (!evidOf(p.id, it.id).length) w.push('Sin evidencia'); else if (DONE.has(it.status) && !evidOf(p.id, it.id).some(e => revOf(e.id) === 'aprobada')) w.push('Marcado cumplido sin evidencia aprobada'); }
  return w;
}
function itemLabel(s, it){
  if (s.key === 'tools') return `${it.title}${it.pn ? ` · P/N ${it.pn}` : ''}${it.pnAlt ? ` (alt. ${it.pnAlt})` : ''}${it.calibrable ? ` · calibrable${isDate(it.calDue || it.calVence) ? ', due ' + fmt(it.calDue || it.calVence) : ''}` : ''}`;
  if (s.key === 'doc') return [it.tipoManual, it.numero].filter(Boolean).join(' ') + (it.revision ? ` Rev. ${it.revision}` : '') + (it.fechaRev ? ` (${it.fechaRev})` : '') || it.title;
  if (s.key === 'mat') return `${it.title}${it.pn ? ` · P/N ${it.pn}` : ''}${it.pnAlt ? ` (alt. ${it.pnAlt})` : ''}${it.uso ? ` · ${it.uso}` : ''}`;
  if (s.key === 'train') return it.kind === 'persona' ? `${it.title}${(it.roles||[]).length ? ` (${it.roles.join(', ')})` : ''}${it.curso ? ` · ${it.curso}` : ''}` : `${it.title || 'Roster'}${it.curso ? ` · ${it.curso}` : ''}`;
  if (s.key === 'serv') return `${it.title}${it.proveedor ? ` · proveedor: ${it.proveedor}` : ''}${it.uso ? ` · ${it.uso}` : ''}`;
  return it.title;
}

let eCur = null;
function renderExpList(){
  const q = fold($('#eQ').value).split(/\s+/).filter(Boolean), f = $('#eF').value;
  const ps = projDb().filter(p => (!f || p.tipo === f || (f === 'abiertos' && !p.aprobacion) || (f === 'aprobados' && p.aprobacion)) && (!q.length || q.every(t => fold([p.desc, ...(p.pns||[]), ...(p.cmm||[]), p.area, p.id].join(' ')).includes(t))));
  const rb = restoreBanner();
  $('#eList').innerHTML = (rb ? `<div style="margin-bottom:8px">${rb}</div>` : '') + (loaded.proj !== true ? `<div class="empty">${loaded.proj === false ? 'Cargando…' : 'Sin acceso a los datos en esta vista.'}</div>`
    : ps.map(p => { const w = projWarnings(p).length; return `<div class="pi ${eCur===p.id?'on':''}" data-p="${esc(p.id)}"><b>${esc(p.desc)}</b><br><small>${esc(p.id)} · ${esc((p.cmm||[])[0] || tipoLabel(p.tipo))} · ${esc(stage(p)[0])} · ${progress(p)}%${w ? ` · ⚠ ${w}` : ''}</small></div>`; }).join('') || '<div class="empty">Sin proyectos</div>');
  if (!$('#catQ')) $('#eNewWrap').innerHTML = isAdmin() ? '<div style="display:flex;flex-direction:column;gap:6px;width:100%"><button class="btn sm pri" id="eNew">+ Nuevo proyecto</button><button class="btn sm" id="eCat">+ Expediente de capacidad aprobada</button></div>' : '';
  if ($('#eNew')) $('#eNew').onclick = newProject;
  if ($('#eCat')) $('#eCat').onclick = () => { $('#eNewWrap').innerHTML = '<div style="width:100%"><input id="catQ" placeholder="Buscar capacidad aprobada (P/N, descripción)…"><div id="catR" style="max-height:220px;overflow:auto"></div><button class="btn sm" id="catX">Cerrar</button></div>';
    const go = () => { const q = fold($('#catQ').value).split(/\s+/).filter(Boolean); const r = q.length ? GROUPS.filter(g => q.every(w => g.text.includes(w) || g.pns.some(p => norm(p).includes(norm(w))))).slice(0, 25) : [];
      $('#catR').innerHTML = r.map(g => `<div class="pi" data-cat="${esc(g.k)}"><b>${esc(g.desc)}</b><br><small>${esc(g.auth)} · ${esc(g.list)} · ${esc(g.pns.slice(0,3).join(', '))}${g.pns.length > 3 ? '…' : ''}${projDb().some(p => p.catKey === g.k) ? ' · ya tiene expediente' : ''}</small></div>`).join('') || (q.length ? '<div class="empty">Sin resultados</div>' : ''); };
    $('#catQ').oninput = go; $('#catQ').focus(); $('#catX').onclick = () => { $('#eNewWrap').innerHTML = ''; renderExpList(); };
    $('#catR').onclick = e => { const d = e.target.closest('[data-cat]'); if (d) openUpdateExp(GROUPS.find(g => g.k === d.dataset.cat)); }; };
}
// ===================== vínculo por P/N con Control de Herramientas (versión local, base compartida)
const HERR = {v:new Map(), ok:false, at:0};
async function loadHerr(force){
  if (!force && Date.now() - HERR.at < 30000) return; HERR.at = Date.now();
  try { const j = await (await fetch('/api/herramientas/indice')).json(); const m = new Map();
    j.vinculos.forEach(v => { const k = v.projId + '|' + v.itemId; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }); HERR.v = m; HERR.ok = true;
    if (location.hash === '#expedientes' && eCur) renderExp(); } catch(e){}
}
function herrBadge(p, it){
  const L = HERR.v.get(p.id + '|' + it.id) || [];
  if (!L.length) return HERR.ok && it.pn && !/^w\/o/i.test(it.pn) ? '<div class="log">🔧 Sin coincidencia de P/N en el maestro de herramientas</div>' : '';
  return L.map(v => `<div class="log">🔧 Maestro de herramientas · P/N ${esc(v.pn)}: ${v.cal ? `${v.cal} calibrable(s), <b>${v.disp} disponible(s) en APAS</b>${v.enCal ? `, ${v.enCal} en calibración` : ''}` : ''}${v.nc ? `${v.cal ? ' · ' : ''}${v.nc} no calibrable(s)` : ''}${v.intercambiables.length ? ` · intercambiables en maestro: ${esc(v.intercambiables.map(a => a.pn).join(', '))}` : ''} <a class="lnk" target="_blank" href="/herramientas/?q=${encodeURIComponent(v.pn)}#${v.cal ? 'calibrables' : 'no-calibrables'}">ver ↗</a></div>`).join('');
}
function projWarnings(p){ const out = []; for (const s of p.sections || []) if (s.key) for (const it of s.items) warnings(p, s, it).forEach(w => out.push([s, it, w])); return out; }
$('#eF').innerHTML = '<option value="">Todos</option><option value="abiertos">En proceso (no aprobados)</option><option value="aprobados">Aprobados / actualización</option><option>Componente</option><option>Aeronave</option><option>Motor / taller</option><option value="Certificación extranjera">Autoridad</option>';
$('#eQ').oninput = renderExpList; $('#eF').onchange = renderExpList;
$('#eList').onclick = e => { const d = e.target.closest('.pi'); if (d){ eCur = d.dataset.p; editMode = false; renderExpList(); renderExp(); } };
function groupOfArticle(key){ const a = ART.find(x => x.k === key); if (!a) return null; return GROUPS.find(g => g.ents.some(e => a.e.includes(e))) || null; }
async function openUpdateExp(g){
  if (!g) return;
  const ex = projDb().find(p => p.catKey === g.k);
  if (ex){ eCur = ex.id; location.hash = '#expedientes'; closeDrawer(); render(); return; }
  const ents = g.ents.map(i => ENT.get(i));
  const sameArts = ART.filter(a => a.pn && g.pns.some(p => norm(p) === a.k));
  const auths = [...new Set([g.auth, ...sameArts.flatMap(a => a.auth)])];
  const added = ents.map(e => e.added).filter(isDate).sort()[0] || null;
  const id = nextId();
  const p = upgrade({id, tipo: g.list === 'Aeronave' ? 'Aeronave' : g.list === 'Motor' ? 'Motor / taller' : 'Componente', origen:'catalogo', catKey:g.k,
    desc:g.desc, pns:g.pns, cmm: ents.map(e => e.manual || e.ata).filter(Boolean).filter((v,i,a) => a.indexOf(v) === i), mfr:g.mfr, ata:g.ata, area:'Capacidad aprobada (actualización de expediente)',
    rating: g.auth === 'FAA' ? g.list : '', limitacion: ents.map(e => e.level || e.lim).filter(Boolean)[0] || '', fechaSolicitud:null, fechaEstimada:null, fechaAprobacion:added,
    prioridad:null, obs:'Expediente de actualización de una capacidad ya aprobada: respaldo de evidencias históricas y nuevas.', dims:Object.fromEntries(DIMS.map(k => [k,true])),
    solicitud:true, aprobacion:true, autoridad:auths, sections:[], fotos:[], aplicabilidad:''});
  await saveProj(p); eCur = id; location.hash = '#expedientes'; closeDrawer(); render(); flash('Expediente de actualización creado: ' + id);
}
function nextId(){ const ids = [...projDb(), ...IMPORT].map(p => /^P\d+$/.test(p.id) ? +p.id.slice(1) : 0); return 'P' + String(Math.max(0, ...ids) + 1).padStart(3, '0'); }
function newProject(){
  $('#eMain').innerHTML = `<div class="box"><h3>Nuevo proyecto · ¿qué tipo de capacidad es?</h3><div class="note2" style="margin:0 0 10px">Primero se clasifica el proyecto; los campos se habilitan según el tipo.</div>
    <div class="choose"><button class="btn" data-nt="Componente"><b>Componente</b><small>Autoevaluación: infraestructura, manuales, materiales, herramientas, entrenamiento y servicios.</small></button>
    <button class="btn" data-nt="Aeronave"><b>Aeronave</b><small>Carta de intención del cliente, dimensiones hangar/aeronave, herramientas por tarea y roster calificado. Cada punto requiere aprobación del administrador.</small></button>
    <button class="btn" data-nt="Certificación extranjera"><b>Autoridad</b><small>Habilitación ante una nueva autoridad. Proceso aún por definir.</small></button></div></div>`;
  $('#eMain').querySelectorAll('[data-nt]').forEach(b => b.onclick = () => createProject(b.dataset.nt));
}
async function createProject(tipo){
  const id = nextId();
  const p = upgrade({id, tipo, desc: tipo === 'Aeronave' ? 'Nueva aeronave' : tipo === 'Componente' ? 'Nuevo componente' : 'Nueva autoridad', pns:[], cmm:[], area:'', rating:'', limitacion:'', fechaSolicitud:today(), fechaEstimada:null, fechaAprobacion:null,
    prioridad:null, obs:'', dims:Object.fromEntries(DIMS.map(k => [k,false])), solicitud:false, aprobacion:false, autoridad: tipo === 'Componente' ? ['FAA','DGAC'] : tipo === 'Aeronave' ? ['DGAC'] : [], sections:[], fotos:[], aplicabilidad:''});
  if (tipo === 'Certificación extranjera') p.sections = [];
  await saveProj(p); eCur = id; editMode = true; renderExpList(); renderExp();
}
let editMode = false;
const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const chip = (t, cls) => `<span class="b ${cls}">${esc(t)}</span>`;
function renderExp(){
  const raw = store.proj.get(eCur);
  if (!raw){ $('#eMain').innerHTML = '<div class="box empty">Selecciona un proyecto para ver su autoevaluación.</div>'; return; }
  const p = upgrade(raw);
  const ad = isAdmin(), up = canUpload();
  const [s, c] = stage(p);
  const evAll = evidOf(p.id);
  const nApr = evAll.filter(e => revOf(e.id) === 'aprobada').length, nPend = evAll.filter(e => revOf(e.id) === 'pendiente').length;
  const W = projWarnings(p);
  const header = editMode && ad ? `<div class="form">
      <label class="fld">Descripción<input id="fDesc" value="${esc(p.desc)}"></label>
      <label class="fld">Tipo<select id="fTipo">${['Componente','Aeronave','Motor / taller','Certificación extranjera'].map(t => `<option value="${t}" ${p.tipo===t?'selected':''}>${tipoLabel(t)}</option>`).join('')}</select></label>
      <label class="fld">Situación actual<input id="fEst" value="${esc(p.estadoTexto||'')}" placeholder="Ej.: a la espera de la DGAC"></label>
      ${p.tipo === 'Aeronave' ? `<label class="fld">Modelo de aeronave<input id="fMA" value="${esc(p.modeloAeronave||'')}"></label><label class="fld">Modelo de motores<input id="fMo" value="${esc(p.motores||'')}"></label>` : ''}
      <label class="fld">P/N (uno por línea)<textarea id="fPns">${esc((p.pns||[]).join('\n'))}</textarea></label>
      <label class="fld">Manual(es) (uno por línea)<textarea id="fCmm">${esc((p.cmm||[]).join('\n'))}</textarea></label>
      <label class="fld">Fabricante<input id="fMfr" value="${esc(p.mfr||'')}"></label>
      <label class="fld">ATA<input id="fAta" value="${esc(p.ata||'')}"></label>
      <label class="fld">Área / solicitante<input id="fArea" value="${esc(p.area||'')}"></label>
      <label class="fld">Rating<input id="fRat" list="ratings" value="${esc(p.rating||'')}"><datalist id="ratings"><option>Accessory</option><option>Airframe</option><option>Radio</option><option>Powerplant</option><option>Instrument</option><option>Emergency Equipment</option></datalist></label>
      <label class="fld">Limitación<select id="fLim"><option value="">—</option>${['TESTING','INSPECTION','LIMITED REPAIR','REPAIR','OVERHAUL'].map(l => `<option ${String(p.limitacion||'').toUpperCase().replace('REPARACIÓN','REPAIR')===l?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fld">Autoridades (separadas por coma)<input id="fAut" value="${esc((p.autoridad||[]).join(', '))}"></label>
      <label class="fld">Fecha de ingreso<input id="fF1" type="date" value="${esc(p.fechaSolicitud||'')}"></label>
      <label class="fld">Fecha estimada de término<input id="fF2" type="date" value="${esc(p.fechaEstimada||'')}"></label>
      <label class="fld">Fecha de aprobación<input id="fF3" type="date" value="${esc(p.fechaAprobacion||'')}"></label>
      <label class="fld" style="grid-column:1/-1">Observaciones internas<textarea id="fObs">${esc(p.obs||'')}</textarea></label></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn pri" id="fSave">Guardar datos</button><button class="btn" id="fCancel">Cancelar</button></div>`
    : `<div class="grid">${p.estadoTexto ? field('Situación actual', esc(p.estadoTexto)) : ''}${p.tipo === 'Aeronave' ? field('Modelo de aeronave · motores', esc([p.modeloAeronave, p.motores].filter(Boolean).join(' · '))) : ''}${field('P/N', esc((p.pns||[]).join('\n')))}${field('Manual(es)', esc((p.cmm||[]).join('\n')))}${field('Fabricante · ATA', esc([p.mfr, p.ata].filter(Boolean).join(' · ')))}
      ${field('Área / solicitante', esc(p.area))}${field('Rating · limitación', esc([p.rating, p.limitacion].filter(Boolean).join(' · ')))}${field('Fechas', `Ingreso ${esc(fmt(p.fechaSolicitud)||'—')}\nEstimada ${esc(fmt(p.fechaEstimada)||'—')}\nAprobación ${esc(fmt(p.fechaAprobacion)||'—')}`)}
      ${p.avancePrioridad != null || p.herrCant ? field('Planilla original', esc([p.avancePrioridad != null ? 'Avance prioridad ' + p.avancePrioridad + '/5' : '', p.herrCant ? 'Herramientas ' + p.herrCant : ''].filter(Boolean).join(' · '))) : ''}</div>
      ${p.obs ? `<div class="f" style="margin-top:10px"><span>Observaciones internas</span><b>${esc(p.obs)}</b></div>` : ''}`;
  const evHtml = (it) => evidOf(p.id, it.id).map(ev => { const r = revOf(ev.id); const img = (ev.contentType||'').startsWith('image/');
    return `<div class="ev">${img ? `<img src="${esc(assetUrl(ev.assetId))}" alt="" data-view="${esc(ev.id)}" style="cursor:zoom-in">` : '📄'}<span class="b s-info">${esc(EVT[ev.tipo||'otro'] || ev.tipo)}</span><a href="#" class="lnk" data-view="${esc(ev.id)}" title="Ver ${esc(ev.filename)}">${esc(ev.filename)}</a>${viaClaude(ev)}
      <span class="b ${r==='aprobada'?'s-ok':r==='rechazada'?'s-bad':'s-warn'}">${r}</span>
      ${ad ? `<button class="btn sm" data-ok="${esc(ev.id)}" title="Aprobar">✓</button><button class="btn sm" data-ko="${esc(ev.id)}" title="Rechazar">✗</button>` : ''}
      ${(ad || (up && r !== 'aprobada' && ev.by && ev.by === RT.myId)) ? `<button class="btn sm" data-del="${esc(ev.id)}" title="Eliminar">🗑</button>` : ''}
      ${ev.fechaDoc ? `<div class="log" style="width:100%">Fecha del documento: ${esc(fmt(ev.fechaDoc))}${ev.fechaDoc < (store.proj.get(p.id)?.fechaAprobacion || '0') ? ' · evidencia histórica (anterior a la aprobación)' : ''}</div>` : ''}
      ${ev.tipo === 'oc' ? `<div class="log" style="width:100%">Autorizada por: ${esc(ev.autorizadoPor || '— (falta)')} · arribo estimado: ${esc(fmt(ev.eta) || '—')}</div>` : ''}
      ${ev.tipo === 'calibracion' && ev.vence ? `<div class="log" style="width:100%">Calibración vence: ${esc(fmt(ev.vence))}</div>` : ''}
      ${ev.tipo === 'foto' && img && it.calibrable && RT.sample ? `<button class="btn sm" data-ia="${esc(ev.id)}" title="Claude lee el sticker y compara la fecha">🔍 Verificar sticker</button>` : ''}
      ${ev.iaCheck ? `<div class="log" style="width:100%">Claude: ${ev.iaCheck.due ? 'due date leído ' + esc(fmt(ev.iaCheck.due)) : 'no se pudo leer la fecha'}${ev.iaCheck.notes ? ' · ' + esc(ev.iaCheck.notes) : ''} (apoyo, no reemplaza la revisión)</div>` : ''}
      ${store.rev.get(ev.id)?.comment ? `<div class="log" style="width:100%">Revisión: ${esc(store.rev.get(ev.id).comment)}</div>` : ''}</div>`; }).join('');
  const secHtml = (S2, si) => {
    const d = SEC_DEF[S2.key], done = secDone(p, S2);
    if (S2.key === 'mat' && !isFAA(p)) return `<div class="box"><h3>${d.name} ${chip('No aplica (solo FAA)','s-na')}</h3></div>`;
    const cond = S2.key === 'infra' || S2.key === 'serv';
    const condCtl = cond ? `<div class="cond">${[['false', S2.key === 'infra' ? 'No requiere infraestructura especial (en orden)' : 'No requiere servicios externos'], ['true','Sí, requiere'], ['null','Sin definir']].map(([v,l]) =>
        `<label><input type="radio" name="rq${si}" value="${v}" ${String(S2.requiere ?? null) === v ? 'checked' : ''} ${ad ? '' : 'disabled'}> ${l}</label>`).join('')}</div>` : '';
    const showItems = !cond || S2.requiere === true;
    const rows = S2.items.map((it, ii) => { const w = warnings(p, S2, it);
      return `<tr><td style="min-width:220px"><b>${esc(itemLabel(S2, it))}</b>
          ${S2.key === 'tools' ? `<div class="log">Logística: <b>${esc(it.logistica || 'Pendiente')}</b>${it.qtyReq != null ? ` · requerido ${esc(it.qtyReq)} · obtenido ${esc(it.qtyObt ?? '—')}` : ''}${it.uso ? ` · ${esc(it.uso)}` : ''}</div>` : ''}
          ${S2.key === 'tools' || S2.key === 'toolsTask' ? herrBadge(p, it) : ''}
          ${it.taller && S2.key !== 'tools' ? `<div class="log">Planilla: ${esc(it.taller)}${it.area ? ' · ' + esc(it.area) : ''}</div>` : ''}
          ${commentsHtml(it, si, ii, ad)}
          ${w.length ? `<div class="warn">${w.map(x => `⚠ ${esc(x)}`).join('<br>')}</div>` : ''}</td>
        <td>${ad ? `<select data-st="${si}:${ii}">${Object.entries(ST).filter(([k]) => k !== 'aprobado').map(([k,[l]]) => `<option value="${k}" ${it.status===k?'selected':''}>${l}</option>`).join('')}</select>` : chip(ST[it.status]?.[0]||it.status, ST[it.status]?.[1]||'s-na')}
          ${DONE.has(it.status) && w.length ? '<div class="log" style="color:var(--bad)">Cumplido con observaciones</div>' : ''}</td>
        ${d.ev.length ? `<td style="min-width:260px">${evHtml(it)}${up ? `<button class="btn sm" data-up="${si}:${ii}">+ Evidencia</button>` : ''}</td>` : ''}
        ${ad ? `<td style="white-space:nowrap"><button class="btn sm" data-ed="${si}:${ii}" title="Editar">✎</button> <button class="btn sm" data-rmi="${si}:${ii}" title="Quitar">×</button></td>` : ''}</tr>`; }).join('');
    const pendL = lectOf(p.id).filter(l => l.estado === 'pendiente').map(l => [l, (l.ops || []).filter(o => o.sec === S2.key).length]).filter(x => x[1]);
    return `<div class="box" id="sec-${S2.key}"><h3>${d.name} ${pendL.map(([l, n]) => `<button class="btn sm pri" data-lrev="${esc(l.id)}" title="Leído de ${esc(l.fuente?.filename || 'documento')}">📥 ${n} por confirmar</button>`).join(' ')} ${S2.key === 'mat' && !S2.items.length && !S2.cerrada ? chip('Sin definir (no bloquea)','s-na') : done ? chip('Cumplido','s-ok') : chip(cond && S2.requiere == null ? 'Sin definir' : `${S2.items.filter(i => DONE.has(i.status)).length}/${S2.items.length}`, 's-na')}
        ${S2.key === 'mat' && ad ? `<label class="b s-na" style="cursor:pointer;margin-left:6px"><input type="checkbox" data-close="${si}" ${S2.cerrada?'checked':''}> Lista cerrada</label>` : ''}
        ${ad && showItems ? `<span style="margin-left:auto"><button class="btn sm" data-addi="${si}">+ ${S2.key === 'doc' ? 'Manual' : S2.key === 'tools' ? 'Herramienta / equipo' : S2.key === 'mat' ? 'Material' : S2.key === 'train' ? 'Grupo / curso' : 'Ítem'}</button></span>` : ''}</h3>
      <div class="hint">${esc(d.hint)}</div>${condCtl}
      ${showItems ? (S2.items.length ? `<div class="wrap" style="border:none"><table class="items"><thead><tr><th>Requisito</th><th>Estado</th>${d.ev.length ? '<th>Evidencias</th>' : ''}${ad ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="empty" style="padding:4px 0">Sin ítems.${ad ? ' Agrega los requisitos que pide el manual.' : ''}</div>`) : ''}${S2.key === 'train' ? collabBlock(p) : ''}</div>`;
  };
  $('#eMain').innerHTML = `
    <div class="box"><div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
      <div><h2 style="margin:0;font-size:19px">${esc(p.desc)}</h2><div style="color:var(--muted);font-size:12.5px;margin-top:2px">${esc(p.id)} · ${esc(tipoLabel(p.tipo))} · ${p.aprobacion ? 'Capacidad aprobada · actualización de expediente' : 'Autoevaluación'}</div>
      <div style="margin-top:8px"><span class="b ${c}">${esc(s)}</span>${authBadges(p.autoridad)}</div></div>
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${ad && !editMode ? '<button class="btn" id="eEdit">Editar datos</button>' : ''}<button class="btn" id="ePres">Vista presentación</button></div></div>
      <div style="margin-top:12px">${bar2(progress(p), expected(p))}</div>
      <div class="dims" style="margin-top:8px">${secOrder(p).filter(k => k !== 'mat' || isFAA(p)).map(k => `<a href="#" data-jump="${k}" class="b ${secDone(p, sec(p,k))?'s-ok':'s-na'}">${secDone(p, sec(p,k))?'✓':'○'} ${esc(SEC_DEF[k].name)}</a>`).join('')}
        ${ad ? `<label class="b ${p.solicitud?'s-ok':'s-na'}" style="cursor:pointer"><input type="checkbox" id="cSol" ${p.solicitud?'checked':''}> Solicitud a la autoridad</label>
               ${usesApr(p) ? aprHtml(p, true) : `<label class="b ${p.aprobacion?'s-ok':'s-na'}" style="cursor:pointer"><input type="checkbox" id="cApr" ${p.aprobacion?'checked':''}> Aprobación de la autoridad</label>`}`
             : `${chip((p.solicitud?'✓':'○') + ' Solicitud a la autoridad', p.solicitud?'s-ok':'s-na')}${usesApr(p) ? aprHtml(p, false) : chip((p.aprobacion?'✓':'○') + ' Aprobación de la autoridad', p.aprobacion?'s-ok':'s-na')}`}</div>
      ${W.length ? `<div class="warnbox"><b>Control de la autoevaluación: ${W.length} ${W.length===1?'observación':'observaciones'}</b>${W.slice(0,6).map(([s2,it,w]) => `<div>⚠ ${esc(SEC_DEF[s2.key].name)} · ${esc(it.title)}: ${esc(w)}</div>`).join('')}${W.length > 6 ? `<div>… y ${W.length - 6} más (ver cada sección)</div>` : ''}</div>` : ''}
      <div style="margin-top:12px">${header}</div></div>
    ${p.tipo === 'Certificación extranjera' ? '<div class="box"><h3>Proceso de autoridad</h3><div class="note2" style="margin:0">Los pasos para habilitarse ante una nueva autoridad aún no están definidos. Mientras tanto puedes registrar la situación actual, fechas y observaciones en los datos del proyecto.</div></div>' : ''}
    ${lectBox(p)}
    ${faaBox(p)}
    ${(p.sections || []).map((S2, si) => S2.key ? secHtml(S2, si) : '').join('')}
    <div class="note2">Evidencias: ${evAll.length} subidas · ${nApr} aprobadas · ${nPend} por revisar. Los documentos para la autoridad se emiten en <a href="#informes" data-goinf="${esc(p.id)}">Informes</a>.</div>`;
  bindExp(p, raw);
}
function commentsHtml(it, si, ii, ad){
  const nd = d => { const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(String(d||'').trim()); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : (d || ''); };
  const log = (it.log || []).map(l => ({...l, date: nd(l.date)})).sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
  const last = log[log.length - 1];
  return `${last ? `<div class="log">💬 ${esc(fmt(last.date) || 's/f')} · ${esc(last.text||'')}</div>` : ''}
    ${log.length > 1 ? `<button class="lnk" data-hist="1">Historial de comentarios (${log.length})</button><div class="hist" hidden>${log.map(l => `<div><b>${esc(fmt(l.date) || 's/f')}</b> ${esc(l.text||'')}</div>`).join('')}</div>` : ''}
    ${ad ? `<button class="lnk" data-cm="${si}:${ii}">+ Comentario</button>` : ''}`;
}
async function iaSticker(btn, ev, p){
  if (!ev || !RT.sample) return;
  btn.disabled = true; btn.textContent = 'Claude está leyendo…';
  try {
    const blob = await (await fetch(assetUrl(ev.assetId))).blob();
    const r = await RT.sample.json('Esta foto muestra una herramienta o equipo de taller aeronáutico con un sticker o label de calibración. Lee la fecha de vencimiento de la calibración (due date / next calibration / vence). Responde solo JSON: {"due":"YYYY-MM-DD" o null si no es legible, "legible":true|false, "notes":"breve, en español: qué texto leíste en el sticker"}.', {images:[blob], modelTier:'default'});
    const due = r && typeof r.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null;
    await writeDoc('evid/' + ev.id, {iaCheck:{due, legible:!!(r && r.legible), notes:String(r?.notes || '').slice(0,300), at:new Date().toISOString()}}, 'update');
    flash(due ? `Claude leyó due date ${fmt(due)}. Compárala con la registrada.` : 'Claude no pudo leer la fecha del sticker.');
  } catch(e){ flash(e && e.code === 'not_granted' ? 'Claude no está autorizado en esta página.' : 'No se pudo verificar la foto (' + (e.code || e.message || 'error') + ').', true); }
  btn.disabled = false; btn.textContent = '🔍 Verificar sticker';
}
function bindExp(p, raw){
  const M = $('#eMain');
  const mut = fn => { const q = JSON.parse(JSON.stringify(p)); fn(q); return saveProj(q); };
  if ($('#eEdit')) $('#eEdit').onclick = () => { editMode = true; renderExp(); };
  $('#ePres').onclick = () => openProject(p.id);
  M.querySelectorAll('[data-jump]').forEach(a => a.onclick = ev => { ev.preventDefault(); const t = $('#sec-' + a.dataset.jump); if (t) t.scrollIntoView({behavior:'smooth'}); });
  if ($('#fCancel')) $('#fCancel').onclick = () => { editMode = false; renderExp(); };
  if ($('#fSave')) $('#fSave').onclick = async () => {
    const lines = v => v.split('\n').map(x => x.trim()).filter(Boolean);
    await mut(q => Object.assign(q, {desc:$('#fDesc').value.trim() || q.desc, tipo:$('#fTipo').value, pns:lines($('#fPns').value), cmm:lines($('#fCmm').value), mfr:$('#fMfr').value.trim(), ata:$('#fAta').value.trim(),
      area:$('#fArea').value.trim(), rating:$('#fRat').value.trim(), limitacion:$('#fLim').value || q.limitacion, autoridad:$('#fAut').value.split(',').map(x => x.trim()).filter(Boolean),
      fechaSolicitud:$('#fF1').value || null, fechaEstimada:$('#fF2').value || null, fechaAprobacion:$('#fF3').value || null, obs:$('#fObs').value.trim(),
      estadoTexto:$('#fEst').value.trim(), ...($('#fMA') ? {modeloAeronave:$('#fMA').value.trim(), motores:$('#fMo').value.trim()} : {})}));
    editMode = false; flash('Datos guardados.');
  };
  if ($('#cSol')) $('#cSol').onchange = e => mut(q => q.solicitud = e.target.checked);
  if ($('#cApr')) $('#cApr').onchange = e => mut(q => q.aprobacion = e.target.checked);
  M.querySelectorAll('input[type=radio][name^=rq]').forEach(r => r.onchange = () => { const si = +r.name.slice(2); mut(q => q.sections[si].requiere = r.value === 'null' ? null : r.value === 'true'); });
  M.querySelectorAll('[data-close]').forEach(c => c.onchange = () => mut(q => q.sections[+c.dataset.close].cerrada = c.checked));
  M.querySelectorAll('[data-st]').forEach(sel => sel.onchange = () => { const [si,ii] = sel.dataset.st.split(':').map(Number); mut(q => q.sections[si].items[ii].status = sel.value); });
  M.querySelectorAll('[data-addi]').forEach(b => b.onclick = () => itemForm(p, +b.dataset.addi, null));
  M.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { const [si,ii] = b.dataset.ed.split(':').map(Number); itemForm(p, si, ii); });
  M.querySelectorAll('[data-rmi]').forEach(b => b.onclick = () => armed(b, () => { const [si,ii] = b.dataset.rmi.split(':').map(Number); mut(q => q.sections[si].items.splice(ii,1)); }));
  M.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const [si,ii] = b.dataset.up.split(':').map(Number); evidForm(b, p, p.sections[si], p.sections[si].items[ii]); });
  M.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => review(b.dataset.ok, 'aprobada'));
  M.querySelectorAll('[data-ko]').forEach(b => b.onclick = () => reviewForm(b, b.dataset.ko));
  M.querySelectorAll('[data-del]').forEach(b => b.onclick = () => armed(b, async () => { const ev = store.evid.get(b.dataset.del); if (!ev) return;
    try { await writeDoc('evid/' + ev.id, null, 'del'); if (store.rev.has(ev.id)) await writeDoc('rev/' + ev.id, null, 'del'); try { await RT.assets.delete(ev.assetId); } catch(e){} } catch(e){ flash('No se pudo eliminar.', true); } }));
  M.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => genDoc(p, b.dataset.doc, b));
  M.querySelectorAll('[data-goinf]').forEach(a => a.onclick = () => { docProj = a.dataset.goinf; });
  M.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => { const d = b.nextElementSibling; d.hidden = !d.hidden; });
  M.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { const [si,ii] = b.dataset.cm.split(':').map(Number);
    const w = document.createElement('div'); w.className = 'evform';
    w.innerHTML = `<input type="date" value="${today()}" id="cmD"><input id="cmT" placeholder="Comentario (ej.: solicitado a APAS Miami)" style="flex:1;min-width:200px"><button class="btn sm pri" id="cmS">Agregar</button><button class="btn sm" id="cmX">×</button>`;
    b.after(w); $('#cmT').focus(); $('#cmX').onclick = () => w.remove();
    $('#cmS').onclick = () => { const t = $('#cmT').value.trim(); if (!t) return; mut(q => { const it = q.sections[si].items[ii]; (it.log = it.log || []).push({date:$('#cmD').value || today(), text:t, at:new Date().toISOString()}); }); }; });
  M.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => incorporate(p, b.dataset.inc));
  M.querySelectorAll('[data-dis]').forEach(b => b.onclick = () => armed(b, () => writeDoc('train/' + b.dataset.dis, null, 'del')));
  M.querySelectorAll('[data-ia]').forEach(b => b.onclick = () => iaSticker(b, store.evid.get(b.dataset.ia), p));
  bindFaa(p); bindApr(p); bindLect(p);
  if (raw.model !== 3 && isAdmin()) saveProj(p); // persist upgrade once
}
function armed(b, fn){ if (b.dataset.armed){ fn(); return; } b.dataset.armed = '1'; const t = b.textContent; b.textContent = '¿Seguro?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = t; }, 3000); }
function itemForm(p, si, ii){
  const S2 = p.sections[si], k = S2.key, it = ii == null ? {} : S2.items[ii];
  const inp = (id, l, v, extra='') => `<label class="fld">${l}<input id="${id}" value="${esc(v ?? '')}" ${extra}></label>`;
  let f = '';
  if (k === 'tools') f = inp('iT','Descripción',it.title) + inp('iP','P/N requerido',it.pn) + inp('iA','P/N alternativo (requiere intercambiabilidad)',it.pnAlt) + inp('iQ','Cantidad requerida',it.qtyReq) + inp('iO','Cantidad obtenida',it.qtyObt) + `<label class="fld">Disponible en CMA/MRO (QC-020)<select id="iD"><option value="">—</option><option ${it.disponible === 'YES' ? 'selected' : ''}>YES</option><option ${it.disponible === 'NO' ? 'selected' : ''}>NO</option></select></label>`
    + `<label class="fld">Logística<select id="iL">${LOGIS.map(l => `<option ${(it.logistica||'Pendiente')===l?'selected':''}>${l}</option>`).join('')}</select></label>`
    + `<label class="fld">¿Calibrable?<select id="iC"><option value="">Sin indicar</option><option value="1" ${it.calibrable===true?'selected':''}>Sí</option><option value="0" ${it.calibrable===false?'selected':''}>No</option></select></label>`
    + inp('iV','Fecha de calibración · due date del sticker',it.calDue || it.calVence,'type="date"') + inp('iU','Uso / aplicación',it.uso);
  else if (k === 'doc') f = `<label class="fld">Tipo de manual<input id="iM" list="mlist" value="${esc(it.tipoManual||'')}"><datalist id="mlist">${MANUALS.map(m => `<option>${m}</option>`).join('')}</datalist></label>`
    + inp('iN','Número / código',it.numero) + inp('iR','Revisión',it.revision) + inp('iD','Fecha de revisión',it.fechaRev);
  else if (k === 'mat') f = inp('iT','Descripción',it.title) + inp('iP','P/N',it.pn) + inp('iA','P/N alternativo(s)',it.pnAlt) + inp('iU','Uso / aplicación',it.uso);
  else if (k === 'train') f = `<label class="fld">Tipo de registro<select id="iKd"><option value="persona" ${it.kind!=='roster'?'selected':''}>Persona</option><option value="roster" ${it.kind==='roster'?'selected':''}>Roster completo</option></select></label>`
    + inp('iT','Nombre de la persona / título del roster',it.title)
    + `<div class="fld" id="iRolesW">Funciones (una o varias)<div class="roles">${ROLES.map(r => `<label><input type="checkbox" value="${r}" ${(it.roles||[]).includes(r)?'checked':''}> ${r}</label>`).join('')}</div></div>`
    + inp('iK','Curso',it.curso ?? (p.tipo === 'Aeronave' ? 'Curso Nv3 de aeronave' : 'Curso básico del componente según manual'));
  else if (k === 'serv') f = `<label class="fld">Servicio<input id="iT" list="slist" value="${esc(it.title||'')}"><datalist id="slist">${SERVS.map(x => `<option>${x}</option>`).join('')}</datalist></label>`
    + inp('iPr','Proveedor externo',it.proveedor) + inp('iU','Detalle (lo que exige el manual)',it.uso);
  else f = inp('iT','Requisito',it.title) + inp('iU','Detalle (lo que exige el manual)',it.uso);
  const box = document.createElement('div'); box.className = 'box';
  box.innerHTML = `<h3>${ii == null ? 'Nuevo' : 'Editar'} · ${esc(SEC_DEF[k].name)}</h3><div class="form">${f}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn pri" id="iS">Guardar</button><button class="btn" id="iX">Cancelar</button></div>`;
  $('#sec-' + k).after(box); box.scrollIntoView({behavior:'smooth', block:'center'});
  const v = id => $('#' + id) ? $('#' + id).value.trim() : undefined;
  $('#iX').onclick = () => box.remove();
  if ($('#iKd')){ const tg = () => { $('#iRolesW').hidden = $('#iKd').value === 'roster'; if ($('#iKd').value === 'roster' && !$('#iT').value) $('#iT').value = 'Roster del proyecto'; }; $('#iKd').onchange = tg; tg(); }
  $('#iS').onclick = async () => {
    const q = JSON.parse(JSON.stringify(p)); const t = ii == null ? {id:uid(), status:'pendiente', log:[]} : q.sections[si].items[ii];
    if (k === 'tools') Object.assign(t, {title:v('iT'), pn:v('iP'), pnAlt:v('iA') || null, qtyReq:v('iQ'), qtyObt:v('iO'), logistica:v('iL'), calibrable: v('iC') === '' ? null : v('iC') === '1', calDue:v('iV') || null, uso:v('iU'), disponible:v('iD') || null});
    else if (k === 'doc') Object.assign(t, {tipoManual:v('iM'), numero:v('iN'), revision:v('iR'), fechaRev:v('iD'), title:[v('iM'), v('iN')].filter(Boolean).join(' ')});
    else if (k === 'mat') Object.assign(t, {title:v('iT'), pn:v('iP'), pnAlt:v('iA') || null, uso:v('iU'), status: ii == null ? 'cumplido' : t.status});
    else if (k === 'train') Object.assign(t, {kind:v('iKd'), title:v('iT'), curso:v('iK'), roles: v('iKd') === 'persona' ? [...box.querySelectorAll('.roles input:checked')].map(x => x.value) : []});
    else if (k === 'serv') Object.assign(t, {title:v('iT'), proveedor:v('iPr'), uso:v('iU')});
    else Object.assign(t, {title:v('iT'), uso:v('iU')});
    if (!t.title){ flash('Falta la descripción.', true); return; }
    if (k === 'tools' && t.logistica === 'ON HAND' && !DONE.has(t.status)) t.status = 'cumplido';
    if (ii == null) q.sections[si].items.push(t);
    box.remove(); await saveProj(q); flash('Guardado.'); renderExp();
  };
}
function evidForm(btn, p, S2, it){
  document.querySelectorAll('.evform').forEach(x => x.remove());
  const types = SEC_DEF[S2.key].ev;
  const w = document.createElement('div'); w.className = 'evform';
  w.innerHTML = `<select id="eT">${types.map(t => `<option value="${t}">${esc(EVT[t])}</option>`).join('')}</select>
    <span id="eX"></span><input id="eF2" type="date" title="Fecha del documento (para evidencias antiguas)"><button class="btn sm pri" id="eGo">Elegir archivo…</button><button class="btn sm" id="eCl">Cancelar</button>`;
  btn.after(w);
  const extra = () => { const t = $('#eT').value; $('#eX').innerHTML = t === 'oc' ? '<input id="eA" placeholder="Autorizado por (gerente / jefe de área)"><input id="eE" type="date" title="Fecha estimada de arribo">'
      : t === 'foto' && S2.key === 'tools' && it.calibrable !== false ? '<label style="font-size:12px">Due date del sticker <input id="eV" type="date"></label>' : ''; };
  $('#eT').onchange = extra; extra();
  $('#eCl').onclick = () => w.remove();
  $('#eGo').onclick = () => {
    const t = $('#eT').value, meta = {tipo:t, fechaDoc: $('#eF2').value || null};
    if (t === 'oc'){ meta.autorizadoPor = ($('#eA').value || '').trim(); meta.eta = $('#eE').value || null; if (!meta.autorizadoPor){ flash('La OC necesita el nombre de quien la autoriza.', true); return; } }
    if ($('#eV') && $('#eV').value) meta.dueSticker = $('#eV').value;
    pickFiles(async fs => { await uploadEvid(p, it.id, fs, meta);
      if (meta.dueSticker && isAdmin()){ const q = JSON.parse(JSON.stringify(p)); const ti = q.sections.find(x => x.key === S2.key).items.find(x => x.id === it.id); ti.calibrable = true; ti.calDue = meta.dueSticker; await saveProj(q); }
      w.remove(); render(); }, t === 'foto' ? 'image/*' : 'image/*,application/pdf');
  };
}
async function uploadEvid(p, itemId, files, meta={}){
  for (const f of files){
    if (f.size > 80*1024*1024){ flash(`${f.name} supera 80 MB.`, true); continue; }
    flash(`Subiendo ${f.name}…`);
    try { const a = await RT.assets.upload(f);
      await RT.db.collection('evid').add({projId:p.id, itemId, assetId:a.id, filename:f.name, contentType:a.contentType || f.type, sizeBytes:a.sizeBytes || f.size, at:new Date().toISOString(), by:RT.myId || null, ...meta});
      flash(`Evidencia subida: ${f.name}`);
    } catch(e){ flash(`No se pudo subir ${f.name} (${e.code || e.message || 'error'}).`, true); }
  }
}
function reviewForm(btn, evId){
  const w = document.createElement('div'); w.className = 'ev'; w.style.width = '100%';
  w.innerHTML = `<input placeholder="Motivo del rechazo" style="flex:1;font:inherit;font-size:12px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)"><button class="btn sm">Rechazar</button>`;
  btn.closest('.ev').after(w); w.querySelector('input').focus();
  w.querySelector('button').onclick = () => review(evId, 'rechazada', w.querySelector('input').value.trim());
}
async function review(evId, status, comment){
  try { await writeDoc('rev/' + evId, {status, comment: comment || '', at:new Date().toISOString()}); flash(status === 'aprobada' ? 'Evidencia aprobada.' : 'Evidencia rechazada.'); }
  catch(e){ flash('No se guardó la revisión.', true); }
}

// ===================== restore spreadsheet projects (owner)
function missingImports(){
  if (loaded.proj !== true) return [];
  const db = projDb();
  return IMPORT.filter(ip => !db.some(d => (ip.excelId != null ? d.excelId === ip.excelId : d.id === ip.id)));
}
function restoreBanner(){
  const miss = missingImports(); if (!miss.length) return '';
  if (!isAdmin()) return store.proj.size ? '' : '<div class="box empty">Aún no hay proyectos cargados.</div>';
  return `<div class="box" id="impBox" style="border-color:var(--warn);background:var(--warn-bg)"><h3>Faltan ${miss.length} proyectos por cargar</h3>
    <div style="font-size:13px;margin-bottom:8px">Los proyectos de "Seguimiento Trabajos Capacidades v2" (con la estructura de autoevaluación armada desde las hojas CMM) no están guardados en la base. Restáuralos para poder editarlos. Los proyectos que ya creaste se conservan.</div>
    <button class="btn pri" id="impGo">Restaurar ${miss.length} proyectos</button></div>`;
}
async function runImport(btn){
  btn.disabled = true; let n = 0; const miss = missingImports();
  // move user-created projects whose id collides with a spreadsheet id
  for (const ip of miss){
    const clash = store.proj.get(ip.id);
    if (clash && clash.excelId !== ip.excelId){
      const nid = nextId();
      const {id, ...rest} = clash;
      await writeDoc('proj/' + nid, {...rest, updatedAt:new Date().toISOString()});
      for (const ev of evidOf(id)) await writeDoc('evid/' + ev.id, {projId:nid}, 'update').catch(() => {});
      await writeDoc('proj/' + id, null, 'del');
      store.proj.delete(id); store.proj.set(nid, {...rest, id:nid});
      if (eCur === id) eCur = nid;
      flash(`Tu proyecto "${rest.desc}" pasó de ${id} a ${nid}.`);
    }
  }
  for (const p of miss){ const {id, ...rest} = p; try { await writeDoc('proj/' + id, {...rest, updatedAt:new Date().toISOString()}); n++; btn.textContent = `Restaurando… ${n}/${miss.length}`; } catch(e){ flash('Error al restaurar ' + id, true); break; } }
  flash(`${n} proyectos restaurados.`);
}
document.addEventListener('click', e => { if (e.target.id === 'impGo') runImport(e.target); });

// ===================== PDF (provisional formats)
const W1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const pdfSafe = s => String(s ?? '').replace(/[✓]/g,'OK').replace(/[○]/g,'-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ch => W1252.includes(ch) ? ch : '?');
const SEC_EN = {'Documentación técnica':'Technical data','Herramientas y equipos':'Equipment and tools','Entrenamiento del personal':'Trained personnel','Infraestructura':'Housing and facilities',
  'Servicios':'Services','Materiales':'Material','Procesos':'Processes'};
async function genDoc(p, auth, btn){
  btn.disabled = true; const t0 = btn.textContent; btn.textContent = 'Generando…';
  try {
    const bytes = await buildDoc(p, auth);
    const name = `${auth === 'FAA' ? 'FAA_Self-Evaluation' : 'DGAC_Autoevaluacion'}_${(p.desc||p.id).replace(/[^\w]+/g,'_')}_${today()}.pdf`;
    if (RT.dl) { await RT.dl.save({filename:name, data:new Blob([bytes], {type:'application/pdf'})}); flash('Documento generado: ' + name); }
    else if (!window.claude) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = name; a.click(); flash('Documento generado: ' + name); }
    else flash('La descarga no está disponible en esta vista.', true);
  } catch(e){ console.error(e); flash('No se pudo generar el documento: ' + (e.message || e), true); }
  btn.disabled = false; btn.textContent = t0;
}
async function buildDoc(p, auth){
  const EN = auth === 'FAA';
  const L = EN ? {title:'CAPABILITY LIST SELF-EVALUATION RECORD', sub:'14 CFR 145.215(c) · A Professional Aviation Services Chile SpA · FAA Certificate APAY048E', prov:'PROVISIONAL FORMAT – FOR INTERNAL REVIEW',
      art:'1. Article', eval:'2. Self-evaluation by element', res:'3. Result', annex:'4. Evidence index', item:'Requirement', status:'Status', ref:'Evidence', element:'Element',
      fields:['Description','Part number(s)','Manufacturer','Technical data (CMM/AMM)','Rating','Function / limitation','Requested by','Request date'],
      st:{ok:'Complies', na:'N/A', pend:'Pending'}, result:(ok) => ok ? 'All elements evaluated comply. The article may be added to the capability list per the RSM/QCM procedure, and the revised list provided to the responsible Flight Standards office.' : 'Open items remain. The article must not be added to the capability list until all elements comply.',
      sign:['Evaluated by','Quality Manager','Accountable Manager'], date:'Name, signature and date', none:'No approved evidence attached.', page:'Page', of:'of', annexLbl:'ANNEX'}
    : {title:'REGISTRO DE AUTOEVALUACIÓN DE CAPACIDAD', sub:'DAN 145 · APAS Chile SpA · Centro de Mantenimiento Aeronáutico N° 655', prov:'FORMATO PROVISORIO – PARA REVISIÓN INTERNA',
      art:'1. Artículo', eval:'2. Autoevaluación por elemento', res:'3. Resultado', annex:'4. Índice de evidencias', item:'Requisito', status:'Estado', ref:'Evidencia', element:'Elemento',
      fields:['Descripción','Número(s) de parte','Fabricante','Datos técnicos (CMM/AMM)','Habilitación','Función / limitación','Solicitante','Fecha de solicitud'],
      st:{ok:'Cumple', na:'N/A', pend:'Pendiente'}, result:(ok) => ok ? 'Todos los elementos evaluados cumplen. Se solicita la inclusión del artículo en la Lista de Capacidad conforme al procedimiento del MPM, sujeta a aprobación de la DGAC.' : 'Existen ítems abiertos. No corresponde solicitar la inclusión en la Lista de Capacidad hasta que todos los elementos cumplan.',
      sign:['Evaluado por','Gerente de Calidad','Gerente Responsable'], date:'Nombre, firma y fecha', none:'Sin evidencias aprobadas adjuntas.', page:'Página', of:'de', annexLbl:'ANEXO'};
  const {PDFDocument, StandardFonts, rgb} = PDFLib;
  const doc = await PDFDocument.create(); doc.setTitle(pdfSafe(`${L.title} - ${p.desc}`)); doc.setCreator('Portal de Capacidades (piloto)');
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold), FI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const A4 = [595.28, 841.89], M = 42, CW = A4[0] - 2*M, NAVY = rgb(0.09,0.25,0.4), INK = rgb(0.1,0.13,0.17), MUTED = rgb(0.37,0.42,0.48), LINE = rgb(0.8,0.83,0.86);
  const GREEN = rgb(0.78,0.94,0.81), YEL = rgb(1,0.92,0.61), GREY = rgb(0.93,0.94,0.95);
  let page, y;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const text = (s, x, yy, font=F, size=9, color=INK) => page.drawText(pdfSafe(s), {x, y:yy, font, size, color});
  const wrap = (s, font, size, w) => { const out = []; for (const para of pdfSafe(s).split('\n')){ let cur = ''; for (const wd of para.split(/\s+/)){ const t = cur ? cur + ' ' + wd : wd;
      if (font.widthOfTextAtSize(t, size) <= w) cur = t; else { if (cur) out.push(cur); let ww = wd; while (font.widthOfTextAtSize(ww, size) > w && ww.length > 1){ let k = ww.length; while (k > 1 && font.widthOfTextAtSize(ww.slice(0,k), size) > w) k--; out.push(ww.slice(0,k)); ww = ww.slice(k); } cur = ww; } }
      out.push(cur); } return out; };
  const ensure = h => { if (y - h < M + 20){ newPage(); return true; } return false; };
  const heading = s => { ensure(40); y -= 8; page.drawRectangle({x:M, y:y-15, width:CW, height:18, color:NAVY}); text(s.toUpperCase(), M+6, y-10, FB, 9.5, rgb(1,1,1)); y -= 22; };
  const table = (cols, rows) => { const pad = 3.5, sz = 8.5, lh = 10.5;
    const head = () => { const hh = 16; let x = M; cols.forEach(c => { page.drawRectangle({x, y:y-hh, width:c.w, height:hh, color:rgb(0.91,0.94,0.97), borderColor:LINE, borderWidth:0.5}); text(c.h, x+pad, y-11, FB, 8, NAVY); x += c.w; }); y -= hh; };
    head();
    for (const r of rows){ const ls = r.map((c,k) => wrap(c.t ?? '', c.b ? FB : F, sz, cols[k].w - 2*pad)); const h = Math.max(...ls.map(l => l.length)) * lh + 2*pad - 1;
      if (ensure(h)) head(); let x = M;
      r.forEach((c,k) => { page.drawRectangle({x, y:y-h, width:cols[k].w, height:h, color:c.fill || rgb(1,1,1), borderColor:LINE, borderWidth:0.5}); ls[k].forEach((l,j) => text(l, x+pad, y-pad-7.5-j*lh, c.b?FB:F, sz)); x += cols[k].w; });
      y -= h; } y -= 6; };
  // annex numbering (approved evidence only)
  const annex = []; let n = 0;
  for (const s of p.sections || []) for (const it of s.items) for (const ev of evidOf(p.id, it.id)) if (revOf(ev.id) === 'aprobada') annex.push({n:++n, ev, it, sec:s.name});
  const anxFor = it => annex.filter(a => a.it.id === it.id).map(a => (EN ? 'Annex ' : 'Anexo ') + a.n).join(', ') || '—';
  newPage();
  page.drawRectangle({x:0, y:A4[1]-80, width:A4[0], height:80, color:NAVY}); await pdfBrand(doc, page, A4[0], A4[1]);
  text(L.title, M, A4[1]-36, FB, 14, rgb(1,1,1)); text(L.sub, M, A4[1]-53, F, 8.5, rgb(0.85,0.9,0.96)); text(L.prov, M, A4[1]-68, FB, 8, rgb(1,0.85,0.5));
  y = A4[1] - 96; text(`${p.id} · ${EN ? 'Issued' : 'Emitido'}: ${fmt(today())}`, M, y, F, 8.5, MUTED); y -= 10;
  heading(L.art);
  const vals = [p.desc, (p.pns||[]).join(', '), p.mfr, [...(p.cmm||[]), p.manualRev].filter(Boolean).join(', '), p.rating, p.limitacion, p.area, fmt(p.fechaSolicitud)];
  table([{h:'', w:170}, {h:'', w:CW-170}], L.fields.map((f,i) => [{t:f, b:true}, {t:vals[i] || '—'}]));
  heading(L.eval);
  const allOk = [];
  const rows = [];
  for (const s of p.sections || []){
    if (s.key === 'mat' && !EN) continue;
    const secN = EN ? (SEC_EN[s.name] || s.name) : s.name;
    if ((s.key === 'infra' || s.key === 'serv') && s.requiere !== true){
      const st = s.requiere === false ? 'ok' : 'pend'; allOk.push(st === 'ok');
      rows.push([{t:secN, b:true}, {t: s.requiere === false ? (EN ? (s.key === 'infra' ? 'No special housing/facilities required by the technical data' : 'No external services required') : (s.key === 'infra' ? 'El manual no exige infraestructura especial' : 'No requiere servicios externos')) : (EN ? 'To be defined' : 'Por definir')}, {t:L.st[st], fill: st==='ok'?GREEN:YEL}, {t:'—'}]);
      continue;
    }
    if (s.key === 'mat' && !s.items.length) continue;
    for (const it of s.items){
      const st = it.status === 'na' ? 'na' : DONE.has(it.status) ? 'ok' : 'pend'; allOk.push(st !== 'pend');
      rows.push([{t:secN, b:true}, {t: s.key ? itemLabel(s, it) : it.title + (it.pn ? ` (P/N ${it.pn})` : '')}, {t:L.st[st], fill: st==='ok'?GREEN:st==='na'?GREY:YEL}, {t: s.key === 'mat' ? 'N/A' : anxFor(it)}]);
    }
  }
  if (rows.length) table([{h:L.element, w:120}, {h:L.item, w:CW-300}, {h:L.status, w:75}, {h:L.ref, w:105}], rows);
  else { text(EN ? 'No requirements defined.' : 'Sin requisitos definidos.', M, y-8, FI, 9, MUTED); y -= 18; }
  heading(L.res);
  const ok = allOk.length > 0 && allOk.every(Boolean);
  wrap(L.result(ok), FB, 9.5, CW).forEach(l => { ensure(14); text(l, M, y-10, FB, 9.5, ok ? rgb(0.1,0.45,0.25) : rgb(0.6,0.35,0)); y -= 13; }); y -= 6;
  heading(L.annex);
  if (annex.length) table([{h:'N°', w:35}, {h:L.element, w:120}, {h:L.item, w:CW-305}, {h:EN?'File':'Archivo', w:150}], annex.map(a => [{t:String(a.n), b:true}, {t: EN ? (SEC_EN[a.sec]||a.sec) : a.sec}, {t:a.it.title}, {t:a.ev.filename}]));
  else { text(L.none, M, y-8, FI, 9, MUTED); y -= 18; }
  ensure(90); y -= 26; const sw = (CW - 40) / 3;
  L.sign.forEach((s, k) => { const x = M + k*(sw+20); page.drawLine({start:{x, y:y-30}, end:{x:x+sw, y:y-30}, thickness:0.6, color:MUTED}); text(s, x, y-42, FB, 8.5, MUTED); text(L.date, x, y-53, FI, 7.5, MUTED); });
  const nRep = doc.getPageCount();
  for (const a of annex){
    const stamp = pg => { const {width, height} = pg.getSize(); pg.drawRectangle({x:0, y:height-16, width, height:16, color:rgb(1,1,1), opacity:0.85});
      pg.drawText(pdfSafe(`${L.annexLbl} ${a.n} · ${a.it.title} · ${p.desc}`).slice(0,150), {x:10, y:height-11, size:7.5, font:FB, color:NAVY}); };
    try { const r = await fetch(assetUrl(a.ev.assetId)); if (!r.ok) throw new Error('HTTP ' + r.status); const buf = new Uint8Array(await r.arrayBuffer());
      const ct = (a.ev.contentType||'').toLowerCase(), nm = (a.ev.filename||'').toLowerCase();
      if (ct.includes('pdf') || nm.endsWith('.pdf')){ const src = await PDFDocument.load(buf, {ignoreEncryption:true}); (await doc.copyPages(src, src.getPageIndices())).forEach(pg => { doc.addPage(pg); stamp(pg); }); }
      else { const img = (sniffImg(buf) || (ct.includes('png') ? 'png' : 'jpg')) === 'png' ? await doc.embedPng(buf) : await doc.embedJpg(buf); const pg = doc.addPage(A4);
        const s = Math.min((A4[0]-2*M)/img.width, (A4[1]-2*M-20)/img.height, 1); pg.drawImage(img, {x:(A4[0]-img.width*s)/2, y:(A4[1]-img.height*s)/2-10, width:img.width*s, height:img.height*s}); stamp(pg); }
    } catch(e){ const pg = doc.addPage(A4); stamp(pg); pg.drawText(pdfSafe(`${L.annexLbl} ${a.n}: ${a.ev.filename} (${e.message||'error'})`), {x:M, y:A4[1]-80, size:10, font:FB, color:rgb(0.7,0.14,0.1)}); }
  }
  const total = doc.getPageCount();
  doc.getPages().forEach((pg, k) => { const {width} = pg.getSize(); const s = pdfSafe(`${p.desc} · ${L.page} ${k+1} ${L.of} ${total}`);
    pg.drawText(s, {x:width-10-F.widthOfTextAtSize(s,7), y:8, size:7, font:F, color:MUTED}); pg.drawText(pdfSafe(k < nRep ? L.prov : L.annexLbl), {x:10, y:8, size:7, font:F, color:MUTED}); });
  return await doc.save();
}

// ===================== shared: expected progress
function expected(p){
  if (!isDate(p.fechaSolicitud) || !isDate(p.fechaEstimada) || p.aprobacion) return null;
  const s = Date.parse(p.fechaSolicitud), e = Date.parse(p.fechaEstimada), t = Date.parse(today());
  if (e <= s) return 100;
  return Math.max(0, Math.min(100, Math.round((t - s) / (e - s) * 100)));
}
const bar2 = (v, ex) => `<div class="pct"><div class="bar" style="position:relative;overflow:visible"><i style="width:${v}%"></i>${ex != null ? `<em class="xmk" style="left:${ex}%" title="Esperado hoy: ${ex}%"></em>` : ''}</div><span>${v}%${ex != null ? `<small style="color:var(--muted)"> / ${ex}%</small>` : ''}</span></div>`;
function ring(v, size=74, color='var(--accent2)'){
  const r = size/2 - 6, c = 2*Math.PI*r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${v}%"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--na-bg)" stroke-width="7"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c*v/100} ${c}" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="${size/4.6}" font-weight="700" fill="currentColor">${v}%</text></svg>`;
}
const fmtN = n => n.toLocaleString('es-CL');

// semáforo: rojo = fecha prometida vencida · amarillo = sin avance evidenciado · verde = en orden
function sema(p){
  if (p.aprobacion) return 'g';
  if (p.fechaEstimada && p.fechaEstimada < today()) return 'r';
  if (progress(p) === 0) return 'y';
  const old = [...store.snap.values()].filter(x => x.date <= new Date(Date.parse(today()) - 7*86400000).toISOString().slice(0,10)).sort((a,b) => b.date.localeCompare(a.date))[0];
  if (old && old.data && old.data[p.id] && old.data[p.id].pct === progress(p)) return 'y';
  return 'g';
}
const SEMA = {g:['var(--ok)','En orden'], y:['#d9a400','Sin avance evidenciado'], r:['var(--bad)','Atrasado a la fecha prometida']};
const dot = p => { const k = sema(p); return `<span class="dot" style="background:${SEMA[k][0]}" title="${SEMA[k][1]}"></span>`; };
// ===================== 1. INICIO (vitrina)
function renderInicio(){
  const ps = projects();
  const open = ps.filter(p => !p.aprobacion && p.tipo !== 'Certificación extranjera');
  const feat = open.filter(p => progress(p) > 0 || p.prioridad === 1).sort((a,b) => progress(b) - progress(a) || (a.prioridad||9) - (b.prioridad||9)).slice(0, 6);
  const appr = ps.filter(p => p.aprobacion && p.fechaAprobacion).sort((a,b) => b.fechaAprobacion.localeCompare(a.fechaAprobacion));
  const recentFAA = S.entries.filter(e => e.auth === 'FAA' && isDate(e.added) && e.added >= '2026-01-01').sort((a,b) => b.added.localeCompare(a.added)).slice(0, 8);
  const lists = Object.keys(S.lists).map(l => ({l, n: ART.filter(a => a.e.some(i => ENT.get(i).list === l)).length}));
  const tot = lists.reduce((s,x) => s + x.n, 0);
  const shades = ['#1f5fa0','#4f8fd0','#8db8e8','#c4dcf5'];
  const ext = ps.filter(p => p.tipo === 'Certificación extranjera');
  $('#v-inicio').innerHTML = `
    <section class="hero">
      <div class="hero-t"><div class="eyebrow">A Professional Aviation Services Chile SpA</div><h2>Capacidades de mantenimiento aprobadas</h2>
        <p>FAA Part 145 Repair Station APAY048E · DGAC Centro de Mantenimiento Aeronáutico N° 655</p></div>
      <div class="hero-n">
        <div><b>${fmtN(nFAA)}</b><span>P/N aprobados FAA</span></div>
        <div><b>${fmtN(nDGAC)}</b><span>P/N aprobados DGAC</span></div>
        <div><b>${fmtN(nDual)}</b><span>P/N con aprobación dual</span></div>
        <div><b>${hab('Aeronave') + hab('Motor') + hab('Servicio especializado')}</b><span>habilitaciones DGAC (aeronaves, motores, servicios)</span></div>
      </div>
    </section>
    <div class="cols">
      <div class="box"><h3>Composición de la lista FAA por rating</h3>
        <div class="stack">${lists.map((x,i) => `<i style="width:${x.n/tot*100}%;background:${shades[i]}" title="${esc(x.l)}: ${x.n}"></i>`).join('')}</div>
        <div class="legend2">${lists.map((x,i) => `<span><i style="background:${shades[i]}"></i>${esc(x.l)} <b>${fmtN(x.n)}</b></span>`).join('')}</div>
        <h3 style="margin-top:18px">Autoridades</h3>
        <div class="auths">
          <div class="auth"><span class="b b-FAA">FAA</span><b>Estados Unidos</b><small>Repair Station APAY048E · 4 ratings limitados</small></div>
          <div class="auth"><span class="b b-DGAC">DGAC</span><b>Chile</b><small>CMA N° 655 · Lista Rev ${S.dgacList.rev}</small></div>
          ${ext.map(p => `<div class="auth dim"><span class="b b-x">${esc((p.autoridad||[])[0]||'')}</span><b>${esc(p.pais || p.desc)}</b><small>${esc(stage(p)[0])}</small></div>`).join('')}
        </div></div>
      <div class="box"><h3>Logros recientes</h3>
        <ul class="tl">${appr.slice(0,6).map(p => `<li><time>${esc(fmt(p.fechaAprobacion))}</time><b>${esc(p.desc)}</b><span>${authBadges(p.autoridad)} aprobado</span></li>`).join('')}
        ${recentFAA.slice(0,4).map(e => `<li><time>${esc(fmt(e.added))}</time><b>${esc(e.desc)}</b><span><span class="b b-FAA">FAA</span> incorporado a Limited ${esc(e.list)}</span></li>`).join('')}</ul></div>
    </div>
    <h2 class="sec">Proyectos destacados en desarrollo</h2>
    <div class="feat">${feat.map(p => `<div class="fcard" data-p="${esc(p.id)}">${ring(progress(p))}<div><b>${esc(p.desc)}</b><small>${esc((p.pns||[])[0]||'')}${(p.pns||[]).length>1?` +${p.pns.length-1}`:''}</small>
      <div style="margin-top:6px">${authBadges(p.autoridad)}<span class="b ${stage(p)[1]}">${esc(stage(p)[0])}</span></div>${p.fechaEstimada?`<small>Término estimado: ${esc(fmt(p.fechaEstimada))}</small>`:''}</div></div>`).join('')
      || '<div class="empty">Sin proyectos destacados.</div>'}</div>
    <div class="note2">${open.length} proyectos en cartera. Detalle completo en la pestaña <a href="#capacidades">Capacidades</a>.</div>`;
  $('#v-inicio').onclick = e => { const c = e.target.closest('[data-p]'); if (c) openProject(c.dataset.p); };
}

// ===================== 2. CAPACIDADES (buscador + proyectos)
let capMode = 'proy', groupBy = 'area';
let capKind = 'comp';
function renderCapacidades(){
  const K = [['comp','Componentes'],['air','Aeronaves'],['aut','Autoridades']];
  $('#capTabs').innerHTML = `<div class="seg">${K.map(([id,l]) => `<button class="${capKind===id?'on':''}" data-k="${id}">${l}</button>`).join('')}</div>`
    + (capKind === 'comp' ? [['proy','Proyectos en cartera'],['aprob','Capacidades aprobadas']].map(([id,l]) => `<button class="tab ${capMode===id?'on':''}" data-m="${id}">${l}</button>`).join('') : '');
  $('#capTabs').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { capKind = b.dataset.k; render(); });
  $('#capTabs').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { capMode = b.dataset.m; render(); });
  if (capKind === 'air') renderAir(); else if (capKind === 'aut') renderAut(); else if (capMode === 'aprob') renderAprob(); else renderCartera();
}
function projRows(list){
  return list.map(p => { const [s,c] = stage(p), v = progress(p), late = sema(p) === 'r';
    return `<tr class="click" data-p="${esc(p.id)}"><td>${dot(p)} <b>${esc(p.desc)}</b>${p.estadoTexto ? `<div class="log">${esc(p.estadoTexto)}</div>` : ''}</td><td>${esc(p.modeloAeronave || (p.pns||[])[0] || '—')}</td>
      <td ${late ? 'style="color:var(--bad)"' : ''}>${esc(fmt(p.fechaEstimada) || '—')}</td><td>${authBadges(p.autoridad)}</td><td><span class="b ${c}">${esc(s)}</span></td><td style="min-width:150px">${bar2(v, expected(p))}</td></tr>`; }).join('');
}
function renderAir(){
  const ents = S.entries.filter(e => e.auth === 'DGAC' && (e.list === 'Aeronave' || e.list === 'Motor'));
  const card = e => `<div class="acard" data-x="X${esc(e.id)}"><div class="ah"><b>${esc(e.modeloAeronave || e.modeloMotor || e.desc)}</b>${e.dual ? '<span class="b b-DUAL">DUAL</span><span class="b b-FAA">FAA</span>' : ''}<span class="b b-DGAC">DGAC</span></div>
    <small>${e.list === 'Aeronave' ? 'Motores: ' + esc(e.motores || '—') : 'Motor'}</small><div class="ax">${esc((e.verb?.texto || e.lim || '').split('\n').slice(0,2).join(' '))}…</div></div>`;
  const ps = projects().filter(p => p.tipo === 'Aeronave' || p.tipo === 'Motor / taller');
  $('#capBody').innerHTML = `<h2 class="sec">Aeronaves aprobadas</h2><div class="agrid">${ents.filter(e => e.list === 'Aeronave').map(card).join('')}</div>
    <h2 class="sec">Motores aprobados</h2><div class="agrid">${ents.filter(e => e.list === 'Motor').map(card).join('')}</div>
    <h2 class="sec">Proyectos de aeronave y motor</h2>
    <div class="wrap"><table><thead><tr><th>Proyecto · situación actual</th><th>Modelo</th><th>Término estimado</th><th>Autoridad</th><th>Etapa</th><th>Avance</th></tr></thead><tbody>${projRows(ps) || '<tr><td colspan="6" class="empty">Sin proyectos</td></tr>'}</tbody></table></div>
    <div class="note2">Haz clic en una aeronave o motor aprobado para ver el alcance literal de la DGAC. Los proyectos de aeronave requieren: carta de intención del cliente, comprobación de dimensiones hangar/aeronave, herramientas por tarea y roster del personal calificado.</div>`;
  $('#capBody').onclick = e => { const x = e.target.closest('[data-x]'); if (x) { openArticle(x.dataset.x); return; } const r = e.target.closest('tr[data-p]'); if (r) openProject(r.dataset.p); };
}
function renderCartera(){
  const ps = projects(), A = alerts(ps);
  const sub = [['proc','En proceso'],['aer','Aeronaves y motores'],['ext','Certificaciones extranjeras'],['hist','Aprobados']];
  const lists = {proc: ps.filter(p => !p.aprobacion && p.tipo === 'Componente'), aer: ps.filter(p => p.tipo === 'Aeronave' || p.tipo === 'Motor / taller'),
    ext: ps.filter(p => p.tipo === 'Certificación extranjera'), hist: ps.filter(p => p.aprobacion)};
  let list = lists[pTab];
  if (pTab === 'proc' && procFilter) list = list.filter(p => sema(p) === procFilter);
  const GB = {area:['Área solicitante', p => p.area || 'Sin área'], stage:['Etapa', p => stage(p)[0]], rating:['Rating', p => p.rating || 'Sin rating'], autoridad:['Autoridad', p => (p.autoridad||[]).join(' + ') || '—'], none:['Sin agrupar', () => '']};
  const groups = new Map();
  list.sort((a,b) => 'ryg'.indexOf(sema(a)) - 'ryg'.indexOf(sema(b)) || progress(a) - progress(b) || String(a.desc).localeCompare(String(b.desc))).forEach(p => { const k = GB[groupBy][1](p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  const row = p => { const [s,c] = stage(p), v = progress(p), ex = expected(p), late = sema(p) === 'r';
    return `<tr class="click" data-p="${esc(p.id)}"><td>${dot(p)} <b>${esc(p.desc)}</b></td>
      <td class="mono">${esc((p.pns||[])[0] || '—')}${(p.pns||[]).length > 1 ? ` <span style="color:var(--muted)">+${p.pns.length-1}</span>` : ''}</td><td>${esc(fmt(p.fechaSolicitud) || '—')}</td>
      <td ${late ? 'style="color:var(--bad)"' : ''}>${esc(fmt(p.fechaEstimada) || '—')}</td><td>${authBadges(p.autoridad)}</td><td><span class="b ${c}">${esc(s)}</span></td><td style="min-width:170px">${bar2(v, ex)}</td></tr>`; };
  const procList = lists.proc, cnt = k => procList.filter(p => sema(p) === k).length;
  const sc = (k) => `<button class="chip ${procFilter===k?'on':''}" data-al="${k}" style="--c:${SEMA[k][0]};--cb:var(--card)"><span class="dot" style="background:${SEMA[k][0]}"></span> <b>${cnt(k)}</b> ${SEMA[k][1].toLowerCase()}</button>`;
  $('#capBody').innerHTML = `
    ${pTab === 'proc' ? `<div class="toolbar">${sc('r')}${sc('y')}${sc('g')}</div>` : ''}
    <div class="toolbar">${sub.map(([id,l]) => `<button class="tab ${pTab===id?'on':''}" data-pt="${id}" style="font-size:12.5px;padding:5px 12px">${l} (${lists[id].length})</button>`).join('')}
      <label style="margin-left:auto;font-size:12.5px;color:var(--muted)">Agrupar por <select id="gb">${Object.entries(GB).map(([k,[l]]) => `<option value="${k}" ${groupBy===k?'selected':''}>${l}</option>`).join('')}</select></label></div>
    ${fromSheet() ? '<div class="note2" style="margin:0 0 8px">Mostrando datos de la planilla Excel (aún no cargados en la base de la página).</div>' : ''}
    <div class="wrap"><table><thead><tr><th>Componente / proyecto</th><th>P/N</th><th>Ingreso</th><th>Término estimado</th><th>Autoridad</th><th>Etapa</th><th>Avance actual / esperado hoy</th></tr></thead><tbody>
    ${[...groups.entries()].map(([g, arr]) => (groupBy !== 'none' ? `<tr class="grp"><td colspan="7">${esc(g)} <span>${arr.length}</span> <span>avance promedio ${Math.round(arr.reduce((s,p) => s + progress(p), 0) / arr.length)}%</span></td></tr>` : '') + arr.map(row).join('')).join('')
      || '<tr><td colspan="7" class="empty">Sin proyectos</td></tr>'}</tbody></table></div>
    <div class="note2"><span class="dot" style="background:var(--ok)"></span> en orden · <span class="dot" style="background:#d9a400"></span> sin avance evidenciado (0%, o sin cambios en la última semana) · <span class="dot" style="background:var(--bad)"></span> atrasado a la fecha prometida: conversar con el cliente y reprogramar la fecha estimada. La marca vertical en la barra es el avance esperado a hoy si el trabajo avanzara de forma pareja hasta la fecha estimada.</div>`;
  $('#capBody').querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { pTab = b.dataset.pt; procFilter = ''; renderCartera(); });
  $('#capBody').querySelectorAll('[data-al]').forEach(b => b.onclick = () => { procFilter = procFilter === b.dataset.al ? '' : b.dataset.al; renderCartera(); });
  $('#gb').onchange = e => { groupBy = e.target.value; renderCartera(); };
  $('#capBody').onclick = e => { const el = e.target.closest('tr[data-p]'); if (el) openProject(el.dataset.p); };
}

// ===================== 4. CARGA DE EVIDENCIAS (en construcción)
const KITTEN = `<svg viewBox="0 0 320 260" width="300" role="img" aria-label="Gatito mecánico trabajando">
  <ellipse cx="160" cy="236" rx="110" ry="10" fill="var(--na-bg)"/>
  <g transform="translate(236 70)"><circle r="30" fill="none" stroke="var(--na)" stroke-width="10" stroke-dasharray="11 7"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite"/></circle><circle r="12" fill="var(--na)"/></g>
  <g transform="translate(268 128)"><circle r="17" fill="none" stroke="var(--muted)" stroke-width="7" stroke-dasharray="8 5"><animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="6s" repeatCount="indefinite"/></circle><circle r="6" fill="var(--muted)"/></g>
  <path d="M96 232 Q86 170 128 150 L192 150 Q230 170 220 232 Z" fill="#f2a65a"/>
  <path d="M112 232 Q110 186 140 176 L176 176 Q206 186 204 232 Z" fill="#3b6ea5"/><rect x="146" y="186" width="24" height="18" rx="3" fill="#2c5585"/>
  <path d="M120 176 L120 214 M196 176 L196 214" stroke="#2c5585" stroke-width="6"/>
  <path d="M218 214 Q262 210 252 176 Q248 166 240 172" fill="none" stroke="#f2a65a" stroke-width="12" stroke-linecap="round"/>
  <circle cx="160" cy="112" r="56" fill="#f6b26b"/>
  <path d="M112 88 L104 40 L140 70 Z M208 88 L216 40 L180 70 Z" fill="#f6b26b"/><path d="M114 80 L110 52 L132 70 Z M206 80 L210 52 L188 70 Z" fill="#f7c9d4"/>
  <path d="M104 78 Q160 22 216 78 L220 88 L100 88 Z" fill="#f4c430"/><rect x="96" y="84" width="128" height="10" rx="5" fill="#d9a400"/><rect x="152" y="46" width="16" height="30" rx="4" fill="#d9a400"/>
  <ellipse cx="138" cy="114" rx="9" ry="11" fill="#2b2b2b"/><ellipse cx="182" cy="114" rx="9" ry="11" fill="#2b2b2b"/><circle cx="141" cy="110" r="3" fill="#fff"/><circle cx="185" cy="110" r="3" fill="#fff"/>
  <path d="M154 130 L166 130 L160 137 Z" fill="#e57f9b"/><path d="M160 137 Q152 146 144 141 M160 137 Q168 146 176 141" fill="none" stroke="#7a4a2a" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M112 128 L84 124 M112 136 L86 140 M208 128 L236 124 M208 136 L234 140" stroke="#7a4a2a" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="124" cy="132" rx="8" ry="5" fill="#f7a8b8" opacity=".6"/><ellipse cx="196" cy="132" rx="8" ry="5" fill="#f7a8b8" opacity=".6"/>
  <g transform="rotate(-30 92 190)"><rect x="86" y="160" width="12" height="56" rx="5" fill="#9aa5b4"/><path d="M80 158 a14 14 0 1 1 24 0 l-6 -2 v-10 h-12 v10 z" fill="#9aa5b4"/>
    <animateTransform attributeName="transform" type="rotate" values="-30 92 190;-12 92 190;-30 92 190" dur="1.4s" repeatCount="indefinite"/></g>
  <circle cx="100" cy="196" r="14" fill="#f6b26b"/>
</svg>`;
// ===================== 4. CARGA DE EVIDENCIAS
const ROSTER_T = ['Operadores','Técnicos','Estructuristas','Aviónicos','Inspectores','Certificadores / RTS','Ingenieros','Otro'];
const WHAT = {
  infra:'Foto de la infraestructura especial instalada.',
  doc:'Extracto del manual: portada e índice (PDF).',
  tools:'Foto del equipo con P/N visible. Si es calibrable, el sticker/label de calibración debe verse e indicar el due date. Si es alternativo, el formulario de intercambiabilidad. Si aún no llega, la OC autorizada con fecha de arribo.',
  train:'Registro del curso, certificado o roster firmado.',
  serv:'Respaldo del proveedor (certificado, OT, informe del proceso).',
};
// training items proposed from this page (stored apart, the admin incorporates them)
const collabTrain = pid => [...store.train.values()].filter(t => t.projId === pid).sort((a,b) => (a.at||'').localeCompare(b.at||''))
  .map(t => ({id:'c:' + t.id, docId:t.id, kind:t.kind, title:t.title, roles:t.roles || [], curso:t.curso, rosterTipo:t.rosterTipo, status:'pendiente', collab:true, by:t.by, at:t.at}));
let cProj = null, cOnlyPend = true;
function evMini(p, it, canDel){
  return evidOf(p.id, it.id).map(ev => { const r = revOf(ev.id), img = (ev.contentType||'').startsWith('image/'), rc = store.rev.get(ev.id)?.comment;
    return `<div class="ev">${img ? `<img src="${esc(assetUrl(ev.assetId))}" alt="" data-view="${esc(ev.id)}" style="cursor:zoom-in">` : '📄'}<span class="b s-info">${esc(EVT[ev.tipo||'otro'] || ev.tipo)}</span>
      <a href="#" class="lnk" data-view="${esc(ev.id)}" title="Ver documento">${esc(ev.filename)}</a><span class="b ${r==='aprobada'?'s-ok':r==='rechazada'?'s-bad':'s-warn'}">${r === 'pendiente' ? 'por revisar' : r}</span>
      ${canDel && r !== 'aprobada' && (isAdmin() || (ev.by && ev.by === RT.myId)) ? `<button class="btn sm" data-cdel="${esc(ev.id)}" title="Eliminar">🗑</button>` : ''}
      ${r === 'rechazada' && rc ? `<div class="log" style="width:100%;color:var(--bad)">Motivo del rechazo: ${esc(rc)}</div>` : ''}</div>`; }).join('');
}
function itemPending(p, S2, it){
  if (DONE.has(it.status) && !warnings(p, S2, it).length) return false;
  const ev = evidOf(p.id, it.id);
  if (ev.some(e => revOf(e.id) === 'pendiente') && !ev.some(e => revOf(e.id) === 'rechazada')) return 'review';
  return true;
}
function renderCarga(){
  const el = $('#v-carga');
  if (loaded.proj !== true || !store.proj.size){ el.innerHTML = '<div class="box empty">Aún no hay proyectos cargados.</div>'; return; }
  const ps = projDb().map(upgrade).filter(p => p.tipo !== 'Certificación extranjera' || (p.sections||[]).some(s => s.items.length));
  const pendCount = p => (p.sections||[]).filter(s => SEC_DEF[s.key]?.ev.length && (!(s.key === 'infra' || s.key === 'serv') || s.requiere === true))
    .reduce((n, s) => n + s.items.filter(it => itemPending(p, s, it) === true).length, 0);
  if (!cProj || !store.proj.has(cProj)) cProj = (ps.find(p => !p.aprobacion && pendCount(p)) || ps[0])?.id;
  const p = upgrade(store.proj.get(cProj));
  const up = canUpload();
  const sections = (p.sections || []).filter(s => SEC_DEF[s.key]?.ev.length && (!(s.key === 'infra' || s.key === 'serv') || s.requiere === true));
  const secBlock = S2 => {
    const items = S2.key === 'train' ? [...S2.items, ...collabTrain(p.id)] : S2.items;
    const shown = items.filter(it => !cOnlyPend || it.collab || itemPending(p, S2, it));
    const rows = shown.map(it => { const w = it.collab ? [] : warnings(p, S2, it).filter(x => !/^(Indicar|Sin revisión|Marcado cumplido|Sin proveedor|Sin P\/N)/.test(x)), st = itemPending(p, S2, it);
      return `<div class="citem">
        <div class="ctop"><span class="dot" style="background:${it.collab ? 'var(--accent2)' : !st ? 'var(--ok)' : st === 'review' ? '#d9a400' : 'var(--bad)'}"></span>
          <b>${esc(itemLabel(S2, it))}</b>${it.collab ? ' <span class="b s-info">agregado aquí · por incorporar</span>' : ` <span class="b ${ST[it.status]?.[1]||'s-na'}">${esc(ST[it.status]?.[0]||it.status)}</span>`}</div>
        ${S2.key === 'tools' ? `<div class="log">Logística: ${esc(it.logistica || 'Pendiente')}${it.calibrable ? ' · calibrable: la foto debe mostrar el sticker' : ''}${it.pnAlt ? ' · alternativo: subir formulario de intercambiabilidad' : ''}</div>` : ''}
        ${w.length ? `<div class="warn">${w.map(x => '• ' + esc(x)).join('<br>')}</div>` : ''}
        ${evMini(p, it, true)}
        ${up ? `<button class="btn sm pri" data-cup="${esc(S2.key)}|${esc(it.id)}">+ Subir evidencia</button>` : ''}
      </div>`; }).join('');
    return `<div class="box"><h3>${esc(SEC_DEF[S2.key].name)} <span class="b s-na">${items.filter(it => !it.collab && !itemPending(p, S2, it)).length}/${items.length} listos</span>
        ${S2.key === 'train' && up ? `<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-addp="persona">+ Persona</button><button class="btn sm" data-addp="roster">+ Roster</button></span>` : ''}</h3>
      <div class="hint">Qué subir: ${esc(WHAT[S2.key] || '')}</div>
      ${rows || `<div class="empty" style="padding:4px 0">${cOnlyPend ? 'Sin pendientes en esta sección. ✓' : 'Sin ítems.'}</div>`}</div>`;
  };
  el.innerHTML = `
    <div class="box cbanner"><div class="kit">${KITTEN}</div><div><h2 style="margin:0 0 4px">Carga de evidencias</h2>
      <div style="font-size:13px;color:var(--muted)">Elige un proyecto, revisa lo que falta y sube la evidencia en el ítem que corresponde. Aquí no se crean ni se modifican requisitos: eso lo hace el administrador en Expedientes. En <b>Entrenamiento</b> sí puedes agregar personas y rosters.</div>
      ${!up ? '<div class="msg" style="margin:8px 0 0">Tu acceso es de solo lectura: no puedes subir evidencias en esta página.</div>' : ''}</div></div>
    <div class="cgrid">
      <aside class="side"><input id="cQ" type="search" placeholder="Buscar proyecto…"><div class="plist" id="cList">${ps.map(x => { const n = pendCount(x);
        return `<div class="pi ${x.id===cProj?'on':''}" data-cp="${esc(x.id)}"><b>${esc(x.desc)}</b><br><small>${esc(x.id)} · ${x.aprobacion ? 'aprobado (actualización)' : esc(stage(x)[0])}${n ? ` · <b>${n} pendiente${n===1?'':'s'}</b>` : ' · al día'}</small></div>`; }).join('')}</div></aside>
      <section>
        <div class="box"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div><h2 style="margin:0;font-size:18px">${esc(p.desc)}</h2>
          <div style="color:var(--muted);font-size:12.5px">${esc(p.id)} · ${esc((p.pns||[]).slice(0,3).join(', '))}${(p.pns||[]).length > 3 ? '…' : ''} · ${esc((p.cmm||[]).join(', '))}</div></div>
          <label style="margin-left:auto;font-size:13px"><input type="checkbox" id="cOnly" ${cOnlyPend?'checked':''}> Mostrar solo pendientes</label></div>
          <div class="note2" style="margin:6px 0 0"><span class="dot" style="background:var(--bad)"></span> falta evidencia o tiene observaciones · <span class="dot" style="background:#d9a400"></span> evidencia subida, por revisar · <span class="dot" style="background:var(--ok)"></span> listo · <span class="dot" style="background:var(--accent2)"></span> agregado aquí, por incorporar</div></div>
        ${sections.map(secBlock).join('') || '<div class="box empty">Este proyecto no tiene ítems que requieran evidencia todavía.</div>'}
      </section></div>`;
  el.querySelectorAll('[data-cp]').forEach(d => d.onclick = () => { cProj = d.dataset.cp; renderCarga(); });
  $('#cQ').oninput = () => { const q = fold($('#cQ').value); el.querySelectorAll('#cList .pi').forEach(d => d.hidden = !!q && !fold(d.textContent).includes(q)); };
  $('#cOnly').onchange = e => { cOnlyPend = e.target.checked; renderCarga(); };
  el.querySelectorAll('[data-cup]').forEach(b => b.onclick = () => { const [k, iid] = b.dataset.cup.split('|'); const S2 = sec(p, k);
    const it = (k === 'train' ? [...S2.items, ...collabTrain(p.id)] : S2.items).find(x => x.id === iid); if (it) evidForm(b, p, S2, it); });
  el.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => armed(b, async () => { const ev = store.evid.get(b.dataset.cdel); if (!ev) return;
    try { await writeDoc('evid/' + ev.id, null, 'del'); try { await RT.assets.delete(ev.assetId); } catch(e){} } catch(e){ flash('No se pudo eliminar.', true); } }));
  el.querySelectorAll('[data-addp]').forEach(b => b.onclick = () => personForm(b, p, b.dataset.addp));
}
function personForm(btn, p, kind){
  document.querySelectorAll('.pform').forEach(x => x.remove());
  const curso0 = p.tipo === 'Aeronave' ? 'Curso Nv3 de aeronave' : 'Curso básico del componente según manual';
  const w = document.createElement('div'); w.className = 'box pform';
  w.innerHTML = `<h3>${kind === 'roster' ? 'Agregar roster' : 'Agregar persona'}</h3><div class="form">
    ${kind === 'roster' ? `<label class="fld">Tipo de roster<select id="pfR">${ROSTER_T.map(r => `<option>${r}</option>`).join('')}</select></label>`
      : `<label class="fld">Nombre de la persona<input id="pfN"></label><div class="fld">Funciones (una o varias)<div class="roles">${ROLES.map(r => `<label><input type="checkbox" value="${r}"> ${r}</label>`).join('')}</div></div>`}
    <label class="fld">Curso<input id="pfC" value="${esc(curso0)}"></label></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn pri" id="pfS">Agregar</button><button class="btn" id="pfX">Cancelar</button></div>`;
  btn.closest('.box').after(w); w.scrollIntoView({behavior:'smooth', block:'center'});
  $('#pfX').onclick = () => { w.remove(); render(); };
  $('#pfS').onclick = async () => {
    const doc = kind === 'roster' ? {kind:'roster', rosterTipo:$('#pfR').value, title:'Roster de ' + $('#pfR').value.toLowerCase(), roles:[]}
      : {kind:'persona', title:($('#pfN').value || '').trim(), roles:[...w.querySelectorAll('.roles input:checked')].map(x => x.value)};
    if (!doc.title){ flash('Falta el nombre.', true); return; }
    if (kind === 'persona' && !doc.roles.length){ flash('Indica al menos una función.', true); return; }
    try { await RT.db.collection('train').add({...doc, curso:$('#pfC').value.trim(), projId:p.id, by:RT.myId || null, at:new Date().toISOString()}); w.remove(); render(); flash('Agregado. Ahora sube su evidencia.'); }
    catch(e){ flash('No se pudo agregar (' + (e.code || e.message) + ').', true); }
  };
}
// admin side (Expedientes): incorporate items proposed from the upload page
function collabBlock(p){
  const cs = collabTrain(p.id); if (!cs.length) return '';
  return `<div class="collab"><b>Agregados desde Carga de evidencias (${cs.length})</b>${cs.map(c => `<div class="ev"><span>${esc(itemLabel({key:'train'}, c))}</span>
    <span class="b s-info">${evidOf(p.id, c.id).length} evidencia(s)</span>${isAdmin() ? `<button class="btn sm" data-inc="${esc(c.docId)}">Incorporar</button><button class="btn sm" data-dis="${esc(c.docId)}">Descartar</button>` : ''}</div>`).join('')}</div>`;
}
async function incorporate(p, docId){
  const t = store.train.get(docId); if (!t) return;
  const q = JSON.parse(JSON.stringify(p)); const S2 = q.sections.find(s => s.key === 'train');
  S2.items.push({id:'c:' + docId, kind:t.kind, title:t.title, roles:t.roles || [], curso:t.curso, rosterTipo:t.rosterTipo, status:'en_curso', log:[{date:today(), text:'Agregado desde Carga de evidencias'}]});
  await saveProj(q); await writeDoc('train/' + docId, null, 'del').catch(() => {}); flash('Incorporado al expediente.');
}

// ===================== 5. INFORMES (bisemanal)
function snapNow(){
  const data = {};
  for (const p of projDb()){
    const items = (p.sections||[]).flatMap(s => s.items);
    data[p.id] = {pct: progress(p), stage: stage(p)[0], desc: p.desc, done: items.filter(i => DONE.has(i.status)).length, total: items.length, aprob: !!p.aprobacion, sol: !!p.solicitud};
  }
  return data;
}
async function ensureSnapshot(){
  if (!isAdmin() || loaded.proj !== true || !store.proj.size || !loaded.snap) return;
  if (store.snap.has(today())) return;
  if (ensureSnapshot.busy) return; ensureSnapshot.busy = true;
  try { await writeDoc('snap/' + today(), {date: today(), data: snapNow(), at: new Date().toISOString()}); } catch(e){}
  ensureSnapshot.busy = false;
}
let repDays = 7, docProj = null;
function docsBox(){
  const ps = projDb(); if (!docProj || !store.proj.has(docProj)) docProj = ps[0]?.id || null;
  const p = docProj ? upgrade(store.proj.get(docProj)) : null;
  const ev = p ? evidOf(p.id) : [], nA = ev.filter(e => revOf(e.id) === 'aprobada').length, nP = ev.filter(e => revOf(e.id) === 'pendiente').length;
  const W = p ? projWarnings(p) : [];
  return `<div class="box"><h3>Documentos para la autoridad</h3>
    <div class="toolbar"><label style="font-size:12.5px;color:var(--muted)">Proyecto <select id="dpSel" style="min-width:320px">${ps.map(x => `<option value="${esc(x.id)}" ${x.id===docProj?'selected':''}>${esc(x.id)} · ${esc(x.desc)}${x.aprobacion ? ' (aprobado)' : ''}</option>`).join('')}</select></label></div>
    ${p ? `<div class="note2" style="margin:0 0 8px">${esc(stage(p)[0])} · avance ${progress(p)}% · evidencias ${ev.length} subidas, ${nA} aprobadas, ${nP} por revisar${W.length ? ` · <span style="color:var(--bad)">${W.length} observaciones abiertas en la autoevaluación</span>` : ''}. Los documentos incluyen solo evidencias aprobadas como anexos. <b>Formato provisorio.</b></div>
      ${isAdmin() ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" data-doc="FAA">PDF FAA · resumen de autoevaluación (EN)</button><button class="btn pri" data-doc="DGAC">PDF DGAC · Autoevaluación (ES)</button><button class="btn" id="stPdf">Informe de estado del proyecto (ES)</button></div>${faaDocsHtml(p)}`
        : '<div class="empty" style="padding:0">La emisión de documentos está disponible para el administrador.</div>'}` : '<div class="empty">Sin proyectos.</div>'}</div>`;
}
function bindDocs(){
  if ($('#dpSel')) $('#dpSel').onchange = e => { docProj = e.target.value; renderInformes(); };
  const p = docProj ? upgrade(store.proj.get(docProj)) : null; if (!p) return;
  document.querySelectorAll('#v-informes [data-doc]').forEach(b => b.onclick = () => genDoc(p, b.dataset.doc, b));
  if ($('#stPdf')) $('#stPdf').onclick = () => genSimple('st', p, $('#stPdf'));
  document.querySelectorAll('#v-informes [data-faa]').forEach(b => b.onclick = () => genFaa(p, b.dataset.faa, b, b.dataset.cmm || ''));
}
function biweekly(){
  const snaps = [...store.snap.values()].filter(s => s.date !== today()).sort((a,b) => a.date.localeCompare(b.date));
  const cut = new Date(Date.parse(today()) - repDays*86400000).toISOString().slice(0,10);
  let base = [...snaps].reverse().find(s => s.date <= cut) || snaps[0] || null;
  const now = snapNow(), from = base ? base.date : null;
  const rows = Object.entries(now).map(([id, n]) => { const b = base?.data?.[id]; return {id, desc:n.desc, before: b ? b.pct : null, now: n.pct, delta: b ? n.pct - b.pct : null, stB: b?.stage, stN: n.stage, doneB: b?.done, doneN: n.done, total: n.total, isNew: !b}; });
  const revs = [...store.rev.values()].filter(r => r.status === 'aprobada' && from && (r.at||'').slice(0,10) > from).length;
  const evs = [...store.evid.values()].filter(e => from && (e.at||'').slice(0,10) > from).length;
  return {base, from, rows, revs, evs, short: base && base.date > cut};
}
function renderInformes(){
  const el = $('#v-informes');
  if (loaded.proj !== true || !store.proj.size){ el.innerHTML = `<div class="box empty">Los informes usan la base de la página. ${isAdmin() ? 'Carga primero los proyectos (pestaña Inicio o Capacidades).' : 'Aún no hay proyectos cargados.'}</div>`; return; }
  const B = biweekly();
  const moved = B.rows.filter(r => r.delta > 0).sort((a,b) => b.delta - a.delta);
  const avgB = B.base ? Math.round(B.rows.filter(r => r.before != null).reduce((s,r) => s + r.before, 0) / Math.max(1, B.rows.filter(r => r.before != null).length)) : null;
  const avgN = Math.round(B.rows.reduce((s,r) => s + r.now, 0) / Math.max(1, B.rows.length));
  const newAppr = B.rows.filter(r => r.stN === 'Aprobado' && r.stB && r.stB !== 'Aprobado');
  const per = repDays === 7 ? 'semanal' : 'mensual';
  el.innerHTML = docsBox() + `<div class="box"><div class="toolbar" style="margin-bottom:6px">${[[7,'Semanal (7 días)'],[30,'Mensual (30 días) · alta gerencia']].map(([d,l]) => `<button class="tab ${repDays===d?'on':''}" data-rd="${d}">${l}</button>`).join('')}</div>
    <h3>Informe ${per} de avance · Capacidades y certificaciones</h3>
    ${B.base ? `<div class="note2" style="margin:0 0 10px">Período: <b>${esc(fmt(B.from))}</b> → <b>${esc(fmt(today()))}</b>${B.short ? ' (aún no hay historial suficiente para el período completo; se compara contra el registro más antiguo disponible)' : ''}. El historial se registra automáticamente una vez al día cuando el administrador abre la página.</div>`
      : '<div class="note2" style="margin:0 0 10px">Todavía no hay un registro anterior para comparar. El primero se guarda hoy; desde mañana el informe mostrará diferencias.</div>'}
    <div class="kpis">
      <div class="kpi" style="cursor:default"><b>${avgB != null ? avgB + '% → ' : ''}${avgN}%</b><span>avance promedio de la cartera</span></div>
      <div class="kpi" style="cursor:default"><b>${moved.length}</b><span>proyectos con avance en el período</span></div>
      <div class="kpi" style="cursor:default"><b>${newAppr.length}</b><span>aprobaciones de autoridad en el período</span></div>
      <div class="kpi" style="cursor:default"><b>${B.evs} · ${B.revs}</b><span>evidencias subidas · aprobadas</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${isAdmin() ? `<button class="btn pri" id="bwPdf">Generar PDF del informe ${per}</button>` : ''}</div></div>
    <div class="box"><h3>Avance por proyecto</h3><div class="wrap" style="border:none"><table><thead><tr><th>Proyecto</th><th>Antes</th><th>Hoy</th><th>Variación</th><th>Etapa</th><th>Ítems cumplidos</th></tr></thead><tbody>
    ${B.rows.sort((a,b) => (b.delta ?? -1) - (a.delta ?? -1) || b.now - a.now).map(r => `<tr class="click" data-p="${esc(r.id)}"><td><b>${esc(r.desc)}</b>${r.isNew && B.base ? ' <span class="b s-info">NUEVO</span>' : ''}</td>
      <td>${r.before != null ? r.before + '%' : '—'}</td><td>${bar(r.now)}</td><td>${r.delta == null ? '—' : r.delta > 0 ? `<b style="color:var(--ok)">+${r.delta}</b>` : r.delta < 0 ? `<b style="color:var(--bad)">${r.delta}</b>` : '<span style="color:var(--muted)">0</span>'}</td>
      <td>${r.stB && r.stB !== r.stN ? `<span style="color:var(--muted)">${esc(r.stB)} →</span> ` : ''}${esc(r.stN)}</td><td>${r.total ? `${r.doneB != null && r.doneB !== r.doneN ? r.doneB + ' → ' : ''}${r.doneN}/${r.total}` : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  el.onclick = e => { const r = e.target.closest('[data-rd]'); if (r){ repDays = +r.dataset.rd; renderInformes(); return; } const t = e.target.closest('tr[data-p]'); if (t) openProject(t.dataset.p); };
  if ($('#bwPdf')) $('#bwPdf').onclick = () => genSimple('bw', null, $('#bwPdf'));
  bindDocs();
}

// ===================== simple PDF reports (bi-weekly and project status, Spanish)
async function genSimple(kind, p, btn){
  btn.disabled = true; const t0 = btn.textContent; btn.textContent = 'Generando…';
  try {
    const bytes = kind === 'bw' ? await pdfBiweekly() : await pdfStatus(p);
    const name = kind === 'bw' ? `Informe_${repDays === 7 ? 'semanal' : 'mensual'}_capacidades_${today()}.pdf` : `Informe_estado_${(p.desc||p.id).replace(/[^\w]+/g,'_')}_${today()}.pdf`;
    if (RT.dl) { await RT.dl.save({filename:name, data:new Blob([bytes], {type:'application/pdf'})}); flash('Documento generado: ' + name); }
    else if (!window.claude) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = name; a.click(); flash('Documento generado: ' + name); }
    else flash('La descarga no está disponible en esta vista.', true);
  } catch(e){ console.error(e); flash('No se pudo generar: ' + (e.message || e), true); }
  btn.disabled = false; btn.textContent = t0;
}
async function pdfKit(title, sub){
  const {PDFDocument, StandardFonts, rgb} = PDFLib;
  const doc = await PDFDocument.create(); doc.setTitle(pdfSafe(title)); doc.setCreator('Portal de Capacidades (piloto)');
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold), FI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const A4 = [595.28, 841.89], M = 42, CW = A4[0] - 2*M, NAVY = rgb(0.09,0.25,0.4), INK = rgb(0.1,0.13,0.17), MUTED = rgb(0.37,0.42,0.48), LINE = rgb(0.8,0.83,0.86);
  const K = {doc, F, FB, FI, rgb, M, CW, NAVY, MUTED, page:null, y:0};
  K.newPage = () => { K.page = doc.addPage(A4); K.y = A4[1] - M; };
  K.text = (s, x, yy, font=F, size=9, color=INK) => K.page.drawText(pdfSafe(s), {x, y:yy, font, size, color});
  K.wrap = (s, font, size, w) => { const out = []; for (const para of pdfSafe(s).split('\n')){ let cur = ''; for (const wd of para.split(/\s+/)){ const t = cur ? cur + ' ' + wd : wd;
      if (font.widthOfTextAtSize(t, size) <= w) cur = t; else { if (cur) out.push(cur); cur = wd; } } out.push(cur); } return out; };
  K.ensure = h => { if (K.y - h < M + 20){ K.newPage(); return true; } return false; };
  K.heading = s => { K.ensure(40); K.y -= 8; K.page.drawRectangle({x:M, y:K.y-15, width:CW, height:18, color:NAVY}); K.text(s.toUpperCase(), M+6, K.y-10, FB, 9.5, rgb(1,1,1)); K.y -= 22; };
  K.para = (s, font=F, size=9.5, color=INK) => { K.wrap(s, font, size, CW).forEach(l => { K.ensure(13); K.text(l, M, K.y-10, font, size, color); K.y -= 12.5; }); K.y -= 4; };
  K.table = (cols, rows) => { const pad = 3.5, sz = 8.5, lh = 10.5;
    const head = () => { let x = M; cols.forEach(c => { K.page.drawRectangle({x, y:K.y-16, width:c.w, height:16, color:rgb(0.91,0.94,0.97), borderColor:LINE, borderWidth:0.5}); K.text(c.h, x+pad, K.y-11, FB, 8, NAVY); x += c.w; }); K.y -= 16; };
    head();
    for (const r of rows){ const ls = r.map((c,k) => K.wrap(c.t ?? '', c.b ? FB : F, sz, cols[k].w - 2*pad)); const h = Math.max(...ls.map(l => l.length)) * lh + 2*pad - 1;
      if (K.ensure(h)) head(); let x = M;
      r.forEach((c,k) => { K.page.drawRectangle({x, y:K.y-h, width:cols[k].w, height:h, color:c.fill || rgb(1,1,1), borderColor:LINE, borderWidth:0.5}); ls[k].forEach((l,j) => K.text(l, x+pad, K.y-pad-7.5-j*lh, c.b?FB:F, sz, c.color || INK)); x += cols[k].w; });
      K.y -= h; } K.y -= 6; };
  await pdfLogo(doc);
  K.cover = () => { K.newPage(); K.page.drawRectangle({x:0, y:A4[1]-74, width:A4[0], height:74, color:NAVY}); { const {img, f} = _lg.get(doc), w = 118, h = w*img.height/img.width, x = A4[0]-36-w-8, yy = A4[1]-12-h-8; K.page.drawRectangle({x, y:yy, width:w+16, height:h+12, color:rgb(1,1,1)}); K.page.drawImage(img, {x:x+8, y:yy+6, width:w, height:h}); const s = pdfSafe(BRAND_LINE); K.page.drawText(s, {x:x+16+w-f.widthOfTextAtSize(s,6.5), y:yy-9, size:6.5, font:f, color:rgb(0.88,0.92,0.97)}); }
    K.text(title, M, A4[1]-36, FB, 14, rgb(1,1,1)); K.text(sub, M, A4[1]-54, F, 8.5, rgb(0.85,0.9,0.96)); K.y = A4[1] - 92; };
  K.finish = async () => { const pages = doc.getPages(), n = pages.length;
    pages.forEach((pg, k) => { const s = pdfSafe(`Gerencia de Calidad · Capacidades · Página ${k+1} de ${n}`); pg.drawText(s, {x:A4[0]-10-F.widthOfTextAtSize(s,7), y:8, size:7, font:F, color:MUTED}); });
    return await doc.save(); };
  return K;
}
async function pdfBiweekly(){
  const B = biweekly();
  const K = await pdfKit(`INFORME ${repDays === 7 ? 'SEMANAL' : 'MENSUAL'} · CAPACIDADES Y CERTIFICACIONES`, `APAS Chile · Gerencia de Calidad · Período ${B.from ? fmt(B.from) : '—'} a ${fmt(today())}`);
  K.cover();
  const G = K.rgb(0.78,0.94,0.81), R = K.rgb(1,0.85,0.85);
  const rows = B.rows.sort((a,b) => (b.delta ?? -1) - (a.delta ?? -1) || b.now - a.now);
  const avgN = Math.round(rows.reduce((s,r) => s + r.now, 0) / Math.max(1, rows.length));
  const withB = rows.filter(r => r.before != null), avgB = withB.length ? Math.round(withB.reduce((s,r) => s + r.before, 0) / withB.length) : null;
  K.heading('1. Resumen del período');
  K.table([{h:'Indicador', w:300}, {h:'Valor', w:K.CW-300}], [
    [{t:'Avance promedio de la cartera', b:true}, {t: (avgB != null ? `${avgB}% -> ` : '') + `${avgN}%`}],
    [{t:'Proyectos con avance', b:true}, {t:String(rows.filter(r => r.delta > 0).length)}],
    [{t:'Proyectos sin avance (0%)', b:true}, {t:String(rows.filter(r => r.now === 0).length)}],
    [{t:'Aprobaciones de autoridad en el período', b:true}, {t:String(rows.filter(r => r.stN === 'Aprobado' && r.stB && r.stB !== 'Aprobado').length)}],
    [{t:'Evidencias subidas / aprobadas', b:true}, {t:`${B.evs} / ${B.revs}`}],
    [{t:'Capacidades aprobadas vigentes', b:true}, {t:`FAA ${nFAA} P/N · DGAC ${nDGAC} P/N · dual ${nDual} P/N`}]]);
  if (B.short || !B.base) K.para(B.base ? `Nota: aún no existe historial para el período completo; la comparación se hace contra el registro del ${fmt(B.from)}.` : 'Nota: no existe registro anterior; este informe sirve como línea base.', K.FI, 8.5, K.MUTED);
  K.heading('2. Avance por proyecto');
  K.table([{h:'Proyecto', w:200}, {h:'Antes', w:50}, {h:'Hoy', w:50}, {h:'Var.', w:45}, {h:'Etapa', w:K.CW-405}, {h:'Ítems', w:60}],
    rows.map(r => [{t:r.desc, b:true}, {t: r.before != null ? r.before + '%' : '—'}, {t: r.now + '%'}, {t: r.delta == null ? '—' : (r.delta > 0 ? '+' : '') + r.delta, fill: r.delta > 0 ? G : r.now === 0 ? R : null},
      {t: (r.stB && r.stB !== r.stN ? r.stB + ' -> ' : '') + r.stN}, {t: r.total ? `${r.doneN}/${r.total}` : '—'}]));
  K.heading('3. Alertas para el próximo período');
  const ps = projDb(), A = alerts(ps);
  K.table([{h:'Alerta', w:200}, {h:'Proyectos', w:K.CW-200}], [
    [{t:'Sin avance (0%)', b:true}, {t: A.zero.map(p => p.desc).join(', ') || '—'}],
    [{t:'Fecha estimada vencida', b:true}, {t: A.late.map(p => `${p.desc} (${fmt(p.fechaEstimada)})`).join(', ') || '—'}],
    [{t:'Atrasados vs. avance esperado', b:true}, {t: A.behind.map(p => `${p.desc} (${progress(p)}% / ${expected(p)}%)`).join(', ') || '—'}],
    [{t:'Listos para solicitar a la autoridad', b:true}, {t: A.ready.map(p => p.desc).join(', ') || '—'}]]);
  return K.finish();
}
async function pdfStatus(p){
  const K = await pdfKit('INFORME DE ESTADO DE PROYECTO', `${p.tipo} · ${p.desc} · Emitido ${fmt(today())}`);
  K.cover();
  const ex = expected(p);
  K.heading('1. Datos del proyecto');
  K.table([{h:'Campo', w:170}, {h:'Dato', w:K.CW-170}], [['Descripción', p.desc], ['Tipo', p.tipo], ['P/N', (p.pns||[]).join(', ')], ['Manual', [...(p.cmm||[]), p.manualRev].filter(Boolean).join(', ')],
    ['Autoridad objetivo', (p.autoridad||[]).join(', ')], ['Área / solicitante', p.area], ['Fecha de ingreso', fmt(p.fechaSolicitud)], ['Término estimado', fmt(p.fechaEstimada)],
    ['Etapa', stage(p)[0]], ['Avance actual / esperado', `${progress(p)}%${ex != null ? ` / ${ex}%` : ''}`]].map(([k,v]) => [{t:k, b:true}, {t: v || '—'}]));
  K.heading('2. Estado por elemento');
  const rows = []; for (const s of p.sections||[]) for (const it of s.items){ const ev = evidOf(p.id, it.id);
    rows.push([{t:s.name, b:true}, {t: s.key ? itemLabel(s, it) : it.title}, {t:ST[it.status]?.[0] || it.status, fill: DONE.has(it.status) ? K.rgb(0.78,0.94,0.81) : null}, {t: ev.length ? `${ev.filter(e => revOf(e.id) === 'aprobada').length}/${ev.length} aprobadas` : '—'}]); }
  if (rows.length) K.table([{h:'Elemento', w:130}, {h:'Ítem', w:K.CW-330}, {h:'Estado', w:90}, {h:'Evidencias', w:110}], rows); else K.para('Sin ítems definidos.', K.FI, 9, K.MUTED);
  if (p.obs){ K.heading('3. Observaciones'); K.para(p.obs); }
  return K.finish();
}

const importBanner = () => restoreBanner();
// ===================== routing / render
const VIEWS = ['inicio','capacidades','expedientes','carga','informes'];
function render(){
  const h = location.hash.slice(1); const v = VIEWS.includes(h) ? h : 'inicio';
  let mod = PERS_V.includes(h) ? 'pers' : h === 'sistema' ? 'sys' : 'cap';
  if (SESSION.u && mod !== 'sys' && !SESSION.mods.includes(mod)){ const alt = SESSION.mods.includes('cap') ? '#inicio' : SESSION.mods.includes('pers') ? '#fichas' : '#sistema'; if (location.hash !== alt){ location.hash = alt; return; } }
  shell(mod); if (!SESSION.u) return;
  if (mod !== 'cap'){ VIEWS.forEach(x => $('#v-' + x).hidden = true); if (mod === 'sys') renderSys(); return; }
  VIEWS.forEach(x => $('#v-' + x).hidden = x !== v);
  document.querySelectorAll('nav.views a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  const ib = importBanner();
  if (v === 'inicio'){ renderInicio(); { const hr = $('#v-inicio .hero'); if (hr) hr.insertAdjacentHTML('afterend', autStrip()); } if (ib) $('#v-inicio').insertAdjacentHTML('afterbegin', ib); }
  else if (v === 'capacidades'){ renderCapacidades(); if (ib && capMode === 'proy') $('#capBody').insertAdjacentHTML('afterbegin', ib); }
  else if (v === 'carga'){ const ae = document.activeElement; const typing = ae && $('#v-carga').contains(ae) && ae.tagName === 'INPUT' && ['text','search','date',''].includes(ae.type); if (!typing && !$('#v-carga .pform') && !$('#v-carga .evform')) renderCarga(); }
  else if (v === 'informes') renderInformes();
  else { loadHerr(); renderExpList(); const ae = document.activeElement; const typing = ae && $('#eMain').contains(ae) && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ['text','search','date','number',''].includes(ae.type))); if (!typing && !$('#eMain .box #iT')) renderExp(); }
  if (curDrawer && $('#ov').classList.contains('open') && !$('#edBox')) { curDrawer[0] === 'a' ? openArticle(curDrawer[1]) : openProject(curDrawer[1]); }
}
const route = render;
window.addEventListener('hashchange', render);
$('#foot').textContent = `Fuentes: FAA Capability Lists APAY048E (Accessory Rev ${S.lists.Accessory.rev}, Airframe Rev ${S.lists.Airframe.rev}, Radio Rev ${S.lists.Radio.rev}, Emergency Equipment ${S.lists['Emergency Equipment'].rev}) · DGAC Lista de Capacidad CMA 655 Rev ${S.dgacList.rev} (${fmt(S.dgacList.date)}) · Seguimiento Trabajos Capacidades v2. · Ver. ${APP_VER} (local)`;
(async () => { if (window.claude) { try { const u = await window.claude.use('user'); RT.myId = u ? await u.id() : null; } catch(e){} } })();
initSession();
try { const op = localStorage.getItem('apas_open_proj'); if (op){ eCur = op; localStorage.removeItem('apas_open_proj'); } } catch(e){}
loadHerr(true);
render();
