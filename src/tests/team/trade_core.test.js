// Trade core: rest-of-season Win M, perceived value, likelihood (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), T = require('../../trade_core.js'), TW = require('../../team_win.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
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

test('a trade and its reverse cancel (no player limit: an arrival is never the drop at an IL return, so with a limit the two sides differ)', () => {
  const mkNoLimit = rosters => M.makeCtx({ L: Object.assign({}, L, { maxPlayers: 99 }), pool, DAYS, rosters, me, nowMs: NOW }), c0 = mkNoLimit(ROS);
  const x = keys(me)[0], y = keys(other)[0];
  const r = T.evaluateTrade(c0, { a: me, b: other, aGets: [y], bGets: [x] });
  assert.ok(Math.abs(r.dA) > 1e-6);
  const R2 = {}; Object.keys(ROS).forEach(t => { R2[t] = ROS[t].map(e => Object.assign({}, e)); });
  R2[me].find(e => e.fid === x).fid = y; R2[other].find(e => e.fid === y).fid = x;
  const back = T.evaluateTrade(mkNoLimit(R2), { a: me, b: other, aGets: [x], bGets: [y] });
  assert.ok(near(back.dA, -r.dA) && near(back.dB, -r.dB));
});

test('rest of season: one chance per opponent from the shared TeamWin league matrix, every opponent weighted equally', () => {
  const r = T.rosWinM(ctx, ctx.roster, me), lw = TW.leagueWin(ctx, ctx.roster), mi = lw.ids.indexOf(me);
  assert.strictEqual(r.opps.length, L.teams.length - 1);
  r.opps.forEach(o => { assert.notStrictEqual(o.opp, me); assert.ok(near(o.p, lw.P[mi][lw.ids.indexOf(o.opp)]) && o.p > 0 && o.p < 1); });
  assert.ok(near(r.mean, r.opps.reduce((s, o) => s + o.p, 0) / r.opps.length));
  const late = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2027, 2, 10) });
  assert.deepStrictEqual(T.rosWinM(late, late.roster, me), { mean: null, opps: [] });
});

test('one k on every term: dA and dB at shrink 1 times 0.6 equal dA and dB at 0.6', () => {
  const x = keys(me)[0], y = keys(other)[0], tr = { a: me, b: other, aGets: [y], bGets: [x] };
  const raw = T.evaluateTrade(ctx, tr, { shrink: { match: 1, cat: 1 } }), k = T.evaluateTrade(ctx, tr);
  assert.ok(near(k.dA, 0.6 * raw.dA, 1e-9) && near(k.dB, 0.6 * raw.dB, 1e-9));
});

test('dA is 100 x the change in my rest-of-season mean Win M', () => {
  const x = keys(me)[0], y = keys(other)[0], R = Object.assign({}, ctx.roster, { [me]: ctx.roster[me].filter(f => f !== x).concat(y), [other]: ctx.roster[other].filter(f => f !== y).concat(x) });
  const r = T.evaluateTrade(ctx, { a: me, b: other, aGets: [y], bGets: [x] });
  assert.ok(near(r.dA, 100 * (T.rosWinM(ctx, R, me).mean - T.rosWinM(ctx, ctx.roster, me).mean)));
  assert.ok(near(r.dB, 100 * (T.rosWinM(ctx, R, other).mean - T.rosWinM(ctx, ctx.roster, other).mean)));
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
