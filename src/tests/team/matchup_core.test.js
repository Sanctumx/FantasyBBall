// Weekly Matchup Analyzer core: week projection and best single adds (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
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

test('simple adds: a full roster with every player kept (or drops: 0) returns no rows instead of throwing', () => {
  assert.deepStrictEqual(M.simpleAdds(ctx, 1, { drops: 0 }), []);
  assert.deepStrictEqual(M.simpleAdds(ctx, 1, { keep: ctx.roster[me].map(f => ctx.pool.byKey.get(f).key) }), []);
});

test('simple adds: drops come from the 5 lowest-value players, FA only, sorted; drops: 1 uses the lowest only', () => {
  const rows = M.simpleAdds(ctx, 1, { limit: 20 });
  assert.ok(rows.length > 5 && rows.length <= 20);
  const lows = new Set(M.lowestValue(ctx, me, 5).map(p => p.key));
  M.simpleAdds(ctx, 1, { limit: 20, drops: 1 }).forEach(r => assert.strictEqual(r.drop.key, M.lowestValue(ctx, me, 1)[0].key));
  assert.ok(new Set(rows.map(r => r.drop.key)).size > 1, 'more than one drop appears');
  rows.forEach(r => {
    assert.ok(lows.has(r.drop.key));
    assert.ok(['FA', 'WW'].includes(r.add.fxStatus) && r.add.owner === null);
    assert.ok(r.games > 0);
    assert.strictEqual(r.dCat.length, 9);
  });
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].dMatch >= rows[i].dMatch);
});

test('a row equals a recomputed swap', () => {
  const rows = M.simpleAdds(ctx, 1, { limit: 5 }), r = rows[0], opp = I.opponentOf(L, me, 1);
  const oppSegs = M.teamSegments(ctx, opp, 1), base = M.scoreSegments(ctx, M.teamSegments(ctx, me, 1), oppSegs, true).match;
  const from = M.addFrom(ctx, 1), per = L.periods.find(p => p.n === 1);
  const segs = M.teamSegments(ctx, me, 1).map(s => s.key === r.drop.key ? { key: s.key, from: s.from, to: from } : s).concat([{ key: r.add.key, from, to: per.end }]);
  assert.ok(Math.abs(r.dMatch - (M.scoreSegments(ctx, segs, oppSegs, true).match - base)) < 1e-12);
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

test('kept players on my team are never dropped, in the list or the plan', () => {
  const low = M.lowestValue(ctx, me, 3).map(p => p.key);
  assert.ok(M.lowestValue(ctx, me, 3, low).every(p => !low.includes(p.key)));
  const rows = M.simpleAdds(ctx, 1, { limit: 40, keep: low });
  assert.ok(rows.length > 0 && rows.every(r => !r.drop || !low.includes(r.drop.key)));
  const plan = M.addPlan(ctx, { keep: low });
  assert.ok(plan.droppable.every(p => !low.includes(p.key)) && plan.moves.every(m => !m.drop || !low.includes(m.drop.key)));
});

test('a drop cap limits the drops in the list and the plan to the worst N, after the keep list', () => {
  const worst = M.lowestValue(ctx, me, 1)[0].key;
  const rows = M.simpleAdds(ctx, 1, { limit: 40, drops: 1 });
  assert.ok(rows.length > 0 && rows.every(r => !r.drop || r.drop.key === worst));
  const plan = M.addPlan(ctx, { droppable: 2 });
  assert.strictEqual(plan.droppable.length, 2);
  const added = new Set(), ok = plan.moves.every(m => { const good = !m.drop || plan.droppable.some(p => p.key === m.drop.key) || added.has(m.drop.key); added.add(m.add.key); return good; });
  assert.ok(ok);
  const kept = M.addPlan(ctx, { droppable: 1, keep: [worst] });
  assert.deepStrictEqual(kept.droppable.map(p => p.key), M.lowestValue(ctx, me, 1, [worst]).map(p => p.key));
  assert.ok(!kept.droppable.some(p => p.key === worst));
  const all = M.addPlan(ctx, {}), same = M.addPlan(ctx, { droppable: undefined });
  assert.deepStrictEqual(all.moves.map(m => m.add.key), same.moves.map(m => m.add.key));
});

test('a capped plan ranks its candidates only against allowed drops', () => {
  const seen = M.simpleAdds(ctx, 1, { limit: 30, drops: 1 }).map(r => r.add.key);
  const plan = M.addPlan(ctx, { droppable: 1, candidates: 30 });
  assert.ok(plan.moves.every(m => seen.includes(m.add.key) || plan.moves.some(x => x !== m && x.add.key === m.add.key)));
});

test('a drop cap larger than the bench never lets the plan drop more than All does', () => {
  const bench = ctx.L.maxPlayers - ctx.L.maxActive;
  assert.strictEqual(M.addPlan(ctx, { droppable: 99 }).droppable.length, M.addPlan(ctx, {}).droppable.length);
  assert.ok(M.addPlan(ctx, { droppable: 99 }).droppable.length <= bench);
});

test('weekly k is 0.72 / 0.82 for the Matchup Analyzer (calib_pair fit; #157 line P measured the Team-tab forecaster, not this one, so the .78 of 2026-10-29 was reverted; the rest-of-season k is WinK.SHRINK, #147)', () => {
  assert.strictEqual(M.K_MATCH, 0.72); assert.strictEqual(M.K_CAT, 0.82); assert.strictEqual(M.KR_MATCH, undefined);
  const a = M.teamSegments(ctx, me, 2), b = M.teamSegments(ctx, I.opponentOf(L, me, 2), 2), w = M.scoreSegments(ctx, a, b, false), p = M.projectWeek(ctx, me, 2);
  assert.strictEqual(p.match, w.match);   // a future week in the Matchup Analyzer uses the weekly k
});
