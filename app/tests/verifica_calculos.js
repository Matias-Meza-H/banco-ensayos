// Verificación 3 con el CÓDIGO JS REAL de la plataforma (en el navegador):
// avance/etapa/semáforo de cada proyecto = _calc de la exportación; personal base+ediciones = personal_vista_actual.
// Uso: node tests/verifica_calculos.js <url> <datos_completos.json>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, jsonPath] = process.argv.slice(2);
  const O = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const gen = O._meta.generado.slice(0, 10);
  const b = await chromium.launch(); const pg = await b.newPage({viewport: {width: 1400, height: 1000}});
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // congela "hoy" en la fecha de la exportación (el semáforo y la vista del personal dependen de la fecha)
  await pg.clock.install({time: new Date(O._meta.generado)});
  await pg.goto(url); await pg.waitForFunction(() => typeof loaded !== 'undefined' && loaded.proj === true, null, {timeout: 20000});
  await pg.waitForTimeout(800);
  const r = await pg.evaluate(O => {
    const out = {dif: [], n: 0};
    for (const op of O.proyectos){ const raw = store.proj.get(op.id); if (!raw){ out.dif.push([op.id, 'no está en la base']); continue; }
      const p = upgrade(raw); const c = {avance: progress(p), etapa: stage(p)[0], semaforo: SEMA[sema(p)][1]}; out.n++;
      if (JSON.stringify(c) !== JSON.stringify(op._calc)) out.dif.push([op.id, op._calc, c]); }
    return out;
  }, O);
  const vista = await pg.evaluate(() => window.__persMerged());
  const dv = vista.map((v, i) => JSON.stringify(v) === JSON.stringify(O.personal_vista_actual[i]) ? null : i).filter(x => x !== null);
  console.log(`Proyectos: ${r.n} calculados con el código JS · ${r.dif.length} difieren de _calc (al ${gen})`);
  r.dif.forEach(d => console.log('  ', JSON.stringify(d)));
  console.log(`Personal: ${vista.length} personas · ${dv.length} difieren de personal_vista_actual${dv.length ? ' → ' + dv.slice(0, 5) : ''}`);
  console.log('Errores de la página:', errs.length ? errs.slice(0, 5) : 'ninguno');
  await b.close();
  process.exit(r.dif.length || dv.length || vista.length !== O.personal_vista_actual.length || errs.length ? 1 : 0);
})();
