// Confirmation: Auto menu C (stand-outs ≥ 0.4 + all TO pairs) vs current Auto menu, both with τ 0.01 (2026-10-16).
// Fresh seeds. Run: node bt_c.js <season> <firstSeed> <lastSeed>   → bt_c_<season>_<first>-<last>.json
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
for (const [name, c] of [['current', {}], ['C', { puntSet: 'thr40+to' }]]) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync('bt_c_' + season + '_' + s0 + '-' + s1 + '.json', JSON.stringify(out));
  console.log(season, s0 + '-' + s1, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
