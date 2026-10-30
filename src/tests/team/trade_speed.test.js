// Trade search speed (#168, 2026-10-29): pairKit gives leagueWin's rows the numbers of the full Engine.evaluate run, localDay is memoized,
// and a full 'any' search matches the golden rows of the slow version.
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), T = require('../../trade_core.js'), W = require('../../team_win.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2026, 9, 21, 12) });
const YAHOO = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 };

test('leagueWin rows (pairKit) equal the full-run rows bit for bit: 9 cats, 8 cats, points, every basis', () => {
  const other = Object.keys(ctx.roster).find(t => t !== me), rows = [me, other];
  const R = Object.assign({}, ctx.roster, { [me]: ctx.roster[me].slice(1).concat(ctx.roster[other][0]), [other]: ctx.roster[other].slice(1).concat(ctx.roster[me][0]) });
  ['total', 'pergame', 'mix'].forEach(basis => [{ cats: 9 }, { cats: 8 }, { points: YAHOO }].forEach(o => {
    const opts = Object.assign({ basis, rows }, o), fast = W.leagueWin(ctx, R, opts), full = W.leagueWin(ctx, R, Object.assign({ detail: true }, opts));
    assert.deepStrictEqual(fast.P, full.P, basis + ' ' + JSON.stringify(o));
    assert.ok(fast.P[fast.ids.indexOf(me)].some(x => x != null));
  }));
});

test('a full any-search returns the golden rows and takes under 2 s', () => {
  const t0 = Date.now(), rows = T.packCandidates(T.tradeCandidates(ctx, 'any')), ms = Date.now() - t0, gold = fx('trade_candidates_golden.json');
  assert.strictEqual(rows.length, gold.length);
  rows.forEach((r, i) => {
    assert.deepStrictEqual(r.slice(0, 3), gold[i].slice(0, 3));
    for (let k = 3; k < 7; k++) assert.ok(Math.abs(r[k] - gold[i][k]) < 2e-6, i + ':' + k);
    assert.strictEqual(r[7], gold[i][7]);
  });
  assert.ok(ms < 2000, 'search took ' + ms + ' ms');
});

test('packCandidates(rows, 4) rounds the numbers to 4 decimals and keeps the rest', () => {
  const rows = T.tradeCandidates(ctx, ctx.roster[me][0]), exact = T.packCandidates(rows), r4 = T.packCandidates(rows, 4);
  r4.forEach((r, i) => {
    assert.deepStrictEqual([r[0], r[1], r[2], r[7]], [exact[i][0], exact[i][1], exact[i][2], exact[i][7]]);
    for (let k = 3; k < 7; k++) assert.strictEqual(r[k], Math.round(exact[i][k] * 1e4) / 1e4);
  });
  assert.ok(JSON.stringify(r4).length < JSON.stringify(exact).length);
});

test('localDay (memoized) matches the plain date math through a DST sweep and after the cache clears', () => {
  const plain = ms => new Date(ms - 6 * 3600e3).toISOString().slice(0, 10);
  for (let ms = Date.UTC(2026, 9, 1); ms < Date.UTC(2027, 3, 30); ms += 37 * 60e3) assert.strictEqual(I.localDay(ms), plain(ms));
  for (let i = 0; i < 60000; i++) I.localDay(1e12 + i * 1000);   // past 50K entries: the memo clears and still answers
  assert.strictEqual(I.localDay(Date.UTC(2026, 9, 21, 5, 59)), '2026-10-20');
  assert.strictEqual(I.localDay(Date.UTC(2026, 9, 21, 6, 0)), '2026-10-21');
});
