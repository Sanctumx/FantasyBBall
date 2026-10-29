// ADP spread backtest: does the board do better assuming the fitted spread (v2) or the old line (v1)?
// Opponents draft with a "true" spread (v2 = our best estimate from 50 real drafts, v1 = the old line, as a robustness check).
// Your team takes the Model pick. Scored with realistic league play (stream_sim). Pairs share slot, seed and noise draws.
// Run: node bt_sd.js 2024-25   (and 2025-26 in parallel)
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], seeds = +(process.argv[3] || 8), out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model' };
const cells = [['board v1 | true v2', 'v1', 'v2'], ['board v2 | true v2', 'v2', 'v2'], ['board v1 | true v1', 'v1', 'v1'], ['board v2 | true v1', 'v2', 'v1']];
for (const [name, board, truth] of cells) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= seeds; seed++) {
    const ro = draft(season, slot, seed, Object.assign({ sdModel: board }, base), { trueSd: truth });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed }).rates[slot - 1] });
  }
  out.push({ name, board, truth, rows });
  require('fs').writeFileSync(require('./results_path').resultPath('bt_sd_' + season + '.json'), JSON.stringify(out));
  console.log(name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
