// Verificación 6: importa (ya hecho) -> "Sistema › Exportar todo" en la app -> compara con el JSON original.
// Diferencias aceptadas y declaradas: _meta, _calc, la línea 02.00.00 agregada al inicio de `versiones`
// y lo que la app agrega sola al abrirse: líneas nuevas del `registro` (actualización, ingreso, respaldo) y la foto semanal en `snapshots_informes`.
// Todo lo original debe quedar intacto, byte a byte en su contenido.
// Uso: node tests/ida_y_vuelta.js <url> <datos_completos.json original> [salida.zip]
const { chromium } = require('playwright');
const fs = require('fs'), zlib = require('zlib');
function unzipEntry(buf, name){ // lector mínimo de zip (método STORE o DEFLATE)
  let i = buf.length - 22; while (buf.readUInt32LE(i) !== 0x06054b50) i--;
  let p = buf.readUInt32LE(i + 16); const n = buf.readUInt16LE(i + 10);
  for (let k = 0; k < n; k++){ const m = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), fl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const fn = buf.slice(p + 46, p + 46 + fl).toString('utf8'); if (fn === name){ const lf = buf.readUInt16LE(off + 26), le = buf.readUInt16LE(off + 28); const d = buf.slice(off + 30 + lf + le, off + 30 + lf + le + cs); return m === 0 ? d : zlib.inflateRawSync(d); }
    p += 46 + fl + el + cl; }
  return null;
}
(async () => {
  const [url, origPath, out] = process.argv.slice(2);
  const O = JSON.parse(fs.readFileSync(origPath, 'utf8'));
  const b = await chromium.launch(); const pg = await b.newPage({acceptDownloads: true});
  await pg.clock.install({time: new Date(O._meta.generado)});
  await pg.goto(url + '#sistema'); await pg.waitForFunction(() => typeof loaded !== 'undefined' && loaded.proj === true); await pg.waitForTimeout(1500);
  await pg.click('[data-stab=exportar]'); await pg.waitForTimeout(300);
  const [dl] = await Promise.all([pg.waitForEvent('download', {timeout: 120000}), pg.click('#exGo')]);
  const zp = out || '/tmp/apas_export_rt.zip'; await dl.saveAs(zp); await b.close();
  const z = fs.readFileSync(zp), N = JSON.parse(unzipEntry(z, 'datos_completos.json').toString('utf8')), M = JSON.parse(unzipEntry(z, 'manifiesto.json').toString('utf8'));
  const dif = [], same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of Object.keys(O)){
    if (k === '_meta') continue;
    if (k === 'proyectos'){ const s = x => x.map(p => { const {_calc, ...r} = p; return r; }); if (!same(s(O[k]), s(N[k]))) dif.push(k);
      const c = O[k].filter((p, i) => !same(p._calc, N[k][i]._calc)).map(p => p.id); if (c.length) dif.push('_calc: ' + c); continue; }
    if (k === 'versiones'){ if (!(N[k][0][0] === '02.00.00' && same(N[k].slice(1), O[k]))) dif.push(k); continue; }
    if (k === 'registro'){ const ids = new Map(N[k].map(r => [r.id, r])); const lost = O[k].filter(r => !same(ids.get(r.id), r)); if (lost.length) dif.push('registro: ' + lost.length + ' líneas originales alteradas');
      console.log(`registro: ${O[k].length} líneas originales intactas + ${N[k].length - O[k].length} nuevas: ${N[k].filter(r => !O[k].some(o => o.id === r.id)).map(r => r.act).join(', ')}`); continue; }
    if (k === 'snapshots_informes'){ const ids = new Map(N[k].map(r => [r.id, r])); const lost = O[k].filter(r => !same(ids.get(r.id), r)); if (lost.length) dif.push('snapshots: ' + lost.length + ' originales alteradas');
      console.log(`snapshots: ${O[k].length} originales intactas + ${N[k].length - O[k].length} nueva(s) creada(s) por la app al abrirla (foto semanal del avance): ${N[k].filter(r => !O[k].some(o => o.id === r.id)).map(r => r.id).join(', ')}`); continue; }
    if (!same(O[k], N[k])) dif.push(k);
  }
  console.log(`Exportación de la app: ${zp} · ${M.archivos.length} archivos · conteos ${JSON.stringify(M.conteos)}`);
  const badFiles = M.archivos.filter(a => { const o = O.archivos.find(x => x.assetId === a.assetId); return !o || o.crc32 !== a.crc32 || o.bytes !== a.bytes; });
  console.log(`Archivos con CRC32/bytes distintos al original: ${badFiles.length}`);
  console.log(dif.length ? 'DIFERENCIAS: ' + dif.join(' | ') : 'Ida y vuelta: sin diferencias (salvo _meta, la línea 02.00.00 de versiones y lo que la app agrega sola: líneas del registro y la foto semanal)');
  process.exit(dif.length || badFiles.length ? 1 : 0);
})();
