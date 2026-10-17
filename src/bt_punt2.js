// Punt strategy retest with correlated categories on (2026-10-16). Your team takes the Model pick; opponents draft by
// ADP with the fitted spread; scored with realistic play and targeted streaming. Scarcity off, no streamability.
// Run: node bt_punt2.js 2024-25 [seeds]   (and 2025-26 in parallel)
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], seeds = +(process.argv[3] || 8), out = [];
const base = { basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['Punt Off', { puntMode: 'off' }], ['Auto (current)', { puntMode: 'auto' }], ['Auto + TO pairs', { puntMode: 'auto', puntSet: 'syn8t0+to' }],
  ['Auto + 3 triples', { puntMode: 'auto', puntSet: 'syn8t3' }], ['Auto all 130', { puntMode: 'auto', puntAutoAll: true }],
  ['Lock TO', { puntMode: 'auto', puntLock: 'p8' }], ['Lock AST+TO', { puntMode: 'auto', puntLock: 'p5_8' }], ['Lock FT%+TO', { puntMode: 'auto', puntLock: 'p1_8' }],
  ['Lock FT%+AST+TO', { puntMode: 'auto', puntLock: 'p1_5_8' }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= seeds; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, cfg: c, rows });
  require('fs').writeFileSync('bt_punt2_' + season + '.json', JSON.stringify(out));
  console.log(name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
