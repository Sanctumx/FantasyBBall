// Players returning from injury (2026-10-17). Projected games are BBM-style (games_fit.json); players out at the start of
// the season (known_inj.json: missed 5+ opening games, i.e. hurt before the draft) are projected for (82 − kg) games at
// their usual availability and carry kg, like BBM's injury notes. cfg.knownW credits back that share of the known
// missed games. Realistic league, Season, title scoring. Run: node bt_known.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json'), KI = require('./known_inj.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const f = FIT[season], K = KI[season];
DATA[season].players.forEach(p => { const gf = Math.min(82, Math.max(1, f.a + f.b * p.g)); const kg = K[p.pid] || 0; p.kg = kg; p.g = kg ? Math.max(1, (82 - kg) * gf / 82) : gf; });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'medium' };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const arms = [['known 0 (Season)', {}], ['known 0.5', { knownW: 0.5 }], ['known 1', { knownW: 1 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), OPP);
    const sc = scoreLeague(season, ro, { seed, target: true }), t = titleScore(sc.weekTot), m = slot - 1;
    rows.push({ season, slot, seed, me: sc.rates[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(','), nKnown: ro[m].filter(pid => K[pid]).length });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_known_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  const avg = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log(season, name.padEnd(17), 'matchup', avg('me').toFixed(3), 'made PO', avg('made').toFixed(2), 'title', avg('title').toFixed(3), 'known-injury picks', avg('nKnown').toFixed(2), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
