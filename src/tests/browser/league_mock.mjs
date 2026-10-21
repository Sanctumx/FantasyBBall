// Mock Fantrax league for the League page checks: n teams of `roster` players taken in ADP order (snake), as the Worker would answer.
import fs from 'fs';
export function mockLeague(REPO, n = 14, roster = 12, extra = {}) {
  const PLAYERS = JSON.parse(fs.readFileSync(REPO + '/src/players.json', 'utf8'));
  const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const ids = Array.from({ length: n }, (_, i) => 't' + i), per = ids.map(() => []), players = {};
  byAdp.slice(0, n * roster).forEach((id, k) => {
    const r = Math.floor(k / n), c = k % n, t = r % 2 ? n - 1 - c : c, p = PLAYERS[id], sp = p.n.indexOf(' ');
    players['f' + id] = { name: p.n.slice(sp + 1) + ', ' + p.n.slice(0, sp), team: p.t, position: p.p };
    per[t].push({ id: 'f' + id, status: 'ACTIVE' });
  });
  const league = { leagueName: 'Home', teamInfo: Object.fromEntries(ids.map((t, i) => [t, { id: t, name: 'Club ' + i }])), rosterInfo: { maxTotalPlayers: roster } };
  const rosters = { rosters: Object.fromEntries(ids.map((t, i) => [t, { rosterItems: per[i] }])) };
  const standings = ids.map((t, i) => ({ teamId: t, rank: i + 1, points: '0-0' }));
  const body = what => what === 'league' ? league : what === 'rosters' ? rosters : what === 'standings' ? standings : players;
  const settings = Object.assign({ teams: n, roster, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3 }, extra);
  const seed = (id = 'abc123', myTeam = 't0') => ({
    'courtside-settings-v1': JSON.stringify({ v: 1, settings, league: { id, name: 'Home', teams: [], loadedAt: 1 }, note: '' }),
    'courtside-leagues-v1': JSON.stringify([{ id, name: 'Home', myTeam, used: 1 }]) });
  const route = r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body(new URL(r.request().url()).searchParams.get('what'))) });
  return { league, rosters, standings, players, settings, seed, route, body, ids };
}
