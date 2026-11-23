// =====================================================================================
// Adaptador local: reemplaza las capacidades de claude.ai (db, assets, downloads, user, sample)
// por el servidor local (server.py). La plataforma original llama `window.claude.use(nombre)`;
// aquí se entrega la misma interfaz, así las reglas de la plataforma (semáforo, avance, PDF,
// lectura, respaldo) corren sin cambios.
// =====================================================================================
(() => {
  const CFG = window.APAS_LOCAL || {};
  const H = {'X-APAS': '1'};
  const api = async (method, url, body, extra) => {
    const r = await fetch(url, {method, headers: {...H, ...(body !== undefined && !(body instanceof Blob) ? {'Content-Type': 'application/json'} : {}), ...(extra || {})},
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body)});
    let j = null; try { j = await r.json(); } catch(e){}
    if (!r.ok){ const e = new Error((j && j.message) || ('HTTP ' + r.status)); e.code = (j && j.error) || 'unavailable'; throw e; }
    return j;
  };
  const deep = o => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------------ db
  const cache = {}, listeners = {}, revs = {};
  const snapOf = c => { const docs = (cache[c] || []).map(d => ({id: d.id, exists: true, data: () => deep(d.data), metadata: {fromCache: false, hasPendingWrites: false}}));
    return {docs, size: docs.length, empty: !docs.length, metadata: {fromCache: false, hasPendingWrites: false}, docChanges: () => docs.map((doc, i) => ({type: 'added', doc, oldIndex: -1, newIndex: i}))}; };
  async function refresh(c){
    const j = await api('GET', '/api/col/' + c);
    cache[c] = j.docs; revs[c] = j.rev;
    (listeners[c] || []).forEach(l => { try { l.next(snapOf(c)); } catch(e){ console.error(e); } });
  }
  let watching = false;
  async function watch(){
    if (watching) return; watching = true;
    for (;;){
      try {
        const j = await (await fetch('/api/watch?revs=' + encodeURIComponent(JSON.stringify(revs)))).json();
        const changed = Object.keys(j.revs).filter(c => listeners[c] && j.revs[c] !== revs[c]);
        await Promise.all(changed.map(refresh));
        Object.keys(j.revs).forEach(c => { if (!listeners[c]) revs[c] = j.revs[c]; });
      } catch(e){ await new Promise(r => setTimeout(r, 3000)); }
    }
  }
  const after = c => listeners[c] ? refresh(c).catch(() => {}) : Promise.resolve();
  const docRef = (c, id) => ({
    id, path: c + '/' + id,
    get: async () => { const d = (await api('GET', '/api/col/' + c)).docs.find(x => x.id === id); return {id, exists: !!d, data: () => d ? deep(d.data) : undefined}; },
    set: async d => { await api('PUT', `/api/doc/${c}/${encodeURIComponent(id)}`, d); await after(c); },
    update: async d => { await api('PATCH', `/api/doc/${c}/${encodeURIComponent(id)}`, d); await after(c); },
    delete: async () => { await api('DELETE', `/api/doc/${c}/${encodeURIComponent(id)}`); await after(c); },
    onSnapshot: (next, err) => colRef(c).onSnapshot(s => { const d = s.docs.find(x => x.id === id); next(d || {id, exists: false, data: () => undefined, metadata: {fromCache: false}}); }, err),
  });
  const colRef = c => ({
    path: c,
    doc: id => docRef(c, id || Math.random().toString(36).slice(2, 12) + Date.now().toString(36)),
    add: async d => { const j = await api('POST', '/api/col/' + c, d); await after(c); return docRef(c, j.id); },
    get: async () => { await refresh(c); return snapOf(c); },
    onSnapshot: (next, error) => {
      const l = {next, error}; (listeners[c] = listeners[c] || []).push(l);
      if (cache[c]) setTimeout(() => next(snapOf(c)), 0); else refresh(c).catch(e => error && error({code: 'unavailable', message: e.message}));
      watch();
      return () => { listeners[c] = (listeners[c] || []).filter(x => x !== l); };
    },
  });
  // APAS_COLMAP: un módulo puede usar nombres cortos (edits, rel, log) que se guardan en sus propias tablas (herr_edits…)
  const M = c => (window.APAS_COLMAP || {})[c] || c;
  const db = {collection: c => colRef(M(c)), doc: p => { const [c, id] = p.split('/'); return docRef(M(c), id); }};

  // ------------------------------------------------------------------ assets
  const assets = {
    upload: async f => {
      const j = await api('POST', '/api/blob', f, {'Content-Type': f.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name || 'archivo')});
      return j;
    },
    delete: async id => { /* la versión local conserva los archivos: quedan en el almacén y en los respaldos */ return true; },
    list: async () => ({assets: []}),
  };

  // ------------------------------------------------------------------ downloads (descarga directa del navegador)
  const downloads = {save: async ({filename, data}) => {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return {status: 'saved'};
  }};

  // ------------------------------------------------------------------ user (sin cuentas: quien opera es el dueño local)
  const actor = () => { try { return localStorage.getItem('apas_actor') || CFG.actor || 'local'; } catch(e){ return CFG.actor || 'local'; } };
  const user = {isOwner: async () => true, canEdit: async () => true, can: async () => true, id: async () => 'local:' + actor(), me: async () => ({id: 'local:' + actor(), name: actor()}), profiles: async ids => Object.fromEntries((ids || []).map(i => [i, {name: String(i).replace(/^local:/, '')}]))};
  window.APAS_ACTOR = actor;
  window.APAS_SET_ACTOR = n => { try { localStorage.setItem('apas_actor', n); } catch(e){} };

  // ------------------------------------------------------------------ sample (lectura con Claude vía servidor)
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  const sniff = async b => { if (b.type && b.type.startsWith('image/')) return b.type; const h = new Uint8Array(await b.slice(0, 4).arrayBuffer());
    return h[0] === 0x89 ? 'image/png' : h[0] === 0xff ? 'image/jpeg' : h[0] === 0x47 ? 'image/gif' : 'image/webp'; };
  async function call(input, opts = {}){
    const images = [];
    for (const im of opts.images || []) images.push({media_type: await sniff(im), data: await b64(im)});
    return api('POST', '/api/claude', {prompt: input, images, tier: opts.modelTier || 'default'});
  }
  const parseJson = t => { let s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch(e){}
    const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch(e){} }
    const e = new Error('Claude no devolvió JSON válido'); e.code = 'transform_error'; e.text = t; throw e; };
  let sample = null;
  if (CFG.claude && CFG.claude.disponible){
    sample = async (input, opts) => { const r = await call(input, opts); if (opts && opts.onText) opts.onText({text: r.text, delta: r.text}); return {text: r.text, truncated: r.truncated}; };
    sample.json = async (input, opts) => parseJson((await call(input, opts)).text);
    sample.limits = async () => ({images: {maxCount: (CFG.claude && CFG.claude.maxImagenes) || 8}});
  }

  window.claude = {use: async n => ({db, assets, downloads, user, sample})[n] ?? null};
})();
