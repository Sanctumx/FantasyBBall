// Pooled summary over all seasons: arm vs arm, paired by season/slot/seed. node real_sum2.js
const fs = require('fs');
const by = {}, names = {};
fs.readdirSync('.').filter(f => /^bt_real_.*\.json$/.test(f)).forEach(f => { const { name, rows } = JSON.parse(fs.readFileSync(f)); rows.forEach(r => { names[r.arm] = name; (by[r.arm] = by[r.arm] || {})[r.season + '|' + r.slot + '|' + r.seed] = r; }); });
const se = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return [m, a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length) : 0]; };
const f1 = ([m, s], k = 100) => (k * m >= 0 ? '+' : '') + (k * m).toFixed(1) + ' ± ' + (k * s).toFixed(1);
const prize = r => r.title ? 60 : r.rounds === 2 ? 30 : r.rounds === 1 ? 5 : 0;
const level = a => { const R = Object.values(by[a] || {}); if (!R.length) return ''; const m = k => (100 * R.reduce((x, r) => x + r[k], 0) / R.length).toFixed(1); return `${names[a]}: ${R.length} drafts, titles ${m('title')}%, playoffs ${m('made')}%, matchup ${m('me')}%`; };
function cmp(a, b, label) {
  if (!by[a] || !by[b]) return;
  const keys = Object.keys(by[a]).filter(k => by[b][k]); if (!keys.length) return;
  const d = g => se(keys.map(k => g(by[a][k]) - g(by[b][k])));
  const seasons = [...new Set(keys.map(k => k.split('|')[0]))].sort();
  const per = seasons.map(s => { const K = keys.filter(k => k.startsWith(s)); return s.slice(2) + ' ' + f1(se(K.map(k => by[a][k].title - by[b][k].title))); }).join(' · ');
  console.log(`${label.padEnd(44)} n ${String(keys.length).padStart(3)}  titles ${f1(d(r => r.title))}  prize ${f1(d(prize), 1)}  made ${f1(d(r => r.made))}  matchup ${f1(d(r => r.me))}\n${''.padEnd(46)}titles by season: ${per}`);
}
console.log('Levels'); [0, 1, 3, 7, 8, 9, 10, 11].forEach(a => { const l = level(a); if (l) console.log('  ' + l); });
console.log('\nYour format, real projections, vs current board');
cmp(1, 0, 'No slide (Win M + look-ahead)'); cmp(3, 0, 'Punt Off'); cmp(7, 0, 'No slide + Punt Off'); cmp(7, 1, 'No slide + Punt Off vs no slide alone');
console.log('\nWhat breaks the slide: no slide vs current board, in each world');
cmp(9, 8, 'OLD FORMAT (snake, most, 2 IL), real proj'); cmp(11, 10, 'Your format, OLD PROJECTIONS'); cmp(1, 0, 'Your format, real projections');
console.log('\nSettings on the NEW board (Win M + look-ahead, Punt Off), vs the new board');
[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].forEach(a => cmp(a, 7, names[a] || ('arm ' + a)));
cmp(25, 23, 'Win C only vs blend (both logistic k=2)');
