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
