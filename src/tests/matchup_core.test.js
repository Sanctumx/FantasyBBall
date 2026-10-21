// Weekly Matchup Analyzer core: week projection and best single adds (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), Pl = require('../inseason_players.js'), M = require('../matchup_core.js'), PLAYERS = require('../players.json');
const fx = n => require('./fixtures/' + n), DAYS = require('../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, NOW = Date.UTC(2026, 9, 21, 12);
const mk = (over) => M.makeCtx(Object.assign({ L, pool, DAYS, rosters: ROS, me, nowMs: NOW }, over || {}));
const ctx = mk();

test('context knows the current period and every roster', () => {
  assert.strictEqual(ctx.cur, 1);
  assert.strictEqual(Object.keys(ctx.roster).length, 14);
  assert.strictEqual(ctx.roster[me].length, ROS[me].length);
});

test('week projection is complementary', () => {
  const a = M.projectWeek(ctx, me, 1), b = M.projectWeek(ctx, a.opp, 1);
  assert.strictEqual(a.opp, I.opponentOf(L, me, 1));
  assert.ok(Math.abs(a.match + b.match - 1) < 1e-9);
  a.cat.forEach((x, c) => assert.ok(Math.abs(x + b.cat[c] - 1) < 1e-9, 'category ' + c));
  assert.ok(a.games[0] > 15 && a.games[0] < 45);
  assert.strictEqual(M.projectWeek(ctx, me, 16).opp, null);
});

test('IR players sit out only the current period', () => {
  const t = Object.keys(ROS).find(k => ROS[k].some(x => x.slot === 'IR')), ir = ROS[t].filter(x => x.slot === 'IR').map(x => x.fid);
  const cur = M.teamSegments(ctx, t, 1).map(s => s.key), next = M.teamSegments(ctx, t, 2).map(s => s.key);
  ir.forEach(f => { assert.ok(!cur.includes(f)); assert.ok(next.includes(f)); });
  assert.strictEqual(next.length, ROS[t].length);
  const per = L.periods.find(p => p.n === 2), s = M.teamSegments(ctx, t, 2)[0];
  assert.strictEqual(s.from, per.start); assert.strictEqual(s.to, per.end);
});

test('simple adds: same drop on every row, FA only, sorted', () => {
  const rows = M.simpleAdds(ctx, 1, { limit: 20 });
  assert.ok(rows.length > 5 && rows.length <= 20);
  const drop = M.lowestValue(ctx, me, 1)[0];
  rows.forEach(r => {
    assert.strictEqual(r.drop.key, drop.key);
    assert.ok(['FA', 'WW'].includes(r.add.fxStatus) && r.add.owner === null);
    assert.ok(r.games > 0);
    assert.strictEqual(r.dCat.length, 9);
  });
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].dMatch >= rows[i].dMatch);
});

test('a row equals a recomputed swap', () => {
  const rows = M.simpleAdds(ctx, 1, { limit: 5 }), r = rows[0], opp = I.opponentOf(L, me, 1);
  const oppSegs = M.teamSegments(ctx, opp, 1), base = M.scoreSegments(ctx, M.teamSegments(ctx, me, 1), oppSegs).match;
  const from = M.addFrom(ctx, 1), per = L.periods.find(p => p.n === 1);
  const segs = M.teamSegments(ctx, me, 1).map(s => s.key === r.drop.key ? { key: s.key, from: s.from, to: from } : s).concat([{ key: r.add.key, from, to: per.end }]);
  assert.ok(Math.abs(r.dMatch - (M.scoreSegments(ctx, segs, oppSegs).match - base)) < 1e-12);
  assert.strictEqual(from, Date.UTC(2026, 9, 22, 6));   // next local day (UTC - 6 h) after Wed 12:00Z
});

test('late in the week no rows have zero games', () => {
  const late = mk({ nowMs: Date.UTC(2026, 9, 26, 12) }), rows = M.simpleAdds(late, 1, {});
  rows.forEach(r => assert.ok(r.games > 0));
});

test('future periods start at the period start', () => {
  assert.strictEqual(M.addFrom(ctx, 3), L.periods.find(p => p.n === 3).start);
});

test('open roster spot means no drop', () => {
  const R2 = JSON.parse(JSON.stringify(ROS)), i = R2[me].findIndex(x => x.slot !== 'IR');
  R2[me].splice(i, 1);
  const c2 = M.makeCtx({ L, pool, DAYS, rosters: R2, me, nowMs: NOW });
  const rows = M.simpleAdds(c2, 1, {});
  assert.ok(rows.length > 0);
  rows.forEach(r => assert.strictEqual(r.drop, null));
});

test('chances are shrunk toward one half', () => {
  const a = M.projectWeek(ctx, me, 1);
  assert.ok(a.cat.every(p => p > 0.5 - 0.5 * M.K_CAT - 1e-9 && p < 0.5 + 0.5 * M.K_CAT + 1e-9));
  assert.ok(a.match > 0.5 - 0.5 * M.K_MATCH - 1e-9 && a.match < 0.5 + 0.5 * M.K_MATCH + 1e-9);
});
