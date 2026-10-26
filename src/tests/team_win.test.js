// Team tab win numbers: matrix, player Win, module scores (#131 PR 2, 2026-10-25)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), T = require('../team_core.js'), W = require('../team_win.js'), M = require('../matchup_core.js'), Pl = require('../inseason_players.js');
const fx = n => require('./fixtures/' + n), PLAYERS = require('../players.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const me = L.teams[0].id, ids = L.teams.map(t => t.id), other = ids[1];
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

const per = n => L.periods.find(p => p.n === n), last = per(L.lastRegular);
// every team plays every other day of the last regular period, from its first day
const teamsAll = [...new Set(pool.players.map(p => p.t).filter(Boolean))];
const games = (from, to) => { const g = {}; teamsAll.forEach(t => { g[t] = []; for (let s = from / 1000 + 3600; s < to / 1000; s += 2 * 86400) g[t].push(s); }); return { games: g }; };
const mk = (nowMs, DAYS, LL) => M.makeCtx({ L: LL || L, pool, DAYS, rosters: ROS, me, nowMs });
const stateOf = () => T.initState(ROS[me]);

test('weeksLeft: the share of each remaining regular period inside the window', () => {
  const fake = { L: { lastRegular: 3, periods: [{ n: 1, start: 0, end: 100 }, { n: 2, start: 100, end: 200 }, { n: 3, start: 200, end: 300 }, { n: 4, start: 300, end: 400 }] }, nowMs: 50 };
  // Team.window works in ms from ctx.nowMs to the end of the last regular period
  assert.ok(near(W.weeksLeft(fake), 2.5));
  assert.strictEqual(W.weeksLeft(Object.assign({}, fake, { nowMs: 350 })), 0);
});

test('oppState: IL players and excluded keys are gone, slots follow Fantrax', () => {
  const ctx = mk(last.start, games(last.start, last.end)), tid = other, keys = ROS[tid].map(x => x.fid);
  const il = ROS[tid].filter(x => x.slot === 'IR').map(x => x.fid), drop = keys.find(k => !il.includes(k));
  const s = W.oppState(ctx, tid, new Set([drop]));
  il.forEach(k => assert.ok(!(k in s.slots)));
  assert.ok(!(drop in s.slots));
  assert.strictEqual(s.order.length, keys.length - il.length - 1);
  s.order.forEach(k => assert.ok(['active', 'bench'].includes(s.slots[k])));
});

test('side: only active and bench players become entries', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), n = st.order.filter(k => ['active', 'bench'].includes(st.slots[k])).length;
  assert.strictEqual(W.side(ctx, st, 1).length, n);
  const moved = T.moveSlot(st, st.order[0], 'reserve');
  assert.strictEqual(W.side(ctx, moved, 1).length, n - (['active', 'bench'].includes(st.slots[st.order[0]]) ? 1 : 0));
});

// with no crowded nights, one whole period left equals the calibrated whole-games path (Matchup.scoreSegments)
test('matrix: one whole period left reproduces Matchup.scoreSegments for every opponent', () => {
  const L2 = Object.assign({}, L, { maxActive: 100 }), ctx = mk(last.start, games(last.start, last.end), L2), st = stateOf();
  const m = W.matrix(ctx, st, { k: { match: M.KW_MATCH, cat: M.KW_CAT } });
  assert.ok(near(m.weeks, 1));
  const segs = (keys) => keys.map(key => ({ key, from: last.start, to: last.end }));
  const mine = segs(st.order.filter(k => ['active', 'bench'].includes(st.slots[k])));
  m.teams.forEach(cell => {
    const os = W.oppState(ctx, cell.id, new Set(st.order)), r = M.scoreSegments(ctx, mine, segs(os.order), true);
    assert.ok(near(cell.match, r.match, 1e-12), cell.id);
    r.cat.forEach((p, c) => assert.ok(near(cell.cat[c], p, 1e-12), cell.id + ' cat ' + c));
  });
  assert.strictEqual(m.teams.length, ids.length - 1);
});

test('matrix: two identical periods give the same cell as one', () => {
  const L2 = Object.assign({}, L, { maxActive: 100 }), p14 = per(L.lastRegular - 1);
  const g = games(p14.start, last.end).games;   // every other day across both periods
  const one = W.matrix(mk(last.start, { games: g }, L2), stateOf()), two = W.matrix(mk(p14.start, { games: g }, L2), stateOf());
  assert.ok(near(two.weeks, 2));
  assert.ok(Math.abs(one.mean.match - two.mean.match) < 0.01, one.mean.match + ' ' + two.mean.match);   // same cadence, so near equal (day parity can differ by a game)
});

test('matrix: a player I bring in leaves his old team, and Reserve equals swapped out', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), inK = ROS[other].find(x => x.slot === 'ACTIVE').fid;
  const sw = T.applySwap(st, [st.order[0]], [inK]);
  const exclude = new Set(sw.order), x = W.matrix(ctx, sw).teams.find(t => t.id === other);
  assert.ok(!W.oppState(ctx, other, exclude).order.includes(inK));
  assert.ok(x.match >= 0 && x.match <= 1);
  const rsv = W.matrix(ctx, T.moveSlot(st, st.order[0], 'reserve')), out = W.matrix(ctx, T.applySwap(st, [st.order[0]], []));
  assert.ok(near(rsv.mean.match, out.mean.match, 1e-12) && near(rsv.mean.winC, out.mean.winC, 1e-12));
});

test('matrix: 8 categories leave the last one null and sum eight chances', () => {
  const ctx = mk(last.start, games(last.start, last.end)), m = W.matrix(ctx, stateOf(), { cats: 8 }), t = m.teams[0];
  assert.strictEqual(t.cat[8], null);
  assert.ok(near(t.winC, t.cat.slice(0, 8).reduce((a, b) => a + b, 0)));
  assert.strictEqual(m.mean.cat[8], null);
});

test('matrix: state, roster and pool are not changed, and no games left gives an empty matrix', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), snap = JSON.stringify([st, ctx.roster]), n = ctx.pool.byKey.size;
  W.matrix(ctx, st); W.playerWin(ctx, st);
  assert.strictEqual(JSON.stringify([st, ctx.roster]), snap);
  assert.strictEqual(ctx.pool.byKey.size, n);
  const over = mk(last.end + 1000, games(last.start, last.end));
  assert.deepStrictEqual(W.matrix(over, st), { weeks: 0, teams: [], mean: null });
});

test('playerWin: bench-refill contribution equals the matrix difference; IL rows are hypothetical', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), pw = W.playerWin(ctx, st), base = W.matrix(ctx, st);
  const k = st.order.find(x => st.slots[x] === 'active'), w = W.matrix(ctx, T.moveSlot(st, k, 'reserve'));
  assert.ok(near(pw[k].m, 100 * (base.mean.match - w.mean.match), 1e-9) && near(pw[k].c, 100 * (base.mean.winC - w.mean.winC), 1e-9));
  st.order.filter(x => st.slots[x] === 'il').forEach(x => assert.strictEqual(pw[x].hypo, true));
  const best = st.order.filter(x => st.slots[x] === 'active').map(x => ctx.pool.byKey.get(x)).sort((a, b) => Pl.valueZ(b.line, 82, ctx.ref) - Pl.valueZ(a.line, 82, ctx.ref))[0];
  assert.ok(pw[best.key].m > 0);
});

test('moduleScores: the worst Active/Bench player shows 0, a candidate equals the explicit swap, weights only re-sort', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), pw = W.playerWin(ctx, st), counted = st.order.filter(k => ['active', 'bench'].includes(st.slots[k]));
  const worst = counted.reduce((a, b) => pw[b].m < pw[a].m ? b : a), cands = ROS[other].map(x => x.fid).slice(0, 6), base = W.matrix(ctx, st);
  const rows = W.moduleScores(ctx, st, { candidates: cands.concat(worst) });
  assert.strictEqual(rows.find(r => r.key === worst).dM, 0);
  const c = cands[0], s = T.moveSlot(T.applySwap(st, [worst], [c]), c, st.slots[worst]), m = W.matrix(ctx, s);
  assert.ok(near(rows.find(r => r.key === c).dM, 100 * (m.mean.match - base.mean.match), 1e-9));
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].sort >= r.sort));
  // a weight on one category re-sorts by that category's change, and leaves dM alone
  const w = [1, 1, 1, 0, 1, 1, 1, 1, 1], rw = W.moduleScores(ctx, st, { candidates: cands, weights: w });
  rw.forEach(r => assert.ok(near(r.dM, rows.find(q => q.key === r.key).dM, 1e-12)));
  rw.forEach(r => assert.ok(near(r.sort, r.dCat.reduce((a, v, i) => a + v * w[i], 0), 1e-9)));
  const only3 = W.moduleScores(ctx, st, { candidates: cands, weights: [0, 0, 0, 1, 0, 0, 0, 0, 0] });
  assert.ok(only3.every((r, i) => i === 0 || only3[i - 1].dCat[3] >= r.dCat[3] - 1e-12));
});

test('moduleScores vs average: subtracts the average-player entry and never touches the pool', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), cands = ROS[other].map(x => x.fid).slice(0, 4), n = ctx.pool.byKey.size;
  const rep = W.moduleScores(ctx, st, { candidates: cands }), avg = W.moduleScores(ctx, st, { candidates: cands, baseline: 'avg' });
  assert.strictEqual(ctx.pool.byKey.has(W.AVG_KEY), false);
  assert.strictEqual(ctx.pool.byKey.size, n);
  const off = rep[0].dM - avg.find(r => r.key === rep[0].key).dM;
  rep.forEach(r => assert.ok(near(r.dM - avg.find(q => q.key === r.key).dM, off, 1e-9)));
});

test('moduleScores works on a 2-for-1 preview state', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = T.applySwap(stateOf(), stateOf().order.slice(0, 2), [ROS[other][0].fid]);
  const rows = W.moduleScores(ctx, st, { candidates: ROS[ids[2]].map(x => x.fid).slice(0, 3) });
  assert.strictEqual(rows.length, 3);
  rows.forEach(r => assert.ok(Number.isFinite(r.dM)));
});

test('moduleScores: my own rows carry per-category changes, so weighted sorts and dCat sums hold; default shrink is K; cache matches a fresh ctx', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), own = st.order.filter(k => ['active', 'bench', 'il'].includes(st.slots[k]));
  const w = [1, 1, 1, 0, 1, 1, 1, 1, 1], rows = W.moduleScores(ctx, st, { candidates: own.concat(ROS[other][0].fid), weights: w });
  rows.forEach(r => {
    assert.ok(near(r.sort, r.dCat.reduce((a, v, i) => a + v * w[i], 0), 1e-9), r.key);
    assert.ok(near(r.dCat.reduce((a, v) => a + v, 0), r.dC, 1e-9), r.key);
  });
  assert.ok(W.moduleScores(ctx, st, {}).some(r => r.key === own[0]));   // default list includes my roster
  // default shrink: the cell is the raw pairMatchup chance pulled toward 0.5 by K
  const raw = W.matrix(ctx, st, { k: { match: 1, cat: 1 } }), def = W.matrix(ctx, st);
  assert.ok(near(def.teams[0].match, 0.5 + M.K_MATCH * (raw.teams[0].match - 0.5), 1e-12));
  assert.ok(near(def.teams[0].cat[0], 0.5 + M.K_CAT * (raw.teams[0].cat[0] - 0.5), 1e-12));
  // two previews on one ctx (cache warm) equal the same previews on fresh ctxs
  const sw = T.applySwap(st, [st.order[0]], [ROS[other][1].fid]), g = games(last.start, last.end);
  W.matrix(ctx, st);
  const a = W.matrix(ctx, sw), b = W.matrix(mk(last.start, g), sw);
  assert.deepStrictEqual(a.teams.map(t => t.match), b.teams.map(t => t.match));
});
