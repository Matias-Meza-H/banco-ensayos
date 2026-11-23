
// ===================== FAA · Self-Evaluation Checklist (Form QC-021 Rev.2) · 03 + 04 · carga masiva
const QC021 = [
  {ch:'I', t:'Housing and Facilities.', es:'Instalaciones', sec:'infra', div:'According to current RSQCM', q:[
    ['a','Does the facility have adequate size to house all necessary tooling, equipment, material and parts to perform the work on these items?'],
    ['b','Do the facilities have adequate lighting, protect customer parts, materials, and units from damage, theft, and contamination, and ensure the safety of the personnel involved?'],
    ['c','Are the storage area and work area physically separated from the workshop facilities?'],
    ['d','Do shipping and receiving areas have adequate space, lighting, shelving, security and fire protection?'],
    ['e',"Is there adequate and appropriate storage space to safely store customers' shipping containers and protect them from damage?"],
    ['f','Are workshop areas clearly segregated by function?']]},
  {ch:'II', t:'Tools and Test Equipment.', es:'Herramientas y equipos', sec:'tools', div:'See Form QC-020-Table A', q:[
    ['a','Does the Repair Station have the equipment and tools necessary to perform the maintenance, preventive maintenance or alteration of the items listed above?'],
    ['b','Are all test and inspection equipment and tools calibrated to a standard acceptable to the FAA?'],
    ['c','Does the repair station have the appropriate check for Alternative Tooling /Equipment Equivalency Assessment (Form QC-020A)?']]},
  {ch:'III', t:'Materials', es:'Materiales', sec:'mat', div:'See Form QC-020-Table B', q:[
    ['a','Does the Repair Station have the consumables materials necessary to perform the maintenance, preventive maintenance or alteration of the items listed above?'],
    ['b','Are the materials recommended by the manufacturer of the article or equivalent?']]},
  {ch:'IV', t:'Technical Data.', es:'Datos técnicos', sec:'doc', div:'See record attached', q:[
    ['a','Does the repair station have the documents and data necessary for performing maintenance, preventive maintenance, and alterations?'],
    ['b','Does the repair station have access to the Airworthiness Directives and Service Bulletins, and can it review them to see if there is any application to these articles?'],
    ['c','Does the repair station have instructions for continued airworthiness?'],
    ['d','Does the article require aircraft maintenance manuals?', 'Maintenance Manuals'],
    ['e','Does the article require component maintenance manuals?'],
    ['f','Does the article require structural maintenance manuals?'],
    ['g','Does the article require standard practice manuals?']]},
  {ch:'V', t:'Process.', es:'Procesos', sec:'serv', div:'See record attached', q:[
    ['a','Does the repair shop have the appropriate certification to perform maintenance, preventive maintenance, or modification of the items listed above?'],
    ['b','Does the repair station have the capability to identify what maintenance, preventive maintenance, or alteration it needs to perform according to the applicable certification?'],
    ['c','Does the repair station have the capability to perform the testing processes required by the applicable maintenance data?'],
    ['d','Does the repair station have the capability to perform the inspection processes required by the applicable maintenance data?'],
    ['e','Does the repair station have the capability to perform the repairs required by the applicable maintenance data?'],
    ['f','Does the repair station have the capability to perform overhaul of the article in accordance with the applicable maintenance data?'],
    ['g','Does the repair station have the capability to perform the Non-Destructive Testing (NDT) processes required by the applicable maintenance data?'],
    ['h','Does the repair station have the capability to perform special processes required by the applicable maintenance data?']]},
  {ch:'VI', t:'Trained Personnel.', es:'Personal entrenado', sec:'train', div:'See training records attached\nSee Rosters attached', q:[
    ['a','Do the training records demonstrate that personnel assigned to perform the maintenance, preventive maintenance, or alteration of the items listed above have completed the required training?'],
    ['b','Do the training records demonstrate that supervisory personnel are qualified to oversee the maintenance, preventive maintenance, or alteration of the items listed above?'],
    ['c','Do the training records demonstrate that inspection personnel are qualified to perform the inspections required for the items listed above?'],
    ['d','Do the training records demonstrate that personnel authorized to approve items for Return to Service (RTS) are qualified for that function?']]},
];
const CH_LIST = QC021.map(c => c.ch);
const CH_OF_SEC = {infra:'I', tools:'II', mat:'III', doc:'IV', serv:'V', train:'VI'};
const SEC_OF_CH = Object.fromEntries(Object.entries(CH_OF_SEC).map(([k,v]) => [v,k]));
const NQ = QC021.reduce((s,c) => s + c.q.length, 0);

// Respuestas reales presentadas a la FAA (ELT KANNAD / INTEGRA, 25/08/2026) como ejemplo de llenado
const SE_SEED = {P003: {
  hdr:{pn:'S185X501-XX\nS182X502-XX\n(See Annex A)', mfr:'SAFRAN', desc:'Emergency Locator Transmitter (ELT)'},
  ans:{
    'I.a':['yes','1.- The housing and facilities are adequate in size, physical workspaces for tooling, equipment and material and parts to perform maintenance.'],
    'I.b':['yes','1.- The facilities have adequate, limited, and restricted areas, and provide security for customer parts, materials, and units against damage, theft, and contamination.\n2.- The worktables have rubber covers to protect them from damage.\n3.- The facilities have an appropriate environment, lighting, and workspace to ensure the safety of the technicians and the quality of their work.'],
    'I.c':['yes','1.- The workshop facilities ensure physical separation between storage and work areas.'],
    'I.d':['yes','1.- The shipping and receiving areas have adequate space, lighting, shelving, security and fire protection.'],
    'I.e':['yes',"1.- The repair station has appropriate storage space to safely store customers' units."],
    'I.f':['yes','1.- As shown in the current RSQCM workshop layout.'],
    'II.a':['yes','1.- The Repair Station has the equipment and tools necessary to perform the maintenance according to CMM 25-63-05, Rev. 6, Date SEP/19/2024 and CMM 25-63-08, Rev. 1, Date MAR/31/2020.\n2.- See, attached Form QC-020 Tools and Equipment Equivalency Summary, Table A.\n3.- See attached photos for equipment and tools required.'],
    'II.b':['yes','1.- All equipment necessaries to perform maintenance i.a.w. the respective CMM are calibrated, see extract of QC-012 form.'],
    'II.c':['yes','1.- See Form QC-020A Equivalent Tools-Equipment Validation and Manufacturing drawing of Special Tools.'],
    'III.a':['yes','1.- Materials are detailed at Form QC-020, Table B.'],
    'III.b':['yes','1.- Materials are detailed at Form QC-020, Table B.'],
    'IV.a':['yes','1.- APAS Chile has the data required to do the maintenance, preventive maintenance and alteration.\n2.- See, attached CMM 25-63-05, Rev. 06, Date SEP/19/2024 as evidence.\n3.- See, attached CMM 25-63-08, Rev. 01, Date MAR/31/2020 as evidence.'],
    'IV.b':['yes','1.- The repair station has a process for verifying Airworthiness Directives (ADs) and Service Bulletins (SBs) during the preliminary inspection process.\n2.- The ADs will be reviewed at drs.faa.gov and ad.easa.europa.eu.\n3.- The APAS Chile technical library provides access to the Service Bulletins for these articles.'],
    'IV.c':['na','1.- N/A.'],
    'IV.d':['na','1.- N/A.'],
    'IV.e':['yes','2.- See, attached CMM 25-63-05, Rev. 06, Date SEP/19/2024 as evidence.\n3.- See, attached CMM 25-63-08, Rev. 01, Date MAR/31/2020 as evidence'],
    'IV.f':['na','1.- N/A.'],
    'IV.g':['na','1.- N/A.'],
    'V.a':['no','1.- Certificate Repair Station #APAY048E requests to expand its radio limited capability list to include the Testing, Inspection and REPAIR limited to Battery Replacement on these articles.'],
    'V.b':['yes','1.- APAS Chile has a preliminary inspection process to identify the required work and whether it has the approved capability within its "limited capabilities list."'],
    'V.c':['yes','1.- The repair station has qualified personnel, necessary equipment and test devices to perform the testing processes required by the maintenance data.'],
    'V.d':['yes','1.- The repair station has access to inspection procedures and qualified inspection personnel to perform all inspections required by the applicable maintenance data.'],
    'V.e':['yes','1.- The repair station does not have full access to repair procedures; the capabilities only apply to items and battery replacement. Alternatively, the CRS have tools and personnel to perform these jobs in the maintenance data shown as evidence.'],
    'V.f':['na','1.- N/A.'],
    'V.g':['na','1.- N/A.'],
    'V.h':['na','1.- N/A.'],
    'VI.a':['yes','1.- Training records demonstrate completion of the training applicable to the scope of work evaluated.\n2.- See attached training records TR-003.'],
    'VI.b':['yes','1.- Training records demonstrate that supervisory personnel have completed the training required for their assigned responsibilities.\n2.- See attached Supervisor Roster QC-016 and training records TR-003.'],
    'VI.c':['yes','1.- Training records demonstrate that inspection personnel have completed the training required for inspection activities within the evaluated scope of work.\n2.- See attached Inspector Roster QC-017 and training records TR-003.'],
    'VI.d':['yes','1.- Training records demonstrate that RTS authorized personnel have completed the training required for their assigned responsibilities.\n2.- See attached RTS Authorized Personnel Roster QC-018 and training records TR-003.'],
  },
  qcm:{name:'PABLO HERNANDEZ', date:'2025-08-25', approved:true}, am:{name:'ALFONSO MAGGI', date:'2026-08-25'},
  annex:[
    {cmm:'25-63-05', rows:[['A','KANNAD 406 AP','S1820502-01'],['B','KANNAD 406 AP','S1820502-02'],['C','KANNAD 406 AF','S1821502-01'],['D','KANNAD 406 AF','S1821502-02'],['E','KANNAD 406 AF-H','S1822502-01'],['F','KANNAD 406 AF-H','S1822502-02'],['G','KANNAD 406 AS','S1823502-01'],['H','KANNAD 406 AS','S1823502-02'],['J','KANNAD 406 AS-TNC','S1823502-03'],['K','KANNAD 121 AF','S1824502-01'],['L','KANNAD 121 AF','S1824502-02'],['M','KANNAD 121 AF-H','S1826502-02'],['N','KANNAD 406 AF (6D)','S1821502-06'],['P','KANNAD 406 Survival','S1823502-05'],['Q','KANNAD 406 AP-H','S1820502-04']]},
    {cmm:'25-63-08', rows:[['A','AP INTEGRA (ER)','S1850501-01'],['B','AP INTEGRA','S1850501-02'],['C','AF INTEGRA (ER)','S1851501-01'],['D','AF INTEGRA','S1851501-02'],['E','AF-H INTEGRA (ER)','S1852501-01'],['F','AF-H INTEGRA','S1852501-02'],['G','AP-H INTEGRA (ER)','S1854501-01'],['H','AP-H INTEGRA','S1854501-02'],['J','AP INTEGRA (ER-N)','S1850501-03'],['K','AF INTEGRA (ER-N)','S1851501-03'],['L','AF-H INTEGRA (ER-N)','S1852501-03'],['M','AP-H INTEGRA (ER-N)','S1854501-03']]}],
}};
function getSE(p){
  const base = p.se || SE_SEED[p.id] || {};
  const ans = {}; for (const c of QC021) for (const [l] of c.q){ const k = c.ch + '.' + l, v = base.ans?.[k]; ans[k] = Array.isArray(v) ? {a:v[0], ref:v[1]} : (v || {a:'', ref:''}); }
  return {hdr: base.hdr || {pn:(p.pns||[]).join('\n'), mfr:p.mfr || '', desc:''}, ans, qcm: base.qcm || {name:'', date:'', approved:null}, am: base.am || {name:'', date:''},
    annex: base.annex || (p.cmm||[]).filter(x => /^\d\d-\d\d-\d\d$/.test(x)).map(c => ({cmm:c, rows:[]})), div: base.div || {}, seeded: !p.se && !!SE_SEED[p.id]};
}
const seStore = se => ({hdr:se.hdr, ans:Object.fromEntries(Object.entries(se.ans).map(([k,v]) => [k, [v.a, v.ref]])), qcm:se.qcm, am:se.am, annex:se.annex, div:se.div});
const cmmsOf = p => (p.cmm||[]).filter(x => /^\d\d-\d\d-\d\d/.test(x));
function itemSecKey(p, itemId){ for (const s of p.sections || []) if (s.items.some(i => i.id === itemId)) return s.key; return null; }
function chOf(p, ev){ return ev.ck || CH_OF_SEC[itemSecKey(p, ev.itemId)] || null; }
const evOfProj = pid => [...store.evid.values()].filter(e => e.projId === pid).sort((a,b) => (a.at||'').localeCompare(b.at||''));
function seChecks(p, se){
  const out = [], ev = evOfProj(p.id);
  const unanswered = Object.entries(se.ans).filter(([,v]) => !v.a).map(([k]) => k);
  if (unanswered.length) out.push(`${unanswered.length} pregunta(s) sin responder: ${unanswered.slice(0,8).join(', ')}${unanswered.length > 8 ? '…' : ''}`);
  for (const [k,v] of Object.entries(se.ans)){
    if (v.a && !String(v.ref||'').trim()) out.push(`${k}: falta la Ref. (justificación)`);
    const nums = [...String(v.ref||'').matchAll(/^\s*(\d+)\.-/gm)].map(m => +m[1]);
    if (nums.length && nums.some((n,i) => n !== i+1)) out.push(`${k}: la numeración de la Ref. no es correlativa (${nums.join(', ')})`);
  }
  for (const c of QC021){
    const mentions = c.q.some(([l]) => /attached|see form|see .*roster|QC-0\d\d|TR-0\d\d/i.test(se.ans[c.ch + '.' + l].ref || '') && se.ans[c.ch + '.' + l].a === 'yes');
    if (mentions && !ev.some(e => chOf(p, e) === c.ch)) out.push(`Capítulo ${c.ch}: la Ref. menciona documentos adjuntos, pero el capítulo no tiene evidencias cargadas`);
  }
  const d1 = se.qcm.date, d2 = se.am.date;
  if (d1 && d2 && d1 !== d2) out.push(`Las fechas de firma no coinciden: QC Manager ${fmt(d1)} · Accountable Manager ${fmt(d2)}${d1.slice(0,4) !== d2.slice(0,4) ? ' (distinto año: ¿error de tipeo?)' : ''}`);
  if (!se.qcm.name || !se.am.name) out.push('Faltan los nombres del QC Manager o del Accountable Manager');
  const cm = cmmsOf(p); for (const a of se.annex) if (!a.rows.length) out.push(`Anexo A: CMM ${a.cmm} sin listado de P/N por variante`);
  for (const e of ev) if (e.cmm && cm.length && !cm.includes(e.cmm)) out.push(`Evidencia "${e.filename}" asignada al CMM ${e.cmm}, que no está en el proyecto`);
  return out;
}
let seOpen = {}, seCh = 'I';
function faaBox(p){
  if (!isFAA(p) || isAir(p) || p.tipo === 'Certificación extranjera') return '';
  const ad = isAdmin(), se = getSE(p), ev = evOfProj(p.id), cm = cmmsOf(p);
  const nAns = Object.values(se.ans).filter(v => v.a).length, chk = seChecks(p, se);
  const pk = paquetes(p);
  const radio = (k, v, a) => `<label class="ynr"><input type="radio" name="se_${k}" value="${v}" ${a === v ? 'checked' : ''} ${ad ? '' : 'disabled'} data-se="${k}">${v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'N/A'}</label>`;
  const chEv = ch => ev.filter(e => chOf(p, e) === ch);
  const evLine = e => { const r = revOf(e.id); return `<div class="ev"><span class="b s-info">${esc(EVT[e.tipo||'otro'] || e.tipo)}</span><a href="#" class="lnk" data-view="${esc(e.id)}">${esc(e.filename)}</a>${viaClaude(e)}
      ${e.cmm ? `<span class="b s-na">CMM ${esc(e.cmm)}</span>` : ''}${e.paqueteNombre ? `<span class="b s-na">📦 ${esc(e.paqueteNombre)}</span>` : ''}<span class="b ${r==='aprobada'?'s-ok':r==='rechazada'?'s-bad':'s-warn'}">${r}</span>
      ${ad && r !== 'aprobada' ? `<button class="btn sm" data-ok="${esc(e.id)}" title="Aprobar">✓</button>` : ''}${ad ? `<button class="btn sm" data-ko="${esc(e.id)}" title="Rechazar">✗</button>` : ''}</div>`; };
  const c = QC021.find(x => x.ch === seCh) || QC021[0];
  const chTabs = QC021.map(x => { const n = x.q.filter(([l]) => se.ans[x.ch + '.' + l].a).length; return `<button class="btn sm ${x.ch === c.ch ? 'pri' : ''}" data-sech="${x.ch}">${x.ch} · ${esc(x.es)} <span style="opacity:.75">${n}/${x.q.length} · 📎${chEv(x.ch).length}</span></button>`; }).join('');
  const rows = c.q.map(([l, qt, sub]) => { const k = c.ch + '.' + l, v = se.ans[k];
    return `${sub ? `<tr><td colspan="3" style="font-weight:700;background:var(--bg)">${esc(sub)}</td></tr>` : ''}<tr><td style="width:28px;font-weight:700">${l})</td>
      <td><div style="font-weight:600">${esc(qt)}</div><div class="log" style="margin:4px 0 2px">Ref.:</div>
      ${ad ? `<textarea class="seref" data-ref="${k}" rows="${Math.max(2, (v.ref||'').split('\n').reduce((n,l) => n + Math.ceil((l.length||1)/95), 0))}" placeholder="1.- Justificación y documento de respaldo (en inglés)">${esc(v.ref||'')}</textarea>` : `<div style="white-space:pre-line;font-size:13px">${esc(v.ref || '—')}</div>`}</td>
      <td style="white-space:nowrap;vertical-align:top">${radio(k,'yes',v.a)}${radio(k,'no',v.a)}${radio(k,'na',v.a)}</td></tr>`; }).join('');
  return `<div class="box" id="faaBox"><h3>Autoevaluación FAA · Self-Evaluation Checklist (Form QC-021 Rev.2) ${chip(`${nAns}/${NQ} respondidas`, nAns === NQ ? 's-ok' : 's-na')}
      <span style="margin-left:auto;display:flex;gap:6px">${canUpload() ? '<button class="btn sm pri" id="zipBtn">📦 Carga masiva (.zip / varios archivos)</button>' : ''}</span></h3>
    <div class="hint">Mismo orden de temas que el documento 03 (autoevaluación) y el 04 (evidencias, uno por CMM). Cada evidencia pertenece a un capítulo I–VI; las de un ítem toman el capítulo de su sección. ${se.seeded ? '<b>Prellenado con la autoevaluación presentada a la FAA el 25/08/2026; se guarda al primer cambio.</b>' : ''}</div>
    ${chk.length ? `<div class="warnbox"><b>Control del documento: ${chk.length} observación(es)</b>${chk.slice(0,8).map(x => `<div>⚠ ${esc(x)}</div>`).join('')}${chk.length > 8 ? `<div>… y ${chk.length-8} más</div>` : ''}</div>` : '<div class="note2" style="margin:6px 0">✓ Sin observaciones de forma.</div>'}
    <details ${seOpen.hdr ? 'open' : ''} data-seo="hdr"><summary><b>Encabezado, firmas y Anexo A</b></summary>
      <div class="form" style="margin-top:8px">
        <label class="fld">1. Part Number (como aparece en el formulario)<textarea data-h="pn" ${ad?'':'disabled'}>${esc(se.hdr.pn)}</textarea></label>
        <label class="fld">2. Manufacturer<input data-h="mfr" value="${esc(se.hdr.mfr)}" ${ad?'':'disabled'}></label>
        <label class="fld">3. Description (inglés)<input data-h="desc" value="${esc(se.hdr.desc)}" ${ad?'':'disabled'}></label>
        <label class="fld">Quality Control Manager<input data-s="qcm.name" value="${esc(se.qcm.name)}" ${ad?'':'disabled'}></label>
        <label class="fld">Fecha QC Manager<input type="date" data-s="qcm.date" value="${esc(se.qcm.date)}" ${ad?'':'disabled'}></label>
        <label class="fld">Accountable Manager<input data-s="am.name" value="${esc(se.am.name)}" ${ad?'':'disabled'}></label>
        <label class="fld">Fecha Accountable Manager<input type="date" data-s="am.date" value="${esc(se.am.date)}" ${ad?'':'disabled'}></label>
      </div>
      <div class="log" style="margin-top:8px">Anexo A · P/N por variante (una fila por línea: Variante; Nombre; Part Number)</div>
      <div class="form">${(se.annex.length ? se.annex : cm.map(x => ({cmm:x, rows:[]}))).map((a, i) => `<label class="fld">CMM ${esc(a.cmm)}<textarea data-anx="${i}" data-cmm="${esc(a.cmm)}" rows="5" ${ad?'':'disabled'}>${esc(a.rows.map(r => r.join('; ')).join('\n'))}</textarea></label>`).join('') || '<div class="empty">Agrega el/los CMM en "Editar datos".</div>'}</div>
      <div class="log" style="margin-top:8px">Texto de los separadores del documento 04</div>
      <div class="form">${QC021.map(x => `<label class="fld">Checklist ${x.ch} · ${esc(x.t)}<input data-div="${x.ch}" value="${esc(se.div[x.ch] ?? x.div).replace(/\n/g,' / ')}" ${ad?'':'disabled'}></label>`).join('')}</div>
    </details>
    ${autoevalHtml(p)}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 6px">${chTabs}</div>
    <div class="wrap" style="border:none"><table class="items"><thead><tr><th colspan="2">${c.ch} · ${esc(c.t)}</th><th>Yes · No · N/A</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="log" style="margin:8px 0 4px">Evidencias del capítulo ${c.ch} (van al documento 04 en este orden${cm.length > 1 ? '; sin CMM = van en todos los 04' : ''}):</div>
    ${chEv(c.ch).map(evLine).join('') || '<div class="empty" style="padding:2px 0">Sin evidencias en este capítulo.</div>'}
    ${pk.length ? `<div class="log" style="margin:12px 0 4px"><b>Paquetes de evidencias</b></div><table class="items"><thead><tr><th>Paquete</th><th>Archivos</th><th>Estado</th>${ad ? '<th></th>' : ''}</tr></thead><tbody>
      ${pk.map(k => `<tr><td>📦 ${esc(k.nombre)}<div class="log">${esc(fmt(k.fecha))}</div></td><td>${k.ev.length} · ${k.ev.filter(e => revOf(e.id) === 'aprobada').length} aprobadas</td>
        <td>${chip(PKST[k.estado]?.[0] || k.estado, PKST[k.estado]?.[1] || 's-na')}${k.nota ? `<div class="log">${esc(k.nota)}</div>` : ''}</td>
        ${ad ? `<td style="white-space:nowrap"><button class="btn sm" data-pk="${esc(k.id)}:presentado">Presentado</button> <button class="btn sm pri" data-pk="${esc(k.id)}:aceptado" title="Aprueba todas las evidencias del paquete">Aceptado por la autoridad</button> <button class="btn sm" data-pk="${esc(k.id)}:observado">Observado</button></td>` : ''}</tr>`).join('')}</tbody></table>` : ''}
  </div>`;
}
const PKST = {preparado:['Preparado','s-na'], presentado:['Presentado a la autoridad','s-warn'], aceptado:['Aceptado: evidencias aceptables','s-ok'], observado:['Observado','s-bad']};
function paquetes(p){
  const m = new Map();
  for (const e of evOfProj(p.id)) if (e.paquete){ if (!m.has(e.paquete)) m.set(e.paquete, {id:e.paquete, nombre:e.paqueteNombre || e.paquete, fecha:(e.at||'').slice(0,10), ev:[]}); m.get(e.paquete).ev.push(e); }
  return [...m.values()].map(k => ({...k, estado:p.paq?.[k.id]?.estado || 'preparado', nota:p.paq?.[k.id]?.nota || ''}));
}
function bindFaa(p){
  const box = $('#faaBox'); if (!box) return;
  box.querySelectorAll('[data-sech]').forEach(b => b.onclick = () => { seCh = b.dataset.sech; renderExp(); });
  box.querySelectorAll('details[data-seo]').forEach(d => d.ontoggle = () => { seOpen[d.dataset.seo] = d.open; });
  if ($('#zipBtn')) $('#zipBtn').onclick = () => bulkPick(p);
  if ($('#aeUp')) $('#aeUp').onclick = () => pickFiles(fs => uploadEvid(p, null, fs, {tipo:'autoeval'}), 'application/pdf,image/*');
  box.querySelectorAll('[data-aeread]').forEach(b => b.onclick = () => seRead(p, store.evid.get(b.dataset.aeread), b));
  if (!isAdmin()) return;
  const save = async mutate => { const q = JSON.parse(JSON.stringify(store.proj.get(p.id))); const se = getSE(q); mutate(se); q.se = seStore(se); await saveProj(q); };
  box.querySelectorAll('input[data-se]').forEach(r => r.onchange = () => save(se => { se.ans[r.dataset.se].a = r.value; }));
  box.querySelectorAll('textarea[data-ref]').forEach(t => t.onchange = () => save(se => { se.ans[t.dataset.ref].ref = t.value.trim(); }));
  box.querySelectorAll('[data-h]').forEach(t => t.onchange = () => save(se => { se.hdr[t.dataset.h] = t.value.trim(); }));
  box.querySelectorAll('[data-s]').forEach(t => t.onchange = () => save(se => { const [a,b] = t.dataset.s.split('.'); se[a][b] = t.value.trim(); }));
  box.querySelectorAll('[data-div]').forEach(t => t.onchange = () => save(se => { se.div[t.dataset.div] = t.value.split(' / ').join('\n'); }));
  box.querySelectorAll('[data-anx]').forEach(t => t.onchange = () => save(se => { const i = +t.dataset.anx;
    const rows = t.value.split('\n').map(l => l.split(/;|\t/).map(x => x.trim())).filter(r => r.join('')).map(r => r.length >= 3 ? r.slice(0,3) : ['', r[0] || '', r[1] || '']);
    if (!se.annex[i]) se.annex[i] = {cmm:t.dataset.cmm, rows:[]}; se.annex[i].rows = rows; }));
  box.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => armed(b, async () => {
    const [id, st] = b.dataset.pk.split(':'); const k = paquetes(p).find(x => x.id === id); if (!k) return;
    const auth = (p.autoridad || []).includes('FAA') ? 'FAA' : (p.autoridad || [])[0] || 'autoridad';
    const q = JSON.parse(JSON.stringify(store.proj.get(p.id))); q.paq = q.paq || {}; q.paq[id] = {estado:st, fecha:today(), nota: st === 'aceptado' ? `Aceptado por ${auth} el ${fmt(today())}` : st === 'presentado' ? `Presentado el ${fmt(today())}` : `Observado el ${fmt(today())}`};
    await saveProj(q);
    if (st === 'aceptado'){ let n = 0; for (const e of k.ev) if (revOf(e.id) !== 'aprobada'){ await review(e.id, 'aprobada', `Aceptada por ${auth} (${fmt(today())}) · paquete ${k.nombre}`); n++; } flash(`${n} evidencia(s) quedaron aprobadas como evidencia aceptable.`); }
  }));
}

// ---------- carga masiva: .zip (lectura en el navegador) o varios archivos
async function unzip(file){
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no parece un .zip válido');
  const n = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true); const out = [];
  const dec = (bytes, name) => { try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch(e){ return [...bytes].map(b => String.fromCharCode(b)).join(''); } };
  for (let k = 0; k < n; k++){
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
    const nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const name = dec(buf.subarray(off + 46, off + 46 + nl)); off += 46 + nl + el + cl;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(name)) continue;
    const ds = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = buf.subarray(ds, ds + csize);
    out.push({name, size:usize, method, read: async () => {
      if (method === 0) return new Blob([data]);
      if (method === 8) return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      throw new Error('Método de compresión no soportado (' + method + ')'); }});
  }
  return out;
}
const MIME = n => /\.pdf$/i.test(n) ? 'application/pdf' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.png$/i.test(n) ? 'image/png' : /\.xlsx$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : /\.docx$/i.test(n) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream';
function guess(p, path){
  const s = path.toLowerCase(), base = s.split('/').pop(), img = /\.(jpe?g|png|heic|webp)$/.test(s);
  let ch = null;
  const folder = s.match(/(?:^|\/)(?:checklist[ _-]*)?(vi|v|iv|iii|ii|i|0?[1-6])[ ._-]/);
  const R = {i:'I', ii:'II', iii:'III', iv:'IV', v:'V', vi:'VI', '1':'I', '01':'I', '2':'II', '02':'II', '3':'III', '03':'III', '4':'IV', '04':'IV', '5':'V', '05':'V', '6':'VI', '06':'VI'};
  if (folder && s.includes('/')) ch = R[folder[1]] || null;
  const kw = [['VI', /train|entrena|tr-?003|roster|qc-?01[678]|curso|certificad|exam|prueba|personal|rts/], ['V', /process|proceso|toc|indice|índice|index|contents/],
    ['III', /material|consum|table ?b|tabla ?b/], ['II', /tool|herramient|calib|qc-?012|qc-?020|equival|datasheet|tester|multimet|torque|power ?supply|foto|photo/],
    ['IV', /cmm|manual|technical|tecnic|record of rev|ror|portada|cover|extract|revision|copyright/], ['I', /infra|housing|facilit|instalac|layout|taller|workshop/]];
  if (!ch) for (const [c, re] of kw) if (re.test(s)){ ch = c; break; }
  if (!ch && img) ch = 'II';
  const sk = SEC_OF_CH[ch], secObj = (p.sections || []).find(x => x.key === sk);
  let itemId = '';
  if (secObj && secObj.items.length){
    const hit = secObj.items.find(it => [it.pn, it.numero, ...(String(it.title||'').toLowerCase().split(/[^a-z0-9-]+/).filter(w => w.length > 4))].filter(Boolean).some(w => s.includes(String(w).toLowerCase())));
    itemId = hit ? hit.id : secObj.items.length === 1 ? secObj.items[0].id : '';
  }
  const tipo = ch === 'VI' ? 'registro' : ch === 'IV' || ch === 'V' ? 'extracto' : /calib|qc-?012/.test(s) ? (img ? 'foto' : 'calibracion') : /equival|qc-?020a|intercamb/.test(s) ? 'intercambiabilidad' : /\b(oc|po|orden)\b/.test(base) ? 'oc' : img ? 'foto' : 'otro';
  const cmm = cmmsOf(p).find(c => s.includes(c.toLowerCase())) || '';
  return {ch: ch || 'IV', itemId, tipo, cmm};
}
function bulkPick(p){
  const fi = document.createElement('input'); fi.type = 'file'; fi.multiple = true; fi.accept = '.zip,application/zip,image/*,application/pdf';
  fi.onchange = async () => {
    const fs = [...fi.files]; if (!fs.length) return; const rows = [];
    for (const f of fs){
      if (/\.zip$/i.test(f.name) || f.type.includes('zip')){
        try { for (const z of await unzip(f)) rows.push({path:z.name, size:z.size, read:z.read}); } catch(e){ flash(`${f.name}: ${e.message}`, true); }
      } else rows.push({path:f.name, size:f.size, read: async () => f});
    }
    if (!rows.length){ flash('No se encontraron archivos.', true); return; }
    rows.sort((a,b) => a.path.localeCompare(b.path, 'es', {numeric:true}));
    rows.forEach(r => Object.assign(r, guess(p, r.path), {on: r.size <= 80*1024*1024}));
    bulkDialog(p, rows);
  };
  fi.click();
}
function bulkDialog(p, rows){
  const vw = document.createElement('div'); vw.id = 'viewer'; document.body.appendChild(vw);
  const cm = cmmsOf(p), def = `${p.id} · ${fmt(today())}`;
  const itemOpts = (ch, sel) => { const s = (p.sections || []).find(x => x.key === SEC_OF_CH[ch]); return `<option value="">(general del capítulo)</option>` + (s ? s.items.map(it => `<option value="${esc(it.id)}" ${it.id === sel ? 'selected' : ''}>${esc(itemLabel(s, it)).slice(0,70)}</option>`).join('') : ''); };
  const draw = () => {
    vw.innerHTML = `<div class="vbox"><div class="vbar"><b>Carga masiva de evidencias · ${esc(p.id)} ${esc(p.desc)}</b><span style="margin-left:auto"></span><button class="btn sm" data-vclose>Cerrar ✕</button></div>
    <div class="vbody" style="background:var(--card,#fff)">
      <div class="note2" style="margin:0 0 8px">${rows.length} archivo(s). Revisa el capítulo, ítem, tipo y CMM propuestos (se deducen de la carpeta y el nombre: p. ej. <code>II_Tools/QC-012_extract.pdf</code>, <code>VI_Training/TR-003.pdf</code>). Todo queda como <b>un paquete</b>; cuando la autoridad lo acepte, lo marcas como aceptado y las evidencias quedan aprobadas.</div>
      <div class="toolbar"><label style="font-size:12.5px">Nombre del paquete <input id="bkN" value="${esc(def)}" style="min-width:280px"></label>
        <label style="font-size:12.5px">Fecha de los documentos <input id="bkF" type="date" title="Opcional: para evidencias antiguas"></label></div>
      <table class="items"><thead><tr><th></th><th>Archivo</th><th>Capítulo</th><th>Ítem</th><th>Tipo</th>${cm.length ? '<th>CMM</th>' : ''}</tr></thead><tbody>
      ${rows.map((r,i) => `<tr ${r.on ? '' : 'style="opacity:.5"'}><td><input type="checkbox" data-b="on" data-i="${i}" ${r.on ? 'checked' : ''} ${r.size > 80*1024*1024 ? 'disabled title="Supera 80 MB"' : ''}></td>
        <td style="max-width:300px;word-break:break-all;font-size:12.5px">${esc(r.path)}<div class="log">${(r.size/1024/1024).toFixed(2)} MB${r.size > 80*1024*1024 ? ' · supera 80 MB, no se sube' : ''}</div></td>
        <td><select data-b="ch" data-i="${i}">${QC021.map(c => `<option value="${c.ch}" ${c.ch === r.ch ? 'selected' : ''}>${c.ch} · ${esc(c.es)}</option>`).join('')}</select></td>
        <td><select data-b="itemId" data-i="${i}" style="max-width:220px">${itemOpts(r.ch, r.itemId)}</select></td>
        <td><select data-b="tipo" data-i="${i}">${Object.entries(EVT).map(([k,l]) => `<option value="${k}" ${k === r.tipo ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        ${cm.length ? `<td><select data-b="cmm" data-i="${i}"><option value="">Todos</option>${cm.map(c => `<option ${c === r.cmm ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>` : ''}</tr>`).join('')}
      </tbody></table>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="btn pri" id="bkGo">Subir ${rows.filter(r => r.on).length} archivo(s)</button><span class="log" id="bkSt"></span></div>
    </div></div>`;
    vw.querySelectorAll('[data-b]').forEach(el => el.onchange = () => { const r = rows[+el.dataset.i], k = el.dataset.b;
      r[k] = k === 'on' ? el.checked : el.value; if (k === 'ch'){ r.itemId = ''; if (r.ch === 'VI') r.tipo = 'registro'; } const keepN = $('#bkN').value, keepF = $('#bkF').value; draw(); $('#bkN').value = keepN; $('#bkF').value = keepF; });
    vw.querySelector('[data-vclose]').onclick = () => vw.remove();
    $('#bkGo').onclick = async () => {
      const sel = rows.filter(r => r.on); if (!sel.length) return;
      const pkg = 'pk' + Date.now().toString(36), nombre = $('#bkN').value.trim() || def, fechaDoc = $('#bkF').value || null;
      $('#bkGo').disabled = true; let ok = 0;
      for (const [i, r] of sel.entries()){
        $('#bkSt').textContent = `Subiendo ${i+1}/${sel.length}: ${r.path}`;
        try { const b = await r.read(), name = r.path.split('/').pop(), f = new File([b], name, {type: b.type || MIME(name)});
          const a = await RT.assets.upload(f);
          await RT.db.collection('evid').add({projId:p.id, itemId:r.itemId || null, ck:r.ch, cmm:r.cmm || null, tipo:r.tipo, fechaDoc, paquete:pkg, paqueteNombre:nombre, ruta:r.path,
            assetId:a.id, filename:name, contentType:a.contentType || f.type, sizeBytes:a.sizeBytes || f.size, at:new Date().toISOString(), by:RT.myId || null});
          ok++;
        } catch(e){ flash(`No se pudo subir ${r.path} (${e.code || e.message || 'error'})`, true); }
      }
      $('#bkSt').textContent = `Listo: ${ok} de ${sel.length} subidos al paquete "${nombre}".`; flash(`Paquete "${nombre}": ${ok} evidencia(s) subidas.`);
      setTimeout(() => { vw.remove(); render(); }, 900);
    };
  };
  draw();
}

// ---------- documentos 03 (QC-021) y 04 (Evidences, uno por CMM)
async function faaKit(){
  const {PDFDocument, StandardFonts, rgb, degrees} = PDFLib;
  const doc = await PDFDocument.create(); doc.setCreator('Portal de Capacidades · APAS Chile');
  const F = await doc.embedFont(StandardFonts.TimesRoman), FB = await doc.embedFont(StandardFonts.TimesRomanBold), H = await doc.embedFont(StandardFonts.Helvetica), HB = await doc.embedFont(StandardFonts.HelveticaBold), HI = await doc.embedFont(StandardFonts.HelveticaOblique);
  const LT = [612, 792], INK = rgb(0.08,0.08,0.1), NAVY = rgb(0.06,0.32,0.6), GREY = rgb(0.45,0.47,0.5), LINE = rgb(0.25,0.25,0.28);
  const wrap = (s, font, size, w) => { const out = []; for (const para of pdfSafe(s).split('\n')){ let cur = ''; for (const wd of para.split(/\s+/)){ const t = cur ? cur + ' ' + wd : wd;
      if (font.widthOfTextAtSize(t, size) <= w) cur = t; else { if (cur) out.push(cur); cur = wd; } } out.push(cur); } return out; };
  const LG = (await pdfLogo(doc)).img;
  const logo = (pg, x, y, s=1) => { const w = 112*s, h = w*LG.height/LG.width; pg.drawImage(LG, {x, y:y - 14*s, width:w, height:h}); };
  return {doc, F, FB, H, HB, HI, rgb, degrees, LT, INK, NAVY, GREY, LINE, wrap, logo, PDFDocument};
}
async function build03(p){
  const K = await faaKit(), {doc, F, FB, H, HB, LT, INK, LINE, GREY, wrap, logo} = K, se = getSE(p);
  doc.setTitle(pdfSafe(`03 Self-Evaluation Checklist - ${se.hdr.desc || p.desc}`));
  const M = 60, CW = LT[0] - 2*M; let pg, y;
  const T = (s, x, yy, f=F, sz=10.5, c=INK) => pg.drawText(pdfSafe(s), {x, y:yy, font:f, size:sz, color:c});
  const box = (x, yy, w, h, fill) => pg.drawRectangle({x, y:yy, width:w, height:h, borderColor:LINE, borderWidth:0.7, color:fill});
  const head = () => { pg = doc.addPage(LT); y = LT[1] - 50;
    T('Self-Evaluation Checklist', M, y - 18, HB, 20); logo(pg, LT[0] - M - 105, y - 10, 1); T('FAA CRS #APAY048E  ·  DGAC CMA #655', LT[0] - M - 112, y - 34, HB, 6.5);
    y -= 40; const cw = [CW*0.42, CW*0.3, CW*0.28], hdr = ['1.  Part Number','2.  Manufacturer','3.  Description'], vals = [se.hdr.pn, se.hdr.mfr, se.hdr.desc];
    const vl = vals.map((v,i) => wrap(v || '', H, 9.5, cw[i] - 8)), hh = Math.max(3, ...vl.map(l => l.length)) * 11 + 8;
    let x = M; hdr.forEach((h,i) => { box(x, y - 14, cw[i], 14); const tw = H.widthOfTextAtSize(h, 9.5); T(h, x + (cw[i]-tw)/2, y - 10.5, H, 9.5); box(x, y - 14 - hh, cw[i], hh);
      vl[i].forEach((l,j) => { const lw = H.widthOfTextAtSize(l, 9.5); T(l, x + (cw[i]-lw)/2, y - 14 - (hh - vl[i].length*11)/2 - 9 - j*11, H, 9.5); }); x += cw[i]; });
    y -= 14 + hh + 18;
    pg.drawText(pdfSafe('Form: QC-021   Rev.2        DIST.: QC/CAPABILITY LIST BINDER'), {x:M, y:28, size:7.5, font:H, color:INK}); };
  const ensure = h => { if (y - h < 60){ head(); return true; } return false; };
  const QW = CW - 26 - 3*30, X = {l:M, q:M+26, y:M+26+QW, n:M+26+QW+30, na:M+26+QW+60};
  head(); T('Checklist', M, y, FB, 11); y -= 6;
  for (const c of QC021){
    const chHead = () => { box(X.l, y - 18, 26, 18); box(X.q, y - 18, QW, 18); box(X.y, y - 18, 30, 18); box(X.n, y - 18, 30, 18); box(X.na, y - 18, 30, 18);
      T(c.ch, X.l + 5, y - 13, FB, 10.5); T(c.t, X.q + 4, y - 13, FB, 10.5); T('Yes', X.y + 6, y - 13, F, 10); T('No', X.n + 8, y - 13, F, 10); T('N/A', X.na + 5, y - 13, F, 10); y -= 18; };
    ensure(90); chHead();
    for (const [l, qt, sub] of c.q){
      const v = se.ans[c.ch + '.' + l];
      if (sub){ ensure(18); box(X.l, y - 16, 26, 16); box(X.q, y - 16, QW, 16); box(X.y, y - 16, 90, 16); T(sub, X.q + 14, y - 12, FB, 10); y -= 16; }
      const ql = wrap(qt, F, 10, QW - 8), rl = wrap(v.ref || '', F, 10, QW - 22), h = (ql.length + 1 + rl.length) * 11.5 + 8;
      if (ensure(h)) chHead();
      box(X.l, y - h, 26, h); box(X.q, y - h, QW, h); box(X.y, y - h, 30, h); box(X.n, y - h, 30, h); box(X.na, y - h, 30, h);
      T(l + ')', X.l + 5, y - 12, F, 10);
      let yy = y - 12; ql.forEach(t => { T(t, X.q + 4, yy, F, 10); yy -= 11.5; }); T('Ref.:', X.q + 4, yy, FB, 10); yy -= 11.5;
      rl.forEach((t, j) => { T(t, X.q + (/^\d+\.-/.test(t) ? 4 : 16), yy, F, 10); yy -= 11.5; });
      const mx = {yes:X.y, no:X.n, na:X.na}[v.a]; if (mx) T('X', mx + 11, y - h/2 - 4, F, 12);
      y -= h;
    }
    y -= 14;
  }
  ensure(120); y -= 6;
  const w1 = CW*0.42, w2 = CW*0.3, w3 = CW*0.28;
  box(M, y - 55, w1, 55); box(M + w1, y - 55, w2, 55); box(M + w1 + w2, y - 55, w3, 55);
  T('Quality Control Manager', M + 4, y - 14, F, 10.5); T(se.qcm.name || '', M + 4, y - 46, F, 10); T('Approved', M + w1 + 6, y - 14, F, 10.5);
  T(`Yes  ${se.qcm.approved === false ? '' : 'X'}      No  ${se.qcm.approved === false ? 'X' : ''}`, M + w1 + 10, y - 38, F, 10.5);
  T(`Date: ${fmt(se.qcm.date) || ''}`, M + w1 + w2 + 6, y - 30, F, 10.5); y -= 64;
  box(M, y - 55, w1, 55); box(M + w1, y - 55, w2 + w3, 55); T('Accountable Manager', M + 4, y - 14, F, 10.5); T(se.am.name || '', M + 4, y - 46, F, 10); T(`Date: ${fmt(se.am.date) || ''}`, M + w1 + 10, y - 30, F, 10.5);
  // Annex A
  if (se.annex.some(a => a.rows.length)){
    head(); T('ANNEX A: Part Number List (i.a.w. respective CMM)', M, y, FB, 13); y -= 22;
    for (const a of se.annex.filter(a => a.rows.length)){
      const cw = [60, 160, 150], x0 = M + (CW - 370)/2;
      ensure(16 * (a.rows.length + 1) + 30);
      ['Variant','Name','Part Number'].forEach((h,i) => { box(x0 + cw.slice(0,i).reduce((s,v)=>s+v,0), y - 14, cw[i], 14); T(h, x0 + cw.slice(0,i).reduce((s,v)=>s+v,0) + 3, y - 10.5, F, 10); }); y -= 14;
      for (const r of a.rows){ r.forEach((v,i) => { box(x0 + cw.slice(0,i).reduce((s,v)=>s+v,0), y - 13, cw[i], 13); T(v, x0 + cw.slice(0,i).reduce((s,v)=>s+v,0) + 3, y - 10, F, 10); }); y -= 13; }
      T(`See CMM ${a.cmm}, DESCRIPTION AND OPERATION section for more details`, x0 - 30, y - 12, F, 10); y -= 34;
    }
  }
  return await doc.save();
}
async function build04(p, cmm, opts={}){
  const K = await faaKit(), {doc, F, FB, H, HB, HI, LT, INK, NAVY, GREY, LINE, wrap, logo, PDFDocument, rgb} = K, se = getSE(p);
  doc.setTitle(pdfSafe(`04 Evidences S-Ev ${cmm || p.desc}`));
  const cover = (lines) => { const pg = doc.addPage(LT); logo(pg, LT[0]/2 - 70, LT[1] - 120, 2);
    const c1 = 'FAA CRS #APAY048E', c2 = cmm ? `CMM ${cmm}` : (p.cmm||[]).join(' / ');
    pg.drawText(c1, {x:(LT[0] - HB.widthOfTextAtSize(c1, 12))/2, y:LT[1] - 168, size:12, font:HB, color:INK}); pg.drawText(pdfSafe(c2), {x:(LT[0] - H.widthOfTextAtSize(pdfSafe(c2), 12))/2, y:LT[1] - 186, size:12, font:H, color:INK});
    if (lines){ const bw = 300, bh = 22 + lines.length * 20, bx = (LT[0]-bw)/2, by = LT[1]/2 - bh/2;
      pg.drawRectangle({x:bx, y:by, width:bw, height:bh, borderColor:GREY, borderWidth:0.8});
      lines.forEach(([t, f], i) => { const s = pdfSafe(t), fz = f === HB ? 13 : 12; pg.drawText(s, {x:(LT[0] - f.widthOfTextAtSize(s, fz))/2, y:by + bh - 26 - i*20, size:fz, font:f, color:INK}); }); }
    return pg; };
  cover(null);
  const ev = evOfProj(p.id).filter(e => (opts.draft ? revOf(e.id) !== 'rechazada' : revOf(e.id) === 'aprobada') && (!e.cmm || !cmm || e.cmm === cmm));
  const order = e => { const sk = itemSecKey(p, e.itemId); if (!sk) return -1; const s = p.sections.find(x => x.key === sk); return s.items.findIndex(i => i.id === e.itemId); };
  const idx = []; let missing = 0;
  for (const c of QC021){
    const divTxt = (se.div[c.ch] ?? c.div).split('\n');
    cover([[`EVIDENCES CHECKLIST ${c.ch}`, H], [c.t.replace(/\.$/, '').toUpperCase(), HB], ...divTxt.map(t => [t, HI])]);
    const list = ev.filter(e => chOf(p, e) === c.ch).sort((a,b) => order(a) - order(b) || (a.at||'').localeCompare(b.at||''));
    for (const e of list){
      const sk = itemSecKey(p, e.itemId), it = sk ? p.sections.find(x => x.key === sk).items.find(i => i.id === e.itemId) : null;
      idx.push([c.ch, it ? it.title : '', e.filename]);
      try { const r = await fetch(assetUrl(e.assetId)); if (!r.ok) throw new Error('HTTP ' + r.status); const buf = new Uint8Array(await r.arrayBuffer());
        const ct = (e.contentType||'').toLowerCase(), nm = (e.filename||'').toLowerCase();
        if (ct.includes('pdf') || nm.endsWith('.pdf')){ const src = await PDFDocument.load(buf, {ignoreEncryption:true}); (await doc.copyPages(src, src.getPageIndices())).forEach(pg => doc.addPage(pg)); }
        else if (/image\/(png|jpe?g)/.test(ct) || /\.(png|jpe?g)$/.test(nm)){
          const img = (sniffImg(buf) || (ct.includes('png') ? 'png' : 'jpg')) === 'png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
          const pg = doc.addPage(LT), M = 50, top = LT[1] - 50;
          logo(pg, M, top - 22, 0.7); pg.drawText('FAA 145 CRS# APAY048E', {x:M, y:top - 40, size:7, font:HB, color:INK});
          const ttl = c.ch === 'II' ? 'SPECIAL TOOLS EVIDENCE' : c.ch === 'I' ? 'HOUSING AND FACILITIES EVIDENCE' : 'PHOTO EVIDENCE';
          pg.drawText(ttl, {x:LT[0] - M - HB.widthOfTextAtSize(ttl, 13), y:top - 18, size:13, font:HB, color:NAVY});
          pg.drawRectangle({x:M, y:top - 96, width:LT[0] - 2*M, height:40, borderColor:LINE, borderWidth:0.7});
          pg.drawText('Description', {x:M + 6, y:top - 70, size:8, font:H, color:GREY});
          const desc = [it ? it.title : '', it?.pn ? 'P/N ' + it.pn : '', e.cmm ? 'CMM ' + e.cmm : ''].filter(Boolean).join(' · ') || e.filename.replace(/\.[^.]+$/, '');
          pg.drawText(pdfSafe(desc).slice(0, 90), {x:M + 6, y:top - 86, size:11, font:HB, color:INK});
          const bw = LT[0] - 2*M, bh = top - 110 - 60, s = Math.min(bw / img.width, bh / img.height);
          pg.drawRectangle({x:M, y:60, width:bw, height:bh, borderColor:LINE, borderWidth:0.7});
          pg.drawImage(img, {x:M + (bw - img.width*s)/2, y:60 + (bh - img.height*s)/2, width:img.width*s, height:img.height*s});
        } else throw new Error('formato no anexable (' + (e.filename.split('.').pop()) + ')');
      } catch(err){ missing++; const pg = doc.addPage(LT); pg.drawText(pdfSafe(`${e.filename}: ${err.message || 'error'}`), {x:50, y:LT[1] - 80, size:10, font:HB, color:rgb(0.7,0.14,0.1)}); }
    }
  }
  return {bytes: await doc.save(), n: ev.length, missing, idx};
}
async function saveBytes(bytes, name){
  if (RT.dl) { await RT.dl.save({filename:name, data:new Blob([bytes], {type:'application/pdf'})}); flash('Documento generado: ' + name); }
  else if (!window.claude) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); a.download = name; a.click(); flash('Documento generado: ' + name); }
  else flash('La descarga no está disponible en esta vista.', true);
}
async function genFaa(p, kind, btn, cmm){
  btn.disabled = true; const t0 = btn.textContent; btn.textContent = 'Generando…';
  try {
    if (kind === 'qc020') await saveBytes(await buildQC020(p), `QC-020_Equivalency_Summary_${pdfSafe(p.desc).replace(/[^\w]+/g,'_')}_${today()}.pdf`);
    else if (kind === '03') await saveBytes(await build03(p), `03_Self-Evaluation_Checklist_${pdfSafe(getSE(p).hdr.mfr || p.id).replace(/[^\w]+/g,'_')}_${today()}.pdf`);
    else { const draft = !!$('#d04draft')?.checked; const r = await build04(p, cmm, {draft});
      await saveBytes(r.bytes, `04_Evidences_S-Ev_${cmm || p.id}${draft ? '_BORRADOR' : ''}_${today()}.pdf`);
      if (!r.n) flash(`El 04 salió solo con portada y separadores: no hay evidencias ${draft ? 'cargadas' : 'aprobadas'} para ${cmm || 'el proyecto'}.`, true);
      else if (r.missing) flash(`${r.missing} evidencia(s) no se pudieron anexar (formato no PDF/JPG/PNG).`, true); }
  } catch(e){ console.error(e); flash('No se pudo generar: ' + (e.message || e), true); }
  btn.disabled = false; btn.textContent = t0;
}
function faaDocsHtml(p){
  if (!p || !isFAA(p) || isAir(p) || p.tipo === 'Certificación extranjera') return '';
  const cm = cmmsOf(p), se = getSE(p), chk = seChecks(p, se);
  return `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><b>Presentación FAA · mismo orden de temas I–VI</b>
    <div class="note2" style="margin:6px 0">03 = Self-Evaluation Checklist (Form QC-021 Rev.2) con Anexo A. 04 = Evidences, uno por CMM: portada, separadores "Evidences Checklist I–VI" y las evidencias de cada capítulo en orden. La carta (01) y la lista de capacidades (02) quedan fuera.
      ${chk.length ? `<br><span style="color:var(--bad)">${chk.length} observación(es) de forma en la autoevaluación: revísalas en el expediente antes de emitir.</span>` : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn pri" data-faa="qc020">QC-020 · Tablas A y B</button><button class="btn pri" data-faa="03">03 · Self-Evaluation (QC-021)</button>
      ${(cm.length ? cm : ['']).map(c => `<button class="btn pri" data-faa="04" data-cmm="${esc(c)}">04 · Evidences ${c ? 'CMM ' + esc(c) : ''}</button>`).join('')}
      <label style="font-size:12.5px"><input type="checkbox" id="d04draft"> Borrador: incluir evidencias por revisar</label></div></div>`;
}

// ---------- autoevaluación firmada (PDF) y lectura con Claude
function autoevalHtml(p){
  const L = evOfProj(p.id).filter(e => e.tipo === 'autoeval');
  return `<div class="aebox"><b>Autoevaluación firmada (PDF)</b>
    ${L.map(e => `<div class="ev"><a href="#" class="lnk" data-view="${esc(e.id)}">${esc(e.filename)}</a>${viaClaude(e)}${e.fechaDoc ? `<span class="log">${esc(fmt(e.fechaDoc))}</span>` : ''}
      ${isAdmin() && RT.sample ? `<button class="btn sm" data-aeread="${esc(e.id)}" title="Claude lee el PDF y propone las respuestas para la tabla">🤖 Leer con Claude y llenar la tabla</button>` : ''}</div>`).join('') || '<div class="log">Sin PDF. Súbelo si ya tienes la autoevaluación firmada: queda como respaldo y Claude puede leerla para llenar la tabla.</div>'}
    ${canUpload() ? '<button class="btn sm" id="aeUp">📎 Subir autoevaluación (PDF)</button>' : ''}
    ${isAdmin() && !RT.sample ? '<div class="log">La lectura con Claude no está disponible en esta vista.</div>' : ''}</div>`;
}
async function pdfImages(blob, maxPages){
  const lib = await loadPdfjs(), doc = await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise, out = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++){
    const pg = await doc.getPage(i), v0 = pg.getViewport({scale:1}), v = pg.getViewport({scale: 1500 / Math.max(v0.width, v0.height)});
    const cv = document.createElement('canvas'); cv.width = Math.round(v.width); cv.height = Math.round(v.height); const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,cv.width,cv.height);
    await pg.render({canvasContext:g, viewport:v}).promise; out.push(await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8)));
  }
  return {imgs:out, total:doc.numPages};
}
async function seRead(p, ev, btn){
  if (!ev || !RT.sample) return; const t0 = btn.textContent; btn.disabled = true;
  try {
    btn.textContent = 'Preparando páginas…';
    const blob = await (await fetch(assetUrl(ev.assetId))).blob(), isPdf = (ev.contentType || '').includes('pdf');
    const {imgs, total} = isPdf ? await pdfImages(blob, 12) : {imgs:[blob], total:1};
    let per = 5; try { const lim = await RT.sample.limits(); per = Math.max(1, Math.min(8, lim?.images?.maxCount || 5)); } catch(e){}
    const qs = QC021.flatMap(c => c.q.map(([l, q]) => `${c.ch}.${l}: ${q}`)).join('\n');
    const prompt = `Estas imágenes son páginas escaneadas de un formulario "Self-Evaluation Checklist" (Form QC-021) de una estación reparadora FAA. Transcribe EXACTAMENTE lo que está escrito, sin inventar ni corregir.
Preguntas del formulario (clave: texto):
${qs}
Para cada pregunta que aparezca en estas páginas indica la casilla marcada con X (yes, no o na) y el texto completo de "Ref.:" con sus saltos de línea (\\n) y su numeración tal como está. Si en estas páginas aparecen: Part Number, Manufacturer, Description, nombres y fechas de firma del Quality Control Manager y del Accountable Manager (fecha en formato YYYY-MM-DD), o la tabla del Annex A (Variant, Name, Part Number por CMM), inclúyelos. Omite lo que no esté en estas páginas.
Responde solo JSON: {"hdr":{"pn":"","mfr":"","desc":""},"ans":{"I.a":{"a":"yes|no|na","ref":"..."}},"qcm":{"name":"","date":""},"am":{"name":"","date":""},"annex":[{"cmm":"25-63-05","rows":[["A","nombre","P/N"]]}],"notas":"observaciones de legibilidad"}`;
    const R = {hdr:{}, ans:{}, qcm:{}, am:{}, annex:[], notas:[]};
    for (let i = 0; i < imgs.length; i += per){
      btn.textContent = `Claude está leyendo páginas ${i + 1}–${Math.min(i + per, imgs.length)} de ${imgs.length}…`;
      const r = await RT.sample.json(prompt, {images: imgs.slice(i, i + per), modelTier:'complex'});
      if (!r || typeof r !== 'object') continue;
      for (const k of ['hdr','qcm','am']) Object.entries(r[k] || {}).forEach(([a, v]) => { if (v) R[k][a] = String(v); });
      Object.entries(r.ans || {}).forEach(([k, v]) => { if (v && /^(VI|V|IV|III|II|I)\.[a-h]$/.test(k)) R.ans[k] = {a: ['yes','no','na'].includes(v.a) ? v.a : '', ref: String(v.ref || '')}; });
      (r.annex || []).forEach(a => { if (a && a.cmm && Array.isArray(a.rows)) R.annex.push({cmm:String(a.cmm), rows:a.rows.filter(Array.isArray).map(x => x.slice(0,3).map(String))}); });
      if (r.notas) R.notas.push(String(r.notas));
    }
    seReview(p, R, total > imgs.length ? `Se leyeron las primeras ${imgs.length} de ${total} páginas.` : '');
  } catch(e){ flash(e && e.code === 'not_granted' ? 'Claude no está autorizado en esta página.' : e && e.code === 'rate_limited' ? 'Claude está ocupado; intenta en unos minutos.' : 'No se pudo leer el PDF (' + (e.code || e.message || 'error') + ').', true); }
  btn.disabled = false; btn.textContent = t0;
}
function seReview(p, R, nota){
  const cur = getSE(p), rows = [];
  const add = (key, label, now, read) => { if (read == null || read === '') return; rows.push({key, label, now:String(now ?? ''), read:String(read), same:String(now ?? '').trim() === String(read).trim()}); };
  add('hdr.pn','Part Number', cur.hdr.pn, R.hdr.pn); add('hdr.mfr','Manufacturer', cur.hdr.mfr, R.hdr.mfr); add('hdr.desc','Description', cur.hdr.desc, R.hdr.desc);
  for (const c of QC021) for (const [l] of c.q){ const k = c.ch + '.' + l, v = R.ans[k]; if (!v) continue;
    add('a.' + k, k + ' respuesta', cur.ans[k].a, v.a); add('r.' + k, k + ' Ref.', cur.ans[k].ref, v.ref); }
  add('qcm.name','QC Manager', cur.qcm.name, R.qcm.name); add('qcm.date','Fecha QC Manager', cur.qcm.date, R.qcm.date); add('am.name','Accountable Manager', cur.am.name, R.am.name); add('am.date','Fecha Accountable Manager', cur.am.date, R.am.date);
  R.annex.forEach((a, i) => add('x.' + i, 'Anexo A · CMM ' + a.cmm, (cur.annex.find(z => z.cmm === a.cmm)?.rows || []).map(r => r.join(' ; ')).join('\n'), a.rows.map(r => r.join(' ; ')).join('\n')));
  const vw = document.createElement('div'); vw.id = 'viewer'; document.body.appendChild(vw);
  vw.innerHTML = `<div class="vbox"><div class="vbar"><b>Lectura de Claude · revisa antes de aplicar</b><span style="margin-left:auto"></span><button class="btn sm" data-vclose>Cerrar ✕</button></div><div class="vbody" style="background:var(--card,#fff)">
    <div class="note2" style="margin:0 0 8px">${rows.length} campo(s) leídos · ${rows.filter(r => !r.same).length} distintos de lo que hay en la tabla. Marca los que quieres aplicar. Claude transcribe, pero puede equivocarse en un escaneo: revisa lo distinto. ${esc(nota)} ${R.notas.length ? '<br>Notas de Claude: ' + esc(R.notas.join(' · ')) : ''}</div>
    <table class="items"><thead><tr><th></th><th>Campo</th><th>En la tabla</th><th>Leído del PDF</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr ${r.same ? 'style="opacity:.55"' : ''}><td><input type="checkbox" data-sr="${i}" ${r.same ? '' : 'checked'}></td><td><b>${esc(r.label)}</b>${r.same ? '<div class="log">igual</div>' : ''}</td><td style="white-space:pre-line;font-size:12px">${esc(r.now) || '—'}</td><td style="white-space:pre-line;font-size:12px">${esc(r.read)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Claude no encontró campos del formulario en el archivo.</td></tr>'}</tbody></table>
    <div style="margin-top:10px"><button class="btn pri" id="srGo">Aplicar seleccionados</button></div></div></div>`;
  vw.querySelector('[data-vclose]').onclick = () => vw.remove();
  $('#srGo').onclick = async () => {
    const pick = [...vw.querySelectorAll('[data-sr]:checked')].map(i => rows[+i.dataset.sr]); if (!pick.length) return vw.remove();
    const q = JSON.parse(JSON.stringify(store.proj.get(p.id))), se = getSE(q);
    for (const r of pick){ const [t, ...rest] = r.key.split('.'), k = rest.join('.');
      if (t === 'hdr') se.hdr[k] = r.read; else if (t === 'qcm' || t === 'am') se[t][k] = r.read;
      else if (t === 'a') se.ans[k].a = r.read; else if (t === 'r') se.ans[k].ref = r.read;
      else if (t === 'x'){ const a = R.annex[+k], ex = se.annex.find(z => z.cmm === a.cmm); ex ? ex.rows = a.rows : se.annex.push({cmm:a.cmm, rows:a.rows}); } }
    q.se = seStore(se); await saveProj(q); logAct('lee con Claude', 'proj/' + p.id, `${pick.length} campos aplicados desde PDF`); flash(`${pick.length} campo(s) aplicados a la autoevaluación.`); vw.remove();
  };
}

const viaClaude = e => (e.via === 'claude' || /chat/i.test(e.ruta || '')) ? `<span class="b b-x" title="Cargado por Claude desde un chat${e.cargadoPor ? ' de ' + esc(e.cargadoPor) : ''}">🤖 Cargado vía Claude</span>` : '';
