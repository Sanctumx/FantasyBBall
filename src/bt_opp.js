const { draft, score } = require('./backtest.js');
const season = process.argv[2], out = [];
for (const n of [4, 8, 13]) for (const mode of ['off', 'auto']) { const rows = [];
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) {
    const s = score(season, draft(season, slot, seed, { puntMode: mode }, { n, gamma: 3 }));
    const others = s.filter((_, i) => i !== slot - 1);
    rows.push({ season, slot, seed, me: s[slot - 1], oppAvg: others.reduce((a, b) => a + b, 0) / others.length }); }
  out.push({ name: `opp${n} ${mode}`, rows }); require('fs').writeFileSync('bt_opp_' + season + '.json', JSON.stringify(out)); console.log(n, mode, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4)); }
