// #146 live-roster k: pure helpers of calib_live.js (period/roster-day mapping, outcome rows, season-to-date lines, division ctx, forecast parity with the shipped Team tab, row builder, k difference, verdict rule)
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), TW = require('../../team_win.js'), CB = require('../../calib_blend.js'), S = require('../../calib_ros_stats.js'), CL = require('../../calib_live.js');

// ---- a small synthetic league: 12 teams, 19 weekly periods from Tue 2024-10-22 19:00 ET (period 1 here is a full week) ----
const DAY = 864e5, T0 = Date.parse('2024-10-22T23:00:00Z');
const fxDate = ms => new Date(ms).toISOString().slice(0, 19) + '.0-0000';
const INFO = {
  teamInfo: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['t' + i, { name: 'T' + i, shortName: 'T' + i, division: 'D' }])),
  scoringPeriods: Array.from({ length: 19 }, (_, i) => ({ number: i + 1, startDate: fxDate(T0 + 7 * i * DAY), endDate: fxDate(T0 + 7 * (i + 1) * DAY - 1000) })),
  rosterInfo: { maxTotalActivePlayers: 10, maxTotalPlayers: 16 }, playerInfo: {}, matchups: [], playoffs: { lastRegularSeasonPeriod: 17 }
};
const LG = Object.assign(I.parseLeague(INFO), { lastRegular: 17 });
const TEAMS = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF'];
const line = (a, b) => ({ fgp: .45 + .01 * (a % 5), fga: 8 + b % 4, ftp: .75 + .01 * (b % 6), fta: 3 + a % 3, tpm: 1 + (a % 4) * .4, pts: 10 + 1.3 * a, reb: 4 + (a % 7), ast: 2 + (b % 5), stl: .6 + .1 * (a % 4), blk: .4 + .1 * (b % 4), to: 1.5 + .1 * (a % 3), m: 20 + a });
const PLAYERS = Array.from({ length: 170 }, (_, i) => ({ key: 'p' + i, n: 'P' + i, t: TEAMS[i % 6], g: 60 + (i % 20), line: line(i % 13, i % 9), adp: i + 1, src: 'proj' }));
const ROWS = {}; for (let t = 0; t < 12; t++) ROWS['t' + t] = Array.from({ length: 13 }, (_, j) => ({ fid: 'p' + (t * 13 + j), slot: j === 12 ? 'IR' : j > 9 ? 'RESERVE' : 'ACTIVE' }));
const DAYS = { games: Object.fromEntries(TEAMS.map((t, k) => [t, Array.from({ length: 140 }, (_, d) => (T0 + d * DAY + (k % 2) * DAY + 3600e3) / 1000).filter((_, d) => d % 2 === k % 2 || d % 3 === 0)])) };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const mkCtx = (p, rows) => CL.divisionCtx({ L: LG, players: PLAYERS, rows: rows || ROWS, DAYS, nowMs: LG.periods[p - 1].start });

test('rosterDay: the 1-based Fantrax roster day on which a period starts (period 1 = day 1, a 7-day period later = +7)', () => {
  assert.strictEqual(CL.rosterDay(LG.periods[0]), 1);
  assert.strictEqual(CL.rosterDay(LG.periods[1]), 8);
  assert.strictEqual(CL.rosterDay(LG.periods[15]), 1 + 7 * 15);
  // the real league's period 1 is a 6-day period: Oct 22 19:30 ET start, period 2 starts Oct 28
  const real = I.parseLeague({ scoringPeriods: [{ number: 1, startDate: '2024-10-22T19:30:00.0-0400', endDate: '2024-10-28T18:59:59.0-0400' }, { number: 2, startDate: '2024-10-28T19:00:00.0-0400', endDate: '2024-11-04T18:59:59.0-0500' }] });
  assert.strictEqual(CL.rosterDay(real.periods[0]), 1);
  assert.strictEqual(CL.rosterDay(real.periods[1]), 7);
});

const cell = (c, tip) => ({ content: String(c), toolTip: String(tip == null ? c : tip) });
const row = (team, opp, w, l, t, cats) => ({ matchupId: team < opp ? team + '_' + opp : opp + '_' + team, fixedCells: [{ teamId: team }], cells: [cell(w), cell(l), cell(t), cell(w)].concat(cats.map(c => cell(c.toFixed(1), c))) });
const HEADER = { cells: ['W', 'L', 'T', 'Pts', 'FG%', '3PTM', 'FT%', 'PTS', 'REB', 'AST', 'ST', 'BLK', 'TO'].map(s => ({ shortName: s })) };
// Fantrax column order is FG%, 3PTM, FT%, PTS, REB, AST, ST, BLK, TO
const standings = tables => ({ responses: [{ data: { tableList: tables.map(rows => ({ header: HEADER, rows })) } }] });

test('parseOutcomes: one outcome per matchupId, categories in the app order (FG%, FT%, 3PM, ...), TO lower wins, ties 0.5, playoff periods dropped', () => {
  const a = [.5, 90, .8, 100, 40, 20, 8, 5, 12], b = [.4, 95, .8, 90, 40, 25, 7, 5, 14];   // a vs b: FG% a, 3PM b, FT% tie, PTS a, REB tie, AST b, STL a, BLK tie, TO a (fewer)
  const t = [row('a', 'b', 4, 3, 2, a), row('b', 'a', 3, 4, 2, b)];
  const o = CL.parseOutcomes(standings([t, t, t]), 2);
  assert.deepStrictEqual(Object.keys(o), ['1', '2']);
  assert.strictEqual(o[1].length, 1);
  assert.deepStrictEqual([o[1][0].a, o[1][0].b], ['a', 'b']);
  assert.deepStrictEqual(o[1][0].cat, [1, .5, 0, 1, .5, 0, 1, .5, 1]);   // FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO
  assert.strictEqual(o[1][0].match, 1);   // 4 wins to 3 losses
  assert.strictEqual(CL.parseOutcomes(standings([[row('a', 'b', 3, 3, 3, a), row('b', 'a', 3, 3, 3, b)]]), 17)[1][0].match, .5);
});

test('stdLine: only games before the checkpoint count; n0 = infinity returns the preseason line bit for bit', () => {
  const l = PLAYERS[3].line, rows = [[0, 5, 10, 2, 3, 1, 20, 6, 4, 1, 0, 2, 30], [3, 4, 9, 3, 4, 2, 15, 5, 3, 2, 1, 1, 28], [9, 9, 9, 9, 9, 9, 99, 9, 9, 9, 9, 9, 40]];
  const INF = { g: Infinity, min: Infinity, fg: Infinity, ft: Infinity }, n0 = { g: 10, min: 750, fg: 500, ft: 200 };
  assert.deepStrictEqual(CL.stdLine(l, rows, 7, INF), l);
  const b = CL.stdLine(l, rows, 7, n0), b2 = CL.stdLine(l, rows.slice(0, 2), 7, n0), b3 = CL.stdLine(l, rows, 9, n0), b4 = CL.stdLine(l, rows, 10, n0);
  assert.deepStrictEqual(b, b2);       // the day-9 game is after the cut at day 7
  assert.deepStrictEqual(b3, b);       // the cut is the first day NOT counted: days < 9 are kept, day 9 is not
  assert.notDeepStrictEqual(b4, b);    // a cut at day 10 counts the day-9 game
  assert.notStrictEqual(b.pts, l.pts);
  assert.deepStrictEqual(CL.stdLine(l, [], 7, n0), l);   // no games yet
});

test('gameSeconds: a game on date D is at 20:00 ET, i.e. inside the period that starts on or before D at 19:00 and outside the one that ended that evening', () => {
  const G = CL.gameSeconds({ AAA: ['2024-10-28', '2024-10-29'], NY: ['2024-11-03'] });
  assert.deepStrictEqual(Object.keys(G.games).sort(), ['AAA', 'NYK']);   // team codes follow InLeague.toProjTeam
  const real = I.parseLeague({ scoringPeriods: [{ number: 1, startDate: '2024-10-22T19:30:00.0-0400', endDate: '2024-10-28T18:59:59.0-0400' }, { number: 2, startDate: '2024-10-28T19:00:00.0-0400', endDate: '2024-11-04T18:59:59.0-0500' }] });
  const inP = (s, p) => s * 1000 >= real.periods[p - 1].start && s * 1000 < real.periods[p - 1].end;
  assert.ok(!inP(G.games.AAA[0], 1) && inP(G.games.AAA[0], 2));   // Oct 28 evening belongs to period 2
  assert.ok(inP(G.games.NYK[0], 2));                                // Nov 3 evening is still period 2 (ends Nov 4 19:00)
  assert.strictEqual(I.localDay(G.games.AAA[0] * 1000), '2024-10-28');
});

test('divisionCtx: owners and slots from the checkpoint roster, later-held players stay in the pool unowned, weeks left count the periods to 17', () => {
  const rows = JSON.parse(JSON.stringify(ROWS)); rows.t0[0] = { fid: 'p169', slot: 'ACTIVE' };
  const ctx = mkCtx(2, rows);
  assert.strictEqual(ctx.pool.byKey.get('p169').owner, 't0');
  assert.strictEqual(ctx.pool.byKey.get('p0').owner, null);          // dropped by t0, no longer owned
  assert.strictEqual(ctx.pool.byKey.get('p13').owner, 't1');
  assert.strictEqual(ctx.pool.byKey.get('p13').slot, 'ACTIVE');
  assert.strictEqual(ctx.pool.byKey.get('p23').slot, 'RESERVE');     // t1's 11th player (index 10)
  assert.strictEqual(ctx.pool.byKey.get('p25').owner, 't1');
  assert.strictEqual(ctx.pool.byKey.get('p12').slot, 'IR');          // t0's 13th player
  assert.strictEqual(ctx.pool.byKey.get('p13').g, 60 + 13 % 20);
  assert.strictEqual(Object.keys(ctx.roster).length, 12);
  assert.ok(near(TW.weeksLeft(ctx), 16));                             // periods 2..17
  assert.ok(near(TW.weeksLeft(mkCtx(16)), 2));
});

// every cell of the forecast equals the shipped Team tab's unshrunk match chance (TeamWin.leagueWin with k = 1)
test('PARITY: forecast.match(i, j) equals TeamWin.leagueWin with the shrink off, cell for cell', () => {
  const ctx = mkCtx(6), e = CL.engineFor(ctx), W = TW.weeksLeft(ctx), f = CL.forecast(ctx, e, ROWS, W);
  const lw = TW.leagueWin(ctx, null, { shrink: { match: 1, cat: 1 } });
  assert.deepStrictEqual(f.ids, lw.ids);
  let n = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (i !== j) { assert.ok(near(f.match(i, j), lw.P[i][j], 1e-12), i + ',' + j); n++; }
  assert.strictEqual(n, 132);
  assert.ok(near(f.cat(0, 1, 3) + f.cat(1, 0, 3), 1, 1e-6));          // symmetric
});

test('forecast: a team that adds a better player gets a higher match chance than before', () => {
  const ctx = mkCtx(4), e = CL.engineFor(ctx), W = TW.weeksLeft(ctx), base = CL.forecast(ctx, e, ROWS, W);
  const rows = JSON.parse(JSON.stringify(ROWS)); rows.t5[1] = { fid: 'p160', slot: 'ACTIVE' };   // t5's second player is replaced by a free player
  rows.t5[1] = { fid: 'p10', slot: 'ACTIVE' };
  const up = CL.forecast(ctx, e, rows, W);
  assert.notStrictEqual(up.match(5, 0), base.match(5, 0));
});

test('pushRows: one pairing makes 9 category rows then 1 match row, with week, division, checkpoint and every arm column', () => {
  const cols = CL.newCols(['A', 'B']), fc = { A: { cat: (i, j, c) => .1 * (c + 1), match: () => .7 }, B: { cat: (i, j, c) => .2, match: () => .6 } };
  CL.pushRows(cols, fc, 0, 1, { cat: [1, 0, .5, 1, 1, 0, 0, 1, .5], match: 1 }, { wk: 5, sd: 3, ck: 2 });
  assert.strictEqual(cols.y.length, 10);
  assert.deepStrictEqual(cols.cat, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepStrictEqual(cols.y.slice(0, 3), [1, 0, .5]);
  assert.strictEqual(cols.y[9], 1);
  assert.ok(cols.wk.every(x => x === 5) && cols.sd.every(x => x === 3) && cols.ck.every(x => x === 2));
  assert.ok(near(cols.p.A[2], .3) && near(cols.p.A[9], .7) && near(cols.p.B[9], .6));
  const D = CL.finish(cols);
  assert.strictEqual(D.n, 10); assert.ok(D.y instanceof Float32Array);
});

// D with two arms: the first arm's forecast is the outcome signal at slope k1, the second at slope k2
const synth = (k1, k2, ndiv = 10, per = 400) => {
  const cols = CL.newCols(['A', 'B']); let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let d = 0; d < ndiv; d++) for (let q = 0; q < 6; q++) for (let n = 0; n < per; n++) {
    const p = .15 + .7 * r(), y = r() < .5 + k1 * (p - .5) ? 1 : 0, pb = .5 + (k1 / k2) * (p - .5);
    cols.p.A.push(p); cols.p.B.push(Math.min(.99, Math.max(.01, pb))); cols.y.push(y); cols.wk.push(q + 1); cols.sd.push(d); cols.cat.push(9); cols.ck.push(0);
  }
  return CL.finish(cols);
};
test('kDiffSE: k_B - k_A with a division-clustered bootstrap SE; identical arms give 0', () => {
  const D = synth(.5, .8), same = CL.kDiffSE(D, 'A', 'A', { kind: 'M' });   // B's chances are A's pulled in by .5 / .8, so its k is larger
  assert.ok(near(same.d, 0) && near(same.se, 0));
  const diff = CL.kDiffSE(D, 'A', 'B', { kind: 'M' });
  assert.ok(near(diff.d, S.fitK(D, 'B', { kind: 'M' }) - S.fitK(D, 'A', { kind: 'M' })));
  assert.ok(diff.d > 0.2 && diff.se > 0 && diff.se < .2);
  assert.strictEqual(diff.byDiv.length, 10);
  assert.ok(diff.byDiv.every(x => x > 0));
  assert.ok(CL.decideDiff(diff).moves);
  assert.ok(!CL.decideDiff({ d: diff.d, se: diff.d, byDiv: diff.byDiv }).moves);
});

test('decide: rounding to .05, the 2 SE bar and the 8-of-10 divisions rule (the edge cases)', () => {
  assert.strictEqual(CL.round05(.625), .65); assert.strictEqual(CL.round05(.62), .6); assert.strictEqual(CL.round05(.5749), .55);
  const divs = (n, v) => Array.from({ length: 10 }, (_, i) => (i < n ? v : 2 * .6 - v));
  // the rounded k must differ from .60 by more than 2 SE: .70 vs .60 with SE .04 -> .1 > .08 ok; SE .05 -> no
  assert.strictEqual(CL.decide({ k: .70, se: .04, byDiv: divs(9, .7), shipped: .6 }).ship, true);
  assert.strictEqual(CL.decide({ k: .70, se: .05, byDiv: divs(9, .7), shipped: .6 }).ship, false);
  assert.strictEqual(CL.decide({ k: .70, se: .04, byDiv: divs(7, .7), shipped: .6 }).ship, false);   // only 7 of 10 on the same side
  assert.strictEqual(CL.decide({ k: .70, se: .04, byDiv: divs(8, .7), shipped: .6 }).ship, true);    // exactly 8 of 10
  assert.strictEqual(CL.decide({ k: .61, se: .001, byDiv: divs(10, .61), shipped: .6 }).ship, false); // rounds to .60: nothing to ship
  assert.strictEqual(CL.decide({ k: .68, se: .02, byDiv: divs(10, .68), shipped: .6 }).k, .7);        // the value to ship is the rounded one
});

test('outcomes feed rows: a season-to-date cut of lines and the outcome period list use only periods from the checkpoint to 17', () => {
  assert.deepStrictEqual(CL.outcomePeriods(2), Array.from({ length: 16 }, (_, i) => i + 2));
  assert.deepStrictEqual(CL.outcomePeriods(16), [16, 17]);
  assert.deepStrictEqual(CL.CHECKPOINTS, [2, 4, 6, 8, 10, 12, 14, 16]);
});
