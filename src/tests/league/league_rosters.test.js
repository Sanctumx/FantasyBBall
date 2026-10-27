// League page source: the loaded Fantrax league's current rosters (2026-10-20, Settings tab Task 7)
const test = require('node:test'), assert = require('node:assert');
const L = require('../../league_core.js'), LS = require('../../league_store.js'), PLAYERS = require('../../players.json');

const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const fxName = p => { const i = p.n.indexOf(' '); return p.n.slice(i + 1) + ', ' + p.n.slice(0, i); };
const ids = n => Array.from({ length: n }, (_, i) => 't' + i);
const leagueOf = n => ({ teamInfo: Object.fromEntries(ids(n).map((t, i) => [t, { id: t, name: 'Team ' + String.fromCharCode(65 + i) }])) });
const standOf = n => ids(n).map((t, i) => ({ teamId: t, rank: i + 1, points: '0-0' }));
const fxOf = list => Object.fromEntries(list.map(id => ['f' + id, { name: fxName(PLAYERS[id]), team: PLAYERS[id].t, position: PLAYERS[id].p }]));
const item = (id, status) => ({ id: 'f' + id, status: status || 'ACTIVE' });
const rostersOf = per => ({ rosters: Object.fromEntries(per.map((items, i) => ['t' + i, { rosterItems: items }])) });
const SET = Object.assign({}, LS.LEAGUE_DEF, { teams: 4, roster: 8 });
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('rosters that equal a full draft give the same matrix and ranks as that draft', () => {
  const N = 4, R = 8, pool = byAdp.slice(0, N * R), per = ids(N).map(() => []);
  const picks = pool.slice();   // snake order: pick k belongs to the team the engine says
  pool.forEach((id, k) => { const r = Math.floor(k / N), c = k % N; per[r % 2 ? N - 1 - c : c].push(item(id)); });
  const src = L.sourceFromRosters(leagueOf(N), rostersOf(per), standOf(N), fxOf(pool), PLAYERS, SET, null);
  const draft = { cfg: Object.assign({}, src.cfg, { order: 'snake' }), picks, owner: [], extra: [] };
  const A = L.computeLeague(PLAYERS, draft, 'avg'), B = L.computeLeague(PLAYERS, src, 'avg');
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) assert.ok(near(A.match[i][j], B.match[i][j]), 'match ' + i + ',' + j);
  assert.deepStrictEqual(A.standings.map(s => s.rank), B.standings.map(s => s.rank));
});

test('teams by standings rank then name; IR players left out and listed; open spots keep their team', () => {
  const lg = leagueOf(4), st = [{ teamId: 't0', rank: 2 }, { teamId: 't1', rank: 1 }, { teamId: 't2' }, { teamId: 't3' }];
  const pool = byAdp.slice(0, 12);
  const per = [[item(pool[0]), item(pool[1]), item(pool[2], 'INJURED_RESERVE')], [item(pool[3])], [item(pool[4]), item(pool[5]), item(pool[6]), item(pool[7]), item(pool[8]), item(pool[9]), item(pool[10], 'RESERVE')], []];
  const s = L.sourceFromRosters(lg, rostersOf(per), st, fxOf(pool), PLAYERS, SET, 't0');
  assert.deepStrictEqual(s.ids, ['t1', 't0', 't2', 't3']);
  assert.deepStrictEqual(s.names, ['Team B', 'Team A', 'Team C', 'Team D']);
  assert.strictEqual(s.cfg.roster, 8, 'R = max(settings.roster, largest non-IR count)');
  assert.strictEqual(s.cfg.teams, 4); assert.strictEqual(s.cfg.slot, 2, 'my team is the second in the order');
  assert.strictEqual(s.picks.length, 32);
  assert.ok(!s.picks.includes(pool[2]), 'IR player not in the picks');
  assert.deepStrictEqual(s.ir.map(x => [x.t, x.name]), [[1, PLAYERS[pool[2]].n]]);
  assert.strictEqual(s.picks.filter(v => v != null).length, 10);
  assert.strictEqual(s.owner.length, 32); assert.ok(s.owner.every(t => t >= 0 && t < 4), 'every pick, open or not, has its team');
  for (let t = 0; t < 4; t++) assert.strictEqual(s.owner.filter(o => o === t).length, 8);
});

test('a roster larger than the settings raises the roster size; a player without projections becomes a waiver-level extra', () => {
  const pool = byAdp.slice(0, 11), many = pool.slice(0, 10).map(id => item(id));
  const fx = fxOf(pool); fx.fx999 = { name: 'Nobody, Real', team: 'XXX', position: 'PG' };
  const s = L.sourceFromRosters(leagueOf(4), rostersOf([many.concat(item(pool[10])), [{ id: 'fx999', status: 'ACTIVE' }], [], []]), standOf(4), fx, PLAYERS, SET, null);
  assert.strictEqual(s.cfg.roster, 11);
  assert.strictEqual(s.extra.length, 1); assert.strictEqual(s.extra[0].n, 'Real Nobody');
  assert.ok(s.picks.includes(PLAYERS.length));
  const R = L.computeLeague(PLAYERS, s, 'avg');
  assert.ok(R.rosters.some(r => r.some(p => p.n === 'Real Nobody')));
});

test('a league with no teams is an error', () => {
  assert.throws(() => L.sourceFromRosters({ teamInfo: {} }, rostersOf([]), [], {}, PLAYERS, SET, null), /no teams/);
});
