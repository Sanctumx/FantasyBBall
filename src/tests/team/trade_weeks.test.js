// Win M per period for uneven trades (#169, 2026-10-29): plays split by period and one match-chance matrix per period.
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2026, 9, 21, 12) });

const cutsOf = () => L.periods.map(p => p.start).concat(L.periods[L.periods.length - 1].end);
const itemsOf = withV => ctx.roster[me].map((f, i) => ctx.pool.byKey.get(f)).map((pp, i) => Object.assign({ t: pp.t, a: Math.min(1, (pp.g || 60) / 82), from: ctx.nowMs, to: cutsOf()[cutsOf().length - 1] }, withV ? { v: 100 - i } : {}));

const W = require('../../team_win.js'), Team = require('../../team_core.js');
const regCuts = () => L.periods.filter(p => p.n <= L.lastRegular).map(p => p.start).concat(L.periods.find(p => p.n === L.lastRegular).end);
const sum = a => a.reduce((x, y) => x + y, 0);

test('plays by period sum to played on every basis', () => {
  const cuts = regCuts();
  ['total', 'pergame', 'mix'].forEach(b => {
    const tv = W.tabView(ctx, b), st = W.tradeState(ctx, me, ctx.roster[me]), plain = Team.playsPct(tv, st, { rank: () => 0 }), res = Team.playsPct(tv, st, { rank: () => 0, cuts });
    Object.keys(plain).forEach(k => {
      assert.deepStrictEqual(Object.assign({}, res[k], { by: undefined }), Object.assign({}, plain[k], { by: undefined }), b + ' ' + k + ' unchanged apart from by');
      assert.strictEqual(res[k].by.length, cuts.length - 1);
      assert.ok(Math.abs(sum(res[k].by) - plain[k].played) < 1e-9, b + ' ' + k + ' ' + sum(res[k].by) + ' vs ' + plain[k].played);
    });
  });
});

test('the IL timeline is global: an IL player is out for the first games, whatever the period', () => {
  const cuts = regCuts(), tv = W.tabView(ctx, 'total'), st = W.tradeState(ctx, me, ctx.roster[me]), il = st.order.find(k => st.slots[k] === 'il');
  assert.ok(il && Team.ilReturn(tv, il).nOut > 0, 'the fixture has an IL player with games to miss');
  const res = Team.playsPct(tv, st, { rank: () => 0, cuts }), by = res[il].by;
  const back = by.findIndex(x => x > 0);   // nOut = 19 games: nothing until the return, in whichever period it falls, then he plays at rate a
  assert.ok(back > 0 && by.slice(0, back).every(x => x === 0) && by[by.length - 1] > 0, 'out for the first periods, then back: ' + by.join(' '));
  assert.ok(Math.abs(sum(by) - res[il].played) < 1e-9);
});

test('a dropped player has 0 after his leave time', () => {
  const cuts = regCuts(), tv = W.tabView(ctx, 'total'), st = W.tradeState(ctx, me, ctx.roster[me]), res = Team.playsPct(tv, st, { cuts, force: 1, rank: k => (k === st.order[0] ? -1 : 1) });
  const gone = Object.keys(res).filter(k => res[k].drop != null);
  assert.ok(gone.length >= 1);
  gone.forEach(k => cuts.slice(0, -1).forEach((c, i) => { if (c >= res[k].drop) assert.strictEqual(res[k].by[i], 0, k + ' period ' + (i + 1)); }));
});

test('rosterGamesBy buckets sum to rosterGames, with and without a value, and a game at a cut lands in the later bucket', () => {
  const cuts = cutsOf();
  [false, true].forEach(withV => {
    const items = itemsOf(withV), whole = I.rosterGames(items, DAYS, 12), by = I.rosterGamesBy(items, DAYS, 12, null, cuts);
    assert.strictEqual(by.length, items.length);
    by.forEach((row, e) => {
      assert.strictEqual(row.length, cuts.length - 1);
      assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - whole[e]) < 1e-9, 'v=' + withV + ' entry ' + e);
    });
  });
  // one team, one game exactly on a cut
  const t = ctx.pool.byKey.get(ctx.roster[me][0]).t, g = (DAYS.games || DAYS)[t].map(s => s * 1000).find(ms => ms > cuts[1] && ms < cuts[2]);
  const two = I.rosterGamesBy([{ t, a: 1, from: g, to: g + 1 }], DAYS, 12, null, [g - 1000, g, g + 1000]);
  assert.deepStrictEqual(two[0], [0, 1], 'game at the cut is in the later bucket');
});
