// Pruebas de los flujos clave en la aplicación real (Playwright).
// ¡Escribe datos! Correr SIEMPRE contra una COPIA de la base: ver tests/correr_pruebas.sh.
// Uso: node tests/flujos.js <url>
const { chromium } = require('playwright');
const zlib = require('zlib');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const res = []; const ok = (n, c, d = '') => { res.push([c, n, d]); console.log(`${c ? '✔' : '✘'} ${n}${d ? ' · ' + d : ''}`); };

(async () => {
  const url = process.argv[2].replace(/\/$/, '');
  const b = await chromium.launch(); const pg = await b.newPage({viewport: {width: 1400, height: 1000}, acceptDownloads: true});
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  const ready = async (h) => { await pg.goto(url + '/' + h); await pg.waitForFunction(() => typeof loaded !== 'undefined' && loaded.proj === true); await pg.waitForTimeout(700); };
  const until = (fn, arg) => pg.waitForFunction(fn, arg, {timeout: 15000});

  // 1. Crear proyecto por tipo (primero se clasifica)
  await ready('#expedientes');
  for (const [tipo, secs] of [['Componente', 'infra,doc,mat,tools,train,serv'], ['Aeronave', 'carta,dims,toolsTask,train'], ['Certificación extranjera', '']]){
    const [n0, e0] = await pg.evaluate(() => [store.proj.size, eCur]);
    await pg.click('#eNew'); await pg.click(`[data-nt="${tipo}"]`);
    // espera a que la app termine: proyecto nuevo guardado Y seleccionado
    await until(([n, e]) => store.proj.size > n && eCur !== e && store.proj.has(eCur), [n0, e0]);
    const p = await pg.evaluate(() => { const p = store.proj.get(eCur); return {id: p.id, tipo: p.tipo, secs: (p.sections || []).map(s => s.key).join(',')}; });
    ok(`Crear proyecto ${tipo}`, p.tipo === tipo && p.secs === secs, `${p.id} · secciones: ${p.secs || '(proceso por definir)'}`);
  }

  // 2. Subir y aprobar evidencia (foto de una herramienta de P001)
  await pg.evaluate(() => { eCur = 'P001'; render(); }); await pg.waitForTimeout(600);
  const ev0 = await pg.evaluate(() => store.evid.size);
  const upSel = await pg.evaluate(() => { const si = upgrade(store.proj.get('P001')).sections.findIndex(s => s.key === 'tools'); return `[data-up="${si}:0"]`; });
  await pg.click(upSel); await pg.selectOption('#eT', 'foto');
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('#eGo')]);
  await fc.setFiles({name: 'prueba_herramienta.png', mimeType: 'image/png', buffer: PNG});
  await until(n => store.evid.size > n, ev0);
  const evId = await pg.evaluate(() => [...store.evid.values()].filter(e => e.filename === 'prueba_herramienta.png').pop().id);
  ok('Subir evidencia', !!evId, evId);
  await pg.waitForTimeout(500); await pg.click(`[data-ok="${evId}"]`);
  await until(id => store.rev.get(id)?.status === 'aprobada', evId);
  ok('Aprobar evidencia', true, 'revisión aprobada');

  // 3. Lectura -> confirmar (se usa la propuesta de prueba más reciente de P001, no la del QC-020 original)
  const lid = await pg.evaluate(() => [...store.lect.values()].filter(l => l.projId === 'P001' && l.estado === 'pendiente').sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0]?.id);
  if (lid && lid !== 'Lchat-P001-qc020'){
    await pg.evaluate(id => { const b = document.querySelector(`[data-lrev="${id}"]`) || document.querySelector('[data-lrev]'); b.click(); }, lid); await pg.waitForTimeout(500);
    const p0 = await pg.evaluate(() => JSON.stringify(store.proj.get('P001')));
    await pg.click('#lcGo'); await until(id => store.lect.get(id)?.estado === 'aplicada', lid);
    const changed = await pg.evaluate(p0 => JSON.stringify(store.proj.get('P001')) !== p0, p0);
    ok('Lectura → confirmar', changed, `lectura ${lid} aplicada; el expediente cambió solo tras confirmar`);
  } else ok('Lectura → confirmar', false, 'no hay una lectura de prueba pendiente (corre antes tools/lectura_claude_code.js)');
  const orig = await pg.evaluate(() => store.lect.get('Lchat-P001-qc020')?.estado);
  ok('La lectura original del QC-020 sigue pendiente', orig === 'pendiente', String(orig));

  // 4. Roster con previsualización -> Excel (módulo Personal)
  await pg.goto(url + '/#listados'); await pg.waitForTimeout(1500);
  const sr = s => `#persHost >> ${s}`;
  await pg.selectOption(sr('#xAc'), {index: 1}); await pg.waitForTimeout(300);
  await pg.click(sr('#xAll')); await pg.click(sr('#xExport')); await pg.waitForTimeout(400);
  const prev = await pg.isVisible(sr('#pvGen'));
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click(sr('#pvGen'))]);
  const p = await dl.path(); const buf = require('fs').readFileSync(p);
  ok('Roster: previsualización y Excel', prev && buf.slice(0, 2).toString() === 'PK' && dl.suggestedFilename().endsWith('.xlsx'), dl.suggestedFilename());

  // 5. Circular con correlativo (anular no libera el número)
  await ready('#sistema'); await pg.click('[data-stab=circ]');
  const y = new Date().getFullYear();
  for (const t of ['Circular de prueba 1', 'Circular de prueba 2']){ await pg.fill('#ciTi', t); await pg.click('#ciS'); await pg.waitForTimeout(700); }
  await pg.click(`[data-cian="CIR-${y}-002"]`); await pg.fill('td input[placeholder^=Motivo]', 'Prueba de anulación'); await pg.click('td span button'); await pg.waitForTimeout(600);
  await pg.fill('#ciTi', 'Circular de prueba 3'); await pg.click('#ciS'); await pg.waitForTimeout(700);
  const cs = await pg.evaluate(() => [...store.circ.values()].map(c => `${c.cod}:${c.estado}`).sort());
  ok('Circular con correlativo', cs.join(' ') === `CIR-${y}-001:Emitida CIR-${y}-002:Anulada CIR-${y}-003:Emitida`, cs.join(' '));

  // 6. Respaldo (dos generaciones; sin función para borrar)
  await pg.click('[data-stab=respaldo]'); const a0 = await pg.evaluate(() => store.bak.get('A_meta')?.at || '');
  await pg.click('#bkNow'); await until(a => (store.bak.get('A_meta')?.at || '') > a, a0);
  const noDel = await pg.evaluate(() => ![...document.querySelectorAll('#v-sistema button')].some(b => /borrar|eliminar/i.test(b.textContent)));
  ok('Respaldo manual', noDel, 'A_meta actualizado; la pestaña no ofrece borrar');

  // 7. Exportar todo
  await pg.click('[data-stab=exportar]');
  const [dz] = await Promise.all([pg.waitForEvent('download', {timeout: 120000}), pg.click('#exGo')]);
  const z = require('fs').readFileSync(await dz.path());
  ok('Exportar todo', z.slice(0, 2).toString() === 'PK' && z.includes(Buffer.from('datos_completos.json')) && z.includes(Buffer.from('manifiesto.json')), dz.suggestedFilename());

  // 8. Registro de modificaciones con el actor
  const lg = await pg.evaluate(() => [...store.log.values()].filter(l => l.u === SESSION.u).length);
  ok('Registro de modificaciones con actor', lg > 0, `${lg} líneas de “${await pg.evaluate(() => SESSION.u)}”`);

  ok('Sin errores de JavaScript', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  const bad = res.filter(r => !r[0]).length; console.log(`\n${res.length - bad}/${res.length} flujos OK`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
