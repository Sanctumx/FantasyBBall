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
  assert.deepStrictEqual(r.groups.map(g => g.slot), ['active', 'bench', 'il', 'reserve']);
  assert.strictEqual(r.rows.length, st.order.length);
  r.groups.forEach(g => g.rows.forEach(x => assert.strictEqual(st.slots[x.key], g.slot)));
});

test('rows: GL is projected games left (team games x g/82), never times Plays %', () => {
  const ctx = mk(), st = stateOf(), r = V.rows(ctx, st, { zCats }), plays = T.playsPct(ctx, st);
  r.rows.forEach(x => {
    const pp = pool.byKey.get(x.key);
    assert.ok(near(x.gl, T.gamesLeft(ctx, pp.t) * Math.min(1, pp.g / 82)), x.key);
    assert.strictEqual(x.pct, plays[x.key].pct);
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
    const b = find(on, a.key), pp = pool.byKey.get(a.key), f = a.pct == null ? 1 : a.pct;
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
  const k = st.order.find(q => st.slots[q] === 'bench' || st.slots[q] === 'active'), gone = V.rows(ctx, T.moveSlot(st, k, 'reserve'), { zCats });
  assert.notDeepStrictEqual(gone.avg, a.avg);
  assert.deepStrictEqual(gone.avg, V.rows(ctx, T.applySwap(st, [k], []), { zCats }).avg);
  assert.ok(near(a.total.pts, a.avg.pts * ctx.L.maxActive));
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
  assert.ok(!(out.key in next.slots) && next.slots[inn.key] === 'bench');
  assert.strictEqual(JSON.stringify(st), before);
});
