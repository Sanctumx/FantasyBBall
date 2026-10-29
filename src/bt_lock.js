const { draft, score } = require('./backtest.js');
const season = process.argv[2], out = [];
for (const [name, c] of [['relock best of 130', { puntMode: 'auto', puntAutoAll: true, puntTau: 0.0002 }], ['relock best of Auto 18', { puntMode: 'auto', puntTau: 0.0002 }]]) { const rows = [];
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) { const s = score(season, draft(season, slot, seed, c)); rows.push({ season, slot, seed, me: s[slot - 1] }); }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_lock_' + season + '.json'), JSON.stringify(out)); console.log(name, 'done'); }
