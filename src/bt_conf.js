// Confirmation of punt τ 0.01 on fresh draws (2026-10-16). Current (τ .005) vs τ .01, β 1.5.
// Scenarios: main = seeds 9-24, ADP opponents; punt4 = seeds 9-16, 4 opponents punting; kit4 = seeds 9-12, 4 opponents using the kit.
// Run: node bt_conf.js <season>
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const scen = [['main', 9, 24, { trueSd: 'v2' }], ['punt4', 9, 16, { trueSd: 'v2', n: 4 }], ['kit4', 9, 12, { trueSd: 'v2', model: 4 }]];
for (const [sc, s0, s1, opp] of scen) for (const [name, c] of [['current', {}], ['tau01', { puntTau: 0.01 }]]) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), opp);
    rows.push({ season, sc, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ sc, name, rows }); require('fs').writeFileSync('bt_conf_' + season + '.json', JSON.stringify(out));
  console.log(season, sc, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
