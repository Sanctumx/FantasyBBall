// League tab on the Team-tab rules (league-team-rules, 2026-10-29): LeagueTab.score gives every team the numbers the Team tab shows for it
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), T = require('../../team_core.js'), W = require('../../team_win.js'), TV = require('../../team_view.js'), M = require('../../matchup_core.js'), Pl = require('../../inseason_players.js');
const LT = require('../../league_tab.js');
const fx = n => require('../fixtures/' + n), PLAYERS = require('../../players.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const me = L.teams[0].id, ids = L.teams.map(t => t.id);
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const last = L.periods.find(p => p.n === L.lastRegular);
const teamsAll = [...new Set(pool.players.map(p => p.t).filter(Boolean))];
const DAYS = (() => { const g = {}; teamsAll.forEach(t => { g[t] = []; for (let s = last.start / 1000 + 3600; s < last.end / 1000; s += 2 * 86400) g[t].push(s); }); return { games: g }; })();
const mkTab = basis => Object.assign(M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: last.start }), { teamTab: true, basis });
const names = ids.map(id => L.teams.find(t => t.id === id).name);

test('score: win chances equal the Team tab matrix of each team, on both bases', () => {
  for (const basis of ['total', 'pergame']) {
    const ctx = mkTab(basis), r = LT.score({ ctx, ids, names, basis, cats: 9, scoring: 'h2h' });
    assert.strictEqual(r.N, ids.length);
    ids.forEach((a, i) => {
      const m = W.matrix(Object.assign({}, ctx, { me: a }), T.tabState(ROS[a]));
      m.teams.forEach(t => {
        const j = ids.indexOf(t.id);
        assert.ok(near(r.match[i][j], t.match), basis + ' match ' + a + t.id);
        r.cats.forEach(c => assert.ok(near(r.cat[i][j][c], t.cat[c]), basis + ' cat ' + c));
        assert.ok(near(r.expCats[i][j], t.winC), basis + ' winC');
      });
      assert.strictEqual(r.match[i][i], null);
    });
  }
});

test('score: a team\'s per game line equals the Team tab\'s team average (rows().avg)', () => {
  const ctx = mkTab('pergame'), r = LT.score({ ctx, ids, names, basis: 'pergame', cats: 9, scoring: 'h2h' });
  ids.forEach((a, i) => {
    const avg = TV.rows(ctx, T.tabState(ROS[a]), { cats: 9, view: 'game' }).avg;
    const want = [avg.fgp, avg.ftp, avg.tpm, avg.pts, avg.reb, avg.ast, avg.stl, avg.blk, avg.to];
    want.forEach((v, c) => assert.ok(near(r.raw[i][c], v, 1e-9), 'team ' + a + ' cat ' + c));
  });
});

test('score: the seasonal totals count the IL player; IL ids are listed', () => {
  const tid = ids.find(t => ROS[t].some(x => x.slot === 'IR')), i = ids.indexOf(tid);
  assert.ok(tid, 'fixture has a team with an IL player');
  const tot = LT.score({ ctx: mkTab('total'), ids, names, basis: 'total', cats: 9, scoring: 'h2h' });
  assert.deepStrictEqual(tot.il[i].slice().sort(), ROS[tid].filter(x => x.slot === 'IR').map(x => x.fid).sort());
  // dropping the IL player from the roster lowers the total points (he counts at his availability) but not the per game line
  const ctx = mkTab('total'), saved = ctx.roster[tid], ilFid = ROS[tid].find(x => x.slot === 'IR').fid;
  const ctx2 = Object.assign({}, ctx, { roster: Object.assign({}, ctx.roster, { [tid]: saved.filter(f => f !== ilFid) }) });
  const less = LT.score({ ctx: ctx2, ids, names, basis: 'total', cats: 9, scoring: 'h2h' });
  assert.ok(tot.raw[i][3] > less.raw[i][3], 'IL player adds to the season total');
});

test('score: standings rank by the scoring mode, profile win is the mean category chance, z and rank over teams', () => {
  const ctx = mkTab('total'), r = LT.score({ ctx, ids, names, basis: 'total', cats: 9, scoring: 'h2h' }), N = ids.length;
  ids.forEach((a, i) => {
    assert.ok(near(r.standings[i].matchAvg, r.match[i].reduce((s, v) => s + (v == null ? 0 : v), 0) / (N - 1)));
    assert.ok(near(r.standings[i].catsPerWeek, r.expCats[i].reduce((s, v) => s + (v == null ? 0 : v), 0) / (N - 1)));
    r.profile(i).forEach(p => assert.ok(near(p.win, ids.reduce((s, b, j) => j === i ? s : s + r.cat[i][j][p.c] / (N - 1), 0))));
  });
  assert.deepStrictEqual(r.standings.map(s => s.rank).sort((a, b) => a - b), ids.map((_, k) => k + 1));
  const best = r.standings.reduce((b, s, i) => s.catsPerWeek > r.standings[b].catsPerWeek ? i : b, 0);
  assert.strictEqual(r.standings[best].rank, 1);
  for (let c = 0; c < 9; c++) assert.ok(near(r.z.reduce((s, t) => s + t[c], 0), 0, 1e-9), 'z centred ' + c);
  assert.strictEqual(r.me, ids.indexOf(me));
});

test('score: with zCats the Zscore view is each team\'s Team-tab Z per lineup slot', () => {
  const ctx = mkTab('total'), zCats = pp => Array.from({ length: 9 }, (_, c) => (pp.line.pts + c) / 10);
  const r = LT.score({ ctx, ids, names, basis: 'total', cats: 9, scoring: 'h2h', zCats }), plain = LT.score({ ctx, ids, names, basis: 'total', cats: 9, scoring: 'h2h' });
  ids.forEach((a, i) => {
    const want = TV.rows(W.tabView(ctx, 'total'), W.tradeState(ctx, a, ctx.roster[a]), { cats: 9, view: 'game', zCats }).avgCats;
    want.forEach((v, c) => assert.ok(near(r.z[i][c], v, 1e-9), 'team ' + a + ' cat ' + c));
  });
  assert.deepStrictEqual(r.rank, plain.rank);   // ranks stay on the stat lines
});

test('score: a team in ids but missing from the rosters is left out instead of crashing', () => {
  const ctx = mkTab('total'), gone = ids[ids.length - 1], roster = Object.assign({}, ctx.roster); delete roster[gone];
  const r = LT.score({ ctx: Object.assign({}, ctx, { roster }), ids, names, basis: 'total', cats: 9, scoring: 'h2h' });
  assert.ok(r, 'scores'); assert.strictEqual(r.N, ids.length - 1);
  assert.ok(!r.names.includes(names[ids.indexOf(gone)]));
  r.match.forEach(row => assert.strictEqual(row.length, r.N));
});

test('score: ids in another order than the league give the same per-team numbers', () => {
  const ctx = mkTab('total'), rev = ids.slice().reverse(), a = LT.score({ ctx, ids, names, basis: 'total', cats: 9, scoring: 'h2h' }),
    b = LT.score({ ctx, ids: rev, names: rev.map(t => names[ids.indexOf(t)]), basis: 'total', cats: 9, scoring: 'h2h' });
  ids.forEach((t, i) => {
    const k = rev.indexOf(t);
    assert.deepStrictEqual(b.raw[k], a.raw[i]); assert.strictEqual(b.names[k], a.names[i]);
    ids.forEach((u, j) => { if (i !== j) assert.ok(near(b.match[k][rev.indexOf(u)], a.match[i][j])); });
  });
});

test('score: the Total stat line is the sum of each counted player\'s line x games played, perWeek = total / W', () => {
  const ctx = mkTab('total'), r = LT.score({ ctx, ids, names, basis: 'total', cats: 9, scoring: 'h2h' }), tv = W.tabView(ctx, 'total');
  ids.forEach((t, i) => {
    const pts = W.side(tv, W.tradeState(ctx, t, ctx.roster[t]), r.W).reduce((s, e) => s + e.p.pts * e.games * r.W, 0);
    assert.ok(near(r.raw[i][3], pts, 1e-6), 'PTS total ' + t);
    assert.ok(near(r.perWeek[i][3], pts / r.W, 1e-6), 'PTS per week ' + t);
  });
});

test('score: 8 categories drop turnovers; no weeks left gives null', () => {
  const r8 = LT.score({ ctx: mkTab('total'), ids, names, basis: 'total', cats: 8, scoring: 'h2h' });
  assert.strictEqual(r8.nc, 8); assert.ok(!r8.cats.includes(8));
  const done = Object.assign(mkTab('total'), { nowMs: last.end + 1 });
  assert.strictEqual(LT.score({ ctx: done, ids, names, basis: 'total', cats: 9, scoring: 'h2h' }), null);
});
