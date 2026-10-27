// Weekly Matchup Analyzer: waiver add plan for the current week (2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, NOW = Date.UTC(2026, 9, 21, 12);
const ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: NOW });
const per = L.periods.find(p => p.n === 1);

// segments of my team after applying plan moves (in plan order)
function applied(plan) {
  const segs = M.teamSegments(ctx, me, 1);
  plan.moves.forEach(m => {
    const t = I.dayStart(m.day);
    if (m.drop) { const s = segs.filter(x => x.key === m.drop.key && x.to > t).pop(); s.to = t; }
    segs.push({ key: m.add.key, from: t, to: per.end });
  });
  return segs;
}
const oppSegs = M.teamSegments(ctx, I.opponentOf(L, me, 1), 1);

test('never more moves than adds left; zero adds = no moves', () => {
  assert.ok(M.addPlan(ctx, { addsLeft: 2 }).moves.length <= 2);
  assert.strictEqual(M.addPlan(ctx, { addsLeft: 0 }).moves.length, 0);
});

test('each move raises the match chance and end matches a recompute', () => {
  const plan = M.addPlan(ctx, { addsLeft: 4 });
  assert.ok(plan.moves.length > 0);
  let prev = plan.start;
  plan.moves.forEach(m => { assert.ok(m.match > prev + 1e-4); prev = m.match; });
  assert.strictEqual(plan.end, prev);
  assert.ok(Math.abs(M.scoreSegments(ctx, applied(plan), oppSegs, true).match - plan.end) < 1e-12);
  assert.ok(Math.abs(plan.start - M.scoreSegments(ctx, M.teamSegments(ctx, me, 1), oppSegs, true).match) < 1e-12);
});

test('drops come only from the droppable set or earlier adds', () => {
  const plan = M.addPlan(ctx, { addsLeft: 4 }), ok = new Set(plan.droppable.map(p => p.key)), added = new Map();
  assert.strictEqual(plan.droppable.length, L.maxPlayers - L.maxActive);
  plan.moves.slice().sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0).forEach(m => {
    if (m.drop) assert.ok(ok.has(m.drop.key) || (added.has(m.drop.key) && added.get(m.drop.key) < m.day), m.drop.key);
    added.set(m.add.key, m.day);
  });
});

test('move days are from tomorrow to the period end', () => {
  const plan = M.addPlan(ctx, { addsLeft: 4 });
  plan.moves.forEach(m => {
    assert.ok(I.dayStart(m.day) >= M.addFrom(ctx, 1) && I.dayStart(m.day) < per.end, m.day);
    assert.strictEqual(m.period, 1);
    assert.ok(m.add.owner === null);
  });
});

test('non-current week gives the current-week note', () => {
  const plan = M.addPlan(ctx, { periods: [2] });
  assert.deepStrictEqual(plan.moves, []);
  assert.strictEqual(plan.note, 'Plans cover the current week only');
});

test('the plan for the fixture league is fast', () => {
  const t = Date.now(); M.addPlan(ctx, {});
  assert.ok(Date.now() - t < 2000);
});
