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

async function fetchFantrax(path) {
  // Fantrax rate-limits bursts (seen in testing from Cloudflare); wait briefly and retry once
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(BASE + path, { headers: { accept: 'application/json', 'user-agent': 'courtside-draft-board' } });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { return { status: r.status, body: null }; }
    const limited = body && body.error && /RATE_LIMITED/i.test(String(body.error.code || ''));
    if (!limited || attempt === 1) return { status: r.status, body };
    await new Promise(res => setTimeout(res, 1500));
  }
}

async function fantrax(req) {
  const url = new URL(req.url);
  const what = url.searchParams.get('what') || 'draft';
  const leagueId = (url.searchParams.get('leagueId') || '').trim();
  if (!ROUTES[what]) return json(400, { error: 'Unknown request. Use what=draft, league or players.' });
  if (what !== 'players' && !/^[A-Za-z0-9]{4,40}$/.test(leagueId)) return json(400, { error: 'League ID should be letters and numbers, as in your league\'s URL after /league/.' });
  try {
    const { status, body } = await fetchFantrax(ROUTES[what](encodeURIComponent(leagueId)));
    if (body == null) return json(502, { error: 'Fantrax sent something that isn\'t data. Try again in a minute.' });
    if (body.error) {
      const msg = String(body.error.message || body.error);
      if (/RATE_LIMITED/i.test(String(body.error.code || ''))) return json(429, { error: 'Fantrax is busy (too many requests). The board will retry on its next sync.' });
      return json(404, { error: /not found/i.test(msg) ? 'Fantrax doesn\'t know that league ID. Check it against your league URL.' : msg });
    }
    if (status < 200 || status >= 300) return json(502, { error: `Fantrax answered ${status}.` });
    return json(200, body, CACHE[what]);
  } catch (e) {
    return json(502, { error: 'Couldn\'t reach Fantrax. Try again in a minute.' });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/fantrax') return fantrax(req);
    return env.ASSETS.fetch(req);   // index.html and anything else the site serves
  }
};
