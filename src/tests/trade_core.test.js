// Trade core: rest-of-season Win M, perceived value, likelihood (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), Pl = require('../inseason_players.js'), M = require('../matchup_core.js'), T = require('../trade_core.js'), PLAYERS = require('../players.json');
const fx = n => require('./fixtures/' + n), DAYS = require('../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, other = L.teams[1].id, NOW = Date.UTC(2026, 9, 21, 12);
const mk = rosters => M.makeCtx({ L, pool, DAYS, rosters, me, nowMs: NOW });
const ctx = mk(ROS);
const keys = t => ctx.roster[t].filter(f => pool.byKey.get(f).slot !== 'IR');
const pvOf = f => T.perceived(ctx, pool.byKey.get(f)).pv;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

test('an empty trade changes nothing', () => {
  const r = T.evaluateTrade(ctx, { a: me, b: other, aGets: [], bGets: [] });
  assert.ok(near(r.dA, 0) && near(r.dB, 0) && near(r.total, 0));
  assert.ok(near(r.likelihood, 1 / (1 + Math.exp(-T.TRADE_W.bias)))); assert.ok(r.likelihood < 0.5); assert.strictEqual(r.multi, false);   // nothing changes hands: not a coin flip
});

test('a trade and its reverse cancel', () => {
  const x = keys(me)[0], y = keys(other)[0];
  const r = T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [x] });
  assert.ok(Math.abs(r.dA) > 1e-6);
  const R2 = {}; Object.keys(ROS).forEach(t => { R2[t] = ROS[t].map(e => Object.assign({}, e)); });
  R2[me].find(e => e.fid === x).fid = y; R2[other].find(e => e.fid === y).fid = x;
  const back = T.evaluateTrade(mk(R2), { a: me, b: other, aGets: [x], bGets: [y] });
  assert.ok(near(back.dA, -r.dA) && near(back.dB, -r.dB));
});

test('rest of season covers the current period to the last regular period with the real opponents', () => {
  const r = T.rosWinM(ctx, ctx.roster, me);
  assert.strictEqual(r.periods.length, L.lastRegular);
  r.periods.forEach((p, i) => { assert.strictEqual(p.n, i + 1); assert.strictEqual(p.opp, I.opponentOf(L, me, p.n)); assert.ok(p.p > 0 && p.p < 1); });
  assert.ok(near(r.mean, r.periods.reduce((s, p) => s + p.p, 0) / r.periods.length));
  const late = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2027, 2, 10) });
  assert.deepStrictEqual(T.rosWinM(late, late.roster, me), { mean: null, periods: [] });
  const mid = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2026, 11, 5) });
  assert.strictEqual(T.rosWinM(mid, mid.roster, me).periods[0].n, 7);
});

test('likelihood rises when B receives more perceived value', () => {
  const mine = keys(me).sort((a, b) => pvOf(b) - pvOf(a)), y = keys(other)[0];
  const hi = T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [mine[0]] }), lo = T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [mine[mine.length - 1]] });
  assert.ok(hi.gapB > lo.gapB);
  [hi, lo].forEach(r => assert.ok(near(r.likelihood, 1 / (1 + Math.exp(-(T.TRADE_W.slope * r.gapB + T.TRADE_W.winM * r.dB + T.TRADE_W.bias))))));
});

test('multi flag on uneven trades', () => {
  const [x1, x2] = keys(me), y = keys(other)[0];
  assert.strictEqual(T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [x1, x2] }).multi, true);
  assert.strictEqual(T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [x1] }).multi, false);
});

test('invalid trades throw', () => {
  const x = keys(me)[0], y = keys(other)[0], z = keys(L.teams[2].id)[0];
  assert.throws(() => T.evaluateTrade(ctx, { a: me, b: me, aGets: [], bGets: [] }));
  assert.throws(() => T.evaluateTrade(ctx, { a: me, b: other, aGets: [z], bGets: [x] }));
  assert.throws(() => T.evaluateTrade(ctx, { a: me, b: other, aGets: [x], bGets: [x] }));
  assert.throws(() => T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [y] }));
});

test('perceived value weights are 0.4 / 0.3 / 0.3', () => {
  const w = T.TRADE_W; assert.deepStrictEqual([w.cur, w.proj, w.adp], [0.4, 0.3, 0.3]);
  const pp = pool.players.find(p => p.src === 'proj' && p.actual && p.owner), v = T.perceived(ctx, pp);
  assert.ok(near(v.pv, 0.4 * v.cur + 0.3 * v.proj + 0.3 * v.adp)); assert.strictEqual(v.rv, v.proj);
  assert.ok(v.cur !== v.proj);
  const noAdp = T.perceived(ctx, Object.assign({}, pp, { adp: null }));
  assert.ok(Number.isFinite(noAdp.adp) && noAdp.adp < v.adp);
});
