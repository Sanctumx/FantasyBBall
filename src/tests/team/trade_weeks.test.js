// Win M per period for uneven trades (#169, 2026-10-29): plays split by period and one match-chance matrix per period.
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2026, 9, 21, 12) });

const cutsOf = () => L.periods.map(p => p.start).concat(L.periods[L.periods.length - 1].end);
const itemsOf = withV => ctx.roster[me].map((f, i) => ctx.pool.byKey.get(f)).map((pp, i) => Object.assign({ t: pp.t, a: Math.min(1, (pp.g || 60) / 82), from: ctx.nowMs, to: cutsOf()[cutsOf().length - 1] }, withV ? { v: 100 - i } : {}));

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
