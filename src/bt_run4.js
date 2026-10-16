const { draft, score } = require('./backtest.js');
const season = process.argv[2], out = [];
const cfgs = [['syn8t2', 1.5, 0.005], ['syn8t3', 1.5, 0.005], ['syn0t3', 1.5, 0.005]];
for (const [set, b, t] of cfgs) { const rows = [];
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) { const s = score(season, draft(season, slot, seed, { puntMode: 'auto', puntSet: set, puntBeta: b, puntTau: t })); rows.push({ season, slot, seed, me: s[slot - 1] }); }
  out.push({ name: `${set} b${b} t${t}`, rows }); require('fs').writeFileSync('bt_res7_' + season + '.json', JSON.stringify(out)); console.log(set, b, t, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4)); }
