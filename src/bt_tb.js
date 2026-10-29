// Punt Auto τ/β refinement (2026-10-17) around the current τ .01, β 1.5: τ .015 and β 1 (β 3 and τ .02 already lost in bt_tau.js).
// Model pick, fitted ADP spread, realistic scoring with targeted streaming. Run: node bt_tb.js <season> <firstSeed> <lastSeed>
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['current', {}], ['τ .015 β 1.5', { puntTau: 0.015 }], ['τ .01 β 1', { puntBeta: 1 }], ['τ .015 β 1', { puntTau: 0.015, puntBeta: 1 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_tb_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
