// Missed-games dial (2026-10-17): share of projected missed games that counts, vs Mix (50%). τ 0.01 Auto, Model pick,
// fitted ADP spread, realistic scoring with targeted streaming, 2 IL spots. Run: node bt_miss.js <season> <firstSeed> <lastSeed> [w,w,...]
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const ws = (process.argv[5] || '0.1,0.2,0.3,0.4').split(',').map(Number), out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
for (const [name, c] of [['mix', {}]].concat(ws.map(w => [Math.round(w * 100) + '%', { missW: w }]))) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_miss_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  console.log(season, s0 + '-' + s1, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
