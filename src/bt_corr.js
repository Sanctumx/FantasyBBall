const { draft, score } = require('./backtest.js');
const season = process.argv[2], out = [];
for (const [name, c] of [['corr off', { puntMode: 'auto', corr: 'off' }], ['corr on', { puntMode: 'auto', corr: 'on' }]]) { const rows = [];
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) { const s = score(season, draft(season, slot, seed, c)); rows.push({ season, slot, seed, me: s[slot - 1] }); }
  out.push({ name, rows }); require('fs').writeFileSync('bt_corr_' + season + '.json', JSON.stringify(out)); console.log(name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4)); }
