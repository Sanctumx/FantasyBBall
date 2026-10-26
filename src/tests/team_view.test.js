// Team tab page logic: rows, totals, scoring job, swap helpers (#131 PR 3, 2026-10-25)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), T = require('../team_core.js'), W = require('../team_win.js'), M = require('../matchup_core.js'), Pl = require('../inseason_players.js'), V = require('../team_view.js');
const fx = n => require('./fixtures/' + n), PLAYERS = require('../players.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const me = L.teams[0].id, other = L.teams[1].id;
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

const per = n => L.periods.find(p => p.n === n), last = per(L.lastRegular);
const teamsAll = [...new Set(pool.players.map(p => p.t).filter(Boolean))];
const games = (from, to) => { const g = {}; teamsAll.forEach(t => { g[t] = []; for (let s = from / 1000 + 3600; s < to / 1000; s += 2 * 86400) g[t].push(s); }); return { games: g }; };
const mk = () => M.makeCtx({ L, pool, DAYS: games(last.start, last.end), rosters: ROS, me, nowMs: last.start });
const stateOf = () => T.initState(ROS[me]);
// a made-up Zscore per category for every player: the key's characters decide it, so rows differ
const zCats = pp => Array.from({ length: 9 }, (_, c) => ((pp.key.length * 7 + c * 3 + String(pp.key).charCodeAt(0)) % 11) / 5 - 1);
const find = (rs, k) => rs.rows.find(r => r.key === k);

test('rows: grouped by slot in roster order, one row per player', () => {
  const ctx = mk(), st = stateOf(), r = V.rows(ctx, st, { zCats });
  assert.deepStrictEqual(r.groups.map(g => g.slot), ['active', 'reserve', 'il']);
  assert.strictEqual(r.rows.length, st.order.length);
  r.groups.forEach(g => g.rows.forEach(x => assert.strictEqual(st.slots[x.key], g.slot)));
});

test('rows: GL is projected games left (team games x g/82), never times Plays %', () => {
  const ctx = mk(), st = stateOf(), r = V.rows(ctx, st, { zCats }), plays = T.playsPct(ctx, st);
  r.rows.forEach(x => {
    const pp = pool.byKey.get(x.key);
    assert.ok(near(x.gl, T.seasonGamesLeft(ctx, pp.t) * Math.min(1, pp.g / 82)), x.key);
    assert.strictEqual(x.pct, plays[x.key].pct);
  });
});

test('rows: GL counts team games to the real season end, past the last league week', () => {
  const ctx = M.makeCtx({ L, pool, DAYS: games(last.start, last.end + 60 * 86400e3), rosters: ROS, me, nowMs: last.start });
  const r = V.rows(ctx, stateOf(), { zCats });
  r.rows.forEach(x => {
    const pp = pool.byKey.get(x.key), n = ctx.DAYS.games[pp.t].filter(s => s * 1000 >= ctx.nowMs).length;
    assert.ok(n > T.gamesLeft(ctx, pp.t), x.key);
    assert.ok(near(x.gl, n * Math.min(1, pp.g / 82)), x.key);
  });
});

test('rows: weights of 1 give the plain Zscore sum, 0 removes a category, 0.5 halves it', () => {
  const ctx = mk(), st = stateOf(), k = st.order[0], pp = pool.byKey.get(k), cats = zCats(pp);
  const z = w => find(V.rows(ctx, st, { zCats, weights: w }), k).z;
  assert.ok(near(z(null), T.weightedZ(cats, null, 9)));
  const w0 = new Array(9).fill(1); w0[3] = 0;
  assert.ok(near(z(w0), T.weightedZ(cats, w0, 9)));
  assert.ok(near(z(w0), z(null) - T.weightedZ(cats.map((v, c) => (c === 3 ? v : 0)), null, 9)));
});

test('rows: the Plays % checkbox scales stats and Z; off leaves them per game', () => {
  const ctx = mk(), st = stateOf(), off = V.rows(ctx, st, { zCats }), on = V.rows(ctx, st, { zCats, adjust: true });
  off.rows.forEach(a => {
    const b = find(on, a.key), pp = pool.byKey.get(a.key), f = a.pct == null ? 0 : a.pct;   // no games left counts as 0, like the team rows
    assert.ok(near(a.stat.pts, pp.line.pts), a.key);
    assert.ok(near(b.stat.pts, pp.line.pts * f), a.key);
    assert.ok(near(b.stat.fgp, pp.line.fgp), a.key);
    assert.ok(near(b.z, a.z * f, 1e-9), a.key);
  });
});

test('rows: rest of season view = line x GL, and with the checkbox x Plays % as well', () => {
  const ctx = mk(), st = stateOf(), g = V.rows(ctx, st, { zCats, view: 'ros' }), a = V.rows(ctx, st, { zCats, view: 'ros', adjust: true });
  g.rows.forEach(x => {
    const pp = pool.byKey.get(x.key), y = find(a, x.key);
    assert.ok(near(x.stat.pts, pp.line.pts * x.gl, 1e-9), x.key);
    assert.ok(near(y.stat.pts, pp.line.pts * x.gl * (x.pct == null ? 1 : x.pct), 1e-9), x.key);
  });
});

test('totals: the checkbox does not change them; Reserve and IL add nothing', () => {
  const ctx = mk(), st = stateOf(), a = V.rows(ctx, st, { zCats }), b = V.rows(ctx, st, { zCats, adjust: true });
  assert.deepStrictEqual(a.avg, b.avg);
  const plays = T.playsPct(ctx, st), exp = T.teamLine(st.order.map(k => ({ line: pool.byKey.get(k).line, pct: plays[k].pct, hypo: plays[k].hypo })), ctx.L.maxActive);
  assert.deepStrictEqual(a.avg, exp);
  const k = st.order.find(q => T.COUNTED.includes(st.slots[q])), gone = V.rows(ctx, T.moveSlot(st, k, 'il'), { zCats });
  assert.notDeepStrictEqual(gone.avg, a.avg);
  assert.deepStrictEqual(gone.avg, V.rows(ctx, T.applySwap(st, [k], []), { zCats }).avg);
  assert.strictEqual(a.total, undefined);
});

test('totals: avgZ is the Plays % weighted Z per lineup slot; the checkbox and IL/Reserve rows leave it alone', () => {
  const ctx = mk(), st = stateOf(), a = V.rows(ctx, st, { zCats }), b = V.rows(ctx, st, { zCats, adjust: true }), plays = T.playsPct(ctx, st);
  const exp = st.order.reduce((s, k) => s + (plays[k].hypo || plays[k].pct == null ? 0 : plays[k].pct * T.weightedZ(zCats(pool.byKey.get(k)), undefined, 9)), 0) / ctx.L.maxActive;
  assert.ok(near(a.avgZ, exp, 1e-9));
  assert.ok(near(b.avgZ, exp, 1e-9));
  const w = Array(9).fill(0.5), h = V.rows(ctx, st, { zCats, weights: w });
  assert.ok(near(h.avgZ, a.avgZ / 2, 1e-9));
});

test('totals: a 2-for-1 swap changes the totals by the hand computed amount', () => {
  const ctx = mk(), st = stateOf(), inK = ROS[other].find(x => x.slot === 'ACTIVE').fid, outs = st.order.filter(k => st.slots[k] === 'active').slice(0, 2);
  const sw = T.applySwap(st, outs, [inK]), a = V.rows(ctx, st, { zCats }), b = V.rows(ctx, sw, { zCats }), pa = T.playsPct(ctx, sw);
  const entries = sw.order.map(k => ({ line: pool.byKey.get(k).line, pct: pa[k].pct, hypo: pa[k].hypo }));
  assert.deepStrictEqual(b.avg, T.teamLine(entries, ctx.L.maxActive));
  assert.notDeepStrictEqual(b.avg, a.avg);
});

test('winJob: one player per step; the result equals matrix and playerWin', () => {
  const ctx = mk(), st = stateOf(), job = V.winJob(ctx, st);
  let steps = 0;
  while (job.step()) steps++;
  assert.ok(job.done);
  assert.strictEqual(steps, st.order.length + 1);   // the matrix, then one player per step
  assert.deepStrictEqual(job.matrix, W.matrix(ctx, st));
  assert.deepStrictEqual(job.players, W.playerWin(ctx, st));
});

test('scorer: the same ctx and roster reuse the finished job; a swap scores again; weights are no part of it', () => {
  const ctx = mk(), st = stateOf(), sc = V.createScorer(), run = j => { while (j.step()); return j; };
  const a = run(sc.get(ctx, st));
  assert.strictEqual(sc.get(ctx, T.initState(ROS[me])), a);   // same roster, a different object
  const b = sc.get(ctx, T.moveSlot(st, st.order[0], 'reserve'));
  assert.notStrictEqual(b, a);
  assert.ok(!b.done);
});

test('scorer: the win options (cats) are part of the cache key', () => {
  const ctx = mk(), st = stateOf(), sc = V.createScorer();
  assert.notStrictEqual(sc.get(ctx, st, { cats: 9 }), sc.get(ctx, st, { cats: 8 }));
  assert.strictEqual(sc.get(ctx, st, { cats: 9 }), sc.get(ctx, st, { cats: 9 }));
});

test('moduleJob: steps of a time budget, rows equal moduleScores, finished jobs stop stepping', () => {
  const ctx = mk(), st = stateOf(), cands = ROS[other].map(x => x.fid).slice(0, 6);
  ['rep', 'avg'].forEach(baseline => {
    const job = V.moduleJob(ctx, st, { baseline }, cands);
    let t = 0, steps = 0;
    const clock = () => (t += 5);   // every call costs 5 ms
    while (job.step(12, clock)) steps++;
    assert.ok(job.done);
    assert.strictEqual(job.step(12, clock), false);
    assert.ok(steps > 1 && steps < cands.length + st.order.length + 3, 'steps ' + steps);   // several pieces per step, not all in one
    assert.strictEqual(job.total, cands.length);
    assert.strictEqual(job.rows.length, cands.length);
    assert.deepStrictEqual(W.moduleSort(job.rows, null), W.moduleScores(ctx, st, { baseline, candidates: cands }));
  });
  const over = V.moduleJob(M.makeCtx({ L, pool, DAYS: games(last.end + 1e6, last.end + 2e6), rosters: ROS, me, nowMs: last.end + 1000 }), st, {}, cands);
  while (over.step(12)); assert.ok(over.done); assert.deepStrictEqual(over.rows, []);
});

test('scorer.getModule: cached by roster, cats and baseline, never the weights; nextJob picks the first unfinished', () => {
  const ctx = mk(), st = stateOf(), sc = V.createScorer(), a = sc.getModule(ctx, st, { baseline: 'rep' });
  assert.strictEqual(sc.getModule(ctx, T.initState(ROS[me]), { baseline: 'rep', weights: [0, 1, 1, 1, 1, 1, 1, 1, 1] }), a);
  assert.notStrictEqual(sc.getModule(ctx, st, { baseline: 'avg' }), a);
  assert.notStrictEqual(sc.getModule(ctx, T.moveSlot(st, st.order[0], 'reserve'), { baseline: 'rep' }), a);
  const w = sc.get(ctx, st), done = { done: true };
  assert.strictEqual(V.nextJob([done, w, a]), w);
  assert.strictEqual(V.nextJob([done]), null);
});

test('moduleView: owner filters, label, accent-blind search that keeps the Win M order, shows every row', () => {
  const ctx = mk(), st = T.applySwap(stateOf(), [stateOf().order[0]], []), sentOut = stateOf().order[0], mine = st.order[1];
  const theirs = ROS[other].map(x => x.fid).slice(0, 3), fa = pool.players.find(p => !p.owner && !(p.key in st.slots)).key;
  const rows = [theirs[0], mine, sentOut, fa, theirs[1], theirs[2]].map((key, i) => ({ key, dM: 10 - i, dCat: [], old: 50, new: 60 - i }));
  const keys = r => r.rows.map(x => x.key), ownerOf = key => ctx.pool.byKey.get(key).owner;
  assert.deepStrictEqual(keys(V.moduleView(rows, ctx, st, { owner: 'all' })), rows.map(r => r.key));
  assert.deepStrictEqual(keys(V.moduleView(rows, ctx, st, { owner: 'me' })), [mine]);
  assert.deepStrictEqual(keys(V.moduleView(rows, ctx, st, { owner: 'fa' })), [sentOut, fa]);   // sent out shows under free agents
  assert.deepStrictEqual(keys(V.moduleView(rows, ctx, st, { owner: other })), theirs.filter(k => ownerOf(k) === other));
  const v = V.moduleView(rows, ctx, st, { owner: 'all' });
  assert.strictEqual(v.rows.find(x => x.key === sentOut).label, 'Sent out');
  assert.strictEqual(v.rows.find(x => x.key === fa).label, 'Free agent');
  assert.ok(/^You/.test(v.rows.find(x => x.key === mine).label));
  const all = V.moduleView(rows, ctx, st, { owner: 'all' });
  assert.strictEqual(all.rows.length, 6); assert.strictEqual(all.total, 6); assert.strictEqual(all.more, undefined);
  const nm = ctx.pool.byKey.get(theirs[1]).n, q = V.moduleView(rows, ctx, st, { owner: 'all', query: nm.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') });
  assert.ok(keys(q).includes(theirs[1]));
  assert.ok(keys(q).every((k, i, a) => i === 0 || rows.findIndex(r => r.key === a[i - 1]) < rows.findIndex(r => r.key === k)));   // Win M order kept
});

test('dropSwap: the incoming player takes the outgoing one\'s slot, two of mine trade slots, dropIn adds to a slot', () => {
  const st = stateOf(), out = st.order.find(k => st.slots[k] === 'active'), inK = ROS[other][0].fid;
  const s = V.dropSwap(st, inK, out);
  assert.ok(!(out in s.slots)); assert.strictEqual(s.slots[inK], 'active'); assert.strictEqual(s.order.length, st.order.length);
  const b = st.order.find(k => st.slots[k] === 'reserve'), t = V.dropSwap(st, b, out);
  assert.strictEqual(t.slots[b], 'active'); assert.strictEqual(t.slots[out], 'reserve'); assert.strictEqual(t.order.length, st.order.length);
  const d = V.dropIn(st, inK, 'il');
  assert.strictEqual(d.slots[inK], 'il'); assert.strictEqual(d.order.length, st.order.length + 1);
  assert.strictEqual(V.dropIn(st, b, 'il').slots[b], 'il');   // already mine: a plain move
});

test('swap boxes: Send out sees only my roster, Bring in never does, accents and partial names match', () => {
  const ctx = mk(), st = stateOf(), out = V.sendOutList(ctx, st), inn = V.bringInList(ctx, st);
  assert.strictEqual(out.length, st.order.length);
  out.forEach(x => assert.ok(x.key in st.slots));
  assert.ok(inn.length > 0);
  inn.forEach(x => assert.ok(!(x.key in st.slots)));
  const name = out[0].n, part = name.split(' ')[0].slice(0, 3).toUpperCase();
  assert.ok(V.search(out, part).some(x => x.key === out[0].key));
  assert.ok(V.search(out, 'zzzzqq').length === 0);
});

test('pick: no duplicates, and Enter takes the top match', () => {
  const ctx = mk(), st = stateOf(), out = V.sendOutList(ctx, st);
  let chips = V.pick([], out[0]);
  assert.deepStrictEqual(chips.map(x => x.key), [out[0].key]);
  assert.deepStrictEqual(V.pick(chips, out[0]).map(x => x.key), [out[0].key]);
  chips = V.pick(chips, V.search(out, out[1].n)[0]);
  assert.strictEqual(chips.length, 2);
});

test('apply: wraps applySwap on the picked keys and leaves the old state alone', () => {
  const ctx = mk(), st = stateOf(), out = V.sendOutList(ctx, st)[0], inn = V.bringInList(ctx, st)[0], before = JSON.stringify(st);
  const next = V.apply(st, [out], [inn]);
  assert.ok(!(out.key in next.slots) && next.slots[inn.key] === 'reserve');
  assert.strictEqual(JSON.stringify(st), before);
});

test('zParts: the weighted parts add up to the row Z; weight 0 and TO in 8-cat leagues give 0', () => {
  const ctx = mk(), st = stateOf(), w = Array(9).fill(1); w[3] = 0; w[5] = 0.5;
  [9, 8].forEach(nc => {
    const r = V.rows(ctx, st, { zCats, weights: w, cats: nc, adjust: true }).rows[0], parts = V.zParts(r.cats, w, nc);
    assert.strictEqual(parts.length, 9);
    assert.ok(near(parts.reduce((s, v) => s + v, 0), r.z, 1e-9));
    assert.strictEqual(parts[3], 0);
    if (nc === 8) assert.strictEqual(parts[8], 0);
  });
});

test('avgCats: Plays % weighted per-category Z per slot, parts add up to avgZ', () => {
  const ctx = mk(), st = stateOf(), w = Array(9).fill(1); w[0] = 0.25;
  const r = V.rows(ctx, st, { zCats, weights: w });
  assert.strictEqual(r.avgCats.length, 9);
  assert.ok(near(V.zParts(r.avgCats, w, 9).reduce((s, v) => s + v, 0), r.avgZ, 1e-9));
});

test('move: refuses the same slot; IL to Active adds him to the team average, Reserve to IL drops him', () => {
  const ctx = mk(), st = stateOf(), il = st.order.find(k => st.slots[k] === 'il'), bn = st.order.find(k => st.slots[k] === 'reserve');
  assert.strictEqual(V.move(st, bn, 'reserve'), st);
  const a = V.rows(ctx, st, { zCats });
  if (il) {
    const up = V.move(st, il, 'active'), b = V.rows(ctx, up, { zCats });
    assert.strictEqual(up.slots[il], 'active');
    assert.ok(find(a, il).hypo && !find(b, il).hypo);   // he now counts in the team rows
    assert.ok(b.avgZ !== a.avgZ || b.avg.pts !== a.avg.pts);
  }
  if (bn) {
    const down = V.move(st, bn, 'il'), c = V.rows(ctx, down, { zCats });
    assert.strictEqual(down.slots[bn], 'il');
    assert.deepStrictEqual(c.avg, V.rows(ctx, T.applySwap(st, [bn], []), { zCats }).avg);
  }
});

test('slotCounts: players per slot against the active limit', () => {
  const st = stateOf(), n = V.slotCounts(st, 10);
  assert.strictEqual(n.active.n, st.order.filter(k => st.slots[k] === 'active').length);
  assert.strictEqual(n.active.over, n.active.n > 10);
  assert.strictEqual(n.il.over, false);
});

test('rows: MPG is the pool player minutes per game and never part of his line', () => {
  const ctx = mk(), r = V.rows(ctx, stateOf(), { zCats });
  r.rows.forEach(x => { const pp = pool.byKey.get(x.key); assert.strictEqual(x.mpg, pp.mpg == null ? null : pp.mpg); assert.ok(!('m' in pp.line) && !('mpg' in pp.line)); });
  assert.ok(r.rows.some(x => x.mpg > 0));
});

test('moduleView with every player: 500+ rows come back in one piece', () => {
  const ctx = mk(), st = stateOf(), rows = ctx.pool.players.map((p, i) => ({ key: p.key, dM: i, old: 0, new: 0, dCat: [] }));
  const v = V.moduleView(rows, ctx, st, {});
  assert.strictEqual(v.rows.length, rows.length); assert.strictEqual(v.total, rows.length);
});

test('diff: who went out, who came in, who changed slot', () => {
  const st = stateOf(), [a, b, c] = st.order, inK = ROS[other][0].fid;
  const mv = V.move(st, a, st.slots[a] === 'il' ? 'active' : 'il'), sw = V.apply(mv, [{ key: b }], [{ key: inK }]);
  assert.deepStrictEqual(V.diff(st, st), { out: [], in: [], moves: [] });
  assert.deepStrictEqual(V.diff(st, mv), { out: [], in: [], moves: [{ key: a, from: st.slots[a], to: mv.slots[a] }] });
  assert.deepStrictEqual(V.diff(st, sw), { out: [b], in: [inK], moves: [{ key: a, from: st.slots[a], to: mv.slots[a] }] });
});

test('sortRows: by a value getter, either way, missing last, ties keep roster order, never mutates', () => {
  const rows = [{ key: 'a', v: 2 }, { key: 'b', v: null }, { key: 'c', v: 5 }, { key: 'd', v: 2 }, { key: 'e', v: 'x' }], snap = JSON.stringify(rows), num = r => typeof r.v === 'number' ? r.v : null;
  assert.deepStrictEqual(V.sortRows(rows, num, 'desc').map(r => r.key), ['c', 'a', 'd', 'b', 'e']);
  assert.deepStrictEqual(V.sortRows(rows, num, 'asc').map(r => r.key), ['a', 'd', 'c', 'b', 'e']);
  assert.deepStrictEqual(V.sortRows(rows, r => r.key, 'desc').map(r => r.key), ['e', 'd', 'c', 'b', 'a']);
  assert.strictEqual(JSON.stringify(rows), snap);
});

test('scorer: the same roster reached by different trades is not the same job', () => {
  const ctx = mk(), st = stateOf(), sc = V.createScorer(), [o1, o2] = st.order, a = ROS[other].find(x => x.slot === 'ACTIVE').fid;
  const x = T.applySwap(st, [o1, o2], [a]), y = T.applySwap(st, [o2, o1], [a]);
  assert.notStrictEqual(sc.get(ctx, x, {}), sc.get(ctx, y, {}));
  assert.strictEqual(sc.get(ctx, x, {}), sc.get(ctx, x, {}));
});

// ---- points mode (#137) ----
test('rows: with point values each row has its FP per game (follows the view and the Plays % box); categories give none', () => {
  const ctx = mk(), st = stateOf(), w = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 };
  const pg = V.rows(ctx, st, { points: w }), pc = V.rows(ctx, st, { points: w, adjust: true }), ros = V.rows(ctx, st, { points: w, view: 'ros' }), cat = V.rows(ctx, st, {});
  pg.rows.forEach((r, i) => {
    const l = ctx.pool.byKey.get(r.key).line;
    assert.ok(near(r.fp, l.pts + 1.2 * l.reb + 1.5 * l.ast + 3 * l.stl + 3 * l.blk - l.to, 1e-9), r.key);
    assert.ok(near(pc.rows[i].fp, r.fp * (r.pct == null ? 0 : r.pct), 1e-9));
    assert.ok(near(ros.rows[i].fp, r.fp * r.gl, 1e-9));
  });
  assert.ok(Number.isFinite(pg.avgFp)); assert.strictEqual(cat.avgFp, null); assert.ok(cat.rows.every(r => r.fp === undefined));
});

test('the scoring job cache keeps point values apart', () => {
  const ctx = mk(), st = stateOf(), job = a => V.winJob(ctx, st, { points: a }), run = j => { while (j.step()); return j.matrix.mean.match; };
  assert.notStrictEqual(run(job({ pts: 1 })), run(job({ ast: 5 })));
});

test('createScorer keeps point values apart: same ctx and roster, other values give another job; the same values give the same job', () => {
  const ctx = mk(), st = stateOf(), sc = V.createScorer(), a = sc.get(ctx, st, { points: { pts: 1 } }), b = sc.get(ctx, st, { points: { ast: 5 } });
  assert.notStrictEqual(a, b); assert.strictEqual(sc.get(ctx, st, { points: { pts: 1, reb: 0 } }), a); assert.notStrictEqual(sc.get(ctx, st, {}), a);
  assert.notStrictEqual(sc.getModule(ctx, st, { points: { pts: 1 } }), sc.getModule(ctx, st, { points: { ast: 5 } }));
});

// sources on the Team tab (2026-10-26): one context per source, the TeamWin math untouched
const Rk = require('../rankings_core.js'), FXP = fx('fx_players.json');
const baseArgs = () => ({ L, pool, DAYS: games(last.start, last.end), rosters: ROS, me, nowMs: last.start, box: [] });
const BOXC = ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
// a week of box games for the first n players of my roster, lines that differ from their projections
const boxOf = n => {
  const mine = ROS[me].map(x => pool.byKey.get(x.fid)).filter(p => p && p.pid != null).slice(0, n), names = {}, teams = {};
  mine.forEach((p, i) => { names[i + 1] = p.n; (teams[p.t] = teams[p.t] || []).push([String(i + 1), 30, 4 + i, 12, 2, 3, 1 + i, 9 + 3 * i, 3 + i, 6 - i, 1, 0, 4]); });
  return { cols: BOXC, names, games: { a: { d: '2026-10-20', teams } } };
};

test('sourceCtx: avg is the plain context; a box source swaps only the lines, keeps the projection ref, and matches a hand-built pool', () => {
  const a = baseArgs(), st = stateOf(), box = boxOf(6), rows = Rk.sourceRows('w7', PLAYERS, [box]);
  const c0 = M.makeCtx(a), cAvg = V.sourceCtx(a, 'avg', Rk.sourceRows('avg', PLAYERS), FXP), cW = V.sourceCtx(a, 'w7', rows, FXP);
  assert.deepStrictEqual(W.matrix(cAvg, st), W.matrix(c0, st));
  assert.deepStrictEqual(cW.ref, c0.ref);
  assert.strictEqual(cW.pool.players.filter(p => !p.lineFb).length, 6);
  assert.notDeepStrictEqual(W.matrix(cW, st).mean, W.matrix(c0, st).mean);
  const hand = Object.assign({}, pool, { players: pool.players.map(p => { const r = Rk.matchRows('w7', rows, pool, FXP).byKey.get(p.key); return r ? Object.assign({}, p, { line: r.line, mpg: r.m }) : p; }) });
  hand.byKey = new Map(hand.players.map(p => [p.key, p]));
  assert.deepStrictEqual(W.matrix(cW, st), W.matrix(M.makeCtx(Object.assign({}, a, { pool: hand, ref: c0.ref })), st));
  assert.strictEqual(pool.byKey.get(cW.pool.players.find(p => !p.lineFb).key).lineFb, undefined);   // the base pool is untouched
});

test('sourceCtx: a previewed trade scores on a source context; scorer jobs are per context and come back when switching back', () => {
  const a = baseArgs(), box = boxOf(6), rows = Rk.sourceRows('w7', PLAYERS, [box]), c0 = M.makeCtx(a), cW = V.sourceCtx(a, 'w7', rows, FXP), sc = V.createScorer();
  const st = stateOf(), inK = ROS[other].find(x => x.slot === 'ACTIVE').fid, sw = T.applySwap(st, [st.order[0]], [inK]);
  const m = W.matrix(cW, sw); assert.ok(m.teams.length > 0 && m.teams.every(t => Number.isFinite(t.match)));
  const j0 = sc.get(c0, sw, { cats: 9 }), jW = sc.get(cW, sw, { cats: 9 });
  assert.notStrictEqual(j0, jW); assert.strictEqual(sc.get(c0, sw, { cats: 9 }), j0); assert.strictEqual(sc.get(cW, sw, { cats: 9 }), jW);
});
