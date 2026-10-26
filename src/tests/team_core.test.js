// Team tab core: preview roster state and swaps (#131, 2026-10-25)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), T = require('../team_core.js');
const fx = n => require('./fixtures/' + n);
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const me = L.teams[0].id, other = L.teams[1].id;
const snap = JSON.stringify(ROS);

test('initState maps Fantrax slots: ACTIVE to active, RESERVE to bench, IR to il', () => {
  const s = T.initState(ROS[me]);
  assert.strictEqual(s.order.length, ROS[me].length);
  ROS[me].forEach(x => assert.strictEqual(s.slots[x.fid], { ACTIVE: 'active', RESERVE: 'bench', IR: 'il' }[x.slot]));
});

test('moveSlot returns a new state and accepts the four slots, including reserve', () => {
  const s = T.initState(ROS[me]), k = s.order[0], n = T.moveSlot(s, k, 'reserve');
  assert.strictEqual(n.slots[k], 'reserve');
  assert.notStrictEqual(n, s);
  assert.notStrictEqual(s.slots[k], 'reserve');
  assert.throws(() => T.moveSlot(s, 'nope', 'bench'));
  assert.throws(() => T.moveSlot(s, k, 'elsewhere'));
});

test('applySwap: 2-for-1 removes the outgoing players, adds the incoming one to the bench, and leaves the saved roster alone', () => {
  const s = T.initState(ROS[me]), outK = s.order.slice(0, 2), inK = ROS[other][0].fid;
  const n = T.applySwap(s, outK, [inK]);
  assert.strictEqual(n.order.length, s.order.length - 1);
  outK.forEach(k => assert.ok(!(k in n.slots)));
  assert.strictEqual(n.slots[inK], 'bench');
  assert.strictEqual(JSON.stringify(ROS), snap);
  assert.strictEqual(s.order.length, ROS[me].length);
});

test('applySwap throws on an unknown outgoing key, a duplicate, or an incoming player already on the roster', () => {
  const s = T.initState(ROS[me]), inK = ROS[other][0].fid;
  assert.throws(() => T.applySwap(s, ['nope'], [inK]));
  assert.throws(() => T.applySwap(s, [s.order[0]], [inK, inK]));
  assert.throws(() => T.applySwap(s, [s.order[0]], [s.order[1]]));
});

test('window runs from now to the end of the last regular period; gamesLeft counts a team\'s tip-offs in it', () => {
  const lg = { lastRegular: 2, periods: [{ n: 1, start: 0, end: 1000 * 100 }, { n: 2, start: 1000 * 100, end: 1000 * 200 }, { n: 3, start: 1000 * 200, end: 1000 * 300 }] };
  const ctx = { L: lg, nowMs: 1000 * 50, DAYS: { games: { AAA: [10, 50, 60, 150, 199, 200, 250], BBB: [] } } };
  assert.deepStrictEqual(T.window(ctx), { from: 1000 * 50, to: 1000 * 200 });
  assert.strictEqual(T.gamesLeft(ctx, 'AAA'), 4);   // 50 (now counts), 60, 150, 199; 200 is the end, 250 is playoffs, 10 is past
  assert.strictEqual(T.gamesLeft(ctx, 'BBB'), 0);
  assert.strictEqual(T.gamesLeft(ctx, 'ZZZ'), 0);
});

// Plays %: real fixture players, hand-built schedule (every team plays once, the same night)
const Pl = require('../inseason_players.js'), M = require('../matchup_core.js'), PLAYERS = require('../players.json');
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const NOW = Date.UTC(2026, 9, 21, 12), NIGHT = Math.floor(Date.UTC(2026, 9, 23, 2) / 1000);
const oneNight = keys => { const g = {}; keys.forEach(k => { g[pool.byKey.get(k).t] = [NIGHT]; }); return { games: g }; };
const mkCtx = keys => M.makeCtx({ L, pool, DAYS: oneNight(keys), rosters: ROS, me, nowMs: NOW });
const stateOf = (act, bench, il, reserve) => ({ order: [].concat(act, bench, il || [], reserve || []), slots: Object.assign({}, ...act.map(k => ({ [k]: 'active' })), ...bench.map(k => ({ [k]: 'bench' })), ...(il || []).map(k => ({ [k]: 'il' })), ...(reserve || []).map(k => ({ [k]: 'reserve' }))) });
const valueOf = (ctx, k) => Pl.valueZ(pool.byKey.get(k).line, 82, ctx.ref);

test('Plays %: 12 active players with a game on a 10-slot night, the two lowest per-game values sit', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 12), ctx = mkCtx(keys), r = T.playsPct(ctx, stateOf(keys, []));
  const sorted = keys.slice().sort((a, b) => valueOf(ctx, b) - valueOf(ctx, a));
  sorted.slice(0, 10).forEach(k => assert.strictEqual(r[k].pct, 1, k));
  sorted.slice(10).forEach(k => assert.strictEqual(r[k].pct, 0, k));
  keys.forEach(k => assert.strictEqual(r[k].gl, 1));
});

test('Plays %: bench players get the slots the active players leave open; IL and reserve rows show what they would get on the bench', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 12), ctx = mkCtx(keys);
  const full = T.playsPct(ctx, stateOf(keys.slice(0, 10), keys.slice(10, 12)));   // 10 active use every slot
  keys.slice(10).forEach(k => assert.strictEqual(full[k].pct, 0));
  const open = T.playsPct(ctx, stateOf(keys.slice(0, 8), keys.slice(8, 10), [keys[10]], [keys[11]]));   // 8 active leave 2 slots
  keys.slice(8, 10).forEach(k => assert.strictEqual(open[k].pct, 1));
  // IL player + the 2 bench players compete for the 2 open slots: the two best per-game values play
  const top2 = new Set(keys.slice(8, 11).sort((a, b) => valueOf(ctx, b) - valueOf(ctx, a)).slice(0, 2));
  assert.strictEqual(open[keys[10]].pct, top2.has(keys[10]) ? 1 : 0);
  const top2r = keys.slice(8, 10).concat(keys[11]).sort((a, b) => valueOf(ctx, b) - valueOf(ctx, a)).slice(0, 2);
  assert.strictEqual(open[keys[11]].pct, top2r.includes(keys[11]) ? 1 : 0);
  const lone = T.playsPct(ctx, stateOf(keys.slice(0, 8), [], [keys[10]], [keys[11]]));
  assert.strictEqual(lone[keys[10]].pct, 1); assert.strictEqual(lone[keys[11]].pct, 1);
});

test('Plays %: pct is null when the team has no games left', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 3), ctx = M.makeCtx({ L, pool, DAYS: { games: {} }, rosters: ROS, me, nowMs: NOW });
  const r = T.playsPct(ctx, stateOf(keys, []));
  keys.forEach(k => { assert.strictEqual(r[k].pct, null); assert.strictEqual(r[k].gl, 0); });
});

// weightedZ and teamLine (task 4)
const R = require('../rankings_core.js'), Rows = R.projSource(PLAYERS, 'avg');

test('weightedZ with all weights 1 reproduces the Rankings Zscore exactly; 0 drops a category; 0.5 halves it', () => {
  const tab = R.table(Rows, { teams: 12, roster: 12, type: 'h2h', basis: 'pergame' }).filter(r => r.z != null).slice(0, 40);
  tab.forEach(r => assert.ok(Math.abs(T.weightedZ(r.cats, null) - r.z) < 1e-12));
  tab.forEach(r => assert.ok(Math.abs(T.weightedZ(r.cats, [1, 1, 1, 1, 1, 1, 1, 1, 1]) - r.z) < 1e-12));
  const r = tab[0], W = Pl.WEIGHTS, w0 = [1, 1, 1, 1, 1, 1, 1, 1, 1], w5 = w0.slice();
  w0[3] = 0; w5[3] = 0.5;
  assert.ok(Math.abs(T.weightedZ(r.cats, w0) - (r.z - r.cats[3] * W[3])) < 1e-12);
  assert.ok(Math.abs(T.weightedZ(r.cats, w5) - (r.z - 0.5 * r.cats[3] * W[3])) < 1e-12);
});

test('teamLine: Plays % x line summed over players, counting stats per active slot, percentages from makes and attempts', () => {
  const a = { fgp: 0.5, fga: 10, ftp: 0.8, fta: 5, tpm: 2, pts: 20, reb: 5, ast: 4, stl: 1, blk: 1, to: 2 };
  const b = { fgp: 0.4, fga: 20, ftp: 0.5, fta: 4, tpm: 1, pts: 10, reb: 3, ast: 2, stl: 0, blk: 0, to: 1 };
  const t = T.teamLine([{ line: a, pct: 1 }, { line: b, pct: 0.5 }], 10);
  assert.ok(Math.abs(t.pts - 2.5) < 1e-12 && Math.abs(t.to - 0.25) < 1e-12);
  assert.ok(Math.abs(t.fga - 2) < 1e-12 && Math.abs(t.fgp - (5 + 4) / 20) < 1e-12);
  assert.ok(Math.abs(t.ftp - (4 + 1) / 7) < 1e-12);
  assert.strictEqual(T.teamLine([], 10).fgp, 0);
  assert.strictEqual(T.teamLine([{ line: a, pct: null }], 10).pts, 0);   // no games left counts for nothing
});

// name search (task 5)
test('search: accent- and case-insensitive, partial, every word must match, starts-with first, limit honoured', () => {
  const list = [{ n: 'Nikola Jokić' }, { n: 'Nikola Vučević' }, { n: 'Jonas Valančiūnas' }, { n: 'Bojan Bogdanović' }, { n: 'Luka Dončić' }, { n: 'Dan Smith' }, { n: 'Anthony Edwards' }];
  const names = q => T.search(list, q).map(x => x.n);
  assert.deepStrictEqual(names('jokic'), ['Nikola Jokić']);
  assert.deepStrictEqual(names('NIK vu'), ['Nikola Vučević']);
  assert.deepStrictEqual(names('doncic'), ['Luka Dončić']);
  assert.deepStrictEqual(names('jo'), ['Nikola Jokić', 'Jonas Valančiūnas']);
  assert.deepStrictEqual(names('an'), ['Anthony Edwards', 'Jonas Valančiūnas', 'Bojan Bogdanović', 'Dan Smith']);   // a word starting with it first, then inside a word, list order within each
  assert.deepStrictEqual(names(''), []);
  assert.deepStrictEqual(names('zzz'), []);
  assert.strictEqual(T.search(list, 'n', 2).length, 2);
});

// review fixes (2026-10-25)
test('Plays %: an "out" player sits out only the rest of the current week, and the bench uses his open nights', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 11), early = Math.floor(NOW / 1000) + 3600, g = {};
  keys.forEach(k => { g[pool.byKey.get(k).t] = [early, NIGHT]; });
  const ctx = M.makeCtx({ L, pool, DAYS: { games: g }, rosters: ROS, me, nowMs: NOW });
  ctx.curEnd = NOW + 2 * 3600 * 1000;   // the current week ends between the two nights
  ctx.out = new Set([keys[0]]);
  const r = T.playsPct(ctx, stateOf(keys.slice(0, 10), [keys[10]]));
  assert.deepStrictEqual([r[keys[0]].gl, r[keys[0]].pct], [2, 0.5]);   // misses the early night only
  assert.strictEqual(r[keys[1]].pct, 1);
  assert.strictEqual(r[keys[10]].pct, 0.5);   // takes the slot the out player leaves on the early night
});

test('weightedZ follows the league: in an 8-category league turnovers carry no weight, as in Rankings.table', () => {
  const tab = R.table(Rows, { teams: 12, roster: 12, type: 'h2h', basis: 'pergame', cats: 8 }).filter(r => r.z != null).slice(0, 20);
  tab.forEach(r => assert.ok(Math.abs(T.weightedZ(r.cats, null, 8) - r.z) < 1e-12));
});

test('playsPct marks IL and reserve rows as hypothetical and teamLine leaves them out', () => {
  const keys = ROS[me].map(x => x.fid).slice(0, 4), ctx = mkCtx(keys), r = T.playsPct(ctx, stateOf(keys.slice(0, 2), [keys[2]], [], [keys[3]]));
  assert.ok(!r[keys[0]].hypo && !r[keys[2]].hypo);
  assert.strictEqual(r[keys[3]].hypo, true);
  const line = pool.byKey.get(keys[0]).line;
  assert.strictEqual(T.teamLine([Object.assign({ line }, r[keys[3]])], 10).pts, 0);
});
