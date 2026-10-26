// Engine hooks that points mode (#137) builds on: draft sims, the games count a player is valued at, per-game variances
const test = require('node:test'), assert = require('node:assert');
const E = require('../engine.js'), R = require('../rankings_core.js'), GOLD = require('./fixtures/golden_players.json');
const rows = R.projSource(GOLD, 'avg');
const prep = () => E.prepPlayers(rows.map(r => Object.assign({}, r.line, { g: r.g, ftx: r.ftx })));

test('draftSims: deterministic, N teams, min(N*R, n) picks, no repeated player', () => {
  const cfg = R.cfgFor({ teams: 14, roster: 12 }), P = prep(), a = E.draftSims(P, cfg), b = E.draftSims(P, cfg);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, 80);
  a.forEach(sim => {
    assert.strictEqual(sim.length, 14);
    const all = sim.flat();
    assert.strictEqual(all.length, Math.min(14 * 12, P.length));
    assert.strictEqual(new Set(all).size, all.length);
  });
});

test('gUse: games the engine values each player at, per basis', () => {
  for (const basis of ['total', 'pergame', 'mix']) {
    const P = prep(), ctx = E.buildContext(P, R.cfgFor({ teams: 14, roster: 12, basis, ilSpots: 0 }));
    P.forEach(p => assert.ok(Math.abs(p.gUse - (basis === 'total' ? p.g : basis === 'pergame' ? ctx.G0 : (p.g + ctx.G0) / 2)) < 1e-12, basis));
  }
});

test('total basis with no IL spots: x is the stat times gUse', () => {
  const P = prep(); E.buildContext(P, R.cfgFor({ teams: 14, roster: 12, basis: 'total', ilSpots: 0 }));
  P.slice(0, 20).forEach(p => assert.ok(Math.abs(p.x[4] - p.reb * p.gUse) < 1e-9 * Math.max(1, p.reb * p.gUse)));
});

test('perGameVar and VARS are exported', () => {
  assert.deepStrictEqual(E.VARS, { GPW: 3.42, VAR_GAMES: 0.82, SIGMA_G2: 1.87, SEASON_G: 80, PROJ_SD: 0.12 });
  const v = E.perGameVar(prep()[0]);
  assert.strictEqual(v.length, 9); assert.ok(v.every(x => x >= 0));
});
