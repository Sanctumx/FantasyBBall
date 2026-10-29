// Title-objective backtest (2026-10-17): Mix vs Season vs Season + convex injury discount (cfg.riskK).
// BBM-style projected games (games_fit.json), standard setup, realistic scoring with targeted streaming; each draft
// scored for weekly matchup rate (all weeks), making the playoffs, playoff-weeks all-play, rounds won and title.
// Run: node bt_title.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['Mix', {}], ['Season', { missW: 1 }], ['Season + risk k2', { missW: 1, riskK: 2 }], ['Season + risk k4', { missW: 1, riskK: 4 }], ['Season + risk k8', { missW: 1, riskK: 8 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    const sc = scoreLeague(season, ro, { seed, target: true }), t = titleScore(sc.weekTot), m = slot - 1;
    rows.push({ season, slot, seed, me: sc.rates[m], rs: t.rsRate[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_title_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  const avg = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log(season, name.padEnd(17), 'matchup', avg('me').toFixed(3), 'made PO', avg('made').toFixed(2), 'PO all-play', avg('poAll').toFixed(3), 'title', avg('title').toFixed(3), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
