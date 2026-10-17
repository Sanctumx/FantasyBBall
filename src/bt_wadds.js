// Weekly adds × missed-games weighting (2026-10-17): does the best share of missed games to count shift with adds?
// Each draft is scored by stream_sim (targeted streaming) at 0 adds (no streaming, no IL fill-ins), 4 adds (Mon-Thu/Fri-Sun)
// and unlimited (both spots streamed daily). τ 0.01 Auto, Model pick, fitted ADP spread.
// Run: node bt_wadds.js <season> <firstSeed> <lastSeed>
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['mix', {}], ['0%', { missW: 0 }], ['25%', { missW: 0.25 }], ['75%', { missW: 0.75 }], ['100%', { missW: 1 }],
  ['mix IL0', { ilSpots: 0 }], ['100% IL0', { missW: 1, ilSpots: 0 }]];
const ADDS = [0, 4, 14];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' }), row = { season, slot, seed, roster: ro[slot - 1].join(',') };
    for (const a of ADDS) row['a' + a] = scoreLeague(season, ro, { seed, target: true, adds: a }).rates[slot - 1];
    rows.push(row);
  }
  out.push({ name, rows }); require('fs').writeFileSync('bt_wadds_' + season + '_' + s0 + '-' + s1 + '.json', JSON.stringify(out));
  console.log(season, name, ADDS.map(a => (100 * rows.reduce((s, r) => s + r['a' + a], 0) / rows.length).toFixed(2)).join(' '), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
