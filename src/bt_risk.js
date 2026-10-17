// Injury risk with BBM-style games projections (2026-10-17). BBM's projected games are already shrunk toward the
// average (slope 0.22 on last season's games, games_calib.py), while the backtest projected games from last season's
// raw count (actual next-season games follow it with slope only 0.35). Here each backtest player's projected games are
// replaced by an expected-games estimate fitted on the other seasons (actual = a + b × prior), like BBM's, and the
// missed-games weighting is retested. Standard setup otherwise. Run: node bt_risk.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['Mix (50%)', {}], ['75%', { missW: 0.75 }], ['Season (100%)', { missW: 1 }], ['Season, IL share 0.35', { missW: 1, ilShare: 0.35 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync('bt_risk_' + season + '_' + s0 + '-' + s1 + '.json', JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
