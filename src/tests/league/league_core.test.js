// League page math (2026-10-18)
const test = require('node:test'), assert = require('node:assert');
const E = require('../../engine.js'), Shared = require('../../shared.js'), L = require('../../league_core.js'), PLAYERS = require('../../players.json');

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

test('per week divides season totals by the 24 NBA weeks (82 games / 3.42)', () => {
  const R = L.computeLeague(PLAYERS, src(168), 'avg');
  assert.ok(near(R.perWeek[3][3], R.raw[3][3] / 24));
});

test('team stats count only the active slots (10 of 12), best-ranked players first', () => {
  const s = src(168), R = L.computeLeague(PLAYERS, s, 'avg');
  const top = R.rosters[0].slice().sort((a, b) => a.rk - b.rk).slice(0, 10);
  assert.ok(near(R.raw[0][3], L.rawTotals(top)[3], 1e-6));
  const G = L.computeLeague(PLAYERS, s, 'avg', 'pergame');
  assert.ok(near(G.raw[0][3], top.reduce((a, p) => a + p.pts, 0) / 10, 1e-6));
});

test('active slot count follows the lineup settings: lu* sum, or the Fantrax slot list when present', () => {
  const top = (R, n) => L.rawTotals(R.rosters[0].slice().sort((a, b) => a.rk - b.rk).slice(0, n))[3];
  const a = src(168); Object.assign(a.cfg, { luC: 2, luG: 2, luF: 2, luGC: 0, luFC: 0, luU: 2 });
  const Ra = L.computeLeague(PLAYERS, a, 'avg'); assert.ok(near(Ra.raw[0][3], top(Ra, 8), 1e-6));
  const b = src(168); b.cfg.luFx = ['PG', 'SG', 'G/F', 'SF', 'PF', 'C', 'U'];
  const Rb = L.computeLeague(PLAYERS, b, 'avg'); assert.ok(near(Rb.raw[0][3], top(Rb, 7), 1e-6));
});

test('a team with fewer players than active slots has open picks fill only the leftover active slots', () => {
  const s = src(100); s.cfg.luFx = ['PG', 'SG', 'G/F', 'SF', 'PF', 'C', 'U'];
  const R = L.computeLeague(PLAYERS, s, 'avg');
  for (let t = 0; t < 14; t++) { assert.strictEqual(R.open[t], 12 - R.rosters[t].length); assert.ok(R.raw[t].every(Number.isFinite)); }
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
  s.picks[k] = PLAYERS.length; s.extra = [dup]; s.base = PLAYERS.length;
  const R = L.computeLeague(PLAYERS, s, 'avg'), t = E.teamAt(k, 14, '3rr');
  assert.ok(R.rosters[t].some(p => p.n === 'Alexandre Sarr'));
  assert.ok(!R.rosters[t].some(p => p.n === 'Alex Sarr'));
});

test('a save made with 234 players keeps its extra on the right player', () => {
  const s = src(168), k = 5, extra = { n: 'Zzz Unlisted', t: 'XXX', p: 'G', g: 60, m: 20, fgp: 0.45, fga: 8, ftp: 0.8, fta: 2, tpm: 1, pts: 10, reb: 3, ast: 3, stl: 1, blk: 0.3, to: 1.5 };
  s.picks[k] = 234; s.extra = [extra];   // no base: saved when the list had 234 players, so 234 is the extra, not Hashtag-only row 0
  const R = L.computeLeague(PLAYERS, s, 'avg'), t = E.teamAt(k, 14, '3rr');
  assert.ok(R.rosters[t].some(p => p.n === 'Zzz Unlisted'));
  assert.ok(!R.rosters[t].some(p => p.n === PLAYERS[234].n));
});

test('mid-draft team stats include a typical player at each open pick, as the win chances do', () => {
  const R = L.computeLeague(PLAYERS, src(100), 'avg');
  for (let t = 0; t < 14; t++) {
    const drafted = L.rawTotals(R.rosters[t]);
    assert.strictEqual(R.open[t], 12 - R.rosters[t].length);
    if (R.open[t] > 0 && R.rosters[t].length < 10) assert.ok(R.raw[t][3] > drafted[3] && R.raw[t][4] > drafted[4], 'team ' + t);
  }
  const full = L.computeLeague(PLAYERS, src(168), 'avg');
  assert.ok(full.open.every(n => n === 0));
  assert.deepStrictEqual(full.raw[3], L.rawTotals(full.rosters[3].slice().sort((a, b) => a.rk - b.rk).slice(0, 10)));
});

test('per game is the average of the active players per-game lines (missed games do not count)', () => {
  const R = L.computeLeague(PLAYERS, src(168), 'avg'), r = R.rosters[2].slice().sort((a, b) => a.rk - b.rk).slice(0, 10);
  assert.ok(near(R.perGame[2][3], r.reduce((a, p) => a + p.pts, 0) / 10));
  assert.ok(near(R.perGame[2][0], r.reduce((a, p) => a + p.fgp * p.fga, 0) / r.reduce((a, p) => a + p.fga, 0)));
  const R2 = L.computeLeague(PLAYERS, src(100), 'avg');
  assert.ok(R2.perGame.every(row => row.every(Number.isFinite)));
});

test('per game basis changes the win chances and shows per-game stats', () => {
  const T = L.computeLeague(PLAYERS, src(168), 'avg'), G = L.computeLeague(PLAYERS, src(168), 'avg', 'pergame');
  assert.strictEqual(T.basis, 'total'); assert.strictEqual(G.basis, 'pergame');
  assert.ok(T.match.some((r, i) => r.some((v, j) => i !== j && Math.abs(v - G.match[i][j]) > 1e-6)), 'win chances differ');
  assert.deepStrictEqual(G.raw[2], G.perGame[2]);
  assert.strictEqual(G.perWeek, null);
  for (const c of G.cats) assert.deepStrictEqual(G.rank.map(r => r[c]).sort((a, b) => a - b), Array.from({ length: 14 }, (_, i) => i + 1));
});
