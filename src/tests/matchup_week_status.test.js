// Matchup week status: box-score totals so far + projection of the games still to play (idea 118, 2026-10-21)
const test = require('node:test'), assert = require('node:assert');
const I = require('../inseason_league.js'), Pl = require('../inseason_players.js'), M = require('../matchup_core.js'), PLAYERS = require('../players.json');
const fx = n => require('./fixtures/' + n), DAYS = require('../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, NOW = Date.UTC(2026, 9, 22, 12);
const ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: NOW }), opp = I.opponentOf(L, me, 1);
const P1 = L.periods.find(x => x.n === 1);
// New York date of the team's first game in period 1
const firstDay = p => I.nyDay(DAYS.games[p.t].map(x => x * 1000).find(ms => ms >= P1.start && ms < P1.end));
const COLS = ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];

const active = t => ctx.roster[t].map(f => pool.byKey.get(f)).filter(p => p.slot !== 'IR' && p.t);
// one box file: a game on `d` for each given [player, line overrides]; ids are made from the pool key
const box = (games) => {
  const f = { season: 2027, cols: COLS, names: {}, games: {} };
  games.forEach((g, i) => {
    const teams = {};
    g.lines.forEach(([p, o]) => {
      f.names[p.key] = p.n;
      (teams[p.t] || (teams[p.t] = [])).push([p.key].concat(COLS.map(c => (o && o[c] != null) ? o[c] : (c === 'min' ? 30 : 0))));
    });
    f.games['g' + i] = { d: g.d, teams };
  });
  return [f];
};

test('periodMonths and nyDay follow New York dates', () => {
  assert.strictEqual(I.nyDay(Date.UTC(2026, 9, 21, 2, 0)), '2026-10-20');
  assert.deepStrictEqual(I.periodMonths({ start: Date.UTC(2026, 9, 26, 19), end: Date.UTC(2026, 10, 2, 23) }), ['2026-10', '2026-11']);
});

test('no box games: the status is exactly the whole-week projection', () => {
  const s = M.weekStatus(ctx, [], me, 1), w = M.projectWeek(ctx, me, 1);
  assert.deepStrictEqual(s.cat, w.cat); assert.strictEqual(s.match, w.match); assert.deepStrictEqual(s.mu, w.mu);
  assert.deepStrictEqual(s.games, w.games);
  assert.ok(s.known[0].pts === 0 && s.known[1].pts === 0);
});

test('a played game is counted once: so far from the box, rest from games after tip-off', () => {
  const p = active(me)[0], whole = M.projectWeek(ctx, me, 1);
  const files = box([{ d: firstDay(p), lines: [[p, { fgm: 8, fga: 16, ftm: 4, fta: 5, pts: 20, reb: 6, to: 3 }]] }]);
  const s = M.weekStatus(ctx, files, me, 1);
  assert.strictEqual(s.known[0].pts, 20); assert.strictEqual(s.known[0].fga, 16); assert.strictEqual(s.known[0].to, 3);
  assert.ok(s.games[0] < whole.games[0], 'games left shrink');
  assert.ok(Math.abs(s.total[0][3] - (20 + s.rest[0][3])) < 1e-9, 'total = so far + rest (points)');
  assert.deepStrictEqual(s.known[1], M.weekStatus(ctx, [], me, 1).known[1]);
});

test('FG% and FT% come from summed makes and attempts', () => {
  const [a, b] = active(me), files = box([{ d: '2026-10-20', lines: [[a, { fgm: 6, fga: 10, ftm: 2, fta: 4 }], [b, { fgm: 2, fga: 10, ftm: 4, fta: 4 }]] }]);
  const s = M.weekStatus(ctx, files, me, 1);
  assert.strictEqual(s.known[0].fgm, 8); assert.strictEqual(s.known[0].fga, 20); assert.strictEqual(s.known[0].ftm, 6); assert.strictEqual(s.known[0].fta, 8);
});

test('IR players and other periods are ignored', () => {
  const t = Object.keys(ROS).find(k => ROS[k].some(x => x.slot === 'IR')), irp = pool.byKey.get(ROS[t].find(x => x.slot === 'IR').fid), a = active(t)[0];
  const files = box([{ d: '2026-10-20', lines: [[irp, { pts: 30 }]] }, { d: '2026-10-19', lines: [[a, { pts: 40 }]] }]);
  const s = M.weekStatus(ctx, files, t, 1);
  assert.strictEqual(s.known[0].pts, 0);
});

test('at most maxActive players count on one day', () => {
  const ps = active(me).slice(0, 12), files = box([{ d: '2026-10-20', lines: ps.map(p => [p, { pts: 10 }]) }]);
  const s = M.weekStatus(ctx, files, me, 1);
  assert.strictEqual(ps.length, 12);
  assert.strictEqual(s.known[0].pts, 10 * L.maxActive);
});

test('a decided category late in the week is more certain than the whole-week chance', () => {
  const a = active(me)[0], files = box([{ d: firstDay(a), lines: [[a, { pts: 90 }]] }]);
  const s = M.weekStatus(ctx, files, me, 1), w = M.projectWeek(ctx, me, 1);
  assert.ok(s.cat[3] > w.cat[3] + 0.1);
});

test('roster rows: current, projected and games left per player add up to the team', () => {
  const [a, b] = active(me), files = box([{ d: firstDay(a), lines: [[a, { fgm: 6, fga: 10, ftm: 2, fta: 4, pts: 15, to: 2 }], [b, { fgm: 2, fga: 8, pts: 5 }]] }]);
  const s = M.weekStatus(ctx, files, me, 1), rows = s.roster[0];
  assert.strictEqual(rows.length, active(me).length);
  assert.ok(Math.abs(rows.reduce((t, r) => t + r.games, 0) - s.games[0]) < 1e-9, 'games left sum');
  assert.strictEqual(rows.reduce((t, r) => t + r.cur[3], 0), s.known[0].pts);
  const ra = rows.find(r => r.key === a.key);
  assert.strictEqual(ra.cur[3], 15); assert.strictEqual(ra.cur[0], 0.6);
  assert.ok(Math.abs(ra.proj[3] - (15 + a.line.pts * ra.games)) < 1e-9);
  assert.ok(Math.abs(ra.proj[0] - (6 + a.line.fgp * a.line.fga * ra.games) / (10 + a.line.fga * ra.games)) < 1e-9);
  assert.ok(Math.abs(rows.reduce((t, r) => t + r.proj[3], 0) - s.total[0][3]) < 1e-6, 'projected points sum to the team total');
});

test('rosterGames: a day cap can be lowered for players already counted', () => {
  const G = { AAA: [Date.parse('2026-10-21T00:30:00Z') / 1000] };
  const e = [1, 2, 3, 4].map(() => ({ t: 'AAA', a: 1, from: 0, to: Date.parse('2026-11-01T00:00:00Z') }));
  assert.deepStrictEqual(I.rosterGames(e, { games: G }, 10), [1, 1, 1, 1]);
  const day = I.localDay(G.AAA[0] * 1000), g = I.rosterGames(e, { games: G }, 10, { [day]: 8 });
  assert.ok(Math.abs(g.reduce((a, x) => a + x, 0) - 2) < 1e-9, 'only 2 slots left: ' + g);
});

test('a night split between played and unplayed games never counts more than maxActive players', () => {
  // a team with early (boxed) and later games the same day: players boxed + players still to play <= maxActive
  const t = Object.keys(ROS).find(k => ROS[k].length >= 12), ps = active(t);
  const day = I.nyDay(DAYS.games[ps[0].t].map(x => x * 1000).find(ms => ms >= P1.start && ms < P1.end));
  const files = box([{ d: day, lines: ps.slice(0, 3).map(p => [p, { pts: 10 }]) }]);
  const s = M.weekStatus(ctx, files, t, 1), whole = M.weekStatus(ctx, [], t, 1);
  s.roster[0].forEach((r, i) => assert.ok(r.games <= whole.roster[0][i].games + 1e-9, r.n + ' keeps no more games than the whole week'));
});

test('status is only reported once something has been played', () => {
  assert.strictEqual(M.weekStatus(ctx, [], me, 1).started, false);
  assert.strictEqual(M.weekStatus(ctx, box([{ d: '2026-10-12', lines: [[active(me)[0], { pts: 9 }]] }]), me, 1).started, false, 'last week is ignored');
  const a = active(me)[0];
  assert.strictEqual(M.weekStatus(ctx, box([{ d: firstDay(a), lines: [[a, { pts: 9 }]] }]), me, 1).started, true);
});

test('games left are whole numbers: real team games still to play, no availability fraction', () => {
  const s = M.weekStatus(ctx, [], me, 1);
  s.roster[0].forEach(r => {
    assert.strictEqual(r.games, Math.round(r.games), r.n + ' whole');
    const sched = DAYS.games[r.t].filter(x => x * 1000 >= P1.start && x * 1000 < P1.end).length;
    assert.ok(r.games <= sched, r.n + ' has at most his team games');
  });
  assert.strictEqual(s.games[0], Math.round(s.games[0]));
  const a = active(me)[0], n = s.roster[0].find(r => r.key === a.key).games;
  const t = M.weekStatus(ctx, box([{ d: firstDay(a), lines: [[a, { pts: 9 }]] }]), me, 1).roster[0].find(r => r.key === a.key).games;
  assert.strictEqual(t, n - 1, 'a played game comes off by exactly one');
});
