window.__persData = DATA;
window.__persMerged = () => P.map(p => { const {ds, counts, text, i, ...r} = p; return JSON.parse(JSON.stringify(r)); });
// ================= BASES Y EDICIÓN DE FICHAS =================
const canEditP = () => !!(window.appCan && window.appCan('pers.edit') && RT.db);
function baseDefaults(){
  const u = k => [...new Set(DATA.personas.map(p => p[k]).filter(v => v && v !== 'x'))].sort((a,b) => a.localeCompare(b,'es'));
  return {puestos:u('puesto').map(n => ({n, d:''})), areas:u('area'), estados:['Activo','Inactivo','Con licencia o permiso'], grupos:['Técnico','Administrativo'], tiposLic:u('tipoLic'),
    especialidades:['Técnico de sistemas','Eléctrico','Aviónico','Aviónico - Eléctrico','Estructura','Motores','Inspector','Ingeniero'], niveles:['Nv1','Nv2','Nv3','Nv4'], ojt:[]};
}
const BKEYS = ['puestos','areas','estados','grupos','tiposLic','especialidades','niveles','ojt'];
function bases(){ const d = baseDefaults(), c = (window.appCfg && window.appCfg('bases')) || {}; BKEYS.forEach(k => { if (Array.isArray(c[k])) d[k] = JSON.parse(JSON.stringify(c[k])); }); return d; }
function persSub(){ if (!RT.db) return; RT.db.collection('pers').onSnapshot(snap => { persDocs.clear(); snap.docs.forEach(d => persDocs.set(d.id, d.data())); rebuildP(); refreshSelects(); renderKpis(); renderList(); route(); }, () => {}); }
window.addEventListener('apas-cfg', () => { if (!$('#v-bases').hidden) renderBases(); });
window.addEventListener('apas-session', () => { try { route(); } catch(e){} });

const sopt = (list, cur, blank) => (blank != null ? `<option value="">${blank}</option>` : '') + [...new Set([...list, ...(cur && !list.includes(cur) ? [cur] : [])])].map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const dctl = (k, v, no) => { const s = isDate(v) ? 'f' : v === 'N/A' ? 'na' : v === 'NO' ? 'no' : 'sin';
  return `<select data-dk="${esc(k)}"><option value="f" ${s==='f'?'selected':''}>Con fecha de vencimiento</option><option value="na" ${s==='na'?'selected':''}>N/A (no aplica)</option>${no ? `<option value="no" ${s==='no'?'selected':''}>NO (no asistió)</option>` : ''}<option value="sin" ${s==='sin'?'selected':''}>Sin registro</option></select>
    <input type="date" data-dd="${esc(k)}" value="${isDate(v) ? v : ''}">`; };
function openEdit(i){
  const isNew = i == null, p = isNew ? {...EMPTY, esps:[]} : P[i], B = bases();
  const f = (l, h) => `<label>${l}${h}</label>`;
  $('#panel').innerHTML = `<div class="phead"><div><h2>${isNew ? 'Agregar persona' : 'Editar ficha · ' + esc(p.nombre)}</h2><div class="sub">Los campos con lista se llenan solo con las opciones definidas en la pestaña Bases.</div></div><button class="close" aria-label="Cerrar">×</button></div>
  <div class="pbody">
    <details open><summary>Datos del profesional</summary><div class="dbody"><div class="eform">
      ${f('Apellido', `<input id="eAp" value="${esc(p.apellido || '')}">`)}${f('Nombre', `<input id="eNo" value="${esc(p.nomRaw || '')}">`)}${f('RUT', `<input id="eRut" value="${esc(p.rut || '')}" placeholder="12.345.678-9">`)}
      ${f('Cargo', `<select id="ePu">${sopt(B.puestos.map(x => x.n), p.puesto, '—')}</select>`)}${f('Área', `<select id="eAr">${sopt(B.areas, p.area, '(Sin área)')}</select>`)}
      ${f('Estado', `<select id="eEs">${sopt(B.estados, p.estado)}</select>`)}${f('Grupo', `<select id="eGr">${sopt(B.grupos, p.grupo)}</select>`)}
      ${f('Tipo de licencia', `<select id="eTl">${sopt(B.tiposLic, p.tipoLic, '—')}</select>`)}${f('N° de licencia', `<input id="eNl" inputmode="numeric" value="${esc(p.nLic ?? '')}">`)}${f('Vencimiento de la licencia', `<input type="date" id="eVl" value="${isDate(p.vencLic) ? p.vencLic : ''}">`)}</div>
      <div style="margin-top:10px;font-size:11.5px;color:var(--muted)">Especialidades / habilitaciones (una o varias)</div><div class="cks" id="eEsp">${[...new Set([...B.especialidades, ...(p.esps || [])])].map(e => `<label class="ck"><input type="checkbox" value="${esc(e)}" ${(p.esps || []).includes(e) ? 'checked' : ''}> ${esc(e)}</label>`).join('')}</div>
      <div class="note">Sin especialidad marcada, se muestra la que se deduce del cargo (${esc(especialidad(p))}).</div></div></details>
    <details open><summary>Cursos generales</summary><div class="dbody">${IND_ALL.map(k => `<div class="erow"><b>${esc(k)}</b>${dctl('g:' + k, (p.generales || {})[k] ?? null)}<span></span></div>`).join('')}</div></details>
    <details open><summary>Aeronaves y motores</summary><div class="dbody">${AC_LIST.map(ac => { const a = (p.acAll || {})[ac] || {}, e = (p.aeronaves || []).find(z => z.aeronave === ac);
      return `<div class="erow"><b>${esc(ac)}</b><select data-acn="${esc(ac)}">${sopt(B.niveles, a.nivel && a.nivel !== 'N/A' ? a.nivel : '', 'Sin curso')}</select><input type="date" data-acv="${esc(ac)}" value="${isDate(a.venc) ? a.venc : ''}">
        <span class="cks" style="margin:0">${(ENG[ac] || []).map(m => `<label class="ck"><input type="checkbox" data-eng="${esc(ac)}|${esc(m)}" ${e && engHas((e.motores.find(z => z.motor === m) || {}).valor) ? 'checked' : ''}> ${esc(m)}</label>`).join('') || '<span style="color:var(--muted);font-size:12px">sin motores definidos</span>'}</span></div>`; }).join('')}
      <div class="note">Nivel y vencimiento del curso de aeronave. Los cursos de motor on wing son one time: se marcan y no vencen.</div></div></details>
    <details><summary>Cursos de operador</summary><div class="dbody">${Object.keys(OP_LIST).map(op => OP_LIST[op].map(c => `<div class="erow"><b>${esc(OP_SHORT[op])} · ${esc(c)}</b>${dctl(`o:${op}|${c}`, ((p.opsAll || {})[op] || {})[c] ?? null, true)}<span></span></div>`).join('')).join('')}</div></details>
    <div id="eMsg" class="msg err" hidden></div>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="eSave">Guardar ficha</button><button class="btn" id="eCancel">Cancelar</button></div>
    <div class="note">Nv4, NDT, cursos por CMM y OJT se mantienen como están; su edición llegará en una próxima versión de datos.</div></div>`;
  $('#ov').classList.add('open'); $('#panel').scrollTop = 0; cur = isNew ? -2 : i;
  const back = () => { isNew ? closeFicha() : openFicha(i); };
  $('#panel .close').onclick = back; $('#eCancel').onclick = back;
  const dval = k => { const st = $(`#panel [data-dk="${CSS.escape(k)}"]`).value, d = $(`#panel [data-dd="${CSS.escape(k)}"]`).value; return st === 'f' ? (d || null) : st === 'na' ? 'N/A' : st === 'no' ? 'NO' : null; };
  $('#eSave').onclick = async () => {
    const err = m => { const e = $('#eMsg'); e.textContent = m; e.hidden = false; };
    const rut = $('#eRut').value.trim(), ap = $('#eAp').value.trim(), no = $('#eNo').value.trim();
    if (!ap && !no) return err('Falta el nombre.'); if (!rut) return err('Falta el RUT.');
    const key = isNew ? rut.replace(/[^0-9kK]/g,'').toUpperCase() : p._id;
    if (isNew && (!key || P.some(q => q._id === key))) return err('Ya existe una persona con ese RUT.');
    const generales = {...(p.generales || {})}; IND_ALL.forEach(k => { if (k in generales || dval('g:' + k) != null) generales[k] = dval('g:' + k); });
    const acAll = {...(p.acAll || {})}, aeronaves = [];
    AC_LIST.forEach(ac => { const o = (p.aeronaves || []).find(z => z.aeronave === ac) || {}, nivel = $(`#panel [data-acn="${CSS.escape(ac)}"]`).value || null, dv = $(`#panel [data-acv="${CSS.escape(ac)}"]`).value;
      const venc = dv || (nivel && o.venc && !isDate(o.venc) ? o.venc : null); acAll[ac] = {...(acAll[ac] || {}), nivel, venc};
      if (nivel || venc) aeronaves.push({...o, aeronave:ac, nivel, venc, motores:(ENG[ac] || []).map(m => { const ov = ((o.motores || []).find(z => z.motor === m) || {}).valor, on = $(`#panel [data-eng="${CSS.escape(ac + '|' + m)}"]`).checked; return {motor:m, valor: on ? (engHas(ov) ? ov : 'SÍ') : 'NO'}; })}); });
    const opsAll = {}, operadores = [];
    Object.keys(OP_LIST).forEach(op => { opsAll[op] = {}; OP_LIST[op].forEach(c => opsAll[op][c] = dval(`o:${op}|${c}`)); if (OP_LIST[op].some(c => opsAll[op][c] != null)) operadores.push({operador:op, cursos:OP_LIST[op].map(c => ({curso:c, valor:opsAll[op][c]}))}); });
    const nl = $('#eNl').value.trim();
    const doc = {rut, apellido:ap, nombre:no, puesto:$('#ePu').value || null, area:$('#eAr').value || null, estado:$('#eEs').value, grupo:$('#eGr').value, tipoLic:$('#eTl').value || null, nLic: nl === '' ? null : (/^\d+$/.test(nl) ? +nl : nl),
      vencLic:$('#eVl').value || (isDate(p.vencLic) ? null : p.vencLic ?? null), esps:[...ROOTQ('#eEsp input:checked')].map(x => x.value), generales, acAll, aeronaves, opsAll, operadores, mod:new Date().toISOString()};
    $('#eSave').disabled = true;
    try { await RT.db.doc('pers/' + key).set(doc); closeFicha(); } catch(e){ err('No se pudo guardar (' + (e.code || e.message || 'error') + ').'); $('#eSave').disabled = false; }
  };
}
$('#pAdd').onclick = () => openEdit(null);

function renderBases(){
  const el = $('#v-bases'), ae = ROOT.activeElement; if (ae && el.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) return;
  const B = bases(), ed = !!(window.appCan && window.appCan('pers.bases'));
  const strList = (k, title, hint) => `<div class="rcard"><h3>${title}</h3><div style="font-size:12px;color:var(--muted);margin-bottom:8px">${hint}</div>
    ${B[k].map((v, n) => `<span class="bitem">${esc(v)}${ed ? `<button data-brm="${k}:${n}" title="Quitar">×</button>` : ''}</span>`).join('') || '<span class="empty">Sin opciones</span>'}
    ${ed ? `<div class="bform"><input data-bin="${k}" placeholder="Nueva opción" style="flex:1;min-width:150px"><button class="btn" data-badd="${k}">Agregar</button></div>` : ''}</div>`;
  el.innerHTML = `<div class="rcard"><h2 style="font-size:16px">Bases de personal</h2><div style="font-size:13px;color:var(--muted);margin-top:4px">Aquí se definen las opciones que aparecen como lista desplegable al editar una ficha. Quien edita solo puede elegir entre estas opciones, así la estructura no se rompe. Quitar una opción no cambia a las personas que ya la tienen.</div></div>
    <div class="rcard"><h3>Cargos y su descripción</h3><table class="rows"><thead><tr><th style="width:240px">Cargo</th><th>Descripción del cargo</th>${ed ? '<th style="width:40px"></th>' : ''}</tr></thead><tbody>
      ${B.puestos.map((x, n) => `<tr><td><b>${esc(x.n)}</b></td><td>${ed ? `<input data-pd="${n}" value="${esc(x.d || '')}" placeholder="Funciones y alcance del cargo" style="width:100%;font:inherit;font-size:13px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)">` : esc(x.d || '—')}</td>${ed ? `<td><button class="btn" data-brm="puestos:${n}">×</button></td>` : ''}</tr>`).join('')}</tbody></table>
      ${ed ? `<div class="bform"><input id="bPn" placeholder="Nuevo cargo" style="width:220px"><input id="bPd" placeholder="Descripción" style="flex:1;min-width:200px"><button class="btn" id="bPa">Agregar cargo</button></div>` : ''}</div>
    <div class="bgrid">${strList('areas','Áreas','Área de trabajo de la persona.')}${strList('especialidades','Especialidades / habilitaciones','Una persona puede tener varias: técnico de sistemas, eléctrico, aviónico, estructura, motores…')}
      ${strList('niveles','Niveles de curso','Niveles aptos para los cursos de aeronave.')}${strList('estados','Estados','Situación de la persona en la empresa.')}${strList('grupos','Grupos','Agrupación general del personal.')}${strList('tiposLic','Tipos de licencia','Tal como aparecen en la licencia.')}</div>
    <div class="rcard"><h3>Tareas de OJT a evaluar</h3><div style="font-size:12px;color:var(--muted);margin-bottom:8px">Catálogo de tareas de entrenamiento en el trabajo. Queda listo para usarlo al registrar OJT por persona.</div>
      <table class="rows"><thead><tr><th>Tarea</th><th style="width:90px">ATA</th><th style="width:200px">Aeronave</th><th style="width:120px">Nivel mínimo</th>${ed ? '<th style="width:40px"></th>' : ''}</tr></thead><tbody>
      ${B.ojt.map((o, n) => `<tr><td>${esc(o.tarea)}</td><td>${esc(o.ata || '—')}</td><td>${esc(o.ac || 'Todas')}</td><td>${esc(o.nivel || '—')}</td>${ed ? `<td><button class="btn" data-brm="ojt:${n}">×</button></td>` : ''}</tr>`).join('') || `<tr><td colspan="5" class="empty">Aún no hay tareas de OJT definidas</td></tr>`}</tbody></table>
      ${ed ? `<div class="bform"><input id="bOt" placeholder="Descripción de la tarea" style="flex:1;min-width:220px"><input id="bOa" placeholder="ATA" style="width:80px"><select id="bOc"><option value="">Todas las aeronaves</option>${AC_LIST.map(a => `<option>${esc(a)}</option>`).join('')}</select><select id="bOn"><option value="">Nivel mínimo</option>${B.niveles.map(a => `<option>${esc(a)}</option>`).join('')}</select><button class="btn" id="bOadd">Agregar tarea</button></div>` : ''}</div>
    <div class="rcard"><h3>Estructura fija en esta versión</h3><div style="font-size:13px;color:var(--muted)">Aeronaves: ${esc(AC_LIST.join(' · '))}<br>Motores: ${esc(Object.entries(ENG).map(([a, m]) => `${AC_SHORT[a]}: ${m.join(', ')}`).join(' · '))}<br>Operadores: ${esc(Object.keys(OP_LIST).join(' · '))}<br>Cursos generales: ${esc(IND_ALL.join(' · '))}<br>Agregar aeronaves, motores, operadores o cursos cambia columnas de todo el sistema: pídemelo y lo incorporo como mejora de datos.</div></div>`;
  if (!ed) return;
  const save = async fn => { try { const b = bases(); fn(b); const out = {}; BKEYS.forEach(k => out[k] = b[k]); if (ROOT.activeElement && ROOT.activeElement.blur) ROOT.activeElement.blur();
      await window.appSaveCfg('bases', out); window.flash && window.flash('Bases guardadas.'); } catch(err){ window.flash && window.flash('No se guardó (' + (err.code || err.message || 'error') + ').', true); } };
  el.querySelectorAll('.bform input').forEach(i => i.onkeydown = ev => { if (ev.key === 'Enter'){ ev.preventDefault(); const b = i.parentElement.querySelector('button'); if (b) b.click(); } });
  el.querySelectorAll('[data-brm]').forEach(b => b.onclick = () => { const [k, n] = b.dataset.brm.split(':'); save(x => x[k].splice(+n, 1)); });
  el.querySelectorAll('[data-badd]').forEach(b => b.onclick = () => { const k = b.dataset.badd, i = el.querySelector(`[data-bin="${k}"]`), v = i.value.trim(); if (!v) return; i.value = ''; save(x => { if (!x[k].includes(v)) x[k].push(v); }); });
  el.querySelectorAll('[data-pd]').forEach(i => { i.onchange = () => { const v = i.value.trim(); save(x => x.puestos[+i.dataset.pd].d = v); }; i.onkeydown = ev => { if (ev.key === 'Enter') i.blur(); }; });
  $('#bPa').onclick = () => { const n = $('#bPn').value.trim(), d = $('#bPd').value.trim(); if (!n) return; $('#bPn').value = $('#bPd').value = ''; save(x => { if (!x.puestos.some(p => p.n === n)) x.puestos.push({n, d}); }); };
  $('#bOadd').onclick = () => { const t = $('#bOt').value.trim(); if (!t) return; const o = {tarea:t, ata:$('#bOa').value.trim(), ac:$('#bOc').value, nivel:$('#bOn').value}; $('#bOt').value = $('#bOa').value = ''; save(x => x.ojt.push(o)); };
}
