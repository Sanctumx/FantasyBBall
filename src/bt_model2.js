const { draft, score } = require('./backtest.js');
const season = process.argv[2], out = [];
for (const n of [4, 13]) for (const mode of ['off', 'auto']) { const rows = [];
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) { const s = score(season, draft(season, slot, seed, { puntMode: mode, oppBoard: n }, { model: n })); rows.push({ season, slot, seed, me: s[slot - 1] }); }
  out.push({ name: `model${n} ${mode} aware`, rows }); require('fs').writeFileSync('bt_model2_' + season + '.json', JSON.stringify(out)); console.log(n, mode, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4)); }
