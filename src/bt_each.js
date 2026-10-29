// Cheap check (2026-10-17): does H2H each-category regular season change titles for the current board (slide)?
// Same drafts as bt_cur arm 4 (seeds 145-160), each scored 4 ways: regular season by matchups (most) or by share of
// categories won (each), with playoff rounds 1-2-2 (weeks 18 / 19-20 / 21-22) or 2-2-2 (16-17 / 18-19 / 20-21).
// Also records the board team's weakest category z (punt depth) to see whether punting builds lose more under 'each'.
// Run: node bt_each.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'medium', slideEngine: true };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const MODES = { most222: { rsMode: 'most', rsWeeks: 15, rounds: [[15, 16], [17, 18], [19, 20]] }, each222: { rsMode: 'each', rsWeeks: 15, rounds: [[15, 16], [17, 18], [19, 20]] } };
const rows = [], t0 = Date.now();
for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
  const ro = draft(season, slot, seed, base, OPP);
  const sc = scoreLeague(season, ro, { seed, target: true }), m = slot - 1, row = { season, slot, seed };
  for (const [k, o] of Object.entries(MODES)) { const t = titleScore(sc.weekTot, o); row[k] = { made: t.made[m], title: t.title[m], rank: t.rsRate.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).findIndex(z => z[1] === m) + 1 }; }
  // punt depth: my team's season category totals vs the league, in sd units; weakest category
  const tot = sc.weekTot.map(t => { const a = new Array(11).fill(0); t.forEach(w => w && w.forEach((x, c) => { a[c] += x; })); return [a[1] ? a[0] / a[1] : 0, a[3] ? a[2] / a[3] : 0, a[4], a[5], a[6], a[7], a[8], a[9], -a[10]]; });
  const z = [...Array(9).keys()].map(c => { const v = tot.map(t => t[c]), mu = v.reduce((x, y) => x + y, 0) / v.length, sd = Math.sqrt(v.reduce((x, y) => x + (y - mu) ** 2, 0) / v.length) || 1; return (tot[m][c] - mu) / sd; });
  row.minZ = Math.min(...z); rows.push(row);
  require('fs').writeFileSync(require('./results_path').resultPath('bt_each_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(rows));
}
console.log(season, 'done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
