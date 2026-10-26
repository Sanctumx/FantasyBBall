// Fits for points mode (#137): the within-player per-game correlation of the 11 point stats and the variance/mean ratio of
// fgm, fga, ftm, fta, from logs3.csv (2023-24 to 2025-26), player-seasons with 25+ games and 20+ minutes per game.
// `node src/points_fit.js` prints RHO and DISP for points_core.js, and the engine's 7 existing ratios to compare with.
const fs = require('fs'), path = require('path');
const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'fgm', 'fga', 'ftm', 'fta'];
const COL = { pts: 'pts', reb: 'reb', ast: 'ast', stl: 'stl', blk: 'blk', to: 'tov', tpm: 'fg3m', fgm: 'fgm', fga: 'fga', ftm: 'ftm', fta: 'fta' };

function fit(file) {
  const lines = fs.readFileSync(file || path.join(__dirname, 'logs3.csv'), 'utf8').split('\n'), head = lines[0].split(','), ix = n => head.indexOf(n);
  const iP = ix('player_id'), iS = ix('season'), iM = ix('minutes'), idx = STATS.map(s => ix(COL[s]));
  const by = new Map();
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(','); if (f.length < head.length) continue;
    const k = f[iP] + '|' + f[iS], m = +f[iM]; if (!(m > 0)) continue;
    let o = by.get(k); if (!o) by.set(k, o = { min: 0, rows: [] });
    o.min += m; o.rows.push(idx.map(j => +f[j]));
  }
  const n = STATS.length, cov = Array.from({ length: n }, () => new Float64Array(n)), sumMean = new Float64Array(n);
  let ps = 0, games = 0;
  for (const o of by.values()) {
    const g = o.rows.length; if (g < 25 || o.min / g < 20) continue;
    const mean = new Float64Array(n); o.rows.forEach(r => r.forEach((v, j) => { mean[j] += v / g; }));
    o.rows.forEach(r => { for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cov[a][b] += (r[a] - mean[a]) * (r[b] - mean[b]); });
    for (let a = 0; a < n; a++) sumMean[a] += mean[a] * (g - 1);
    ps++; games += g;
  }
  const rho = cov.map((row, a) => Array.from(row, (c, b) => c / Math.sqrt(cov[a][a] * cov[b][b])));
  const disp = {}; STATS.forEach((s, a) => { disp[s] = cov[a][a] / sumMean[a]; });
  return { rho, disp, playerSeasons: ps, games };
}
module.exports = { STATS, fit };
if (require.main === module) {
  const r = fit();
  console.log('player-seasons', r.playerSeasons, 'games', r.games);
  console.log('RHO order', STATS.join(','));
  console.log(JSON.stringify(r.rho.map(row => row.map(v => +v.toFixed(6)))));
  console.log('variance/mean', STATS.map(s => s + ' ' + r.disp[s].toFixed(3)).join('  '));
}
