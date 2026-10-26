// Trade finder and Sell High / Buy Low (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), Pl = require('../inseason_players.js'), M = require('../matchup_core.js'), T = require('../trade_core.js'), PLAYERS = require('../players.json');
const fx = n => require('./fixtures/' + n), DAYS = require('../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, NOW = Date.UTC(2026, 9, 21, 12);
const ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: NOW });
const mineKeys = new Set(ctx.roster[me]);

test('finder rows are one-for-one with a player on another team, sorted by dA x likelihood', () => {
  const give = ctx.roster[me].find(f => pool.byKey.get(f).slot !== 'IR'), rows = T.findTrades(ctx, give, { limit: 10 });
  assert.ok(rows.length > 0 && rows.length <= 10);
  rows.forEach(r => {
    assert.strictEqual(r.give.key, give); assert.ok(!mineKeys.has(r.target.key));
    assert.strictEqual(r.target.owner, r.team); assert.notStrictEqual(r.team, me); assert.ok(r.dA > 0);
    const v = T.perceived(ctx, r.target);
    assert.strictEqual(r.buyLow, v.rv - v.pv >= T.TRADE_W.tagGap);
  });
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].dA * rows[i - 1].likelihood >= rows[i].dA * rows[i].likelihood);
});

test('Sell High players are mine and Buy Low players are not', () => {
  const r = T.sellHighBuyLow(ctx, { limit: 8, targets: 3 });
  assert.ok(r.sellHigh.length + r.buyLow.length > 0);
  r.sellHigh.forEach(x => {
    assert.ok(mineKeys.has(x.player.key)); assert.ok(x.gap >= T.TRADE_W.tagGap);
    x.trades.forEach(t => assert.strictEqual(t.give.key, x.player.key));
  });
  r.buyLow.forEach(x => {
    assert.ok(!mineKeys.has(x.player.key)); assert.ok(x.gap >= T.TRADE_W.tagGap);
    x.trades.forEach(t => { assert.strictEqual(t.target.key, x.player.key); assert.ok(mineKeys.has(t.give.key)); });
  });
  for (let i = 1; i < r.sellHigh.length; i++) assert.ok(r.sellHigh[i - 1].gap >= r.sellHigh[i].gap);
});

test('the whole fixture league computes in under 3 seconds', () => {
  const c = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: NOW }), t = Date.now();
  T.sellHighBuyLow(c, {});
  assert.ok(Date.now() - t < 3000, 'took ' + (Date.now() - t) + ' ms');
});

test('filterTrades applies likelihood, +Win M you and +Win M them before the limit', () => {
  const give = ctx.roster[me].find(f => pool.byKey.get(f).slot !== 'IR'), all = T.tradeCandidates(ctx, give);
  assert.ok(all.length > 100 && all.some(r => r.dA < 0) && all.some(r => r.dA > 0));   // every one-for-one with every other team's player, not only the ones that help
  const opts = { minLikelihood: 0.05, minDA: 0.5, minDB: 0 }, got = T.filterTrades(all, opts);
  const want = all.filter(r => r.likelihood >= 0.05 && r.dA >= 0.5 && r.dB >= 0);
  assert.strictEqual(got.length, want.length);
  got.forEach(r => assert.ok(r.likelihood >= 0.05 && r.dA >= 0.5 && r.dB >= 0));
  for (let i = 1; i < got.length; i++) assert.ok(got[i - 1].dA * got[i - 1].likelihood >= got[i].dA * got[i].likelihood);
  assert.strictEqual(T.filterTrades(all, { limit: 3 }).length, 3);
  assert.deepStrictEqual(T.filterTrades(all, { minDA: 1e-9 }).map(r => r.target.key), T.findTrades(ctx, give, {}).map(r => r.target.key));
});

test('"any" offers each of my players: rows carry every give, all mine, none dropped by the limit order', () => {
  const rows = T.findTrades(ctx, 'any', { limit: 40, minLikelihood: 0.05, minDA: 1e-9 });
  assert.ok(rows.length > 0 && rows.length <= 40);
  rows.forEach(r => { assert.ok(mineKeys.has(r.give.key)); assert.ok(!mineKeys.has(r.target.key)); assert.ok(r.likelihood >= 0.05); });
  assert.ok(new Set(rows.map(r => r.give.key)).size > 1);
  const one = ctx.roster[me][0];
  const best = T.findTrades(ctx, one, { limit: 1 })[0];
  if (best) assert.ok(rows.length === 40 || rows.some(r => r.give.key === one && r.target.key === best.target.key) || best.likelihood < 0.05);
});

test('parseFilter reads 50%, 0.5 and 50 as the same likelihood; blank is no limit; junk is invalid', () => {
  const lik = s => T.parseFilter('lik', s);
  assert.strictEqual(lik('50%'), 0.5); assert.strictEqual(lik('0.5'), 0.5); assert.strictEqual(lik(' 50 '), 0.5);
  assert.strictEqual(lik('1'), 1); assert.strictEqual(lik('1%'), 0.01); assert.strictEqual(lik('.25'), 0.25);
  assert.strictEqual(lik(''), null); assert.strictEqual(lik('any'), null); assert.strictEqual(lik(null), null);
  assert.strictEqual(lik('abc'), undefined); assert.strictEqual(lik('150%'), undefined); assert.strictEqual(lik('-5'), undefined);
  assert.strictEqual(lik('50 %'), 0.5); assert.strictEqual(lik('50 percent'), 0.5); assert.strictEqual(lik('0,5'), 0.5); assert.strictEqual(lik('50％'), 0.5);
  const pts = s => T.parseFilter('da', s);
  assert.strictEqual(pts('2'), 2); assert.strictEqual(pts('1.5%'), 1.5); assert.strictEqual(pts('-1'), -1); assert.strictEqual(pts('0'), 0);
  assert.strictEqual(pts(''), null); assert.strictEqual(pts('x'), undefined);
});

test('packed candidates round-trip through JSON and rebuild the same rows from the pool', () => {
  const give = ctx.roster[me][0], rows = T.tradeCandidates(ctx, give);
  const back = T.unpackCandidates(JSON.parse(JSON.stringify(T.packCandidates(rows))), pool);
  assert.strictEqual(back.length, rows.length);
  back.forEach((r, i) => {
    assert.strictEqual(r.give, rows[i].give); assert.strictEqual(r.target, rows[i].target); assert.strictEqual(r.team, rows[i].team);
    ['likelihood', 'dA', 'dB', 'total'].forEach(k => assert.ok(Math.abs(r[k] - rows[i][k]) < 1e-9)); assert.strictEqual(r.buyLow, rows[i].buyLow);
  });
  const gone = T.packCandidates(rows).concat([['nobody', rows[0].target.key, rows[0].team, 0.5, 1, 1, 2, 0]]);
  assert.strictEqual(T.unpackCandidates(gone, pool).length, rows.length);   // a player no longer in the pool is dropped
});

test('sellHighBuyLow from saved candidates matches the direct computation', () => {
  const cache = {};
  const cands = g => cache[g] || (cache[g] = T.tradeCandidates(ctx, g));
  const a = T.sellHighBuyLow(ctx, { limit: 8, targets: 3 }), b = T.sellHighBuyLow(ctx, { limit: 8, targets: 3, candidates: cands });
  const sig = r => JSON.stringify({ s: r.sellHigh.map(x => [x.player.key, x.trades.map(t => t.target.key)]), b: r.buyLow.map(x => [x.player.key, x.trades.map(t => t.give.key)]) });
  assert.strictEqual(sig(b), sig(a));
});

test('candSig changes with rosters, day and period', () => {
  const s1 = T.candSig(ctx, '2026-10-21', 'v1'), same = T.candSig(ctx, '2026-10-21', 'v1');
  assert.strictEqual(s1, same);
  assert.notStrictEqual(s1, T.candSig(ctx, '2026-10-22', 'v1'));
  assert.notStrictEqual(s1, T.candSig(ctx, '2026-10-21', 'v2'));
  const moved = Object.assign({}, ctx, { roster: Object.assign({}, ctx.roster, { [me]: ctx.roster[me].slice(1) }) });
  assert.notStrictEqual(s1, T.candSig(moved, '2026-10-21', 'v1'));
});

test('candidates cover every other-team player and findTrades still defaults to trades that help me', () => {
  const give = ctx.roster[me].find(f => pool.byKey.get(f).slot !== 'IR'), all = T.tradeCandidates(ctx, give);
  const others = Object.keys(ctx.roster).filter(t => t !== me).reduce((n, t) => n + ctx.roster[t].length, 0);
  assert.strictEqual(all.length, others);
  assert.ok(T.findTrades(ctx, give, {}).every(r => r.dA > 0));
  assert.ok(T.filterTrades(all, { limit: 5000 }).length === all.length);   // the page's blank "+Win M you" box means no floor
});

// (#147: the cap was 60% on the old pairMatchup dB; on the TeamWin dB the top list includes a win-win offer at 68%, so the cap is 70%)
test('likelihood: the best-value offers are not near-certain (median under 30%, none over 70%)', () => {
  assert.ok(T.TRADE_W.bias < 0);
  const all = [].concat.apply([], ctx.roster[me].slice(0, 4).map(g => T.tradeCandidates(ctx, g)));
  const top = T.filterTrades(all, { limit: 25, minDA: 1e-9 }).map(r => r.likelihood).sort((a, b) => a - b);
  assert.strictEqual(top.length, 25);
  assert.ok(top[12] < 0.3, 'median ' + top[12]); assert.ok(top[24] < 0.7, 'max ' + top[24]);
});
