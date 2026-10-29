const { draft, score } = require('./backtest.js');
const E = require('./engine.js');
const which = process.argv[2];
const configs = [];
if (which === 'A') { configs.push({ name: 'off', c: { puntMode: 'off' } });
  for (const b of [0.35, 1, 2]) for (const t of [0.005, 0.02]) configs.push({ name: `auto b${b} t${t}`, c: { puntMode: 'auto', puntBeta: b, puntTau: t } }); }
else { E.strategiesFor({ cats: 9 }).forEach(S => configs.push({ name: 'lock ' + S.label, c: { puntMode: 'off', puntLock: S.id, puntBeta: 1 } })); }
const out = [];
for (const cf of configs) {
  const rows = [];
  for (const season of ['2024-25', '2025-26']) for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 6; seed++) {
    const ro = draft(season, slot, seed, cf.c); const s = score(season, ro); rows.push({ season, slot, seed, me: s[slot - 1] });
  }
  out.push({ name: cf.name, rows }); console.log(cf.name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4));
  require('fs').writeFileSync(require('./results_path').resultPath('bt_res_' + which + '.json'), JSON.stringify(out));
}
