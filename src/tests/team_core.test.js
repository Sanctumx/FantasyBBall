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
