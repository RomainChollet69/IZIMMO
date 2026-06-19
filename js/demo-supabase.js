/**
 * demo-supabase.js
 * Faux client Supabase pour le MODE DÉMO (bac à sable isolé, sans backend).
 * Reproduit la surface de supabase-js réellement utilisée par l'app
 * (query builder chaînable, auth, storage) en lisant/écrivant un store en
 * sessionStorage (clé 'leon_demo_db'), et neutralise les appels /api/*.
 *
 * Activation : uniquement si sessionStorage['leon_demo'] === '1' (posé par demo.html).
 * Sinon : NO-OP total (coût ~nul pour les vrais utilisateurs).
 *
 * Doit être chargé AVANT js/supabase-config.js, qui fait :
 *   const supabaseClient = window.__LEON_DEMO_CLIENT__ || supabase.createClient(...)
 *
 * Le store est pré-rempli par demo.html à partir de js/demo-data.js (DEMO_SEED).
 */
(function () {
  'use strict';

  // ---- Garde : ne rien faire hors mode démo ----
  if (sessionStorage.getItem('leon_demo') !== '1') return;

  const DEMO_USER_ID = '00000000-0000-4000-8000-000000000000'; // doit matcher anonymize.cjs
  const STORE_KEY = 'leon_demo_db';
  const FAKE_PHONE = '0102030405';

  // ===== Store =====
  function loadDb() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      console.error('[Demo] store illisible', e);
      return {};
    }
  }
  function saveDb(db) {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(db));
  }
  function tableRows(db, table) {
    if (!Array.isArray(db[table])) db[table] = [];
    return db[table];
  }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
  }

  // ===== Utilitaires de filtrage =====
  function likeToRegExp(pattern, insensitive) {
    const esc = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = esc.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp('^' + body + '$', insensitive ? 'i' : '');
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  // Prédicat positif pour un opérateur PostgREST simple (utilisé par .not aussi)
  function makePredicate(col, op, val) {
    switch (op) {
      case 'eq': return (r) => r[col] == val;
      case 'neq': return (r) => r[col] != val;
      case 'gt': return (r) => cmp(r[col], val) > 0;
      case 'gte': return (r) => cmp(r[col], val) >= 0;
      case 'lt': return (r) => cmp(r[col], val) < 0;
      case 'lte': return (r) => cmp(r[col], val) <= 0;
      case 'like': return (r) => r[col] != null && likeToRegExp(val, false).test(r[col]);
      case 'ilike': return (r) => r[col] != null && likeToRegExp(val, true).test(r[col]);
      case 'is': return (r) => (val === null ? r[col] == null : r[col] === val);
      case 'in': return (r) => Array.isArray(val) && val.includes(r[col]);
      default: return () => true;
    }
  }

  // ===== Query builder chaînable & thenable =====
  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.op = 'select';
      this.payload = null;
      this.selectStr = '*';
      this.returning = false; // .select() appelé après insert/update/delete
      this.orders = [];
      this.limitN = null;
      this.rangeFromTo = null;
      this.singleMode = null; // 'single' | 'maybe' | null
      this.upsertOpts = null;
    }

    // --- ops ---
    select(str) {
      if (this.op === 'select') this.selectStr = str || '*';
      else this.returning = true; // insert/update/delete + .select()
      return this;
    }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload) { this.op = 'update'; this.payload = payload; return this; }
    delete() { this.op = 'delete'; return this; }
    upsert(payload, opts) { this.op = 'upsert'; this.payload = payload; this.upsertOpts = opts || {}; return this; }

    // --- filtres ---
    eq(c, v) { this.filters.push(makePredicate(c, 'eq', v)); return this; }
    neq(c, v) { this.filters.push(makePredicate(c, 'neq', v)); return this; }
    gt(c, v) { this.filters.push(makePredicate(c, 'gt', v)); return this; }
    gte(c, v) { this.filters.push(makePredicate(c, 'gte', v)); return this; }
    lt(c, v) { this.filters.push(makePredicate(c, 'lt', v)); return this; }
    lte(c, v) { this.filters.push(makePredicate(c, 'lte', v)); return this; }
    like(c, v) { this.filters.push(makePredicate(c, 'like', v)); return this; }
    ilike(c, v) { this.filters.push(makePredicate(c, 'ilike', v)); return this; }
    is(c, v) { this.filters.push(makePredicate(c, 'is', v)); return this; }
    in(c, v) { this.filters.push(makePredicate(c, 'in', v)); return this; }
    not(c, op, v) { const p = makePredicate(c, op, v); this.filters.push((r) => !p(r)); return this; }
    contains(c, v) {
      this.filters.push((r) => {
        const rv = r[c];
        if (Array.isArray(rv) && Array.isArray(v)) return v.every((x) => rv.includes(x));
        if (rv && typeof rv === 'object' && v && typeof v === 'object') {
          return Object.keys(v).every((k) => rv[k] === v[k]);
        }
        return false;
      });
      return this;
    }
    or(str) {
      // ex: "first_name.ilike.%x%,last_name.ilike.%x%"
      const conds = String(str).split(',').map((c) => {
        const i1 = c.indexOf('.'); const i2 = c.indexOf('.', i1 + 1);
        const col = c.slice(0, i1); const op = c.slice(i1 + 1, i2); const val = c.slice(i2 + 1);
        return makePredicate(col, op, val);
      });
      this.filters.push((r) => conds.some((p) => p(r)));
      return this;
    }

    // --- modifieurs ---
    order(col, opts) { this.orders.push({ col, asc: !opts || opts.ascending !== false }); return this; }
    limit(n) { this.limitN = n; return this; }
    range(from, to) { this.rangeFromTo = [from, to]; return this; }
    single() { this.singleMode = 'single'; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }

    // --- embeds (jointures imbriquées du select) ---
    _embedNames() {
      const names = [];
      const re = /(\w+)\s*\(/g; let m;
      while ((m = re.exec(this.selectStr)) !== null) names.push(m[1]);
      return names;
    }
    _attachEmbeds(db, rows) {
      const embeds = this._embedNames();
      if (!embeds.length) return rows;
      return rows.map((row) => {
        const out = { ...row };
        embeds.forEach((name) => {
          const fkCol = name.replace(/s$/, '') + '_id'; // sellers->seller_id, buyers->buyer_id
          const target = tableRows(db, name);
          if (row[fkCol] !== undefined) {
            // relation to-one
            out[name] = target.find((t) => t.id === row[fkCol]) || null;
          } else {
            // relation to-many (rows pointant vers cette ligne)
            const baseFk = this.table.replace(/s$/, '') + '_id';
            out[name] = target.filter((t) => t[baseFk] === row.id);
          }
        });
        return out;
      });
    }

    // --- exécution ---
    _run() {
      try {
        const db = loadDb();
        const rows = tableRows(db, this.table);

        if (this.op === 'select') {
          let res = rows.filter((r) => this.filters.every((f) => f(r)));
          if (this.orders.length) {
            res = res.slice().sort((a, b) => {
              for (const o of this.orders) { const c = cmp(a[o.col], b[o.col]); if (c !== 0) return o.asc ? c : -c; }
              return 0;
            });
          }
          const count = res.length;
          if (this.rangeFromTo) res = res.slice(this.rangeFromTo[0], this.rangeFromTo[1] + 1);
          if (this.limitN != null) res = res.slice(0, this.limitN);
          res = this._attachEmbeds(db, res).map((r) => ({ ...r }));
          return this._finalize(res, count);
        }

        if (this.op === 'insert' || this.op === 'upsert') {
          const items = Array.isArray(this.payload) ? this.payload : [this.payload];
          const nowIso = new Date().toISOString();
          const inserted = [];
          items.forEach((item) => {
            if (this.op === 'upsert' && this.upsertOpts && this.upsertOpts.onConflict) {
              const keys = String(this.upsertOpts.onConflict).split(',').map((s) => s.trim());
              const existing = rows.find((r) => keys.every((k) => r[k] === item[k]));
              if (existing) { Object.assign(existing, item, { updated_at: nowIso }); inserted.push(existing); return; }
            }
            const rec = { id: item.id || uuid(), created_at: item.created_at || nowIso, ...item };
            rows.push(rec);
            inserted.push(rec);
          });
          saveDb(db);
          return this._finalize(this.returning ? inserted.map((r) => ({ ...r })) : null, inserted.length);
        }

        if (this.op === 'update') {
          const nowIso = new Date().toISOString();
          const updated = [];
          rows.forEach((r) => {
            if (this.filters.every((f) => f(r))) { Object.assign(r, this.payload, { updated_at: r.updated_at !== undefined ? nowIso : r.updated_at }); updated.push(r); }
          });
          saveDb(db);
          return this._finalize(this.returning ? updated.map((r) => ({ ...r })) : null, updated.length);
        }

        if (this.op === 'delete') {
          const kept = []; const removed = [];
          rows.forEach((r) => { (this.filters.every((f) => f(r)) ? removed : kept).push(r); });
          db[this.table] = kept;
          saveDb(db);
          return this._finalize(this.returning ? removed : null, removed.length);
        }

        return { data: null, error: null };
      } catch (error) {
        console.error('[Demo] query error', this.table, error);
        return { data: null, error: { message: String(error) } };
      }
    }

    _finalize(data, count) {
      if (this.singleMode && Array.isArray(data)) {
        if (data.length === 0) {
          return this.singleMode === 'maybe'
            ? { data: null, error: null, count }
            : { data: null, error: { code: 'PGRST116', message: 'No rows found' }, count };
        }
        return { data: data[0], error: null, count };
      }
      return { data, error: null, count };
    }

    then(onF, onR) { return Promise.resolve(this._run()).then(onF, onR); }
    catch(onR) { return this.then(undefined, onR); }
    finally(cb) { return this.then().finally(cb); }
  }

  // ===== Auth factice =====
  function buildDemoUser() {
    const db = loadDb();
    const profile = (db.profiles && db.profiles[0]) || {};
    const fullName = profile.full_name || 'Camille Martin';
    return {
      id: DEMO_USER_ID,
      email: 'exemple@mail.com',
      user_metadata: { full_name: fullName, name: fullName, avatar_url: '', picture: '' },
      app_metadata: {},
    };
  }
  function demoSession() {
    return { access_token: 'demo-token', token_type: 'bearer', user: buildDemoUser() };
  }
  const auth = {
    getSession: async () => ({ data: { session: demoSession() }, error: null }),
    getUser: async () => ({ data: { user: buildDemoUser() }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => { window.location.href = 'demo.html'; return { error: null }; },
    signInWithPassword: async () => ({ data: { session: demoSession(), user: buildDemoUser() }, error: null }),
    signInWithOAuth: async () => ({ data: {}, error: null }),
    signUp: async () => ({ data: { session: demoSession(), user: buildDemoUser() }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  };

  // ===== Storage factice (bucket lead-files) =====
  const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e8eaf6"/><text x="50%" y="50%" font-family="Inter,sans-serif" font-size="18" fill="#667eea" text-anchor="middle" dominant-baseline="middle">Document (démo)</text></svg>');
  function storageFrom() {
    return {
      upload: async (path) => ({ data: { path, id: uuid(), fullPath: path }, error: null }),
      download: async () => ({ data: new Blob([''], { type: 'text/plain' }), error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: PLACEHOLDER_IMG }, error: null }),
      createSignedUrls: async (paths) => ({ data: (paths || []).map((p) => ({ path: p, signedUrl: PLACEHOLDER_IMG })), error: null }),
      getPublicUrl: () => ({ data: { publicUrl: PLACEHOLDER_IMG } }),
      remove: async () => ({ data: [], error: null }),
      list: async () => ({ data: [], error: null }),
    };
  }

  // ===== Client démo =====
  window.__LEON_DEMO_CLIENT__ = {
    from: (table) => new QueryBuilder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth,
    storage: { from: storageFrom },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };

  // ===== Intercepteur fetch : neutralise /api/* (effets de bord + coûts IA) =====
  const realFetch = window.fetch.bind(window);
  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }
  function cannedMessage(body) {
    const ld = (body && body.leadData) || {};
    const who = ld.first_name ? ld.first_name : 'Madame, Monsieur';
    return `Bonjour ${who},\n\nMerci pour votre intérêt. Je reviens vers vous très vite pour convenir d'un créneau.\nÀ très bientôt,\n${(body && body.agentName) || 'Votre conseiller'}\n\n(Message d'exemple généré en mode démo)`;
  }
  function handleApi(path, body) {
    if (path.endsWith('/api/assistant')) {
      const action = body && body.action;
      switch (action) {
        case 'create_event':
        case 'update_event': return { success: true, event: { id: 'demo-evt-' + uuid().slice(0, 8) } };
        case 'delete_event': return { success: true };
        case 'list_events': return { events: [] };
        case 'find_slots':
        case 'suggest_time': return { slots: [] };
        case 'list_visit_requests': return { requests: [] };
        case 'process_visit_request': return { success: true };
        case 'draft_message':
        case 'orchestrate': return { success: true, message: cannedMessage(body), reply: cannedMessage(body) };
        default: return { success: true };
      }
    }
    if (path.endsWith('/api/generate-message')) return { message: cannedMessage(body) };
    if (path.endsWith('/api/generate-social-post')) return { post: 'Post d\'exemple (mode démo).', content: 'Post d\'exemple (mode démo).' };
    if (path.endsWith('/api/generate-study')) return { study: 'Étude de marché indisponible en mode démo.' };
    if (path.endsWith('/api/transcribe')) return { text: '' };
    // parse/analyse/scrape/import : indisponibles en démo (flux secondaires, pas de vrai fichier)
    return { demo: true, error: 'Fonction indisponible en mode démo' };
  }
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/api\//.test(url)) {
      let body = {};
      try { if (init && typeof init.body === 'string') body = JSON.parse(init.body); } catch (e) { /* FormData ou non-JSON */ }
      try { return Promise.resolve(jsonResponse(handleApi(url, body))); }
      catch (e) { return Promise.resolve(jsonResponse({ demo: true, error: String(e) })); }
    }
    return realFetch(input, init);
  };

  console.log('[Demo] Mode démo actif — backend simulé (sessionStorage).');
})();
