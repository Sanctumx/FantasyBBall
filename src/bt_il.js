// IL fill share (2026-10-17): the board counts 0.35 × IL spots of missed games at waiver level (0.70 at 2 spots).
// il_cover.py measured what 2 spots can really cover when absences overlap: 0.75-0.82 of missed games if every
// absence could use a spot, 0.65-0.67 for absences of 3+ games, 0.51-0.57 for 7+. Arms set the share with cfg.ilShare.
// τ 0.01 Auto, Model pick, fitted ADP spread, realistic scoring with targeted streaming. Run: node bt_il.js <season> <s0> <s1>
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['0.70 (current)', {}], ['0.60', { ilShare: 0.6 }], ['0.53', { ilShare: 0.525 }], ['0.40', { ilShare: 0.4 }], ['0.25', { ilShare: 0.25 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    rows.push({ season, slot, seed, me: scoreLeague(season, ro, { seed, target: true }).rates[slot - 1], roster: ro[slot - 1].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_il_' + season + '_' + s0 + '-' + s1 + '.json'), JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
