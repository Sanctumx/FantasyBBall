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
