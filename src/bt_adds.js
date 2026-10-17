// Streamability × category scarcity backtest. Board with Weekly adds 0 (off) or 4, category scarcity Off / Medium /
// Very strong. Your team takes the Model pick; opponents draft by ADP with the fitted spread. Every league is scored
// with realistic play and targeted streaming (each team streams for the categories it is losing or close in).
// Run: node bt_adds.js 2024-25 [seeds]   (and 2025-26 in parallel)
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], seeds = +(process.argv[3] || 8), out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2' };
const arms = [];
for (const adds of [0, 4]) for (const scarZ of ['off', 'medium', 'vstrong']) arms.push(['adds ' + adds + ' | scarcity ' + scarZ, { weeklyAdds: adds, scarZ }]);
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= seeds; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, cfg: c, rows });
  require('fs').writeFileSync('bt_adds_' + season + '.json', JSON.stringify(out));
  console.log(name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
