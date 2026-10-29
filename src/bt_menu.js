// Punt Auto menus (2026-10-16). All menus = no punt + 9 single punts, plus: B stand-outs (pairs and triples with synergy
// ≥ 0.4), C = B + all TO pairs, D = C + TO triples on stand-out pairs (triple synergy ≥ 0.15), E = nothing (singles only).
// Current Auto (A) comes from bt_punt2/bt_punt3 results (deterministic, identical rosters).
// Model pick, fitted ADP spread, realistic scoring with targeted streaming. Run: node bt_menu.js <season> [seeds]
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], seeds = +(process.argv[3] || 8), out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['E: singles only', { puntSet: 'syn0t0' }], ['B: stand-outs', { puntSet: 'thr40' }], ['C: stand-outs + TO pairs', { puntSet: 'thr40+to' }], ['D: C + TO triples', { puntSet: 'thr40+to+tt' }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= seeds; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_menu_' + season + '.json'), JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
