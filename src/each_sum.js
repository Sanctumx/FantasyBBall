// Summarize bt_each_*.json: titles / playoffs made per 100 seasons under each scoring, paired differences each − most.
const fs = require('fs');
const rows = require('./results_path').listResults(/^bt_each_.*\.json$/).flatMap(f => JSON.parse(fs.readFileSync(f)));
const se = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return [m, Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length)]; };
const f1 = ([m, s]) => (100 * m).toFixed(1) + ' ± ' + (100 * s).toFixed(1);
console.log('drafts', rows.length);
for (const fmt of ['222']) {
  const M = 'most' + fmt, E = 'each' + fmt;
  console.log(`\n${fmt}: titles most ${f1(se(rows.map(r => r[M].title)))} | each ${f1(se(rows.map(r => r[E].title)))} | diff ${f1(se(rows.map(r => r[E].title - r[M].title)))}`);
  console.log(`     made   most ${f1(se(rows.map(r => r[M].made)))} | each ${f1(se(rows.map(r => r[E].made)))} | diff ${f1(se(rows.map(r => r[E].made - r[M].made)))}`);
  console.log('     seed   most ' + se(rows.map(r => r[M].rank))[0].toFixed(2) + ' | each ' + se(rows.map(r => r[E].rank))[0].toFixed(2));
  for (const s of [...new Set(rows.map(r => r.season))].sort()) { const R = rows.filter(r => r.season === s); console.log('     ' + s + ' titles diff ' + f1(se(R.map(r => r[E].title - r[M].title))) + ', made diff ' + f1(se(R.map(r => r[E].made - r[M].made)))); }
  // punt depth split: weakest category ≤ −1.5 sd vs the rest
  for (const [lab, R] of [['weakest ≤ −1.5 sd', rows.filter(r => r.minZ <= -1.5)], ['weakest > −1.5 sd', rows.filter(r => r.minZ > -1.5)]]) if (R.length > 1)
    console.log(`     ${lab} (${R.length}): made diff ${f1(se(R.map(r => r[E].made - r[M].made)))}, titles diff ${f1(se(R.map(r => r[E].title - r[M].title)))}`);
}
