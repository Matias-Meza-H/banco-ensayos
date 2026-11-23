// ================= INFORME PERSONAL =================
// Evidence items for one person, in report order
function evidenceItems(p){
  const it = [];
  it.push({key:'lic', sec:'Licencia', label:`Licencia ${p.tipoLic || ''}`.trim(), value:p.vencLic});
  for (const [k,v] of Object.entries(p.generales)) if (v !== 'N/A') it.push({key:'gen:'+k, sec:'Cursos generales', label:k, value:v});
  for (const [k,v] of Object.entries(p.oneTime)) if (v != null && v !== 'N/A') it.push({key:'ot:'+k, sec:'Cursos generales', label:k+' (one time)', value:v});
  for (const a of p.aeronaves) it.push({key:'ac:'+a.aeronave, sec:'Aeronaves', label:a.aeronave + (a.nivel && a.nivel!=='N/A' ? ' · '+a.nivel : ''), value:a.venc,
      extra: a.motores.filter(m=>m.valor && m.valor!=='N/A').map(m=>`${m.motor}: ${m.valor}`).join(', ')});
  for (const o of p.operadores) for (const c of o.cursos) if (c.valor !== 'N/A') it.push({key:`op:${o.operador}:${c.curso}`, sec:'Operadores', label:`${o.operador} · ${c.curso}`, value:c.valor});
  for (const n of p.nv4) it.push({key:`nv4:${n.esp}:${n.aeronave||''}`, sec:'Especialidades', label:`Nv4 ${n.esp||''} ${n.aeronave||''} ${n.motores?'('+n.motores+')':''}`.trim(), value:n.venc});
  for (const n of p.ndt) it.push({key:'ndt:'+n.metodo, sec:'Especialidades', label:`NDT ${n.metodo} ${n.nivel||''}`.trim(), value:n.cert, extra: n.prof ? `Proficiencia: ${isDate(n.prof)?fmt(n.prof):n.prof}` : ''});
  for (const c of p.cmm) it.push({key:'cmm:'+c.cmm, sec:'Especialidades', label:`${c.cmm} ${c.curso||''}`.trim(), value:c.vencOjt, extra: c.realizado ? `Realizado: ${isDate(c.realizado)?fmt(c.realizado):c.realizado}` : ''});
  it.push({key:'otro', sec:'Otros documentos', label:'Otros respaldos (referencias, OJT, evaluaciones)', value:undefined});
  return it;
}
const stText = v => v === undefined ? '' : isDate(v) ? LABEL[status(v)] : v == null ? 'Sin registro' : v === 'NO' ? 'No asistió' : String(v);

// ---- runtime capabilities (null when not available)
const RT = {db:null, assets:null, user:null, canEdit:null, ready:false};
const certs = new Map(); window.__certs = certs; // id -> record
let certErr = null;
(async () => {
  if (!window.claude) { RT.ready = true; return; }
  try { RT.user = await window.claude.use('user'); } catch(e) {}
  try { const d0 = await window.claude.use('db'); RT.db = d0 ? window.wrapDb(d0) : null; } catch(e) {}
  try { RT.assets = window.wrapAssets(await window.claude.use('assets')); } catch(e) {}
  try { RT.canEdit = RT.user ? await RT.user.canEdit() : null; } catch(e) {}
  RT.ready = true;
  if (RT.db){
    persSub();
    let timer = setTimeout(() => { certErr = 'No se pudieron cargar los certificados todavía; reintentando…'; renderR(); }, 10000);
    RT.db.collection('certs').onSnapshot(snap => {
      if (!snap.metadata.fromCache){ clearTimeout(timer); certErr = null; }
      certs.clear(); snap.docs.forEach(d => certs.set(d.id, {id:d.id, ...d.data()}));
      renderR(); renderRPeople();
    }, e => { clearTimeout(timer); certErr = 'No se pudieron cargar los certificados (' + (e && e.code || 'error') + ').'; renderR(); });
  }
  renderR();
})();
const editable = () => !!(RT.assets && RT.db && RT.canEdit !== false) && (!window.appCanUpload || window.appCanUpload());
const certsOf = rut => [...certs.values()].filter(c => c.rut === rut).sort((a,b) => (a.uploadedAt||'').localeCompare(b.uploadedAt||''));
const assetUrl = id => (window.__assetUrl ? window.__assetUrl(id) : '/_blob/' + id);

// ---- people list
let rCur = null;
function renderRPeople(){
  const q = $('#rQ').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const list = P.filter(p => !q || q.split(/\s+/).every(t => p.text.includes(t))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  $('#rPeople').innerHTML = list.map(p => { const n = certsOf(p.rut).length;
    return `<div class="rp ${rCur===p.i?'on':''}" data-i="${p.i}"><span>${esc(p.nombre||'(sin nombre)')}<br><small>${esc(p.rut)} · ${esc(p.esp)}</small></span>${n?`<small>${n} 📎</small>`:''}</div>`; }).join('')
    || '<div class="empty">Sin resultados</div>';
}
$('#rQ').addEventListener('input', renderRPeople);
$('#rPeople').addEventListener('click', e => { const d = e.target.closest('.rp'); if (d){ rCur = +d.dataset.i; renderRPeople(); renderR(); } });

function annexMap(p){ // key -> [{rec, n}]
  const map = new Map(); let n = 0;
  const all = certsOf(p.rut);
  for (const item of evidenceItems(p)) for (const c of all.filter(c => c.item === item.key)) { n++; if (!map.has(item.key)) map.set(item.key, []); map.get(item.key).push({rec:c, n}); }
  // certificates whose item no longer exists in the data
  for (const c of all) if (![...map.values()].flat().some(x => x.rec.id === c.id)) { n++; if (!map.has('otro')) map.set('otro', []); map.get('otro').push({rec:c, n}); }
  return map;
}
function renderR(){
  if (rCur == null) return;
  const p = P[rCur], items = evidenceItems(p), ax = annexMap(p), ed = editable();
  const nCert = certsOf(p.rut).length;
  const mode = !window.claude ? 'Vista local: la subida de certificados funciona solo dentro de Claude.'
    : !RT.ready ? 'Cargando permisos…'
    : ed ? 'Modo administrador: puedes adjuntar certificados (PDF o imagen, máx. 20 MB) a cada ítem.'
    : 'Solo lectura: solo los administradores (Editores de la página) pueden adjuntar certificados.';
  let lastSec = '';
  const rows = items.map(it => {
    const secRow = it.sec !== lastSec ? `<tr><td colspan="4" class="sec" style="padding-top:12px">${esc(it.sec)}</td></tr>` : ''; lastSec = it.sec;
    const cs = ax.get(it.key) || [];
    return secRow + `<tr><td>${esc(it.label)}${it.extra?`<div style="font-size:11.5px;color:var(--muted)">${esc(it.extra)}</div>`:''}</td>
      <td>${it.value === undefined ? '' : cell(it.value)}</td>
      <td>${cs.map(({rec,n}) => `<div class="cert"><span class="anx">Anexo ${n}</span><a href="#" data-viewc="${esc(rec.id)}" title="Ver ${esc(rec.filename)}">${esc(rec.filename)}</a>
        ${ed ? `<input data-ref="${esc(rec.id)}" value="${esc(rec.ref||'')}" placeholder="N° certificado / ref.">
        <button class="x" data-del="${esc(rec.id)}" title="Quitar">×</button>` : (rec.ref ? `<small>${esc(rec.ref)}</small>` : '')}</div>`).join('') || '<span style="color:var(--muted);font-size:12px">—</span>'}</td>
      <td>${ed ? `<button class="btn up" data-up="${esc(it.key)}">+ Adjuntar</button>` : ''}</td></tr>`;
  }).join('');
  const o = p.ojt || {};
  const ojtAta = Object.entries(o.ata || {});
  $('#rMain').innerHTML = `
    <div class="rcard"><div class="rhead">
      <div><h2>${esc(p.nombre)}</h2><div class="sub" style="color:var(--muted);font-size:12.5px">${esc(p.rut)} · ${esc(p.puesto||'')} · ${esc(p.area||'Sin área')} · ${esc(p.esp)}</div>
      <div class="sum" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${summaryChips(p.ds.map(d=>d[1]))}<span class="chip s-info">${nCert} certificado${nCert===1?'':'s'} adjunto${nCert===1?'':'s'}</span></div></div>
      <div class="act"><button class="btn" id="rFicha">Ver ficha</button><button class="btn primary" id="rPdf">Generar informe PDF</button></div>
    </div><div id="rMsg" class="msg" style="margin:10px 0 0" ${certErr?'':'hidden'}>${esc(certErr||'')}</div>
    <div class="note">${esc(mode)}</div></div>
    <div class="rcard"><h3>Evidencias por ítem</h3>
      <table class="rows ev"><thead><tr><th>Ítem</th><th>Vencimiento / estado</th><th>Certificados adjuntos</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <input type="file" id="rFile" accept="application/pdf,image/png,image/jpeg" hidden></div>
    <div class="rcard"><h3>OJT y evaluación anual</h3><div class="grid">
      ${field('Evaluación anual (venc.)', cell(o.evalAnual ?? null))}${field('Último OJT', cell(o.ultimo ?? null))}${field('Venc. OJT anual', cell(o.vencAnual ?? null))}${field('N° OJT últimos 12 meses', esc(o.n12 ?? 0))}</div>
      ${ojtAta.length ? `<div class="note">Último OJT por capítulo ATA: ${ojtAta.map(([k,v])=>`${esc(k)}: ${isDate(v)?fmt(v):esc(v)}`).join(' · ')}</div>` : ''}
      ${(p.ojtReg||[]).length ? `<table class="rows" style="margin-top:8px"><thead><tr><th>Fecha</th><th>Tarea</th><th>ATA</th><th>Instructor</th></tr></thead><tbody>${p.ojtReg.map(r=>`<tr><td>${isDate(r.fecha)?fmt(r.fecha):esc(r.fecha)}</td><td>${esc(r.tarea)}</td><td>${esc(r.ata)}</td><td>${esc(r.instructor)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">Sin registros de OJT en la planilla (hoja 8b).</div>'}</div>`;
  $('#rFicha').onclick = () => { location.hash = '#fichas'; openFicha(p.i); };
  $('#rPdf').onclick = () => genReport(p);
  let upKey = null;
  $('#rMain').querySelectorAll('[data-up]').forEach(b => b.onclick = () => { upKey = b.dataset.up; $('#rFile').value = ''; $('#rFile').click(); });
  $('#rFile').onchange = async () => {
    const f = $('#rFile').files[0]; if (!f || !upKey) return;
    if (f.size > 80*1024*1024) return rMsg('El archivo supera 80 MB.', true);
    const it = items.find(i => i.key === upKey);
    rMsg(`Subiendo ${f.name}…`);
    try {
      const a = await RT.assets.upload(f);
      await RT.db.collection('certs').add({rut:p.rut, nombre:p.nombre, item:upKey, itemLabel:it?.label||upKey, assetId:a.id, filename:f.name,
        contentType:a.contentType || f.type, sizeBytes:a.sizeBytes || f.size, ref:'', uploadedAt:new Date().toISOString()});
      rMsg(`Adjuntado: ${f.name}`);
    } catch(e) { rMsg('No se pudo adjuntar' + (e && (e.code||e.message) ? ` (${e.code||e.message})` : '') + '.', true); }
  };
  $('#rMain').querySelectorAll('[data-ref]').forEach(inp => inp.onchange = async () => {
    try { await RT.db.doc('certs/' + inp.dataset.ref).update({ref: inp.value.trim()}); } catch(e) { rMsg('No se guardó la referencia.', true); }
  });
  $('#rMain').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const rec = certs.get(b.dataset.del); if (!rec) return;
    if (b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = '¿Quitar?'; setTimeout(()=>{ b.dataset.armed=''; b.textContent='×'; }, 3000); return; }
    try { await RT.db.doc('certs/' + rec.id).delete(); try { await RT.assets.delete(rec.assetId); } catch(e) {} rMsg(`Quitado: ${rec.filename}`); }
    catch(e) { rMsg('No se pudo quitar el archivo.', true); }
  });
}
function rMsg(t, err){ const m = $('#rMsg'); if (!m) return; m.textContent = t; m.className = 'msg' + (err?' err':''); m.hidden = false; }

// ---- PDF generation (pdf-lib)
const W1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const pdfSafe = s => String(s ?? '').replace(/▲/g,'^').replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/[^\x20-\x7E\xA0-\xFF]/g, ch => W1252.includes(ch) ? ch : '?');
async function genReport(p){
  const btn = $('#rPdf'); btn.disabled = true; btn.textContent = 'Generando…';
  try {
    const bytes = await buildReport(p);
    const filename = `Informe_${(p.nombre||'persona').replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`;
    const dl = window.claude ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({filename, data:new Blob([bytes], {type:'application/pdf'})}); rMsg(`Informe generado: ${filename}`); }
    else if (!window.claude) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = filename; a.click(); rMsg(`Informe generado: ${filename}`); }
    else rMsg('La descarga no está disponible en esta vista. Abre la página directamente en claude.ai.', true);
  } catch(e) { console.error(e); rMsg('No se pudo generar el informe' + (e && e.message ? `: ${e.message}` : '.'), true); }
  btn.disabled = false; btn.textContent = 'Generar informe PDF';
}
async function buildReport(p){
  const {PDFDocument, StandardFonts, rgb} = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Informe personal - ${p.nombre}`)); doc.setAuthor('Gerencia de Calidad'); doc.setCreator('Portal Gerencia de Calidad (piloto)');
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold), FI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const A4 = [595.28, 841.89], M = 42, CW = A4[0] - 2*M;
  const NAVY = rgb(0.12,0.31,0.47), INK = rgb(0.1,0.14,0.19), MUTED = rgb(0.37,0.42,0.48), LINE = rgb(0.8,0.83,0.86);
  const FILL = {ok:rgb(0.78,0.94,0.81), w6:rgb(1,0.92,0.61), w3:rgb(0.99,0.84,0.71), bad:rgb(1,0.78,0.81)};
  const today = new Date().toISOString().slice(0,10);
  let page, y;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const wrap = (text, font, size, width) => {
    const words = pdfSafe(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words){ const t = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) <= width) cur = t;
      else { if (cur) lines.push(cur); let ww = w; while (font.widthOfTextAtSize(ww, size) > width && ww.length > 1){ let k = ww.length; while (k > 1 && font.widthOfTextAtSize(ww.slice(0,k), size) > width) k--; lines.push(ww.slice(0,k)); ww = ww.slice(k); } cur = ww; } }
    if (cur || !lines.length) lines.push(cur); return lines;
  };
  const text = (s, x, yy, font=F, size=9, color=INK) => page.drawText(pdfSafe(s), {x, y:yy, font, size, color});
  const ensure = h => { if (y - h < M + 20) { newPage(); return true; } return false; };
  const heading = s => { ensure(40); y -= 8; page.drawRectangle({x:M, y:y-15, width:CW, height:18, color:NAVY}); text(s.toUpperCase(), M+6, y-10, FB, 9.5, rgb(1,1,1)); y -= 22; };
  // table: cols [{h, w, key}] rows: arrays of {t, fill?, bold?}
  const table = (cols, rows) => {
    const pad = 3.5, size = 8.5, lh = 10.5;
    const drawHead = () => { const hh = Math.max(...cols.map(c => wrap(c.h, FB, 8, c.w - 2*pad).length)) * 10 + 2*pad;
      let x = M; cols.forEach(c => { page.drawRectangle({x, y:y-hh, width:c.w, height:hh, color:rgb(0.91,0.94,0.97), borderColor:LINE, borderWidth:0.5});
        wrap(c.h, FB, 8, c.w-2*pad).forEach((l,k) => text(l, x+pad, y-pad-8-k*10, FB, 8, NAVY)); x += c.w; }); y -= hh; };
    drawHead();
    for (const r of rows){
      const lines = r.map((c,k) => wrap(c.t ?? '', c.bold?FB:F, size, cols[k].w - 2*pad));
      const h = Math.max(...lines.map(l => l.length)) * lh + 2*pad - 1;
      if (ensure(h)) drawHead();
      let x = M; r.forEach((c,k) => { page.drawRectangle({x, y:y-h, width:cols[k].w, height:h, color:c.fill || rgb(1,1,1), borderColor:LINE, borderWidth:0.5});
        lines[k].forEach((l,j) => text(l, x+pad, y-pad-7.5-j*lh, c.bold?FB:F, size, c.color || INK)); x += cols[k].w; });
      y -= h;
    }
    y -= 6;
  };
  const dcell = v => isDate(v) ? {t:fmt(v), fill:FILL[status(v)]} : {t: v == null ? 'Sin registro' : v === 'NO' ? 'No asistió' : String(v), fill: v == null || v === 'NO' ? FILL.bad : rgb(0.95,0.96,0.97)};
  const ax = annexMap(p), anxOf = k => (ax.get(k) || []).map(x => 'Anexo ' + x.n).join(', ') || '—';

  // ---- cover / header
  newPage();
  page.drawRectangle({x:0, y:A4[1]-78, width:A4[0], height:78, color:NAVY}); await window.pdfBrand(doc, page, A4[0], A4[1]);
  text('INFORME PERSONAL DE CAPACITACIÓN Y VIGENCIAS', M, A4[1]-38, FB, 14, rgb(1,1,1));
  text(`Gerencia de Calidad   ·   Emitido: ${fmt(today)}`, M, A4[1]-56, F, 9.5, rgb(0.86,0.91,0.96));
  y = A4[1] - 100;
  text(p.nombre || '(sin nombre)', M, y, FB, 16); y -= 16;
  text(`${p.rut}   ·   ${p.puesto || ''}   ·   ${p.area || 'Sin área'}   ·   ${p.esp}`, M, y, F, 9.5, MUTED); y -= 14;

  heading('1. Datos del profesional');
  const kv = [['Nombre', p.nombre], ['RUT', p.rut], ['Puesto', p.puesto], ['Área', p.area], ['Especialidad', p.esp], ['Estado', p.estado],
    ['Tipo de licencia', p.tipoLic], ['N° de licencia', p.nLic], ['Vencimiento licencia', isDate(p.vencLic) ? fmt(p.vencLic) + ' (' + LABEL[status(p.vencLic)] + ')' : p.vencLic],
    ['Habilitaciones especiales', [...p.nv4.map(n=>`Nv4 ${n.esp||''}`), ...p.ndt.map(n=>`NDT ${n.metodo} ${n.nivel||''}`)].join(', ') || '—']];
  table([{h:'Campo', w:150}, {h:'Dato', w:CW-150}], kv.map(([k,v]) => [{t:k, bold:true}, {t: v == null || v === '' ? '—' : String(v)}]));

  heading('2. Resumen de vigencias');
  const c = p.counts;
  table([{h:'Vencidos',w:CW/5},{h:'< 3 meses',w:CW/5},{h:'6–3 meses',w:CW/5},{h:'> 6 meses',w:CW/5},{h:'Próximo vencimiento',w:CW/5}],
    [[{t:String(c.bad), fill:c.bad?FILL.bad:null, bold:true},{t:String(c.w3), fill:c.w3?FILL.w3:null, bold:true},{t:String(c.w6), fill:c.w6?FILL.w6:null, bold:true},{t:String(c.ok), bold:true},
      {t: p.ds[0] ? `${fmt(p.ds[0][1])} · ${p.ds[0][0]}` : 'Sin fechas', fill: p.ds[0] ? FILL[status(p.ds[0][1])] : null}]]);

  const its = evidenceItems(p);
  const secTable = (title, filter, cols) => { const list = its.filter(filter); heading(title);
    if (!list.length) { text('Sin registros.', M, y-8, FI, 9, MUTED); y -= 18; return; }
    table(cols, list.map(it => [{t:it.label}, dcell(it.value), {t:stText(it.value)}, {t:it.extra||''}, {t:anxOf(it.key)}])); };
  const stdCols = [{h:'Ítem',w:170},{h:'Vencimiento',w:70},{h:'Estado',w:70},{h:'Detalle',w:CW-375},{h:'Evidencia',w:65}];
  secTable('3. Cursos generales y licencia', it => it.sec === 'Licencia' || it.sec === 'Cursos generales', stdCols);
  secTable('4. Cursos de aeronave', it => it.sec === 'Aeronaves', [{h:'Aeronave / nivel',w:150},{h:'Vencimiento',w:70},{h:'Estado',w:70},{h:'Motores (one time)',w:CW-355},{h:'Evidencia',w:65}]);
  secTable('5. Cursos de operador', it => it.sec === 'Operadores', stdCols);
  if (its.some(it => it.sec === 'Especialidades')) secTable('6. Especialidades (Nv4 · NDT · CMM)', it => it.sec === 'Especialidades', stdCols);

  heading('7. OJT y evaluación anual');
  const o = p.ojt || {};
  table([{h:'Evaluación anual (venc.)',w:CW/4},{h:'Último OJT',w:CW/4},{h:'Venc. OJT anual',w:CW/4},{h:'N° OJT últimos 12 meses',w:CW/4}],
    [[dcell(o.evalAnual ?? null), dcell(o.ultimo ?? null), dcell(o.vencAnual ?? null), {t:String(o.n12 ?? 0)}]]);
  if ((p.ojtReg||[]).length) table([{h:'Fecha',w:60},{h:'Tarea / descripción',w:CW-260},{h:'ATA',w:40},{h:'P/N o material',w:80},{h:'Instructor',w:80}],
    p.ojtReg.map(r => [{t:isDate(r.fecha)?fmt(r.fecha):r.fecha||''},{t:r.tarea||''},{t:r.ata||''},{t:r.pn||''},{t:r.instructor||''}]));
  else { text('Sin registros de OJT en la fuente (hoja 8b).', M, y-8, FI, 9, MUTED); y -= 18; }

  // annex index
  const annexes = [...ax.entries()].flatMap(([k, arr]) => arr.map(x => ({...x, label: its.find(i => i.key === k)?.label || x.rec.itemLabel || 'Otro'}))).sort((a,b)=>a.n-b.n);
  heading('8. Índice de anexos (evidencias)');
  if (annexes.length) table([{h:'Anexo',w:45},{h:'Ítem',w:180},{h:'Archivo',w:CW-325},{h:'N° certificado / ref.',w:100}],
    annexes.map(a => [{t:String(a.n), bold:true},{t:a.label},{t:a.rec.filename},{t:a.rec.ref||''}]));
  else { text('No hay certificados adjuntos para esta persona.', M, y-8, FI, 9, MUTED); y -= 18; }

  // sign-off
  ensure(90); y -= 24;
  const sw = (CW - 30) / 2;
  [['Emitido por (Gerencia de Calidad)', M], ['Revisado / aprobado', M + sw + 30]].forEach(([l, x]) => {
    page.drawLine({start:{x, y:y-30}, end:{x:x+sw, y:y-30}, thickness:0.6, color:MUTED});
    text(l, x, y-42, F, 8.5, MUTED); text('Nombre, firma y fecha', x, y-53, FI, 8, MUTED); });
  y -= 70;
  text(`Fuente de datos: ${DATA.fuente} (${(DATA.actualizado||'').split('·')[0].trim()}). Semáforo calculado al ${fmt(today)}.`, M, y, FI, 7.5, MUTED);
  const reportPages = doc.getPageCount();

  // ---- annexes
  for (const a of annexes){
    const stamp = pg => { const {width, height} = pg.getSize();
      pg.drawRectangle({x:0, y:height-16, width, height:16, color:rgb(1,1,1), opacity:0.85});
      pg.drawText(pdfSafe(`ANEXO ${a.n} · ${a.label} · ${p.nombre} · ${p.rut}`).slice(0,140), {x:10, y:height-11, size:7.5, font:FB, color:NAVY}); };
    try {
      const resp = await fetch(assetUrl(a.rec.assetId)); if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const buf = new Uint8Array(await resp.arrayBuffer());
      const ct = (a.rec.contentType || '').toLowerCase(), nm = (a.rec.filename || '').toLowerCase();
      if (ct.includes('pdf') || nm.endsWith('.pdf')){
        const src = await PDFDocument.load(buf, {ignoreEncryption:true});
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach(pg => { doc.addPage(pg); stamp(pg); });
      } else {
        const img = (window.sniffImg(buf) || (ct.includes('png') ? 'png' : 'jpg')) === 'png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
        const pg = doc.addPage(A4); const s = Math.min((A4[0]-2*M)/img.width, (A4[1]-2*M-20)/img.height, 1);
        pg.drawImage(img, {x:(A4[0]-img.width*s)/2, y:(A4[1]-img.height*s)/2 - 10, width:img.width*s, height:img.height*s}); stamp(pg);
      }
    } catch(e) {
      const pg = doc.addPage(A4); stamp(pg);
      pg.drawText(pdfSafe(`Anexo ${a.n}: no se pudo incorporar el archivo "${a.rec.filename}".`), {x:M, y:A4[1]-80, size:11, font:FB, color:rgb(0.7,0.14,0.1)});
      pg.drawText(pdfSafe(`Motivo: ${e && e.message || 'formato no compatible'}. Consulte el original en el portal.`), {x:M, y:A4[1]-98, size:9, font:F, color:MUTED});
    }
  }
  // footer on every page
  const total = doc.getPageCount();
  doc.getPages().forEach((pg, k) => { const {width} = pg.getSize();
    const s = pdfSafe(`${p.nombre} · ${p.rut}   ·   ${k < reportPages ? 'Informe' : 'Anexos'}   ·   Página ${k+1} de ${total}`);
    pg.drawText(s, {x: width - 10 - F.widthOfTextAtSize(s, 7), y:8, size:7, font:F, color:MUTED});
    pg.drawText('Gerencia de Calidad', {x:10, y:8, size:7, font:F, color:MUTED}); });
  return await doc.save();
}

ROOT.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-viewc]'); if (!a) return; e.preventDefault(); const c = certs.get(a.dataset.viewc); if (c) window.openViewer({assetId:c.assetId, filename:c.filename, contentType:c.contentType}); });
window.addEventListener('apas-session', () => { try { renderR(); } catch(e){} });
