const test = require('node:test'), assert = require('node:assert');
const S = require('../league_store.js'), FXL = require('./fixtures/fx_league.json'), FXS = require('./fixtures/fx_standings.json'), SCHED = require('../sched.json');
const SLOTS = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'G/C', 'F/C', 'U'];

test('fxSlots reads the fixture league lineup', () => { assert.deepStrictEqual(S.fxSlots(FXL), SLOTS); assert.strictEqual(S.fxSlots({}), null); });
test('Load overwrites teams, roster and lineup only, with a one-line note', () => {
  const before = Object.assign({}, S.LEAGUE_DEF, { teams: 12, roster: 13, scoring: 'most', cats: 8, ilSpots: 2, asb: 'separate', poStart: 20, poFmt: '1-2-2' });
  const r = S.applyFantrax(before, FXL);
  assert.deepStrictEqual([r.settings.teams, r.settings.roster, r.settings.luSplit, r.settings.luC, r.settings.luG, r.settings.luF, r.settings.luGC, r.settings.luFC, r.settings.luU], [14, 12, true, 1, 3, 3, 1, 1, 1]);
  assert.deepStrictEqual(r.settings.luFx, SLOTS);
  assert.deepStrictEqual([r.settings.scoring, r.settings.cats, r.settings.ilSpots, r.settings.asb, r.settings.poStart, r.settings.poFmt], ['most', 8, 2, 'separate', 20, '1-2-2']);
  assert.strictEqual(r.note, 'Updated from Fantrax: Teams 12 → 14 · Roster size 13 → 12 · Lineup PG SG G SF PF F C G/C F/C UTIL.');
  assert.deepStrictEqual(S.applyFantrax(r.settings, FXL).changes, []);
  assert.strictEqual(S.applyFantrax(r.settings, FXL).note, 'Settings already match Fantrax.');
});
test('a league without roster info changes the team count only', () => {
  const r = S.applyFantrax(S.LEAGUE_DEF, { teamInfo: { a: {}, b: {}, c: {}, d: {}, e: {}, f: {} } });
  assert.deepStrictEqual([r.settings.teams, r.settings.roster, r.settings.luFx], [6, 12, undefined]);
});
test('teamsOf lists every team with its record, sorted by name', () => {
  const t = S.teamsOf(FXL, FXS); assert.strictEqual(t.length, 14); assert.strictEqual(t[0].name, 'Team 1'); assert.strictEqual(t[13].name, 'Team 14');
  assert.ok(t.every(x => x.id && x.record === '0-0-0'));
});
test('schedule helpers match the board', () => {
  const m = S.weekPlan(SCHED, 'merged'); assert.strictEqual(m.count, 24); assert.deepStrictEqual(m.idx[17], [17, 18]); assert.strictEqual(S.weekPlan(SCHED, 'separate').count, 25);
  assert.deepStrictEqual(S.playoffRounds(SCHED, { asb: 'merged', poStart: 18, poFmt: '2-2-2' }).rounds, [[18, 19], [20, 21], [22, 23]]);
  assert.strictEqual(S.playoffRounds(SCHED, { asb: 'merged', poStart: 23, poFmt: '2-2-2' }).fits, false);
  assert.strictEqual(S.clampPoStart({ asb: 'merged', poStart: 25 }, SCHED).poStart, 24); assert.strictEqual(S.clampPoStart({ asb: 'merged', poStart: 5 }, SCHED).poStart, 10);
  assert.strictEqual(S.withAsb({ asb: 'merged', poStart: 18 }, 'separate').poStart, 19); assert.strictEqual(S.withAsb({ asb: 'separate', poStart: 18 }, 'merged').poStart, 17);
  assert.strictEqual(S.withAsb({ asb: 'merged', poStart: 18 }, 'merged').poStart, 18);
});
test('fxDraftPlan maps picks, skips past the board, refuses a different team count', () => {
  const d = { draftOrder: ['a', 'b', 'c', 'd'], draftPicks: [{ round: 1, pickInRound: 2, teamId: 'b', playerId: 'p1' }, { round: 4, pick: 13, teamId: 'a' }, { round: 9, pickInRound: 1, teamId: 'a', playerId: 'p9' }] };
  const r = S.fxDraftPlan(d, 4, 8, null);
  assert.deepStrictEqual(r.items, [{ k: 1, t: 1, fid: 'p1' }, { k: 12, t: 0, fid: null }]); assert.strictEqual(r.skipped, 1); assert.strictEqual(r.error, null);
  assert.match(S.fxDraftPlan(d, 6, 8, null).error, /Settings say 6 teams; this league's draft has 4/);
  assert.match(S.fxDraftPlan({ draftPicks: [] }, 4, 8, { teamInfo: {} }).error, /no teams or draft order/);
});
test('sameLeague compares the effective lineup, so a missing luFx that matches the dropdowns is no difference', () => {
  const base = S.normalize(S.LEAGUE_DEF), withFx = Object.assign({}, base, { luFx: S.lineupSlots(base) });
  assert.strictEqual(S.sameLeague(base, withFx), true);
  assert.strictEqual(S.sameLeague(base, Object.assign({}, base, { luFx: SLOTS })), false);
  assert.strictEqual(S.sameLeague(base, Object.assign({}, base, { teams: 12 })), false);
});

test('Load keeps points scoring and point values', () => {
  const before = Object.assign({}, S.LEAGUE_DEF, { scoring: 'points', pointVals: Object.assign({}, S.LEAGUE_DEF.pointVals, { to: -1 }) });
  const r = S.applyFantrax(before, FXL);
  assert.deepStrictEqual([r.settings.scoring, r.settings.pointVals.to], ['points', -1]);
});
