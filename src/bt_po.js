// Playoff boost backtest: Off vs the current uniform boost vs the boost scaled by roster survival.
// Your team takes the Model pick; opponents draft by ADP with the fitted spread. Scored with realistic league play
// (stream_sim): season = all-play matchup win rate over every week; playoffs = all-play win rate in the 3 playoff
// rounds (weeks 18-19, 20-21, 22-23, each round's stats summed), which is what a playoff run depends on.
// Run: node bt_po.js 2024-25 [seeds]   (and 2025-26 in parallel)
const { draft, PO_WEEKS } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const season = process.argv[2], seeds = +(process.argv[3] || 8), out = [];
const N = 14, ROUNDS = [PO_WEEKS.slice(0, 2), PO_WEEKS.slice(2, 4), PO_WEEKS.slice(4, 6)];
const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
function playoffRate(weekTot, me) {
  let wins = 0, games = 0;
  for (const ws of ROUNDS) {
    const tot = weekTot.map(t => { const a = new Array(11).fill(0); ws.forEach(w => t[w] && t[w].forEach((x, c) => { a[c] += x; })); return cats(a); });
    for (let b = 0; b < N; b++) if (b !== me) {
      let wa = 0, wb = 0; for (let c = 0; c < 9; c++) { if (tot[me][c] > tot[b][c]) wa++; else if (tot[me][c] < tot[b][c]) wb++; }
      wins += wa > wb ? 1 : wa === wb ? 0.5 : 0; games++;
    }
  }
  return wins / games;
}
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2' };
const arms = [['Off', { poBoost: 'off' }], ['Medium, uniform (current)', { poBoost: 'medium' }], ['Medium × survival', { poBoost: 'medium', poSurv: true }],
  ['Very strong, uniform', { poBoost: 'vstrong' }], ['Very strong × survival', { poBoost: 'vstrong', poSurv: true }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= seeds; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    const sc = scoreLeague(season, ro, { seed });
    rows.push({ season, slot, seed, season_: sc.rates[slot - 1], po: playoffRate(sc.weekTot, slot - 1), roster: ro[slot - 1].join(',') });
  }
  out.push({ name, rows });
  require('fs').writeFileSync(require('./results_path').resultPath('bt_po_' + season + '.json'), JSON.stringify(out));
  const m = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(4);
  console.log(name, '| season', m('season_'), '| playoffs', m('po'), '|', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
