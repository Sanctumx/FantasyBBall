// Punt ladder (2026-10-16): Auto + TO pairs; + best 2 synergy pairs; + 3 TO triples (TO + top 3 synergy pairs).
// Compared with current Auto (singles + top 8 synergy pairs). Model pick, realistic scoring, targeted streaming.
// Run: node bt_punt3.js <season> [seeds]
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], seeds = +(process.argv[3] || 8), out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['Auto (current)', {}], ['1: Auto + TO pairs', { puntSet: 'syn0t0+to' }], ['2: + best 2 pairs', { puntSet: 'syn2t0+to' }], ['3: + 3 TO triples', { puntSet: 'syn2t0+to+tt3' }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= seeds; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync('bt_punt3_' + season + '.json', JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
