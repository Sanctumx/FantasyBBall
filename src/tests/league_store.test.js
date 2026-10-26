const test = require('node:test'), assert = require('node:assert');
const S = require('../league_store.js');
const ZERO = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tpm: 0, fgm: 0, fga: 0, ftm: 0, fta: 0 };
const getter = d => k => (k in d ? d[k] : null), J = JSON.stringify;

test('league defaults are the Draft Kit defaults', () => {
  assert.deepStrictEqual(S.LEAGUE_DEF, { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3, luSplit: true, luC: 2, luG: 3, luF: 3, luGC: 0, luFC: 0, luU: 2, pointVals: ZERO });
});
test('normalize keeps valid saved values, drops draft keys, repairs only invalid ones', () => {
  const v = { teams: 10, roster: 13, scoring: 'most', cats: 8, asb: 'separate', poStart: 20, poFmt: '1-1-1', ilSpots: 0, luSplit: false, luC: 0, luG: 6, luF: 0, luGC: 3, luFC: 0, luU: 10 };
  assert.deepStrictEqual(S.normalize(Object.assign({ slot: 4, field: 'strong', order: 'snake' }, v)), Object.assign({ pointVals: ZERO }, v));
  const r = S.normalize({ teams: 'x', roster: 99, scoring: 'pts', cats: 7, luC: 9, luFx: ['ZZ'] });
  assert.deepStrictEqual([r.teams, r.roster, r.scoring, r.cats, r.luC, 'luFx' in r], [14, 12, 'h2h', 9, 2, false]);
  assert.deepStrictEqual(S.normalize({ luFx: ['PG', 'G/C', 'U'] }).luFx, ['PG', 'G/C', 'U']);
});
test('a first visit gets defaults and no league', () => {
  const s = S.load(getter({})); assert.deepStrictEqual(s.settings, S.LEAGUE_DEF); assert.strictEqual(s.league, null); assert.strictEqual(s.migrated, true);
});
test('an old board carries its league settings and connected league over; draft settings stay behind', () => {
  const board = { cfg: { teams: 12, roster: 13, scoring: 'most', cats: 8, slot: 5, order: 'snake', field: 'strong', luC: 1, luFx: ['PG', 'C', 'U'] }, fx: { leagueId: 'abc123', order: ['a', 'b'], names: { a: 'Alpha', b: 'Beta' } } };
  const s = S.load(getter({ 'courtside-board-v1': J(board), 'courtside-leagues-v1': J([{ id: 'abc123', name: 'Home', myTeam: 'b', used: 1 }]) }));
  assert.deepStrictEqual([s.settings.teams, s.settings.roster, s.settings.scoring, s.settings.cats, s.settings.luC], [12, 13, 'most', 8, 1]);
  assert.deepStrictEqual(s.settings.luFx, ['PG', 'C', 'U']); assert.ok(!('slot' in s.settings) && !('field' in s.settings));
  assert.deepStrictEqual(s.league, { id: 'abc123', name: 'Home', teams: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], loadedAt: null });
});
test('active league after migration: board fx, then the In-Season league, then the newest saved league', () => {
  const lg = J([{ id: 'old1', name: 'A', used: 1 }, { id: 'new2', name: 'B', used: 9 }]);
  assert.strictEqual(S.load(getter({ 'courtside-leagues-v1': lg, 'courtside-inseason-v1': J({ leagueId: 'old1' }) })).league.id, 'old1');
  // the old Matchup page defaulted to a hard-coded league nobody saved: it must not become everyone's league
  assert.strictEqual(S.load(getter({ 'courtside-leagues-v1': lg, 'courtside-inseason-v1': J({ leagueId: 'zz99' }) })).league.id, 'new2');
  assert.strictEqual(S.load(getter({ 'courtside-inseason-v1': J({ leagueId: 'zz99' }) })).league, null);
  assert.strictEqual(S.load(getter({ 'courtside-leagues-v1': lg })).league.id, 'new2');
});
test('once written, the settings key wins over old keys', () => {
  const s = S.load(getter({ 'courtside-settings-v1': J({ v: 1, settings: { teams: 10 }, league: null, note: '' }), 'courtside-board-v1': J({ cfg: { teams: 12 }, fx: { leagueId: 'abc123' } }) }));
  assert.deepStrictEqual([s.settings.teams, s.league, s.migrated], [10, null, false]);
});
test('corrupt JSON anywhere gives defaults without throwing', () => {
  const s = S.load(getter({ 'courtside-settings-v1': '{', 'courtside-board-v1': 'nope', 'courtside-leagues-v1': '[' }));
  assert.deepStrictEqual(s.settings, S.LEAGUE_DEF);
});
test('save then load round-trips', () => {
  const out = {}, st = { settings: Object.assign({}, S.LEAGUE_DEF, { teams: 10 }), league: { id: 'q1w2', name: 'X', teams: [], loadedAt: 5 }, note: 'n' };
  S.save((k, v) => { out[k] = v; }, st); const back = S.load(getter(out)); delete back.migrated; assert.deepStrictEqual(back, st);
});
test('saved leagues: newest first, a custom name survives a reload, forget removes', () => {
  const d = { 'courtside-leagues-v1': J([{ id: 'a1b2', name: 'Mine', custom: true, myTeam: 't1', used: 1 }, { id: 'c3d4', name: 'Other', used: 2 }]) }, get = getter(d), set = (k, v) => { d[k] = v; };
  assert.deepStrictEqual(S.savedLeagues(get).map(x => x.id), ['c3d4', 'a1b2']);
  S.rememberLeague(get, set, 'a1b2', 'Fantrax Name', null);
  const a = S.savedLeagues(get).find(x => x.id === 'a1b2'); assert.deepStrictEqual([a.name, a.myTeam], ['Mine', 't1']);
  assert.strictEqual(S.defaultTeam(get, 'a1b2'), 't1');
  S.forgetLeague(get, set, 'c3d4'); assert.deepStrictEqual(S.savedLeagues(get).map(x => x.id), ['a1b2']);
});
test('scoring is kept per saved league; a league saved before this has category scoring', () => {
  const d = { 'courtside-leagues-v1': J([{ id: 'old1', name: 'Old', used: 1 }, { id: 'pts1', name: 'Pts', used: 2 }]) }, get = getter(d), set = (k, v) => { d[k] = v; };
  assert.deepStrictEqual(S.leagueScoring(get, 'old1'), { scoring: 'h2h', pointVals: ZERO });
  assert.strictEqual(S.leagueScoring(get, 'nope'), null);
  S.setLeagueScoring(get, set, 'pts1', Object.assign({}, S.LEAGUE_DEF, { scoring: 'points', pointVals: { pts: 1, to: -1 } }));
  assert.deepStrictEqual(S.leagueScoring(get, 'pts1'), { scoring: 'points', pointVals: Object.assign({}, ZERO, { pts: 1, to: -1 }) });
  S.rememberLeague(get, set, 'pts1', 'Fantrax', null);   // reconnecting keeps it
  assert.strictEqual(S.leagueScoring(get, 'pts1').scoring, 'points');
  assert.strictEqual(S.leagueScoring(get, 'old1').scoring, 'h2h');
});
test('pickTeam: remembered, else the default, else the first team', () => {
  const ids = ['t1', 't2', 't3'];
  assert.strictEqual(S.pickTeam('t3', ids, 't2'), 't3'); assert.strictEqual(S.pickTeam('gone', ids, 't2'), 't2'); assert.strictEqual(S.pickTeam(null, ids, 'gone'), 't1');
});
test('lineup slots: split G/F, plain C and UTIL, or the Fantrax list', () => {
  assert.deepStrictEqual(S.lineupSlots(S.LEAGUE_DEF), ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'U', 'U']);
  assert.deepStrictEqual(S.lineupSlots({ luFx: ['PG', 'U'] }), ['PG', 'U']);
});

test('points scoring: normalize keeps point values, zeros bad ones, drops unknown keys', () => {
  assert.deepStrictEqual(S.POINT_STATS, ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'fgm', 'fga', 'ftm', 'fta']);
  assert.strictEqual(S.PT_MAX, 100);
  const r = S.normalize({ scoring: 'points', cats: 8, pointVals: { to: -1.5, reb: 1.2, zzz: 5 } });
  assert.deepStrictEqual([r.scoring, r.cats, r.pointVals.to, r.pointVals.reb, 'zzz' in r.pointVals], ['points', 8, -1.5, 1.2, false]);
  assert.deepStrictEqual(Object.assign({}, r.pointVals, { to: 0, reb: 0 }), ZERO);
  ['2', NaN, Infinity, 101, -100.01, null].forEach(bad => assert.strictEqual(S.normalize({ pointVals: { pts: bad } }).pointVals.pts, 0));
  assert.strictEqual(S.normalize({ pointVals: { pts: -100 } }).pointVals.pts, -100);
  const m = S.normalize({}); assert.deepStrictEqual(m.pointVals, ZERO); assert.notStrictEqual(m.pointVals, S.LEAGUE_DEF.pointVals);
});
test('saved settings without point values load unchanged plus zeros', () => {
  const saved = { v: 1, settings: { teams: 10, scoring: 'most' }, league: null, note: '' };
  const s = S.load(getter({ [S.KEYS.settings]: J(saved) })).settings;
  assert.deepStrictEqual([s.teams, s.scoring, s.pointVals], [10, 'most', ZERO]);
});
test('pointVals are league settings but not draft keys, so the Draft board ignores them', () => {
  assert.strictEqual(S.LEAGUE_KEYS.includes('pointVals'), false);
  const a = S.normalize({}), b = S.normalize({ pointVals: { to: -1 } });
  assert.strictEqual(S.sameLeague(a, b), true);
});
test('isPoints and draftSettings', () => {
  assert.strictEqual(S.isPoints({ scoring: 'points' }), true);
  assert.strictEqual(S.isPoints({ scoring: 'h2h' }), false);
  const d = S.draftSettings(S.normalize({ pointVals: { to: -1 } }), { teams: 12, scoring: 'h2h' });
  assert.deepStrictEqual([d.teams, d.scoring, d.pointVals.to], [12, 'h2h', -1]);
  assert.match(S.POINTS_NOTE_HTML, /aren't supported on this tab yet/);
  assert.match(S.POINTS_NOTE_HTML, /Rankings and Team work in points leagues/);
  assert.match(S.POINTS_NOTE_HTML, /Rankings and Team work in points leagues/);
});
