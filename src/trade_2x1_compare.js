// Approach 1 (plain rest-of-season) against approach 2 (week-weighted) for the 2-for-1 search (#169, plan Task 11, gate C).
// For each date (the start of period n plus 12 h): the top-10/25 overlap of the two rankings by sortKey, Kendall tau on the rows both rank, and
// whether the top row is the same. Usage: node src/trade_2x1_compare.js [--smoke] [--periods 1,5,9,13,15,16]. Writes src/results/trade_cmp_<date>.json
'use strict';
const fs = require('fs'), path = require('path');
const I = require('./inseason_league.js'), Pl = require('./inseason_players.js'), M = require('./matchup_core.js'), T = require('./trade_core.js'), PLAYERS = require('./players.json');
const fx = n => require('./tests/fixtures/' + n), DAYS = require('./sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, smoke = process.argv.includes('--smoke'), OPT = { basis: 'total' };
const pi = process.argv.indexOf('--periods'), periods = pi > 0 ? process.argv[pi + 1].split(',').map(Number) : [1, 5, 9, 13, 15, 16];
const key = r => r.gives.map(p => p.key).sort().join('+') + '>' + r.targets[0].key + '@' + r.team;
const rank = rows => { const m = new Map(); rows.slice().sort((x, y) => y.sortKey - x.sortKey).forEach((r, i) => m.set(key(r), i)); return m; };
const overlap = (a, b, n) => { const s = new Set(b.slice(0, n)); return a.slice(0, n).filter(x => s.has(x)).length; };
function tau(a, b) {   // Kendall tau-a over the keys both rank
  const ks = [...a.keys()].filter(k => b.has(k)); let c = 0, d = 0;
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const s = (a.get(ks[i]) - a.get(ks[j])) * (b.get(ks[i]) - b.get(ks[j])); if (s > 0) c++; else if (s < 0) d++; }
  return c + d ? (c - d) / (c + d) : null;
}
const out = { made: new Date().toISOString().slice(0, 10), smoke, dates: [] };
periods.forEach(n => {
  const per = L.periods.find(p => p.n === n); if (!per) return;
  const ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: per.start + 12 * 36e5 });
  const pairs = smoke ? T.givePairs(ctx, ctx.roster[me][0]).slice(0, 1) : T.givePairs(ctx, 'any'), run = approach => { const rows = []; pairs.forEach(p => T.candidates2x1ForPair(ctx, p, Object.assign({ approach }, OPT)).forEach(r => rows.push(r))); return rows; };
  const r1 = run(1), r2 = run(2), k1 = [...rank(r1).keys()], k2 = [...rank(r2).keys()];
  const row = { period: n, rows1: r1.length, rows2: r2.length, top10: overlap(k1, k2, 10), top25: overlap(k1, k2, 25), tau: tau(rank(r1), rank(r2)), sameTop1: k1[0] === k2[0] };
  out.dates.push(row); console.log(JSON.stringify(row));
});
const file = path.join(__dirname, 'results', 'trade_cmp_' + out.made + (smoke ? '_smoke' : '') + '.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('wrote', file);
