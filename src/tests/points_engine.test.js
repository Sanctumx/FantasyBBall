// Points mode (#137): one FP total through Engine.evaluate gives the engine's own numbers when one stat is scored
const test = require('node:test'), assert = require('node:assert');
const Pts = require('../points_core.js'), E = require('../engine.js'), R = require('../rankings_core.js'), GOLD = require('./fixtures/golden_players.json');
const rows = R.projSource(GOLD, 'avg'), FP = Pts.FP_SLOT;
const rel = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const prep = () => E.prepPlayers(rows.map(r => Object.assign({}, r.line, { g: r.g, ftx: r.ftx })));
// every pick but the last is made; my team has one open slot, so each candidate's gain is the same comparison in both runs
const run = (P, ctx, cfg) => {
  const N = cfg.teams * cfg.roster, byAdp = P.map((p, i) => i).sort((a, b) => E.adpOf(P[a], cfg.adpSrc) - E.adpOf(P[b], cfg.adpSrc));
  const picks = new Array(N).fill(null), owner = Array.from({ length: N }, (_, k) => Math.floor(k / cfg.roster));
  byAdp.slice(0, N - 1).forEach((i, k) => { picks[k] = i; });
  E.evaluate(P, ctx, cfg, { picks, owner });
  return P.map(p => p.gainC ? Array.from(p.gainC) : null);
};

for (const [w, cat] of [[{ reb: 1 }, 4], [{ to: -1 }, 8]]) for (const basis of ['total', 'pergame']) {
  test('one scored stat ' + JSON.stringify(w) + ' (' + basis + ') equals the engine\'s category ' + cat, () => {
    const cfg = Object.assign(R.cfgFor({ teams: 14, roster: 12, cats: 9, ilSpots: 3, basis }), { field: null });
    const P = prep(), ctx = E.buildContext(P, cfg), view = Pts.engineView(P, ctx, cfg, w), nz = Pts.noise(P, ctx, cfg, w);
    P.forEach((p, i) => { assert.ok(rel(view.P[i].x[FP], p.x[cat], 1e-12), 'x ' + i); assert.ok(rel(view.P[i].pv[FP], p.pv[cat], 1e-12), 'pv ' + i); });
    assert.ok(rel(nz.idio, ctx.idioNoise[cat], 1e-12) && rel(nz.load, ctx.loadS[cat], 1e-12) && rel(nz.h2h, ctx.h2hNoise[cat], 1e-12));
    assert.strictEqual(view.ctx.streamK[FP], 1);
    const g0 = run(P, ctx, cfg), g1 = run(view.P, view.ctx, cfg);
    let seen = 0;
    g0.forEach((a, i) => { if (a && g1[i]) { seen++; assert.ok(rel(g1[i][FP], a[cat], 1e-9), 'gain ' + i); } });
    assert.ok(seen > 20);
  });
}

test('field easy: the room\'s value is the FP total', () => {
  const cfg = R.cfgFor({ teams: 14, roster: 12 }), P = prep(), ctx = E.buildContext(P, cfg), v = Pts.engineView(P, ctx, cfg, { pts: 1, reb: 1.2 });
  v.P.forEach(p => assert.strictEqual(p.fieldV, p.x[FP]));
});

test('Yahoo weights: finite gains, the top FP player is among the top 5 gains; zero weights: all gains 0, no NaN', () => {
  const cfg = R.cfgFor({ teams: 14, roster: 12, ilSpots: 3, basis: 'total' }), P = prep(), ctx = E.buildContext(P, cfg);
  const Y = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 }, v = Pts.engineView(P, ctx, cfg, Y), g = run(v.P, v.ctx, cfg);
  const idx = g.map((a, i) => a ? i : -1).filter(i => i >= 0);
  idx.forEach(i => assert.ok(g[i].every(Number.isFinite)));
  const top = idx.slice().sort((a, b) => v.P[b].x[FP] - v.P[a].x[FP])[0], rank = idx.slice().sort((a, b) => g[b][FP] - g[a][FP]).indexOf(top);
  assert.ok(rank < 5, 'rank ' + rank);
  const z = Pts.engineView(P, ctx, cfg, {}), gz = run(z.P, z.ctx, cfg);
  gz.forEach(a => { if (a) a.forEach(x => assert.ok(Number.isFinite(x) && Math.abs(x) < 1e-6)); });
});

test('entry equals Engine.entryVec for one scored stat', () => {
  const cfg = R.cfgFor({ teams: 14, roster: 12 }), P = prep(), ctx = E.buildContext(P, cfg), l = GOLD[5], e = Pts.entry(l, 72, ctx, { reb: 1 }), q = E.entryVec(l, ctx, 72);
  assert.ok(rel(e.x[FP], q.x[4], 1e-12) && rel(e.pv[FP], q.pv[4], 1e-12));
  assert.strictEqual(e.x[0], 0);
});
