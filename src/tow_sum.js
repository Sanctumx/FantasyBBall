// TO ×0.5 inside soft −1 vs the slide in use (bt_cur arm 4), paired by season/slot/seed.
const fs = require('fs');
const base = {}; require('./results_path').listResults(/^bt_cur_.*_arm4\.json$/).forEach(f => JSON.parse(fs.readFileSync(f))[0].rows.forEach(r => { base[r.season + '|' + r.slot + '|' + r.seed] = r; }));
const rows = require('./results_path').listResults(/^bt_tow_.*\.json$/).flatMap(f => JSON.parse(fs.readFileSync(f))[0].rows).filter(r => base[r.season + '|' + r.slot + '|' + r.seed]);
const se = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return [m, Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length)]; };
const f1 = ([m, s], k = 100) => (m * k >= 0 ? '+' : '') + (k * m).toFixed(1) + ' ± ' + (k * s).toFixed(1);
const prize = r => r.title ? 60 : r.rounds === 2 ? 30 : r.rounds === 1 ? 5 : 0;
const d = (k, g = r => r[k]) => rows.map(r => g(r) - g(base[r.season + '|' + r.slot + '|' + r.seed]));
console.log('paired drafts', rows.length, '| same roster', rows.filter(r => r.roster === base[r.season + '|' + r.slot + '|' + r.seed].roster).length);
console.log('titles', f1(se(d('title'))), '| prize', f1(se(d(0, prize)), 1), '| made', f1(se(d('made'))), '| matchup', f1(se(d('me'))));
for (const s of [...new Set(rows.map(r => r.season))].sort()) { const R = rows.filter(r => r.season === s); console.log(' ', s, 'titles', f1(se(R.map(r => r.title - base[r.season + '|' + r.slot + '|' + r.seed].title))), 'matchup', f1(se(R.map(r => r.me - base[r.season + '|' + r.slot + '|' + r.seed].me)))); }
