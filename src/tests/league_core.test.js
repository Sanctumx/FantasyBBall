// League page math (2026-10-18)
const test = require('node:test'), assert = require('node:assert');
const E = require('../engine.js'), Shared = require('../shared.js'), L = require('../league_core.js'), PLAYERS = require('../players.json');

const CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, basis: 'pergame', ilSpots: 3, field: 'easy', fieldZ: 'std',
  puntMode: 'off', puntLock: '', catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'light', zdrop: 0, poStart: 18, asb: 'merged', proj: 'avg' };
const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const src = (n, extra) => ({ cfg: Object.assign({}, CFG), picks: byAdp.slice(0, 168).map((id, k) => k < n ? id : null), owner: [], extra: extra || [], names: null });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('matchup matrix is complementary with an empty diagonal', () => {
  const R = L.computeLeague(PLAYERS, src(168), 'avg');
  assert.strictEqual(R.N, 14);
  for (let i = 0; i < 14; i++) { assert.strictEqual(R.match[i][i], null); for (let j = 0; j < 14; j++) if (i !== j) assert.ok(near(R.match[i][j] + R.match[j][i], 1)); }
});

test('expected categories is the sum of category win chances', () => {
  const R = L.computeLeague(PLAYERS, src(168), 'avg');
  assert.deepStrictEqual(R.cats, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(near(R.expCats[2][5], R.cats.reduce((a, c) => a + R.cat[2][5][c], 0)));
});

test('8-cat leaves turnovers out', () => {
  const s = src(168); s.cfg.cats = 8;
  const R = L.computeLeague(PLAYERS, s, 'avg');
  assert.strictEqual(R.cats.length, 8); assert.ok(!R.cats.includes(E.TO));
});

test('numbers equal the engine run the board makes on Season basis and Playoff boost Off', () => {
  const s = src(168), R = L.computeLeague(PLAYERS, s, 'avg');
  const cfg = Object.assign({}, CFG, { basis: 'total', poBoost: 'off' });
  const P = E.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, 'avg'))));
  const res = E.evaluate(P, E.buildContext(P, cfg), cfg, { picks: s.picks, owner: [] });
  assert.ok(near(R.standings[0].catsPerWeek, res.standings[0].cats));
  const mm = res.myMatch.reduce((a, m) => a + m.p, 0) / res.myMatch.length;
  assert.ok(near(R.standings[0].matchAvg, mm));
  for (let c = 0; c < 9; c++) assert.ok(near(R.profile(0)[c].win, res.myChance[c]));
});

test('stat ranks are 1..N per category and TO rank 1 has the fewest turnovers', () => {
  const R = L.computeLeague(PLAYERS, src(168), 'avg');
  for (const c of R.cats) assert.deepStrictEqual(R.rank.map(r => r[c]).sort((a, b) => a - b), Array.from({ length: 14 }, (_, i) => i + 1));
  const best = R.rank.findIndex(r => r[8] === 1);
  assert.ok(R.raw.every(r => r[8] >= R.raw[best][8]));
});

test('per week divides season totals by the regular-season weeks', () => {
  const R = L.computeLeague(PLAYERS, src(168), 'avg');
  assert.ok(near(R.perWeek[3][3], R.raw[3][3] / 17));
});

test('half-filled draft still computes everything', () => {
  const R = L.computeLeague(PLAYERS, src(84), 'avg');
  assert.strictEqual(R.picked, 84); assert.strictEqual(R.total, 168);
  assert.ok(R.match.every((r, i) => r.every((v, j) => i === j || Number.isFinite(v))));
});

test('an old duplicate extra counts as the projected player', () => {
  const sarr = PLAYERS.findIndex(p => p.n === 'Alexandre Sarr'), s = src(168);
  const k = s.picks.indexOf(sarr); assert.ok(k >= 0);
  const dup = Object.assign({}, PLAYERS[sarr], { n: 'Alex Sarr' }); delete dup.hs;
  s.picks[k] = PLAYERS.length; s.extra = [dup];
  const R = L.computeLeague(PLAYERS, s, 'avg'), t = E.teamAt(k, 14, '3rr');
  assert.ok(R.rosters[t].some(p => p.n === 'Alexandre Sarr'));
  assert.ok(!R.rosters[t].some(p => p.n === 'Alex Sarr'));
});
