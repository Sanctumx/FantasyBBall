// Team-specific value of a free slot (gate E of src/trade_2x1_gate.txt, exploration only). Takes the weekly per-category difference of S4 - STATIC_P
// measured by slot_profile.js (results/slotprof_part_*.json), turns it into a pseudo-player and adds it to each of the 14 fixture teams at periods 1
// and 9: s_t = Win M(team + pseudo-player) - Win M(team), plain rest-of-season, 9 cats, shipped shrink. One pseudo-player per category gives the breakdown.
// Run: node slot_team_spread.js     writes results/slotspread_<date>.json
const fs = require('fs');
const I = require('./inseason_league.js'), Pl = require('./inseason_players.js'), M = require('./matchup_core.js'), T = require('./trade_core.js');
const PLAYERS = require('./players.json'), fx = n => require('./tests/fixtures/' + n), DAYS = require('./sched_days.json');
const { listResults, resultPath } = require('./results_path');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const GPW = 3.5;   // games a regular player plays in an average week: the pseudo-player's weekly line is spread over this many games
const BLOCK = { 1: [1, 8], 9: [9, 15] };   // period -> week range of the measured block (E, M)
const CATS = { 'fg%': [0, 1], 'ft%': [2, 3], tpm: [4], pts: [5], reb: [6], ast: [7], stl: [8], blk: [9], to: [10] };
const parts = listResults(/^slotprof_part_.*\.json$/).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const drafts = parts.flatMap(p => p.drafts);
const delta = (lo, hi) => { const d = new Array(11).fill(0); for (const dr of drafts) for (let w = lo; w <= hi; w++) dr.cat[w].forEach((x, c) => { d[c] += x / (drafts.length * (hi - lo + 1)); }); return d; };
// weekly totals -> per-game line (fgp/fga, ftp/fta and the counting stats); a negative fga or fta only means fewer attempts than STATIC_P
const lineOf = (d, cols) => { const x = d.map((v, c) => (cols.includes(c) ? v : 0)).map(v => v / GPW);
  return { fgp: x[1] ? x[0] / x[1] : 0, fga: x[1], ftp: x[3] ? x[2] / x[3] : 0, fta: x[3], tpm: x[4], pts: x[5], reb: x[6], ast: x[7], stl: x[8], blk: x[9], to: x[10] }; };
// The pseudo-player is the team's worst active player with the weekly difference added to his line: same games, same roster size, so the
// plays model and the roster cap behave as before and only the stats change (a separate extra player was crowded out or forced a drop).
const addLine = (l, x) => { const fga = l.fga + x.fga, fta = l.fta + x.fta;
  return { fgp: fga ? (l.fgp * l.fga + x.fgp * x.fga) / fga : l.fgp, fga, ftp: fta ? (l.ftp * l.fta + x.ftp * x.fta) / fta : l.ftp, fta,
    tpm: l.tpm + x.tpm, pts: l.pts + x.pts, reb: l.reb + x.reb, ast: l.ast + x.ast, stl: l.stl + x.stl, blk: l.blk + x.blk, to: l.to + x.to }; };
let uid = 0;

const out = { made: new Date().toISOString().slice(0, 10), GPW, drafts: drafts.length, periods: {} };
for (const per of Object.keys(BLOCK)) {
  const [lo, hi] = BLOCK[per], d = delta(lo, hi), start = L.periods[per].start;
  const ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me: L.teams[0].id, nowMs: start + 12 * 3600e3 });
  const ids = Object.keys(ctx.roster), rows = [];
  const worst = {}, val = f => { const p = ctx.pool.byKey.get(f); return Pl.valueZ(p.line, p.g, ctx.ref); };
  const add = (t, line) => {
    const w = worst[t] = worst[t] || ctx.roster[t].filter(f => ctx.pool.byKey.get(f).slot !== 'IR').sort((a, b) => val(a) - val(b))[0];
    const key = 'slot_pseudo' + (uid++), p = ctx.pool.byKey.get(w);
    ctx.pool.byKey.set(key, Object.assign({}, p, { key, line: addLine(p.line, line) }));
    const R = Object.assign({}, ctx.roster, { [t]: ctx.roster[t].map(f => (f === w ? key : f)) });
    const base = T.rosWinM(ctx, ctx.roster, t).mean, v = T.rosWinM(ctx, R, t).mean;
    ctx.pool.byKey.delete(key); return base == null || v == null ? null : 100 * (v - base);
  };
  for (const t of ids) {
    const row = { team: t, s: add(t, lineOf(d, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), byCat: {} };
    for (const k in CATS) row.byCat[k] = add(t, lineOf(d, CATS[k]));
    rows.push(row);
  }
  const s = rows.map(r => r.s).filter(x => x != null).sort((a, b) => a - b);
  out.periods[per] = { weeks: [lo, hi], deltaWeekly: d, rows, secondSpread: s.length > 3 ? s[s.length - 2] - s[1] : null, min: s[0], max: s[s.length - 1] };
}
const sBar = 0.70, need = Math.max(0.2, 0.5 * Math.abs(sBar));
out.sBar = sBar; out.needed = need;
out.meaningful = Object.values(out.periods).every(p => p.secondSpread != null && p.secondSpread >= need);
fs.writeFileSync(resultPath(`slotspread_${out.made}.json`), JSON.stringify(out));
for (const per in out.periods) { const p = out.periods[per]; console.log('period', per, 'weeks', p.weeks.join('-'), 'second-highest minus second-lowest', p.secondSpread && p.secondSpread.toFixed(3), 'min', p.min.toFixed(3), 'max', p.max.toFixed(3)); }
console.log('needed >=', need.toFixed(2), '-> meaningful:', out.meaningful);
