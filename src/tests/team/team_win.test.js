// Team tab win numbers: matrix, player Win, module scores (#131 PR 2, 2026-10-25)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), T = require('../../team_core.js'), W = require('../../team_win.js'), M = require('../../matchup_core.js'), Pl = require('../../inseason_players.js'), Eng = require('../../engine.js');
const fx = n => require('../fixtures/' + n), PLAYERS = require('../../players.json');
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
  s.order.forEach(k => assert.ok(['active', 'reserve'].includes(s.slots[k])));
});

test('side: only active and reserve players become entries', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), n = st.order.filter(k => ['active', 'reserve'].includes(st.slots[k])).length;
  assert.strictEqual(W.side(ctx, st, 1).length, n);
  const moved = T.moveSlot(st, st.order[0], 'il');
  assert.strictEqual(W.side(ctx, moved, 1).length, n - (['active', 'reserve'].includes(st.slots[st.order[0]]) ? 1 : 0));
});

// every team's forecast = the sum of its players' Engine.entryVec at (Plays % games per average week x WEEKS), then one Engine.evaluate run
test('matrix: every cell equals a hand-built Engine.evaluate run over the same entries, shrunk toward 50% by W.SHRINK (#139)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), m = W.matrix(ctx, st), Wk = W.weeksLeft(ctx);
  const adp = p => p.adp == null ? 1e9 : p.adp, list = ctx.pool.players.filter(p => p.g > 0).sort((a, b) => (a.owner ? 0 : 1) - (b.owner ? 0 : 1) || adp(a) - adp(b));
  const cfg = { teams: ids.length, roster: ctx.L.maxActive, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 0, field: 'easy', fieldZ: 'std', puntMode: 'off', puntLock: '',
    catW: Pl.WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0, basis: 'total' };
  const ec = Eng.buildContext(Eng.prepPlayers(list.map((p, i) => Object.assign({}, p.line, { g: p.g, ftx: i + 1 }))), cfg);
  const vecOf = entries => { const mu = new Float64Array(Eng.NC), v = new Float64Array(Eng.NC); entries.forEach(e => { const q = Eng.entryVec(e.p, ec, e.games * Eng.WEEKS); for (let c = 0; c < Eng.NC; c++) { mu[c] += q.x[c]; v[c] += q.pv[c]; } }); return { mu, v }; };
  const tv = [vecOf(W.side(ctx, st, Wk))].concat(m.teams.map(t => vecOf(W.side(ctx, W.oppState(ctx, t.id, new Set(st.order)), Wk))));
  const pl = tv.map((t, i) => ({ id: i, x: t.mu, pv: t.v, adpUse: 1, sd: 1, adpE: 1, sdE: 1, fieldV: 0, boardRaw: 0 }));
  const out = Eng.evaluate(pl, ec, Object.assign({}, cfg, { teams: pl.length, roster: 1 }), { picks: pl.map((_, i) => i), owner: pl.map((_, i) => i) });
  const sh = (p, k) => 0.5 + k * (p - 0.5);
  m.teams.forEach((cell, i) => {
    assert.ok(near(cell.match, sh(out.pairProb(out.teams[0], out.teams[i + 1]), W.SHRINK.match), 1e-12), cell.id);
    cell.cat.forEach((p, c) => assert.ok(near(p, sh(out.catProb(out.teams[0], out.teams[i + 1], c), W.SHRINK.cat), 1e-12), cell.id + ' cat ' + c));
  });
  assert.strictEqual(m.teams.length, ids.length - 1);
});


test('playerGain one player at a time equals playerWin', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), base = W.matrix(ctx, st), all = W.playerWin(ctx, st);
  st.order.forEach(k => assert.deepStrictEqual(W.playerGain(ctx, st, k, base), all[k]));
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
  const rsv = W.matrix(ctx, T.moveSlot(st, st.order[0], 'il')), out = W.matrix(ctx, T.applySwap(st, [st.order[0]], []));
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

test('playerWin: reserve-refill contribution equals the matrix difference; IL rows are hypothetical', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), pw = W.playerWin(ctx, st), base = W.matrix(ctx, st);
  const k = st.order.find(x => st.slots[x] === 'active'), w = W.matrix(ctx, T.applySwap(st, [k], []));
  assert.ok(near(pw[k].m, 100 * (base.mean.match - w.mean.match), 1e-9) && near(pw[k].c, 100 * (base.mean.winC - w.mean.winC), 1e-9));
  st.order.filter(x => st.slots[x] === 'il').forEach(x => assert.strictEqual(pw[x].hypo, true));
  const best = st.order.filter(x => st.slots[x] === 'active').map(x => ctx.pool.byKey.get(x)).sort((a, b) => Pl.valueZ(b.line, 82, ctx.ref) - Pl.valueZ(a.line, 82, ctx.ref))[0];
  assert.ok(pw[best.key].m > 0);
});

test('moduleScores: the worst Active/Reserve player shows 0, a candidate equals the explicit swap, weights only re-sort', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), pw = W.playerWin(ctx, st), counted = st.order.filter(k => ['active', 'reserve'].includes(st.slots[k]));
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

test('Vs replacement, Team tab Season basis, IL on the timeline: the replacement is the lowest counted non-IL player who plays; everyone else is measured against him', () => {
  const ctx = Object.assign({}, mk(last.start, games(last.start, last.end)), { teamTab: true, basis: 'total' }), st = T.tabState(ROS[me]);
  const il = st.order.filter(k => st.slots[k] === 'il'), act = st.order.filter(k => st.slots[k] === 'active');
  assert.ok(il.length && act.length >= ctx.L.maxActive, 'premise: IL player and full Active slots');
  const su = W.moduleSetup(ctx, st, { baseline: 'rep' }), pct = m => 100 * m.mean.match, cur = pct(su.base), pl = W.plays(ctx, st, { tid: me });
  assert.ok(!il.includes(su.worst), 'an IL player is never the replacement');
  assert.ok(pl[su.worst].played > 0);
  const cand = T.counted(st, ctx).filter(k => st.slots[k] !== 'il' && pl[k].played > 0 && pl[k].drop == null);   // a player dropped at an IL return is not the replacement
  cand.forEach(k => assert.ok(su.pw[su.worst].m <= su.pw[k].m + 1e-12, 'the lowest contribution among them ' + k));
  assert.deepStrictEqual(su.grp, [su.worst]);
  const row = k => W.moduleRow(ctx, st, su, k);
  T.counted(st, ctx).filter(k => k !== su.worst).forEach(k => assert.ok(near(row(k).dM, su.pw[k].m - su.ref.m, 1e-9), 'own player vs the replacement ' + k));
  assert.ok(near(row(su.worst).dM, 0, 1e-12), 'the replacement shows 0');
  const c = pool.players.find(p => !p.owner && p.g > 40 && p.t).key, s2 = T.moveSlot(T.applySwap(st, su.grp, [c]), c, 'active');
  assert.ok(near(row(c).dM, pct(W.matrix(ctx, s2, su.mo)) - cur, 1e-9), 'a candidate takes the replacement\'s slot');
  assert.ok(near(row(c).new - row(c).old, row(c).dM, 1e-9));
});

test('Team tab: the list row of an IL player equals the roster row (one pw, no pairing), and a player who never plays reads below 0 in both baselines', () => {
  const ctx = Object.assign({}, mk(last.start, games(last.start, last.end)), { teamTab: true, basis: 'total' }), st = T.tabState(ROS[me]);
  const il = st.order.find(k => st.slots[k] === 'il'), act = st.order.filter(k => st.slots[k] === 'active');
  const rep = W.moduleSetup(ctx, st, { baseline: 'rep' }), pw = W.playerWin(ctx, st, rep.mo);
  assert.ok(near(rep.pw[il].m, pw[il].m, 1e-12));
  assert.ok(near(W.moduleRow(ctx, st, rep, il).dM, pw[il].m - rep.ref.m, 1e-9));
  // a player whose team has no games plays 0%: counted, but worth nothing
  const none = act[0], DAYS = games(last.start, last.end); DAYS.games[pool.byKey.get(none).t] = [];
  const c0 = Object.assign({}, mk(last.start, DAYS), { teamTab: true, basis: 'total' });
  assert.strictEqual(W.plays(c0, st, { tid: me })[none].played, 0);
  const su = W.moduleSetup(c0, st, { baseline: 'rep' });
  assert.ok(su.worst !== none, 'he is not the replacement');
  assert.ok(W.moduleRow(c0, st, su, none).dM < -1e-9, 'reads below 0');
});

test('avg: a player dropped at an IL return is replaced by an average player who takes his slot games and cannot be dropped, so the drop moves on', () => {
  const ctx = Object.assign({}, mk(last.start, games(last.start, last.end)), { teamTab: true, basis: 'total' }), st = T.tabState(ROS[me]);
  const pl = W.plays(ctx, st, { tid: me }), D = Object.keys(pl).find(k => pl[k].drop != null && st.slots[k] !== 'il'), Wk = W.weeksLeft(ctx);
  assert.ok(D, 'fixture: a counted player is dropped');
  const su = W.moduleSetup(ctx, st, { baseline: 'avg' }), ap = su.ap;
  // the share counts a dropped player's games only up to his leave time
  const allowed = T.counted(st, ctx).reduce((a, k) => a + T.soloGames(ctx, k, pl[k].drop), 0);
  assert.ok(allowed < T.counted(st, ctx).reduce((a, k) => a + T.soloGames(ctx, k), 0), 'the dropped player counts less than a full window');
  assert.ok(near(ap.share, ap.tot * Wk / allowed, 1e-12), 'share ' + ap.share);
  // his row = the team minus the team with an average player in his place, the next-ranked player dropped instead
  const st2 = T.applySwap(st, [D], []), w = T.window(ctx), A0 = { t: pool.byKey.get(D).t, a: 0, v: 0, from: w.from, to: w.from };
  const r2 = T.playsPct(ctx, st2, { rank: W.dropRank(ctx, me), extra: [A0] });
  const mine = T.counted(st2, ctx).map(k => ({ key: k, p: pool.byKey.get(k).line, games: r2[k].played / Wk })).concat(Object.assign({}, ap.mean, { games: T.soloGames(ctx, D) / Wk * ap.share }));
  const hand = W.matrixOf(ctx, mine, new Set(st.order), Wk, { recv: {} }), row = W.moduleRow(ctx, st, su, D);
  assert.ok(near(row.dM, 100 * (su.base.mean.match - hand.mean.match), 1e-9), 'dropped row ' + row.dM);
  assert.ok(Object.keys(r2).some(k => r2[k].drop != null && k !== D), 'the drop moved to another player');
  // he reads at the replacement's level, not far below it
  const rep = W.moduleSetup(ctx, st, { baseline: 'rep' }), rowR = W.moduleRow(ctx, st, su, rep.worst);
  assert.ok(row.dM <= rowR.dM + 1e-9, 'D ' + row.dM + ' vs R ' + rowR.dM);
  assert.ok(row.dM > rowR.dM - 2, 'about the replacement\'s level ' + row.dM + ' vs ' + rowR.dM);
});

test('avg: avgOwn on a counted player equals avgCandidate on the same player taken out and put back as a candidate (same games rule)', () => {
  const ctx = Object.assign({}, mk(last.start, games(last.start, last.end)), { teamTab: true, basis: 'total' }), st = T.tabState(ROS[me]);
  const su = W.moduleSetup(ctx, st, { baseline: 'avg' }), k = T.counted(st, ctx)[0], g = T.soloGames(ctx, k) / su.ap.W * su.ap.share;
  const own = W.moduleRow(ctx, st, su, k), mine = su.ap.mine.filter(e => e.key !== k).concat(Object.assign({}, su.ap.mean, { games: g })), hand = W.matrixOf(ctx, mine, new Set(st.order), su.ap.W);
  assert.ok(near(own.dM, 100 * (su.base.mean.match - hand.mean.match), 1e-9));
});

test('moduleSetup + moduleRow + moduleSort equal moduleScores in both baselines; new - old = dM; rep old is the matrix mean', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), own = st.order.filter(k => ['active', 'reserve', 'il'].includes(st.slots[k]));
  const cands = own.concat(ROS[other].map(x => x.fid).slice(0, 4)), w = [1, 1, 1, 0, 1, 1, 1, 1, 1];
  ['rep', 'avg'].forEach(baseline => {
    const full = W.moduleScores(ctx, st, { candidates: cands, baseline, weights: w }), su = W.moduleSetup(ctx, st, { baseline });
    const rows = W.moduleSort(cands.map(k => W.moduleRow(ctx, st, su, k)), w);
    assert.deepStrictEqual(rows.map(r => r.key), full.map(r => r.key));
    rows.forEach((r, i) => { assert.ok(near(r.dM, full[i].dM, 1e-12)); assert.ok(near(r.new - r.old, r.dM, 1e-9), baseline + ' ' + r.key); });
  });
  const su = W.moduleSetup(ctx, st, { baseline: 'rep' });
  assert.ok(near(W.moduleRow(ctx, st, su, cands[cands.length - 1]).old, 100 * W.matrix(ctx, st).mean.match, 1e-9));
  assert.strictEqual(W.moduleSetup(mk(last.end + 1000, games(last.start, last.end)), st, {}), null);
});

test('moduleSort: by dM, by weighted dCat when a weight differs from 1, ties keep input order, input untouched', () => {
  const r = (key, dM, dCat) => ({ key, dM, dCat });
  const rows = [r('a', 1, [1, 5]), r('b', 3, [2, 0]), r('c', 3, [0, 0]), r('d', 2, [9, 0])], snap = JSON.stringify(rows);
  assert.deepStrictEqual(W.moduleSort(rows, null).map(x => x.key), ['b', 'c', 'd', 'a']);
  assert.deepStrictEqual(W.moduleSort(rows, [1, 1]).map(x => x.key), ['b', 'c', 'd', 'a']);
  assert.deepStrictEqual(W.moduleSort(rows, [1, 0]).map(x => x.key), ['d', 'b', 'a', 'c']);
  assert.strictEqual(JSON.stringify(rows), snap);
});

test('moduleScores works on a 2-for-1 preview state', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = T.applySwap(stateOf(), stateOf().order.slice(0, 2), [ROS[other][0].fid]);
  const rows = W.moduleScores(ctx, st, { candidates: ROS[ids[2]].map(x => x.fid).slice(0, 3) });
  assert.strictEqual(rows.length, 3);
  rows.forEach(r => assert.ok(Number.isFinite(r.dM)));
});

test('moduleScores: my own rows carry per-category changes, so weighted sorts and dCat sums hold; default shrink is K; cache matches a fresh ctx', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), own = st.order.filter(k => ['active', 'reserve', 'il'].includes(st.slots[k]));
  const w = [1, 1, 1, 0, 1, 1, 1, 1, 1], rows = W.moduleScores(ctx, st, { candidates: own.concat(ROS[other][0].fid), weights: w });
  rows.forEach(r => {
    assert.ok(near(r.sort, r.dCat.reduce((a, v, i) => a + v * w[i], 0), 1e-9), r.key);
    assert.ok(near(r.dCat.reduce((a, v) => a + v, 0), r.dC, 1e-9), r.key);
  });
  assert.ok(W.moduleScores(ctx, st, {}).some(r => r.key === own[0]));   // default list includes my roster
  // two previews on one ctx (cache warm) equal the same previews on fresh ctxs
  const sw = T.applySwap(st, [st.order[0]], [ROS[other][1].fid]), g = games(last.start, last.end);
  W.matrix(ctx, st);
  const a = W.matrix(ctx, sw), b = W.matrix(mk(last.start, g), sw);
  assert.deepStrictEqual(a.teams.map(t => t.match), b.teams.map(t => t.match));
});

// ---- Vs average (user 2026-10-26): current team - the average player + him; the average player = the games-weighted mean line with total games / Active spots ----
const sideOf = (ctx, st) => W.side(ctx, st, W.weeksLeft(ctx));
const sumG = es => es.reduce((a, e) => a + e.games, 0);
const meanEntry = (mine, ctx) => ({ p: T.teamLine(mine.map(e => ({ line: e.p, pct: e.games })), sumG(mine)), games: sumG(mine) / ctx.L.maxActive });
const allowedOf = (ctx, st) => T.counted(st).reduce((a, k) => a + T.windowGames(ctx, [k], null)[0], 0);   // each player's own team games, no nightly cap
const candEntry = (ctx, st, mine, key) => {
  const w = W.weeksLeft(ctx), share = sumG(mine) * w / allowedOf(ctx, st);
  return { p: ctx.pool.byKey.get(key).line, games: T.windowGames(ctx, [key], null)[0] / w * share };
};

test('avg: a candidate is my team minus the average player plus him', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), w = W.weeksLeft(ctx), mine = sideOf(ctx, st), c = ROS[other].find(x => x.slot === 'ACTIVE').fid;
  const base = W.matrix(ctx, st), entries = mine.concat(Object.assign(meanEntry(mine, ctx), { sign: -1 }), candEntry(ctx, st, mine, c));
  const m = W.matrixOf(ctx, entries, new Set(st.order.concat(c)), w);
  const row = W.moduleScores(ctx, st, { baseline: 'avg', candidates: [c] })[0];
  assert.ok(near(row.dM, 100 * (m.mean.match - base.mean.match), 1e-9));
  assert.ok(near(row.dC, 100 * (m.mean.winC - base.mean.winC), 1e-9));
  assert.ok(near(row.new - row.old, row.dM, 1e-9) && near(row.old, 100 * base.mean.match, 1e-9));
});

test('avg: my own counted player replaces nobody; he is scored against an average-line entry with the games his slot allows (as a candidate)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), w = W.weeksLeft(ctx), mine = sideOf(ctx, st), x = st.order.find(k => st.slots[k] === 'active');
  const base = W.matrix(ctx, st), m = W.matrixOf(ctx, mine.filter(e => e.key !== x).concat(Object.assign(meanEntry(mine, ctx), { games: T.soloGames(ctx, x) / w * W.avgParts(ctx, st, w).share })), new Set(st.order), w);
  const row = W.moduleScores(ctx, st, { baseline: 'avg', candidates: [x] })[0];
  assert.ok(near(row.dM, 100 * (base.mean.match - m.mean.match), 1e-9));
  assert.ok(near(row.new, 100 * base.mean.match, 1e-9) && near(row.old, 100 * m.mean.match, 1e-9));
});

test('avg: taking the average player out and putting him back leaves the team unchanged; the divisor is the Active spots', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), w = W.weeksLeft(ctx), mine = sideOf(ctx, st), base = W.matrix(ctx, st), avg = meanEntry(mine, ctx);
  const m = W.matrixOf(ctx, mine.concat(Object.assign({}, avg, { sign: -1 }), avg), new Set(st.order), w);
  assert.ok(near(m.mean.match, base.mean.match, 1e-12) && near(m.mean.winC, base.mean.winC, 1e-12));
  assert.ok(near(W.avgParts(ctx, st, w).mean.games, sumG(mine) / ctx.L.maxActive, 1e-12));
});

test('avg: an average-line player with an average player\'s games scores the same as taking nobody out, minus the variance only', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), w = W.weeksLeft(ctx), mine = sideOf(ctx, st), base = W.matrix(ctx, st);
  const m = W.matrixOf(ctx, mine.concat(Object.assign({}, meanEntry(mine, ctx), { sign: -1 }), meanEntry(mine, ctx)), new Set(st.order), w);
  assert.ok(Math.abs(100 * (m.mean.match - base.mean.match)) < 1e-9);
});

test('rep: when the worst player is in Reserve a candidate is scored as an Active player, not with the Reserve leftovers', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), su0 = W.moduleSetup(ctx, st, {}), c = ROS[other].find(x => x.slot === 'ACTIVE').fid;
  const rk = st.order.find(k => st.slots[k] === 'reserve'), su = Object.assign({}, su0, { worst: rk, grp: [rk], wSlot: 'reserve' });   // force the Reserve player to be the worst
  const s0 = T.moveSlot(T.applySwap(st, [su.worst], [c]), c, 'active'), exp = 100 * (W.matrix(ctx, s0).mean.match - su.base.mean.match);
  assert.ok(near(W.moduleRow(ctx, st, su, c).dM, exp, 1e-9), String(W.moduleRow(ctx, st, su, c).dM) + ' vs ' + exp);
});

test('avg: playerGain equals the module row for every roster player (IL counts as a candidate); the pool is untouched', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), n = ctx.pool.byKey.size, base = W.matrix(ctx, st);
  const rows = W.moduleScores(ctx, st, { baseline: 'avg', candidates: st.order });
  st.order.forEach(k => {
    const g = W.playerGain(ctx, st, k, base, { baseline: 'avg' }), r = rows.find(q => q.key === k);
    assert.ok(near(g.m, r.dM, 1e-9) && near(g.c, r.dC, 1e-9), k);
    assert.strictEqual(g.hypo === true, st.slots[k] === 'il');
  });
  assert.strictEqual(ctx.pool.byKey.size, n);
});

test('avg: no worst-player rule (nobody is forced to 0); rep still has one', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), cands = T.counted(st);
  const avg = W.moduleScores(ctx, st, { baseline: 'avg', candidates: cands }), rep = W.moduleScores(ctx, st, { candidates: cands });
  assert.ok(avg.filter(r => st.slots[r.key] === 'active').every(r => r.dM !== 0));   // a Reserve player with no nights adds exactly 0 either way
  assert.ok(rep.some(r => r.dM === 0));
});

// D3 (2026-10-26): a candidate from an opponent leaves that team and the opponent receives the player I send out
const oppActive = (tid, n) => ROS[tid].filter(x => x.slot === 'ACTIVE')[n || 0].fid;

test('received: an opponent candidate sends my outgoing player to his old team in the vacated slot; free agents send nothing', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), out = st.order[0], inK = oppActive(other);
  const r = W.received(ctx, T.applySwap(st, [out], [inK]));
  assert.deepStrictEqual(r, { [other]: [{ key: out, slot: 'active' }] });
  const fa = pool.players.find(p => !p.owner && p.g > 0).key;
  assert.deepStrictEqual(W.received(ctx, T.applySwap(st, [out], [fa])), {});
  assert.deepStrictEqual(W.received(ctx, T.applySwap(st, [out], [])), {});
  assert.deepStrictEqual(W.received(ctx, st), {});
});

test('received: extra outgoing players go to the reserve; two opponents pair in order; an IL slot becomes reserve; swapped back = nothing', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), [o1, o2] = st.order, a = oppActive(other);
  assert.deepStrictEqual(W.received(ctx, T.applySwap(st, [o1, o2], [a])), { [other]: [{ key: o1, slot: 'active' }, { key: o2, slot: 'reserve' }] });
  const third = ids.find(t => t !== me && t !== other), b = oppActive(third);
  assert.deepStrictEqual(W.received(ctx, T.applySwap(st, [o1, o2], [a, b])), { [other]: [{ key: o1, slot: 'active' }], [third]: [{ key: o2, slot: 'active' }] });
  const il = ROS[other].find(x => x.slot === 'IR');
  if (il) assert.deepStrictEqual(W.received(ctx, T.applySwap(st, [o1], [il.fid])), { [other]: [{ key: o1, slot: 'reserve' }] });
  const back = T.applySwap(T.applySwap(st, [o1], [a]), [a], [o1]);
  assert.deepStrictEqual(W.received(ctx, back), {});
});

test('matrix: after a trade only the old team of my candidate changes, and he now has the player I sent out', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), out = st.order.find(k => st.slots[k] === 'active'), inK = oppActive(other);
  const sw = T.applySwap(st, [out], [inK]), m = W.matrix(ctx, sw);
  // the old behaviour: the candidate left, nothing came back
  const without = W.matrixOf(ctx, W.side(ctx, sw, W.weeksLeft(ctx)), new Set(sw.order), W.weeksLeft(ctx), {});
  const at = m.teams.find(t => t.id === other), was = without.teams.find(t => t.id === other);
  assert.notStrictEqual(at.match, was.match);
  m.teams.filter(t => t.id !== other).forEach(t => assert.ok(near(t.match, without.teams.find(x => x.id === t.id).match, 1e-12)));
  // the received player really is on the opponent's side: the better the player I send him, the lower my match chance against him
  const act = st.order.filter(k => st.slots[k] === 'active').sort((a, b) => Pl.valueZ(ctx.pool.byKey.get(a).line, 82, ctx.ref) - Pl.valueZ(ctx.pool.byKey.get(b).line, 82, ctx.ref)), lo = act[0], hi = act[act.length - 1];
  const vs = k => W.matrix(ctx, T.applySwap(st, [k], [inK])).teams.find(t => t.id === other).match;
  assert.ok(vs(hi) < vs(lo));
});

test('matrix: a free-agent swap gives exactly the numbers it gave before D3', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), out = st.order[0], fa = pool.players.find(p => !p.owner && p.g > 0).key;
  const sw = T.applySwap(st, [out], [fa]), W0 = W.weeksLeft(ctx);
  assert.deepStrictEqual(W.matrix(ctx, sw), W.matrixOf(ctx, W.side(ctx, sw, W0), new Set(sw.order), W0, {}));
});

test('matrix cache: the same candidate with a different player sent to his team gives different numbers; a chain U to me to T leaves U', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), act = st.order.filter(k => st.slots[k] === 'active'), inK = oppActive(other);
  const m1 = W.matrix(ctx, T.applySwap(st, [act[0]], [inK])).teams.find(t => t.id === other);
  const m2 = W.matrix(ctx, T.applySwap(st, [act[1]], [inK])).teams.find(t => t.id === other);
  assert.notStrictEqual(m1.match, m2.match);
  const third = ids.find(t => t !== me && t !== other), x = oppActive(third);
  const chain = T.applySwap(T.applySwap(st, [act[0]], [x]), [x], [inK]);   // x came from `third`, then went to `other`
  assert.deepStrictEqual(W.received(ctx, chain), { [third]: [{ key: act[0], slot: 'active' }], [other]: [{ key: x, slot: 'active' }] });
});

test("rep module row: an opponent candidate costs my worst player going to his team; my own rows and free agents are unchanged", () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), su = W.moduleSetup(ctx, st, { baseline: 'rep' }), inK = oppActive(other);
  const row = W.moduleRow(ctx, st, su, inK), sw = T.applySwap(st, [su.worst], [inK]);
  const hand = W.matrix(ctx, T.moveSlot(sw, inK, su.wSlot === 'reserve' ? 'active' : su.wSlot), su.mo);
  assert.ok(near(row.new, 100 * hand.mean.match, 1e-9));
  assert.strictEqual(W.received(ctx, sw)[other][0].key, su.worst);
});

// reviewer findings on D3 (2026-10-26)
test('received: a swap-back undoes the earlier trade for good (free agent next, same player again, another team)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), o1 = st.order[0], a = oppActive(other), fa = pool.players.find(p => !p.owner && p.g > 0).key;
  const back = T.applySwap(T.applySwap(st, [o1], [a]), [a], [o1]);
  assert.deepStrictEqual(W.received(ctx, T.applySwap(back, [o1], [fa])), {});
  assert.deepStrictEqual(W.received(ctx, T.applySwap(back, [o1], [a])), { [other]: [{ key: o1, slot: 'active' }] });
  const third = ids.find(t => t !== me && t !== other), b = oppActive(third);
  assert.deepStrictEqual(W.received(ctx, T.applySwap(back, [o1], [b])), { [third]: [{ key: o1, slot: 'active' }] });
});

test('received: getting my own sent-out player back from his new team hands the new team my outgoing player', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), [o1, o2] = st.order, a = oppActive(other);
  const s2 = T.applySwap(T.applySwap(st, [o1], [a]), [o2], [o1]);
  assert.deepStrictEqual(W.received(ctx, s2), { [other]: [{ key: o2, slot: 'active' }] });
});

test('oppState: the received players join in key order, so the state matches the sorted cache key', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), [o1, o2] = st.order;
  const r = [{ key: o1, slot: 'active' }, { key: o2, slot: 'reserve' }];
  assert.deepStrictEqual(W.oppState(ctx, other, null, r).order, W.oppState(ctx, other, null, r.slice().reverse()).order);
});

test('avg: after a trade the Vs average rows use the same opponents as the matrix (what they received, what left)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), o1 = st.order.find(k => st.slots[k] === 'active'), a = oppActive(other);
  const sw = T.applySwap(st, [o1], [a]), su = W.moduleSetup(ctx, sw, { baseline: 'avg' }), own = sw.order.find(k => k !== a && T.COUNTED.includes(sw.slots[k]));
  const row = W.moduleRow(ctx, sw, su, own), recv = W.received(ctx, sw), W0 = su.ap.W;
  const keys = [].concat(...Object.values(recv)).map(r => r.key);
  const hand = W.matrixOf(ctx, su.ap.mine.filter(x => x.key !== own).concat(Object.assign({}, su.ap.mean, { games: T.soloGames(ctx, own) / W0 * su.ap.share })),new Set(sw.order.concat(keys)), W0, { recv });
  assert.ok(near(row.dM, 100 * (su.base.mean.match - hand.mean.match), 1e-9));
  const cand = pool.players.find(p => !p.owner && p.g > 0).key, rc = W.moduleRow(ctx, sw, su, cand);
  const mine = su.ap.mine.concat(Object.assign({}, su.ap.mean, { sign: -1 }), { p: ctx.pool.byKey.get(cand).line, games: require('../../team_core.js').windowGames(ctx, [cand], null)[0] / W0 * su.ap.share });
  const handC = W.matrixOf(ctx, mine, new Set(sw.order.concat(keys, [cand])), W0, { recv });
  assert.ok(near(rc.dM, 100 * (handC.mean.match - su.base.mean.match), 1e-9));
});

test('matrix: an opponent player brought in and then swapped out for a free agent stays off his old team, like the Vs average rows', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), a = oppActive(other), fa = pool.players.find(p => !p.owner && p.g > 0).key;
  const s1 = T.applySwap(st, [], [a]), s2 = T.applySwap(s1, [a], [fa]), W0 = W.weeksLeft(ctx);
  const hand = W.matrixOf(ctx, W.side(ctx, s2, W0), new Set(s2.order.concat([a])), W0, { recv: {} });
  assert.deepStrictEqual(W.matrix(ctx, s2), hand);
  assert.notStrictEqual(require('../../team_view.js').signature(s2, ctx), require('../../team_view.js').signature(T.applySwap(st, [], [fa]), ctx));
});

test('engCtxFrom / evalVecs: the pieces calib_ros.js reuses give the matrix numbers', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), Wk = W.weeksLeft(ctx);
  assert.strictEqual(typeof W.engCtxFrom, 'function'); assert.strictEqual(typeof W.evalVecs, 'function'); assert.strictEqual(typeof W.teamVec, 'function');
  const e = W.engCtxFrom(ctx.pool.players.filter(p => p.g > 0).map(p => Object.assign({}, p.line, { g: p.g })), Object.keys(ctx.roster).length, ctx.L.maxActive, 9);
  const vecs = [W.teamVec(e, W.side(ctx, st, Wk))].concat(Object.keys(ctx.roster).filter(t => t !== ctx.me).map(t => W.teamVec(e, W.side(ctx, W.oppState(ctx, t, new Set(st.order)), Wk))));
  const out = W.evalVecs(e, vecs), m = W.matrix(ctx, st, { shrink: { match: 1, cat: 1 } });
  assert.ok(Math.abs(out.pairProb(out.teams[0], out.teams[1]) - m.teams[0].match) < 0.02);   // a different pool order gives a nearby context, not an identical one
  assert.ok(Math.abs(out.catProb(out.teams[0], out.teams[1], 0) + out.catProb(out.teams[1], out.teams[0], 0) - 1) < 1e-9);
});

test('matrix: opts.shrink overrides the constants, {match:1, cat:1} gives the raw engine chances; winC and the means follow the shrunk cells (#139)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), s = W.matrix(ctx, st), r = W.matrix(ctx, st, { shrink: { match: 1, cat: 1 } });
  assert.ok(W.SHRINK.match < 1 && W.SHRINK.cat < 1 && W.SHRINK.match > 0 && W.SHRINK.cat > 0);
  s.teams.forEach((t, i) => {
    assert.ok(near(t.match, 0.5 + W.SHRINK.match * (r.teams[i].match - 0.5), 1e-12));
    assert.ok(near(t.winC, t.cat.reduce((a, v) => a + (v == null ? 0 : v), 0), 1e-12));
  });
  assert.ok(near(s.mean.match, s.teams.reduce((a, t) => a + t.match, 0) / s.teams.length, 1e-12));
  assert.ok(Math.abs(s.mean.match - 0.5) < Math.abs(r.mean.match - 0.5) || near(r.mean.match, 0.5, 1e-9));
});

// ---- points mode (#137) ----
const Pts = require('../../points_core.js'), YAHOO = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 };

test('points: with one stat scored, each opponent match chance equals the category matrix for that stat', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), cat = W.matrix(ctx, st, { shrink: { match: 1, cat: 1 } }), pt = W.matrix(ctx, st, { points: { reb: 1 } });
  assert.strictEqual(pt.teams.length, cat.teams.length);
  pt.teams.forEach((t, i) => { assert.ok(near(t.match, cat.teams[i].cat[4], 1e-12), t.id); assert.strictEqual(t.cat, null); assert.strictEqual(t.winC, null); });
  assert.strictEqual(pt.mean.cat, null); assert.strictEqual(pt.mean.winC, null);
});

test('points: Yahoo weights give match chances inside (0, 1), c is null and module rows are sorted by dM', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), m = W.matrix(ctx, st, { points: YAHOO });
  m.teams.forEach(t => assert.ok(t.match > 0 && t.match < 1));
  const cands = ROS[other].map(x => x.fid).slice(0, 6), rows = W.moduleScores(ctx, st, { candidates: cands, points: YAHOO });
  assert.strictEqual(rows.length, 6);
  rows.forEach((r, i) => { assert.strictEqual(r.dC, null); assert.strictEqual(r.dCat, null); assert.ok(Number.isFinite(r.dM)); if (i) assert.ok(rows[i - 1].dM >= r.dM); });
  const g = W.playerWin(ctx, st, { points: YAHOO }); Object.values(g).forEach(x => { assert.strictEqual(x.c, null); assert.ok(Number.isFinite(x.m)); });
});

test('points: zero weights give match 0.5 everywhere and no NaN; the avg baseline works', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), m = W.matrix(ctx, st, { points: {} });
  m.teams.forEach(t => assert.ok(near(t.match, 0.5, 1e-6), String(t.match)));
  const rows = W.moduleScores(ctx, st, { candidates: ROS[other].map(x => x.fid).slice(0, 3), baseline: 'avg', points: YAHOO });
  rows.forEach(r => assert.ok(Number.isFinite(r.dM) && r.dC === null));
});

test('points: two weight sets do not share a cached opponent forecast', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), a = W.matrix(ctx, st, { points: { pts: 1 } }), b = W.matrix(ctx, st, { points: { ast: 5 } });
  assert.ok(a.teams.some((t, i) => Math.abs(t.match - b.teams[i].match) > 1e-6));
});

test('pointsPerWeek: the points my counted players produce in an average week', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), Wk = W.weeksLeft(ctx);
  const want = W.side(ctx, st, Wk).reduce((s, e) => s + Pts.perGame(e.p, YAHOO) * e.games, 0);
  assert.ok(near(W.pointsPerWeek(ctx, st, YAHOO), want, 1e-9));
});

test('nightOf: a crowded night goes to the better points player, and Matchup without it is unchanged', () => {
  const nowMs = last.start, g = games(last.start, last.end), base = mk(nowMs, g), st = stateOf();
  const rev = M.makeCtx({ L, pool, DAYS: g, rosters: ROS, me, nowMs, nightOf: pp => -Pts.perGame(pp.line, YAHOO) });
  assert.strictEqual(base.nightOf, undefined); assert.strictEqual(typeof rev.nightOf, 'function');
  const keys = st.order.slice(), seg = keys.map(k => ({ key: k, from: last.start, to: last.end }));
  const a = M.segGames(base, seg, null, true), b = M.segGames(rev, seg, null, true);
  assert.ok(a.some((v, i) => v !== b[i]), 'a different night order changes who plays');
  assert.strictEqual(a.reduce((x, y) => x + y, 0), b.reduce((x, y) => x + y, 0));
});

test('points: a shared ctx used with weights A then B gives what a fresh ctx gives for B', () => {
  const nowMs = last.start, g = games(last.start, last.end), st = stateOf(), A = { pts: 1 }, B = { ast: 5, reb: 2 };
  const shared = mk(nowMs, g); W.matrix(shared, st, { points: A });
  const after = W.matrix(shared, st, { points: B }), fresh = W.matrix(mk(nowMs, g), st, { points: B });
  assert.deepStrictEqual(after.teams.map(t => t.match), fresh.teams.map(t => t.match)); assert.strictEqual(after.mean.match, fresh.mean.match);
});

// ---- #147: one k for every tab, and the league-wide matrix the Trade Analyzer reads ----
test('WinK: Team, Rankings and Trade read one shrink object', () => {
  const K = require('../../win_k.js');
  assert.strictEqual(W.SHRINK, K.SHRINK); assert.deepStrictEqual(K.SHRINK, { match: 0.6, cat: 0.75 });
  assert.ok(near(K.shrink(0.9, 0.6), 0.5 + 0.6 * 0.4));
});

test('leagueWin: my row is the Team tab (Season basis) matrix with every opponent weighted equally (#151)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), lw = W.leagueWin(ctx, ctx.roster), m = W.matrix(Object.assign(mk(last.start, games(last.start, last.end)), { teamTab: true, basis: 'total' }), T.tabState(ROS[me]));
  const mi = lw.ids.indexOf(me), mean = lw.ids.filter(t => t !== me).reduce((s, t) => s + lw.P[mi][lw.ids.indexOf(t)], 0) / (ids.length - 1);
  assert.ok(near(mean, m.mean.match, 1e-9));
  lw.ids.forEach((a, i) => lw.ids.forEach((b, j) => { if (i < j) assert.ok(near(lw.P[i][j] + lw.P[j][i], 1, 0.05), 'pair ' + a + b); }));
});

test('tradeState / leagueWin: an IR player gets his availability games (g/82), not every team game (#152)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), il = ROS[me].find(x => x.slot === 'IR').fid, tab = W.tabView(ctx), Wk = W.weeksLeft(ctx);
  const e = W.side(tab, W.tradeState(ctx, me, [il]), Wk).find(x => x.key === il);
  assert.ok(near(e.games * Wk, T.soloGames(tab, il), 1e-9));
  assert.ok(e.games * Wk < T.soloGames(ctx, il) - 0.5, 'below the full-schedule games');
});

test('leagueWin: two calls on one ctx build the engine context once (tabView does not clone per call)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), orig = Eng.buildContext; let n = 0;
  Eng.buildContext = (...a) => { n++; return orig(...a); };
  try { W.leagueWin(ctx, ctx.roster); W.leagueWin(ctx, ctx.roster, { shrink: { match: 1, cat: 1 } }); } finally { Eng.buildContext = orig; }
  assert.strictEqual(n, 1);
});

test('leagueWin: one linear k on every pair (shrink 1 vs 0.6)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), a = W.leagueWin(ctx, ctx.roster, { shrink: { match: 1, cat: 1 } }), b = W.leagueWin(ctx, ctx.roster, { shrink: { match: 0.6, cat: 0.75 } });
  a.P.forEach((row, i) => row.forEach((p, j) => { if (i !== j) assert.ok(near(b.P[i][j] - 0.5, 0.6 * (p - 0.5), 1e-12)); }));
});

test('tradeState: IR players stay il (kept and incoming), Fantrax RESERVE is active; slots do not depend on fids order (#151)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), slot = f => ctx.pool.byKey.get(f).slot;
  const x = ctx.roster[me].filter(f => slot(f) === 'ACTIVE').slice(0, 2), ys = ctx.roster[other].filter(f => slot(f) === 'ACTIVE').slice(0, 2);
  const keep = ctx.roster[me].filter(f => !x.includes(f)), a = W.tradeState(ctx, me, keep.concat(ys)), b = W.tradeState(ctx, me, keep.concat(ys.slice().reverse()));
  ys.forEach(y => assert.strictEqual(a.slots[y], b.slots[y]));
  assert.deepStrictEqual(a.order, b.order);
  const il = ctx.roster[other].find(f => slot(f) === 'IR');
  assert.ok(il, 'fixture has an IR player on the other team');
  const s = W.tradeState(ctx, me, keep.concat([il, ys[0]])); assert.strictEqual(s.slots[il], 'il'); assert.strictEqual(s.slots[ys[0]], 'active');
  const mineIl = ctx.roster[me].find(f => slot(f) === 'IR');
  assert.ok(mineIl); assert.strictEqual(a.slots[mineIl], 'il');
  ctx.roster[me].filter(f => slot(f) === 'RESERVE').forEach(f => assert.strictEqual(a.slots[f], 'active'));
});

test('leagueWin: a traded roster moves the incoming player into the slot the outgoing one left', () => {
  const ctx = mk(last.start, games(last.start, last.end)), x = ctx.roster[me].find(f => ctx.pool.byKey.get(f).slot === 'ACTIVE'), y = ctx.roster[other].find(f => ctx.pool.byKey.get(f).slot === 'ACTIVE');
  const R = Object.assign({}, ctx.roster, { [me]: ctx.roster[me].filter(f => f !== x).concat(y), [other]: ctx.roster[other].filter(f => f !== y).concat(x) });
  const st = W.tradeState(ctx, me, R[me]);
  assert.strictEqual(st.slots[y], 'active'); assert.ok(!(x in st.slots));
  const a = W.leagueWin(ctx, ctx.roster), b = W.leagueWin(ctx, R);
  assert.ok(Math.abs(a.P[a.ids.indexOf(me)][a.ids.indexOf(other)] - b.P[b.ids.indexOf(me)][b.ids.indexOf(other)]) > 1e-6);
});

// ---- the Team-tab flag (2026-10-26): Reserve is a parking place, IL counts only on the seasonal bases; a plain ctx is untouched ----
const mkTab = basis => Object.assign(mk(last.start, games(last.start, last.end)), { teamTab: true, basis });
const tabSt = () => T.tabState(ROS[me]);

test('Team tab: oppState keeps the opponent\'s IL players as il and makes his bench Active; a plain ctx is as before', () => {
  const tid = other, il = ROS[tid].filter(x => x.slot === 'IR').map(x => x.fid), plain = mk(last.start, games(last.start, last.end));
  assert.ok(il.length, 'fixture opponent has an IL player');
  const s = W.oppState(mkTab('total'), tid);
  il.forEach(k => assert.strictEqual(s.slots[k], 'il'));
  s.order.filter(k => !il.includes(k)).forEach(k => assert.strictEqual(s.slots[k], 'active'));
  il.forEach(k => assert.ok(!(k in W.oppState(plain, tid).slots)));
});

test('Team tab: side counts Active (and IL on the seasonal bases) only; a Reserve player is no entry', () => {
  const st = tabSt(), k = st.order.find(x => st.slots[x] === 'active'), il = st.order.find(x => st.slots[x] === 'il'), res = T.moveSlot(st, k, 'reserve');
  assert.ok(il);
  const nAct = st.order.filter(x => st.slots[x] === 'active').length;
  assert.strictEqual(W.side(mkTab('pergame'), st, 1).length, nAct);
  assert.strictEqual(W.side(mkTab('pergame'), res, 1).length, nAct - 1);
  assert.strictEqual(W.side(mkTab('total'), st, 1).length, nAct + 1);
  assert.ok(W.side(mkTab('total'), st, 1).some(e => e.key === il));
});

test('Team tab: parking a player in Reserve is the same as removing him, and a Reserve player scores as the swap into Active (hypo)', () => {
  for (const basis of ['pergame', 'total']) {
    const ctx = mkTab(basis), st = tabSt(), k = st.order.find(x => st.slots[x] === 'active'), res = T.moveSlot(st, k, 'reserve');
    assert.ok(near(W.matrix(ctx, res).mean.match, W.matrix(ctx, T.applySwap(st, [k], [])).mean.match), basis);
    const g = W.playerGain(ctx, res, k, W.matrix(ctx, res)), back = W.matrix(ctx, st).mean.match - W.matrix(ctx, res).mean.match;
    assert.strictEqual(g.hypo, true, basis); assert.ok(near(g.m, 100 * back, 1e-7), basis);
  }
});

test('Team tab: an IL player is hypo on Per game and counted (not hypo, his own contribution) on the seasonal basis', () => {
  const st = tabSt(), il = st.order.find(x => st.slots[x] === 'il');
  const per = mkTab('pergame'), tot = mkTab('total');
  assert.strictEqual(W.playerGain(per, st, il, W.matrix(per, st)).hypo, true);
  const g = W.playerGain(tot, st, il, W.matrix(tot, st));
  assert.ok(!g.hypo);
  assert.ok(near(g.m, 100 * (W.matrix(tot, st).mean.match - W.matrix(tot, T.applySwap(st, [il], [])).mean.match), 1e-7));
});

test('Team tab: the module scores a Reserve player and a candidate with finite numbers, a candidate takes an Active slot', () => {
  for (const basis of ['pergame', 'total']) {
    const ctx = mkTab(basis), st = T.moveSlot(tabSt(), tabSt().order[0], 'reserve'), cands = [st.order[0], ctx.roster[other][0]];
    for (const baseline of ['rep', 'avg']) {
      const r = W.moduleScores(ctx, st, { candidates: cands, baseline });
      assert.strictEqual(r.length, 2, basis + baseline);
      r.forEach(x => assert.ok(Number.isFinite(x.dM) && Number.isFinite(x.dC), basis + baseline));
    }
  }
});

test('Team tab: a plain ctx still counts Reserve and leaves IL out (the golden pins the numbers)', () => {
  const ctx = mk(last.start, games(last.start, last.end)), st = stateOf(), n = st.order.filter(k => ['active', 'reserve'].includes(st.slots[k])).length;
  assert.strictEqual(W.side(ctx, st, 1).length, n);
});

test('Team tab: oppState with recv adds a received player as Active, a received IR player stays il; a plain ctx drops the IR one', () => {
  const tab = mkTab('total'), plain = mk(last.start, games(last.start, last.end)), act = ROS[me].find(x => x.slot === 'ACTIVE').fid, irMine = ROS[me].find(x => x.slot === 'IR');
  const s = W.oppState(tab, other, null, [{ key: act, slot: 'active' }]);
  assert.strictEqual(s.slots[act], 'active');
  if (irMine) {
    assert.strictEqual(W.oppState(tab, other, null, [{ key: irMine.fid, slot: 'reserve' }]).slots[irMine.fid], 'il');
    assert.ok(!(irMine.fid in W.oppState(plain, other, null, [{ key: irMine.fid, slot: 'reserve' }]).slots));
  }
});

test('Team tab: soloGames = the games his own schedule allows with no nightly cap; Per game ignores g, seasonal bases scale by availability', () => {
  const st = tabSt(), k = st.order.find(x => st.slots[x] === 'active'), pg = mkTab('pergame'), tot = mkTab('total'), pp = pg.pool.byKey.get(k), g0 = pp.g;
  try {
    pp.g = 41;
    const full = T.soloGames(pg, k), half = T.soloGames(tot, k), w = T.window(tot);
    assert.strictEqual(full, T.windowGames(pg, [k], null)[0]);
    assert.ok(full > 0);
    assert.strictEqual(half, require('../../inseason_league.js').rosterGames([{ t: pp.t, a: 0.5, from: w.from, to: w.to }], tot.DAYS, tot.L.maxActive, null)[0]);
    assert.ok(half < full && half > 0);
    pp.g = 82; assert.ok(near(T.soloGames(tot, k), full, 1e-9));
  } finally { pp.g = g0; }
});

test('Team tab: Vs average on the seasonal basis: the share is a fraction of the allowed games and a candidate with more games scores higher; Per game ignores g', () => {
  const cand = ctxOther => ctxOther.roster[other].find(f => ctxOther.pool.byKey.get(f).slot === 'ACTIVE'), st = tabSt();
  for (const basis of ['pergame', 'total']) {
    const ctx = mkTab(basis), ap = W.avgParts(ctx, st, W.weeksLeft(ctx)), c = cand(ctx), pp = ctx.pool.byKey.get(c), g0 = pp.g, row = g => { pp.g = g; return W.moduleRow(ctx, st, W.moduleSetup(ctx, st, { baseline: 'avg' }), c).dM; };
    assert.ok(ap && ap.share > 0 && ap.share <= 1 + 1e-9, basis + ' share ' + (ap && ap.share));
    try { const hi = row(82), lo = row(10); if (basis === 'total') assert.ok(hi > lo, 'total: ' + hi + ' vs ' + lo); else assert.ok(near(hi, lo, 1e-9), 'pergame ' + hi + ' vs ' + lo); } finally { pp.g = g0; }
  }
});

test('Team tab: a candidate in the list scores as the worst counted player\'s slot swapped for him, in Active', () => {
  for (const basis of ['pergame', 'total']) {
    const ctx = mkTab(basis), st = tabSt(), c = ctx.roster[other].find(f => ctx.pool.byKey.get(f).slot === 'ACTIVE'), su = W.moduleSetup(ctx, st, { baseline: 'rep' });
    if (su.wSlot !== 'active') continue;
    const row = W.moduleRow(ctx, st, su, c), after = T.moveSlot(T.applySwap(st, su.grp, [c]), c, 'active');   // grp = the worst, plus the IL player sharing his slot
    assert.ok(near(row.dM, 100 * (W.matrix(ctx, after, su.mo).mean.match - su.base.mean.match), 1e-6), basis);
    assert.ok(Number.isFinite(row.dM) && row.dM !== 0, basis);
  }
});

// dropRank (IL timeline, 2026-10-29): who is dropped when the IL players return and the roster is over the player limit is chosen by Win M
// contribution (the drop in the team's mean match chance when he is removed), not by nightValue
const tabDrop = DAYS => Object.assign({}, mk(last.start, DAYS || games(last.start, last.end)), { teamTab: true, basis: 'total' });
test('dropRank: rank(k) is minus the team\'s mean match chance when k is the one dropped at the first return, the field\'s saved rosters with nobody dropped', () => {
  const ctx = tabDrop(), st = T.tabState(ROS[me]), Wk = W.weeksLeft(ctx), rank = W.dropRank(ctx, me), e = W.engCtx(ctx, 9);
  const field = ids.filter(t => t !== me).map(t => W.teamVec(e, W.side(ctx, W.oppState(ctx, t), Wk, { noDrop: true })));
  const meanDropped = k => {
    const r = T.playsPct(ctx, st, { force: 1, rank: x => (x === k ? -1 : 0) });
    const mine = st.order.filter(x => T.counted(st, ctx).includes(x)).map(x => ({ key: x, p: pool.byKey.get(x).line, games: r[x].played / Wk }));
    const vecs = [W.teamVec(e, mine)].concat(field), out = W.evalVecs(e, vecs);
    return field.reduce((s, _, j) => s + 0.5 + W.SHRINK.match * (out.pairProb(out.teams[0], out.teams[j + 1]) - 0.5), 0) / field.length;
  };
  T.counted(st, ctx).forEach(k => assert.ok(near(rank(k), -meanDropped(k), 1e-9), k));
  assert.strictEqual(rank('not-on-the-roster'), Infinity, 'players off the saved roster are never dropped');
  // the player the rank picks is the one whose drop leaves the best team: it is what the Team tab then shows
  const pick = T.counted(st, ctx).reduce((a, b) => rank(b) < rank(a) ? b : a), res = W.plays(ctx, st, { tid: me });
  assert.ok(res[pick].drop != null, 'the lowest rank is the player dropped');
});

test('dropRank: a player whose team has no games is the one dropped; the dropped player has the lowest contribution among the non-IL counted', () => {
  const DAYS = games(last.start, last.end), st = T.tabState(ROS[me]), act = st.order.filter(k => st.slots[k] === 'active');
  DAYS.games[pool.byKey.get(act[0]).t] = [];
  const ctx = tabDrop(DAYS), rank = W.dropRank(ctx, me), res = W.plays(ctx, st, { tid: me }), drop = Object.keys(res).filter(k => res[k].drop != null);
  assert.ok(drop.length >= 1, 'fixture: over the limit');
  assert.ok(T.counted(st, ctx).every(k => rank(act[0]) <= rank(k) + 1e-12), 'the no-games player ranks lowest');
  const pw = W.playerWin(ctx, st, { cats: 9 });
  drop.forEach(d => T.counted(st, ctx).filter(k => st.slots[k] !== 'il' && !drop.includes(k)).forEach(k => assert.ok(pw[d].m <= pw[k].m + 1e-9, d + ' vs ' + k)));
});

test('dropRank: free agents swapped in are never the drop, so the weakest read at or below the replacement and not all the same', () => {
  const ctx = tabDrop(), st = T.tabState(ROS[me]), su = W.moduleSetup(ctx, st, { baseline: 'rep' }), fa = pool.players.filter(p => !p.owner && p.g > 0 && p.t).sort((a, b) => Pl.valueZ(a.line, 82, ctx.ref) - Pl.valueZ(b.line, 82, ctx.ref)).slice(0, 5);
  const dM = fa.map(p => W.moduleRow(ctx, st, su, p.key).dM);
  dM.forEach(d => assert.ok(d <= 1e-9, 'weak free agent ' + d));
  assert.ok(new Set(dM.map(d => d.toFixed(9))).size > 1, 'not all the same ' + dM);
  const res = W.plays(ctx, st, { tid: me }), dropped = Object.keys(res).filter(k => res[k].drop != null);
  dropped.forEach(d => { assert.notStrictEqual(d, su.worst); assert.ok(W.moduleRow(ctx, st, su, d).dM <= 1e-9, 'the dropped row ' + W.moduleRow(ctx, st, su, d).dM); });
});
