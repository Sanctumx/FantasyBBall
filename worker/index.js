// Cloudflare Worker for the Courtside Draft Kit: serves the board (static assets) and proxies Fantrax's public
// "fxea" endpoints at /api/fantrax, so live draft sync works without Netlify. Same API as netlify/functions/fantrax.mjs:
// GET /api/fantrax?what=draft|league|players&leagueId=XXXX
const BASE = 'https://www.fantrax.com/fxea/general/';
const ROUTES = {
  draft:   id => `getDraftResults?leagueId=${id}`,
  league:  id => `getLeagueInfo?leagueId=${id}`,
  players: () => 'getPlayerIds?sport=NBA'
};
// how long browsers / Cloudflare's cache may reuse each answer (seconds)
const CACHE = { draft: 5, league: 300, players: 86400 };

const json = (status, body, maxAge = 0) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store'
  }
});

// Last good answer per request, kept in this Worker instance's memory (2026-10-18): reused while fresh (CACHE seconds) so
// many boards syncing the same league make one Fantrax call, and served (marked stale) when Fantrax rate-limits us, so a
// busy spell doesn't break a draft. Also stored with the Cache API where the zone supports it.
const MEM = new Map(), STALE_MAX = { draft: 600, league: 86400, players: 7 * 86400 };
const keyOf = (what, id) => what + ':' + (what === 'players' ? 'all' : id);
const cacheReq = k => new Request('https://courtside-cache.internal/' + encodeURIComponent(k));
async function remembered(what, id, fresh) {
  const k = keyOf(what, id), m = MEM.get(k), age = m ? (Date.now() - m.at) / 1000 : Infinity;
  if (m && age <= (fresh ? CACHE[what] : STALE_MAX[what])) return m.body;
  try { const r = await caches.default.match(cacheReq(k)); if (r) { const v = await r.json(); const a = (Date.now() - v.at) / 1000; if (a <= (fresh ? CACHE[what] : STALE_MAX[what])) { MEM.set(k, v); return v.body; } } } catch {}
  return null;
}
function remember(what, id, body, ctx) {
  const k = keyOf(what, id), v = { at: Date.now(), body }; MEM.set(k, v);
  if (MEM.size > 500) MEM.delete(MEM.keys().next().value);
  try { const p = caches.default.put(cacheReq(k), new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + STALE_MAX[what] } })); if (ctx) ctx.waitUntil(p.catch(() => {})); } catch {}
}

async function fetchFantrax(path) {
  // Fantrax rate-limits bursts (seen in testing from Cloudflare); wait and retry twice (1.5 s, then 3 s)
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(BASE + path, { headers: { accept: 'application/json', 'user-agent': 'courtside-draft-board' } });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { return { status: r.status, body: null }; }
    const limited = body && body.error && /RATE_LIMITED/i.test(String(body.error.code || ''));
    if (!limited || attempt === 2) return { status: r.status, body };
    await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
  }
}

async function fantrax(req, ctx) {
  const url = new URL(req.url);
  const what = url.searchParams.get('what') || 'draft';
  const leagueId = (url.searchParams.get('leagueId') || '').trim();
  if (!ROUTES[what]) return json(400, { error: 'Unknown request. Use what=draft, league or players.' });
  if (what !== 'players' && !/^[A-Za-z0-9]{4,40}$/.test(leagueId)) return json(400, { error: 'League ID should be letters and numbers, as in your league\'s URL after /league/.' });
  const fresh = await remembered(what, leagueId, true);
  if (fresh) return json(200, fresh, CACHE[what]);
  try {
    const { status, body } = await fetchFantrax(ROUTES[what](encodeURIComponent(leagueId)));
    if (body == null) return json(502, { error: 'Fantrax sent something that isn\'t data. Try again in a minute.' });
    if (body.error) {
      const msg = String(body.error.message || body.error);
      if (/RATE_LIMITED/i.test(String(body.error.code || ''))) {
        const old = await remembered(what, leagueId, false);   // busy: the last good answer beats an error
        if (old) return json(200, old, 0);
        return json(429, { error: 'Fantrax is busy (too many requests). The board will retry on its own.' });
      }
      return json(404, { error: /not found/i.test(msg) ? 'Fantrax doesn\'t know that league ID. Check it against your league URL.' : msg });
    }
    if (status < 200 || status >= 300) return json(502, { error: `Fantrax answered ${status}.` });
    remember(what, leagueId, body, ctx);
    return json(200, body, CACHE[what]);
  } catch (e) {
    const old = await remembered(what, leagueId, false);
    if (old) return json(200, old, 0);
    return json(502, { error: 'Couldn\'t reach Fantrax. The board will retry on its own.' });
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api/fantrax') return fantrax(req, ctx);
    return env.ASSETS.fetch(req);   // index.html and anything else the site serves
  }
};
