// Realistic opponents (2026-10-17): 13 opponents = 2 drafting with this kit (Auto), 2 punting, 4 sharp (value rank /
// ADP blend), 5 ADP. BBM-style games. Title scoring + weekly matchup rate. Run: node bt_league.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'medium' };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const arms = [['Season, boost medium (board)', {}], ['Mix', { missW: 0.5, basis: 'mix' }], ['Boost off', { poBoost: 'off' }], ['Boost strong', { poBoost: 'strong' }], ['Boost very strong', { poBoost: 'vstrong' }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), OPP);
    const sc = scoreLeague(season, ro, { seed, target: true }), t = titleScore(sc.weekTot), m = slot - 1;
    rows.push({ season, slot, seed, me: sc.rates[m], rs: t.rsRate[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync('bt_league_' + season + '_' + s0 + '-' + s1 + '.json', JSON.stringify(out));
  const avg = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log(season, name.padEnd(28), 'matchup', avg('me').toFixed(3), 'made PO', avg('made').toFixed(2), 'PO all-play', avg('poAll').toFixed(3), 'title', avg('title').toFixed(3), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
