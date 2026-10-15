// Proxy for Fantrax's public "fxea" endpoints so the board (a static page) can read a live draft.
// GET /api/fantrax?what=draft|league|players&leagueId=XXXX
const BASE = 'https://www.fantrax.com/fxea/general/';
const ROUTES = {
  draft:   id => `getDraftResults?leagueId=${id}`,
  league:  id => `getLeagueInfo?leagueId=${id}`,
  players: () => 'getPlayerIds?sport=NBA'
};
// how long browsers / Netlify's CDN may reuse each answer (seconds)
const CACHE = { draft: 5, league: 300, players: 86400 };

export default async (req) => {
  const url = new URL(req.url);
  const what = url.searchParams.get('what') || 'draft';
  const leagueId = (url.searchParams.get('leagueId') || '').trim();
  const json = (status, body, maxAge = 0) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store'
    }
  });
  if (!ROUTES[what]) return json(400, { error: 'Unknown request. Use what=draft, league or players.' });
  if (what !== 'players' && !/^[A-Za-z0-9]{4,40}$/.test(leagueId)) return json(400, { error: 'League ID should be letters and numbers, as in your league\'s URL after /league/.' });
  try {
    const r = await fetch(BASE + ROUTES[what](encodeURIComponent(leagueId)), {
      headers: { 'accept': 'application/json', 'user-agent': 'courtside-draft-board' }
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { return json(502, { error: 'Fantrax sent something that isn\'t data. Try again in a minute.' }); }
    if (body && body.error) {
      const msg = String(body.error.message || body.error);
      return json(404, { error: /not found/i.test(msg) ? 'Fantrax doesn\'t know that league ID. Check it against your league URL.' : msg });
    }
    if (!r.ok) return json(502, { error: `Fantrax answered ${r.status}.` });
    return json(200, body, CACHE[what]);
  } catch (e) {
    return json(502, { error: 'Couldn\'t reach Fantrax. Try again in a minute.' });
  }
};

export const config = { path: '/api/fantrax' };
