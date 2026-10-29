const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], out = [];
const cfgs = [['base (Mix)', { puntMode: 'auto', basis: 'mix' }], ['A: IL fill', { puntMode: 'auto', basis: 'total', ilSpots: 2 }],
  ['B: streamer baseline', { puntMode: 'auto', basis: 'mix', streamBase: 4 }], ['C: both', { puntMode: 'auto', basis: 'total', ilSpots: 2, streamBase: 4 }]];
for (const [name, c] of cfgs) { const rows = [];
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) { const ro = draft(season, slot, seed, c); const s = scoreLeague(season, ro, { seed }).rates; rows.push({ season, slot, seed, me: s[slot - 1] }); }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_stream_' + season + '.json'), JSON.stringify(out)); console.log(name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4)); }
