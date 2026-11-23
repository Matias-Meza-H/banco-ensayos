// Verificación 5: genera QC-020, 03 y 04 (uno por CMM) del ELT (P003) y del Thrust Reverser (P001)
// con el código real de la plataforma y cuenta las páginas. Esperado: 04 ELT 25-63-05 = 51 págs., 25-63-08 = 50 págs.
// Uso: node tests/documentos.js <url> <carpeta de salida>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [url, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, {recursive: true});
  const b = await chromium.launch(); const pg = await b.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(url); await pg.waitForFunction(() => typeof loaded !== 'undefined' && loaded.proj === true && store.evid.size > 0); await pg.waitForTimeout(800);
  const res = await pg.evaluate(async () => {
    const out = [], b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const pages = async bytes => (await PDFLib.PDFDocument.load(bytes)).getPageCount();
    for (const id of ['P003', 'P001']){
      const p = upgrade(store.proj.get(id));
      const q = await buildQC020(p); out.push({id, doc: 'QC-020', pages: await pages(q), b64: b64(q)});
      const t = await build03(p); out.push({id, doc: '03', pages: await pages(t), b64: b64(t)});
      for (const c of (cmmsOf(p).length ? cmmsOf(p) : [''])){
        const r = await build04(p, c, {draft: false});
        const ev = evOfProj(id).filter(e => revOf(e.id) === 'aprobada' && e.ck && (e.cmm === c || !e.cmm)).map(e => e.filename);
        out.push({id, doc: '04 ' + (c || '(sin CMM)'), pages: await pages(r.bytes), evid: r.n, missing: r.missing, anexas: ev, b64: b64(r.bytes)});
      }
    }
    return out;
  });
  for (const r of res){
    const f = path.join(outDir, `${r.id}_${r.doc.replace(/[^\w-]+/g, '_')}.pdf`); fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
    console.log(`${r.id} · ${r.doc}: ${r.pages} páginas${r.evid != null ? ` · ${r.evid} evidencias aprobadas anexadas${r.missing ? `, ${r.missing} sin anexar` : ''}` : ''} → ${f}`);
  }
  const elt = Object.fromEntries(res.filter(r => r.id === 'P003' && r.doc.startsWith('04')).map(r => [r.doc.slice(3), r.pages]));
  const ok = elt['25-63-05'] === 51 && elt['25-63-08'] === 50;
  console.log(`ELT 04: 25-63-05 = ${elt['25-63-05']} (esperado 51) · 25-63-08 = ${elt['25-63-08']} (esperado 50) → ${ok ? 'OK' : 'NO CUADRA'}`);
  console.log('Errores de la página:', errs.length ? errs : 'ninguno');
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
