// Fantrax answers, cached in the browser (2026-10-26): a page draws at once from the last answers it saved, then asks Fantrax
// again in the background and redraws only if something changed. One copy for every page (it replaced the per-page fxGet).
// Draft data is never cached: it feeds the picks and so the Model pick. Pure over a storage and a fetcher, so Node can test it.
(function (root) {
  'use strict';
  const PREFIX = 'courtside-fx-v1:', DAY = 864e5;
  const MAX_AGE = { players: 7 * DAY }, DEF_AGE = DAY, NEVER = { draft: 1 };

  // One Fantrax call through the sync service. Errors: 'offline' (no answer), 'nohost' (not the hosted site), else Fantrax's own.
  async function fxFetch(what, id, fetchFn, onResponse) {
    const f = fetchFn || ((u, o) => fetch(u, o));
    let r; try { r = await f('api/fantrax?what=' + what + (id ? '&leagueId=' + encodeURIComponent(id) : ''), { cache: 'no-store' }); } catch (e) { throw new Error('offline'); }
    const type = r.headers.get('content-type') || ''; if (!type.includes('json')) throw new Error('nohost');
    let body; try { body = await r.json(); } catch (e) { throw new Error('nohost'); }
    if (r.status === 404 && !(body && body.error)) throw new Error('nohost');
    if (!r.ok || body.error) { const er = new Error(body.error || ('Fantrax answered ' + r.status)); er.status = r.status; throw er; }
    if (onResponse) onResponse(r);
    return body;
  }

  const local = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => localStorage.setItem(k, v),
    remove: k => { try { localStorage.removeItem(k); } catch (e) {} },
    keys: () => { try { return Object.keys(localStorage); } catch (e) { return []; } } };

  function create(opts) {
    const st = opts.storage || local, fetcher = opts.fetcher || ((w, id) => fxFetch(w, id, null, opts.onResponse)), now = opts.now || Date.now;
    const key = (what, id) => PREFIX + what + ':' + (id || '');

    // the saved answer, or null when there is none, it is unreadable or it is too old to show
    function peek(what, id) {
      if (NEVER[what]) return null;
      let e; try { e = JSON.parse(st.get(key(what, id)) || 'null'); } catch (x) { return null; }
      if (!e || typeof e.at !== 'number' || typeof e.json !== 'string' || now() - e.at > (MAX_AGE[what] || DEF_AGE)) return null;
      let body; try { body = JSON.parse(e.json); } catch (x) { return null; }
      return { body, at: e.at, json: e.json };
    }
    // keep one league per kind of answer; a full or blocked storage just means no cache
    function store(what, id, json) {
      const k = key(what, id), lead = PREFIX + what + ':';
      try { st.keys().forEach(x => { if (x.startsWith(lead) && x !== k) st.remove(x); }); } catch (e) {}
      try { st.set(k, JSON.stringify({ at: now(), json })); } catch (e) {}
    }
    async function fetchOne(what, id) {
      const body = await fetcher(what, id);
      if (NEVER[what]) return { body };
      const json = JSON.stringify(body);
      store(what, id, json);
      return { body, json };
    }
    const live = async (what, id) => (await fetchOne(what, id)).body;

    // specs = [[what, leagueId?], ...]. onCached(bodies, at) only if every piece is saved; onFresh(bodies, at, changed) after
    // the live answers; onError(error, hadCached) if a live call fails (the cached view stays).
    async function swr(specs, hooks) {
      const hit = specs.map(s => peek(s[0], s[1])), had = hit.every(Boolean);
      const fresh = Promise.all(specs.map(s => fetchOne(s[0], s[1]))); fresh.catch(() => {});   // started before drawing; handled below
      if (had) await hooks.onCached(hit.map(h => h.body), Math.min.apply(null, hit.map(h => h.at)));
      let res; try { res = await fresh; } catch (e) { await hooks.onError(e, had); return; }
      await hooks.onFresh(res.map(r => r.body), now(), !had || res.some((r, i) => r.json !== hit[i].json));   // against what the page drew, not what storage holds now
    }
    return { peek, live, swr };
  }

  const api = { PREFIX, fxFetch, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FxCache = api;
})(this);
