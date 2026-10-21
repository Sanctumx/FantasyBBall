// Rankings core: Zscore on the top X players by H2H-adjusted value within a source (user ruling, 2026-10-21)
const test = require('node:test'), assert = require('node:assert');
const R = require('../rankings_core.js'), PLAYERS = require('../players.json');
const rows = R.projSource(PLAYERS, 'avg');
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test('projSource lists every player with games and a per-game line', () => {
  assert.strictEqual(rows.length, PLAYERS.length);
  assert.ok(rows[0].g > 0 && rows[0].line.pts > 0 && rows[0].pid === 0);
});

test('pool is the top teams x roster players by H2H value', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'h2h', basis: 'pergame' });
  const pool = t.filter(r => r.inPool), rest = t.filter(r => r.z != null && !r.inPool);
  assert.strictEqual(pool.length, 144);
  assert.ok(Math.min(...pool.map(r => r.z)) >= Math.max(...rest.map(r => r.z)) - 1e-9);
});

test('league size sets the pool', () => {
  assert.strictEqual(R.table(rows, { teams: 10, roster: 12, type: 'h2h', basis: 'pergame' }).filter(r => r.inPool).length, 120);
});

test('Standard type: every category has mean 0 and SD 1 over the pool', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'classic', basis: 'pergame' }), pool = t.filter(r => r.inPool);
  for (let c = 0; c < 9; c++) {
    const m = pool.reduce((s, r) => s + r.cats[c], 0) / pool.length;
    const sd = Math.sqrt(pool.reduce((s, r) => s + (r.cats[c] - m) ** 2, 0) / pool.length);
    assert.ok(near(m, 0, 1e-9) && near(sd, 1, 1e-9), 'cat ' + c + ' ' + m + ' ' + sd);
  }
});

test('Zscore is the weighted sum of the category z (TO x0.5)', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'classic', basis: 'pergame' });
  const W = [1, 1, 1, 1, 1, 1, 1, 1, 0.5];
  t.slice(0, 20).forEach(r => assert.ok(near(r.z, r.cats.reduce((s, v, c) => s + v * W[c], 0), 1e-9)));
});

test('input order does not change a player\'s Zscore', () => {
  const a = R.table(rows, { teams: 12, roster: 12, type: 'h2h', basis: 'total' });
  const b = R.table(rows.slice().reverse(), { teams: 12, roster: 12, type: 'h2h', basis: 'total' });
  const zb = new Map(b.map(r => [r.pid, r.z]));
  a.forEach(r => assert.ok(near(r.z, zb.get(r.pid), 1e-6), 'pid ' + r.pid));
});

test('a player with no games has no Zscore and does not move the others', () => {
  const extra = rows.concat([Object.assign({}, rows[0], { pid: 9999, g: 0 })]);
  const a = R.table(rows, { teams: 12, roster: 12, type: 'h2h', basis: 'total' }), b = R.table(extra, { teams: 12, roster: 12, type: 'h2h', basis: 'total' });
  assert.strictEqual(b.find(r => r.pid === 9999).z, null);
  const zb = new Map(b.map(r => [r.pid, r.z]));
  a.forEach(r => assert.ok(near(r.z, zb.get(r.pid), 1e-9)));
});

test('8-cat leagues ignore turnovers', () => {
  const t = R.table(rows, { teams: 12, roster: 12, type: 'classic', basis: 'pergame', cats: 8 });
  t.slice(0, 20).forEach(r => assert.ok(near(r.z, r.cats.slice(0, 8).reduce((s, v) => s + v, 0), 1e-9)));
});

const ESPN = require('./fixtures/espn_2025_26.json');
test('seasonSource: one row per player with games, games scaled to 80 for the busiest, percentages from makes', () => {
  const s = R.seasonSource(ESPN, PLAYERS), played = ESPN.players.filter(p => p.gp > 0), maxGp = Math.max(...played.map(p => p.gp));
  assert.strictEqual(s.length, played.length);
  const top = s.find(r => r.gp === maxGp); assert.ok(near(top.g, 80));
  const d = s.find(r => /Luka Don/.test(r.n)), e = played.find(p => /Luka Don/.test(p.n));
  assert.ok(near(d.line.fgp, e.fgm / e.fga) && near(d.line.pts, e.pts) && near(d.g, e.gp * 80 / maxGp));
  assert.ok(d.pos && d.pos !== '', 'position taken from players.json');
  assert.strictEqual(new Set(s.map(r => r.pid)).size, s.length);
});

test('a season-source table ranks and keeps unscaled games for display', () => {
  const s = R.seasonSource(ESPN, PLAYERS), t = R.table(s, { teams: 14, roster: 12, type: 'h2h', basis: 'total' });
  assert.strictEqual(t.filter(r => r.inPool).length, 168);
  const best = s.find(r => r.pid === t[0].pid); assert.ok(best.gp > 20);
});

const I = require('../inseason_league.js'), Pl = require('../inseason_players.js');
const FXP = require('./fixtures/fx_players.json'), ROS = I.parseRosters(require('./fixtures/fx_rosters.json'));
test('ownersOf: each rostered player maps to one row with his team and slot, IR included', () => {
  const o = R.ownersOf(rows, FXP, ROS);
  const fid = Object.keys(FXP).find(k => /Wembanyama/.test(FXP[k].name));
  const team = Object.keys(ROS).find(t => ROS[t].some(x => x.fid === fid)), slot = ROS[team].find(x => x.fid === fid).slot;
  const wp = rows.find(r => /Wembanyama/.test(r.n));
  assert.deepStrictEqual(o.get(wp.pid), { owner: team, slot });
  assert.ok(o.size > 100 && o.size <= 178);
  assert.ok([...o.values()].some(v => v.slot === 'IR'));
  assert.strictEqual(new Set([...o.keys()]).size, o.size);
});

test('ownersOf works on season-source rows too', () => {
  const s = R.seasonSource(ESPN, PLAYERS), o = R.ownersOf(s, FXP, ROS);
  assert.ok(o.size > 150);
});

// Playoff games and Playoff boost (same rule as the board: 1 + strength x (games / average - 1), kept within x0.5-x1.5)
const SCHED = require('../sched.json'), LS = require('../league_store.js');
const S0 = Object.assign({}, LS.LEAGUE_DEF);

test('playoffGames: per-round and total games by team, plus the league average', () => {
  const pg = R.playoffGames(SCHED, S0), tot = Object.values(pg.byTeam).map(x => x.total);
  assert.strictEqual(Object.keys(pg.byTeam).length, Object.keys(SCHED.games).length);
  assert.strictEqual(pg.byTeam[Object.keys(pg.byTeam)[0]].per.length, 3);
  assert.ok(near(pg.avg, tot.reduce((a, b) => a + b, 0) / tot.length));
  const late = R.playoffGames(SCHED, Object.assign({}, S0, { poStart: 24 }));
  assert.ok(Object.values(late.byTeam).every(x => x.per.length === 1), 'rounds past the season are dropped');
});

test('seasonSource rows use the schedule team codes, so every row has Playoff games', () => {
  const s = R.seasonSource(ESPN, PLAYERS), pg = R.playoffGames(SCHED, S0), t = R.table(s, { teams: 14, roster: 12, type: 'classic', basis: 'pergame' });
  const bad = s.filter(r => r.g > 0 && !pg.byTeam[r.t]);
  assert.deepStrictEqual(bad.map(r => r.t), [], 'team codes not in the schedule');
  assert.ok(R.withPlayoffs(t, s, pg, 'off').filter(x => x.z != null).every(x => x.po > 0));
});

test('withPlayoffs: Off keeps z, adds games; boost scales z and categories and re-ranks', () => {
  const tab = R.table(rows, { teams: 14, roster: 12, type: 'classic', basis: 'pergame' }), pg = R.playoffGames(SCHED, S0);
  const off = R.withPlayoffs(tab, rows, pg, 'off');
  assert.deepStrictEqual(off.map(x => x.z), tab.map(x => x.z));
  assert.ok(off.every((x, i) => x.mult === 1 && (tab[i].z == null || x.po > 0)));
  const on = R.withPlayoffs(tab, rows, pg, 'vstrong'), byPid = new Map(rows.map(r => [r.pid, r]));
  for (const x of on.filter(y => y.z != null)) {
    const o = tab.find(t => t.pid === x.pid), edge = pg.byTeam[byPid.get(x.pid).t].total / pg.avg - 1;
    assert.ok(near(x.mult, Math.max(0.5, Math.min(1.5, 1 + edge))));
    assert.ok(near(x.z, o.z * x.mult) && near(x.cats[3], o.cats[3] * x.mult));
  }
  assert.ok(on.every((x, i) => i === 0 || x.z == null || on[i - 1].z != null && on[i - 1].z >= x.z), 'sorted best first, no-games last');
});

// Win C / Win M: calculated by Engine.evaluate exactly like the Draft tab (season-long, gain over replacement), plus an
// "Average player" view (gain minus the gain of an average Zscore-pool player in the same run)
const Eng = require('../engine.js'), Shared = require('../shared.js');
const tabAvg = R.table(rows, { teams: 14, roster: 12, type: 'classic', basis: 'total' });
const wOpts = { teams: 14, roster: 12, cats: 9, ilSpots: 3, basis: 'total' };
const byPid = new Map(rows.map(r => [r.pid, r]));
const boardGains = () => {   // the Draft tab at pick 1, slot 1 with the default settings
  const P = Eng.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, 'avg')))), cfg = R.cfgFor({ basis: 'total' });
  const ctx = Eng.buildContext(P, cfg); Eng.evaluate(P, ctx, cfg, { picks: new Array(14 * 12).fill(null) });
  return P.map(p => ({ c: p.gain * 100, m: p.gainM * 100 }));
};

test('winStart (no league): Replacement equals the Draft tab at pick 1', () => {
  const w = R.winStart(rows, tabAvg, wOpts), b = boardGains();
  for (const [pid, v] of w.rep) { assert.ok(near(v.c, b[pid].c, 1e-6) && near(v.m, b[pid].m, 1e-6), 'pid ' + pid); }
  assert.strictEqual(w.rep.size, rows.filter(r => r.g > 0).length);
  assert.strictEqual(w.pending.length, 0);
});

test('winStart: Average player view shifts every row by one constant and ranks the same', () => {
  const w = R.winStart(rows, tabAvg, wOpts), ids = [...w.rep.keys()];
  const dC = ids.map(i => w.rep.get(i).c - w.avg.get(i).c), dM = ids.map(i => w.rep.get(i).m - w.avg.get(i).m);
  assert.ok(dC.every(v => near(v, dC[0], 1e-9)) && dM.every(v => near(v, dM[0], 1e-9)) && dC[0] > 0, 'constant positive shift ' + dC[0]);
});

test('winStart: the average-player entry does not move real gains', () => {
  const small = R.winStart(rows.slice(0, 150), R.table(rows.slice(0, 150), { teams: 14, roster: 12, type: 'classic', basis: 'total' }), wOpts);
  assert.ok(small.rep.size > 0);   // too few rows for the average entry: Average view falls back to Replacement
  const w = R.winStart(rows, tabAvg, wOpts), b = boardGains();
  assert.ok(near(w.rep.get(0).c, b[0].c, 1e-9));
});

test('winStart: Jokic beats the pool tail, 8 categories is finite, repeat calls and reversed rows agree', () => {
  const w = R.winStart(rows, tabAvg, wOpts), jokic = rows.find(r => /Jokic/.test(r.n)).pid, last = tabAvg.filter(t => t.z != null).slice(-1)[0].pid;
  assert.ok(w.rep.get(jokic).m > 0 && w.rep.get(jokic).m > w.rep.get(last).m && w.rep.get(last).m < 0);
  const w8 = R.winStart(rows, tabAvg, Object.assign({}, wOpts, { cats: 8 }));
  assert.ok([...w8.rep.values()].every(v => isFinite(v.c) && isFinite(v.m)));
  const again = R.winStart(rows, tabAvg, wOpts); assert.ok(near(again.rep.get(jokic).c, w.rep.get(jokic).c, 1e-12));
  const rev = rows.slice().reverse(), wr = R.winStart(rev, R.table(rev, { teams: 14, roster: 12, type: 'classic', basis: 'total' }), wOpts);
  assert.ok(near(wr.rep.get(jokic).m, w.rep.get(jokic).m, 1e-6));
});

test('winStart: better counting stats raise both numbers', () => {
  const pid = tabAvg.filter(t => t.z != null)[60].pid, up = rows.map(r => r.pid === pid ? Object.assign({}, r, { line: Object.assign({}, r.line, { pts: r.line.pts * 1.1, reb: r.line.reb * 1.1, ast: r.line.ast * 1.1 }) }) : r);
  const a = R.winStart(rows, tabAvg, wOpts).rep.get(pid), b = R.winStart(up, tabAvg, wOpts).rep.get(pid);
  assert.ok(b.c > a.c && b.m > a.m);
});

// league mode: team 0 is mine; lists are top-roster player ids (best first)
const lists = tabAvg.filter(t => t.z != null).map(t => t.pid);
const mkLeague = (mineN) => { const t = []; for (let k = 0; k < 14; k++) t.push(lists.slice(k * 12 + (k ? 0 : 0), k * 12 + 12)); t[0] = t[0].slice(0, mineN); return t; };
test('winStart (league): a free agent replaces my weakest; my players come from their own runs', () => {
  const teams = mkLeague(12), w = R.winStart(rows, tabAvg, Object.assign({}, wOpts, { teams: 14, lists: teams }));
  assert.strictEqual(w.pending.length, 11, 'one run for each of my players except the weakest');
  const fa = lists[200]; assert.ok(w.rep.get(fa) && isFinite(w.rep.get(fa).m));
  assert.ok(![...w.rep.values()].every(v => v.m === 0), 'an open slot exists, so gains are not all zero');
  const weakest = teams[0][11], before = w.rep.get(weakest); assert.ok(before && isFinite(before.m), 'the weakest comes from the main run');
  while (w.pending.length) w.step();
  assert.ok(teams[0].every(pid => w.rep.has(pid) && w.avg.has(pid) && isFinite(w.rep.get(pid).c)));
  assert.ok(w.rep.get(teams[0][0]).m > w.rep.get(teams[0][11]).m, 'my best starter is worth more than my weakest');
});
test('winStart (league): a short roster needs no extra runs for its open slot', () => {
  const w = R.winStart(rows, tabAvg, Object.assign({}, wOpts, { lists: mkLeague(6) }));
  assert.strictEqual(w.pending.length, 6); while (w.pending.length) w.step();
  assert.ok([...w.rep.values()].every(v => isFinite(v.m)));
});

// Windows: the last N calendar days of box-score games, ending on the newest game date
const BOX = { cols: ['min', 'fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'], names: { 1: 'LeBron James', 2: 'Stephen Curry' },
  games: { a: { d: '2026-10-10', teams: { LAL: [['1', 30, 10, 20, 2, 4, 1, 25, 5, 5, 1, 0, 2]] } },
    b: { d: '2026-10-20', teams: { LAL: [['1', 30, 5, 10, 4, 4, 1, 15, 7, 3, 0, 0, 4]], GS: [['2', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]] } } } };
test('windowSource: window ends on the newest game, sums makes and attempts, skips zero-minute lines', () => {
  const w7 = R.windowSource([BOX, null], 7, PLAYERS), w14 = R.windowSource([BOX], 14, PLAYERS);
  assert.strictEqual(w7.to, '2026-10-20'); assert.strictEqual(w7.from, '2026-10-14');
  assert.deepStrictEqual(w7.rows.map(r => [r.n, r.gp]), [['LeBron James', 1]]);
  assert.strictEqual(w14.rows.length, 1); assert.strictEqual(w14.rows[0].gp, 2);
  assert.ok(near(w14.rows[0].line.fgp, 15 / 30) && near(w14.rows[0].line.pts, 20) && near(w14.rows[0].line.fga, 15));
  assert.strictEqual(w14.rows[0].g, 80);
  assert.deepStrictEqual(R.windowSource([], 7, PLAYERS), { rows: [], from: null, to: null });
});

test('every source row carries minutes per game as m (display only)', () => {
  const Sh = require('../shared.js');
  rows.slice(0, 50).forEach(r => assert.strictEqual(r.m, Sh.projOf(PLAYERS[r.pid], 'avg').m));
  assert.ok(rows.some(r => r.m > 20));
  const hs = R.projSource(PLAYERS, 'hs').find(r => PLAYERS[r.pid].hs);
  assert.strictEqual(hs.m, PLAYERS[hs.pid].hs.m);
  const s = R.seasonSource(ESPN, PLAYERS), byEspn = new Map(ESPN.players.map(p => [p.id, p]));
  s.slice(0, 50).forEach(r => assert.strictEqual(r.m, byEspn.get(r.espnId).min));
  const w14 = R.windowSource([BOX], 14, PLAYERS);
  assert.strictEqual(w14.rows[0].m, 30);
});

test('winStart (league): Average player is the average player on my roster', () => {
  const t = mkLeague(12), mine = t[0].slice(0, 11), rs = mine.map(p => byPid.get(p));
  const mean = f => rs.reduce((a, r) => a + f(r), 0) / rs.length, line = {};
  Object.keys(rs[0].line).forEach(k => { line[k] = mean(r => r.line[k]); });
  const fakePid = Math.max(...rows.map(r => r.pid)) + 1, fake = { pid: fakePid, n: 'Roster Average', t: 'XXX', pos: '', g: mean(r => r.g), line, adp: null, ftx: null };
  const rows2 = rows.concat([fake]), tab2 = R.table(rows2, { teams: 14, roster: 12, type: 'classic', basis: 'total' });
  const w = R.winStart(rows2, tab2, Object.assign({}, wOpts, { lists: t })), v = w.avg.get(fakePid), top = w.avg.get(lists[100]);
  assert.ok(Math.abs(v.m) < 0.35 * Math.max(0.01, Math.abs(w.rep.get(fakePid).m - w.avg.get(fakePid).m)) + 0.02, 'a roster-average player has ~0 vs the roster average: ' + v.m + ' ' + w.rep.get(fakePid).m);
  assert.ok(isFinite(top.m));
});
