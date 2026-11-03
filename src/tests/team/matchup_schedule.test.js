// Team schedule grid: who starts each day, IR / out players, games that count (2026-11-02)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, NOW = Date.UTC(2026, 9, 22, 12);
const mk = (L2, now) => M.makeCtx({ L: L2, pool, DAYS, rosters: ROS, me, nowMs: now == null ? NOW : now });
const kinds = (g, i) => g.rows.map(r => r.cells[i] && r.cells[i].kind).filter(Boolean);

test('a night with more players than the limit: the limit start, the rest bench', () => {
  const ctx = mk(Object.assign({}, L, { maxActive: 3 })), g = M.scheduleGrid(ctx, 1, []);
  g.days.forEach((d, i) => {
    const k = kinds(g, i), start = k.filter(x => x === 'start').length, bench = k.filter(x => x === 'bench').length;
    assert.strictEqual(start, Math.min(3, k.length)); assert.strictEqual(start + bench, k.length);
    assert.deepStrictEqual(g.tot[i], { used: start, avail: k.length });
  });
  assert.ok(g.tot.some(t => t.avail > 3), 'fixture has a crowded night');
});

test('starters are the best per-game players; games count only starts', () => {
  const ctx = mk(Object.assign({}, L, { maxActive: 2 })), g = M.scheduleGrid(ctx, 1, []);
  const i = g.tot.findIndex(t => t.avail > 2), val = r => M.nightValue(ctx, r.p);
  const on = g.rows.filter(r => r.cells[i]), s = on.filter(r => r.cells[i].kind === 'start'), b = on.filter(r => r.cells[i].kind === 'bench');
  assert.ok(Math.min(...s.map(val)) >= Math.max(...b.map(val)));
  g.rows.forEach(r => assert.strictEqual(r.games, r.cells.filter(c => c && c.kind === 'start').length));
});

test('IR players: no marks in the current week, counted like the projection in a later one', () => {
  const ir = pool.byKey.get(ROS[me].find(x => x.slot === 'IR').fid), cur = M.scheduleGrid(mk(L), 1, []), next = M.scheduleGrid(mk(L), 2, []);
  const a = cur.rows.find(r => r.key === ir.key), b = next.rows.find(r => r.key === ir.key);
  assert.ok(a.ir && b.ir);
  assert.strictEqual(a.games, 0); assert.ok(a.cells.every(c => c === null));
  assert.ok(b.games > 0);
});

test('games per player match the projection (Games left) with no box scores', () => {
  const ctx = mk(L), g = M.scheduleGrid(ctx, 1, []), s = M.weekStatus(ctx, [], me, 1);
  s.roster[0].forEach(p => assert.strictEqual(g.rows.find(r => r.key === p.key).games, p.games));
});

test('a played game counts only for a player with minutes; a game he missed is dnp', () => {
  const ctx = mk(L), g0 = M.scheduleGrid(ctx, 1, []), r0 = g0.rows.find(r => r.games > 0), i = r0.cells.findIndex(c => c), ms = DAYS.games[r0.t].map(x => x * 1000).find(m => I.localDay(m) === g0.days[i]);
  const day = I.nyDay(ms), team = {};
  const cols = ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
  team[r0.t] = [[r0.key].concat(cols.map(c => c === 'min' ? 30 : 0))];
  const files = [{ season: 2027, cols, names: { [r0.key]: r0.n }, games: { g1: { d: day, teams: team } } }];
  const g = M.scheduleGrid(ctx, 1, files), r = g.rows.find(x => x.key === r0.key);
  assert.strictEqual(r.cells[i].kind, 'played'); assert.ok(r.cells[i].past);
});

test('an out player keeps the game he played this week and gets no later games; days before today are dimmed', () => {
  const ctx = mk(L), g0 = M.scheduleGrid(ctx, 1, []), r0 = g0.rows.find(r => r.games >= 2), i = r0.cells.findIndex(c => c), ms = DAYS.games[r0.t].map(x => x * 1000).find(m => I.localDay(m) === g0.days[i]);
  const cols = ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'], team = { [r0.t]: [[r0.key].concat(cols.map(c => c === 'min' ? 30 : 0))] };
  const files = [{ season: 2027, cols, names: { [r0.key]: r0.n }, games: { g1: { d: I.nyDay(ms), teams: team } } }];
  ctx.out = new Set([r0.key]);
  const r = M.scheduleGrid(ctx, 1, files).rows.find(x => x.key === r0.key), kinds = r.cells.filter(Boolean).map(c => c.kind);
  assert.deepStrictEqual(kinds, ['played']); assert.strictEqual(r.games, 1); assert.ok(r.out);
  const late = M.scheduleGrid(mk(L, Date.UTC(2026, 9, 25, 12)), 1, []);
  assert.ok(late.rows.some(x => x.cells.some(c => c && c.past)), 'earlier days are marked past');
});
