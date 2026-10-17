// Summarize bt_real_*.json: each arm vs the current board (arm 0), paired by season/slot/seed; titles, prize, made, matchup.
const fs = require('fs');
const all = fs.readdirSync('.').filter(f => /^bt_real_.*\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(f)));
const by = {}; const names = {};
all.forEach(({ name, rows }) => rows.forEach(r => { names[r.arm] = name; (by[r.arm] = by[r.arm] || {})[r.season + '|' + r.slot + '|' + r.seed] = r; }));
const se = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return [m, a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length) : 0]; };
const f1 = ([m, s], k = 100) => (k * m >= 0 ? '+' : '') + (k * m).toFixed(1) + ' ± ' + (k * s).toFixed(1);
const prize = r => r.title ? 60 : r.rounds === 2 ? 30 : r.rounds === 1 ? 5 : 0;
const base = by[0] || {};
for (const season of ['2024-25', '2025-26']) {
  const B = Object.values(base).filter(r => r.season === season);
  if (!B.length) continue;
  const lv = k => (100 * B.reduce((a, r) => a + r[k], 0) / B.length).toFixed(1);
  console.log(`\n${season}: current board, ${B.length} drafts: titles ${lv('title')}%, playoffs ${lv('made')}%, matchup ${lv('me')}%  (average team: titles 7.1%, playoffs 57%)`);
  for (const a of Object.keys(by).filter(a => a !== '0').sort()) {
    const R = Object.values(by[a]).filter(r => r.season === season && base[r.season + '|' + r.slot + '|' + r.seed]);
    if (!R.length) continue;
    const d = g => se(R.map(r => g(r) - g(base[r.season + '|' + r.slot + '|' + r.seed])));
    console.log(`  ${names[a].padEnd(30)} n ${R.length}  titles ${f1(d(r => r.title))}  prize ${f1(d(prize), 1)}  made ${f1(d(r => r.made))}  matchup ${f1(d(r => r.me))}`);
  }
}
