// Points mode (#137): fantasy points of a stat line and its variance, with the measured stat correlations
const test = require('node:test'), assert = require('node:assert');
const Pts = require('../points_core.js'), E = require('../engine.js'), GOLD = require('./fixtures/golden_players.json');
const rel = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const line = GOLD[3], YAHOO = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 }, ESPN = { pts: 1, reb: 1, ast: 1, stl: 1, blk: 1, to: -1, tpm: 1, fgm: 2, fga: -1, ftm: 1, fta: -1 };

test('RHO is symmetric with unit diagonal and positive semidefinite; named entries match the fit', () => {
  const R = Pts.RHO, n = R.length, S = Pts.STATS, at = (a, b) => R[S.indexOf(a)][S.indexOf(b)];
  assert.strictEqual(n, 11);
  for (let i = 0; i < n; i++) { assert.strictEqual(R[i][i], 1); for (let j = 0; j < n; j++) assert.strictEqual(R[i][j], R[j][i]); }
  // pts = 2 fgm + tpm + ftm exactly, so rho is positive semidefinite (singular): check no weight vector goes below -1e-4 of its length
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let t = 0; t < 300; t++) {
    const a = Array.from({ length: n }, rnd), q = a.reduce((s, x, i) => s + a.reduce((u, y, j) => u + x * y * R[i][j], 0), 0);
    assert.ok(q >= -1e-4 * a.reduce((s, x) => s + x * x, 0), 'semidefinite');
  }
  [['pts', 'fgm', 0.94], ['ftm', 'fta', 0.94], ['fgm', 'fga', 0.78], ['pts', 'fga', 0.75], ['pts', 'tpm', 0.66]].forEach(([a, b, v]) => assert.ok(Math.abs(at(a, b) - v) < 0.005, a + b));
});

test('statsOf derives fgm and ftm from the shooting percentages and is the same for a prepped player', () => {
  const s = Pts.statsOf(line), P = E.prepPlayers([Object.assign({}, line, { g: 70 })])[0];
  assert.ok(rel(s.fgm, line.fgp * line.fga) && rel(s.ftm, line.ftp * line.fta));
  const q = Pts.statsOf(P); Pts.STATS.forEach(k => assert.ok(rel(q[k], s[k]), k));
  const z = Pts.statsOf({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tpm: 0, fga: 0, fta: 0 });
  Pts.STATS.forEach(k => assert.strictEqual(z[k], 0, k));   // no NaN when fga is 0 and fgp missing
});

test('one scored stat gives the engine\'s own variance', () => {
  assert.ok(rel(Pts.pgVar(line, { reb: 1 }), E.perGameVar(line)[4]));
  assert.ok(rel(Pts.pgVar(line, { to: -1 }), E.perGameVar(line)[8]));
  assert.ok(rel(Pts.perGame(line, { to: -1 }), -line.to));
  assert.ok(rel(Pts.pgVar(line, { pts: 1 }), 5.38 * line.pts ** 0.78));
  assert.ok(rel(Pts.projVar(line, 70, { reb: 1 }), (0.12 * line.reb * 70) ** 2));
  assert.ok(rel(Pts.weekVar(line, 70, { reb: 1 }), E.VARS.GPW * 70 / 82 * E.perGameVar(line)[4] + line.reb ** 2 * E.VARS.VAR_GAMES));
});

test('fgm 2 and fga -1 cancel on a 50% shooter at 2 points per make', () => assert.ok(Math.abs(Pts.perGame({ fgp: 0.5, fga: 10, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tpm: 0, ftp: 0, fta: 0 }, { fgm: 2, fga: -1 })) < 1e-12));

test('correlations raise Yahoo-style variance 1.2 to 1.6 times over independent stats', () => {
  const ind = Object.keys(YAHOO).reduce((a, k) => a + YAHOO[k] ** 2 * Pts.pgVar(line, { [k]: 1 }), 0);
  const r = Pts.pgVar(line, YAHOO) / ind;
  assert.ok(r > 1.2 && r < 1.6, String(r));
});

test('ESPN-style negative weights keep variance at or above 0; zero weights give 0 everywhere; key follows the weights', () => {
  assert.ok(Pts.pgVar(line, ESPN) >= 0 && Pts.projVar(line, 70, ESPN) >= 0 && Pts.weekVar(line, 70, ESPN) >= 0);
  assert.strictEqual(Pts.perGame(line, {}), 0); assert.strictEqual(Pts.pgVar(line, {}), 0); assert.strictEqual(Pts.projVar(line, 70, {}), 0);
  assert.notStrictEqual(Pts.key(YAHOO), Pts.key(ESPN)); assert.strictEqual(Pts.key({ pts: 1 }), Pts.key({ pts: 1, reb: 0 }));
});

test('a line with missing stats (a window row with no pts) still gives a finite variance', () => {
  const sparse = { reb: 5, ast: 3, fga: 8, fgp: 0.5, fta: 2, ftp: 0.8 };
  assert.ok(Number.isFinite(Pts.pgVar(sparse, YAHOO)) && Number.isFinite(Pts.weekVar(sparse, 70, YAHOO)) && Number.isFinite(Pts.projVar(sparse, 70, YAHOO)));
});
