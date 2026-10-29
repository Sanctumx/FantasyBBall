// Two-pick joint look-ahead (2026-10-17, backtest.js cfg.look2): Model pick vs re-valuing the next pick for each of the 4 best candidates.
// per-36 value above per-game value, minutes, young; upside_bt.json, fitted without the test season). Realistic league
// (2 kit, 2 punt, 4 sharp, 5 ADP opponents), BBM-style games, Season, title scoring. Baseline = same pick rule at λ ≈ 0.
// Run: node bt_upside.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json'), UP = require('./upside_bt.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft, setUpside } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
setUpside(UP[season]);
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'medium' };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const arms = [['Model pick', {}], ['Two-pick look-ahead (K 4)', { look2: 4 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), OPP);
    const sc = scoreLeague(season, ro, { seed, target: true }), t = titleScore(sc.weekTot), m = slot - 1;
    rows.push({ season, slot, seed, me: sc.rates[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_look2_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  const avg = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log(season, name.padEnd(8), 'matchup', avg('me').toFixed(3), 'made PO', avg('made').toFixed(2), 'title', avg('title').toFixed(3), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
