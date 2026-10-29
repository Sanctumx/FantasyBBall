// Auto pair-menu size at the settled τ 0.01 / β 1.5 (2026-10-17): no punt + singles + top 8 / 14 / 20 synergy pairs.
// Model pick, fitted ADP spread, realistic scoring with targeted streaming. Run: node bt_pairs.js <season> <firstSeed> <lastSeed>
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['top 8', { puntSet: 'syn8t0' }], ['top 14', { puntSet: 'syn14t0' }], ['top 20', { puntSet: 'syn20t0' }]];   // 2026-10-17 rerun: the first run's 'syn14'/'syn20' also blended all 84 triples (parser bug)
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_pairs_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
