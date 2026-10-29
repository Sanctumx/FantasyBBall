// League of drafting strategies (2026-10-18, user request): every team drafts with one of four strategies, assigned to the
// 14 draft slots at random each draft, in equal parts (3 each + 2 extra that rotate, so each strategy gets 3.5 teams on
// average): Standard Zscore TO ×0.5, H2H-Adjusted Zscore TO ×0.5, this board's Model pick (arm 23 settings), pure ADP.
// Every team is scored (same in-season streaming for all), so each draft gives 14 team-seasons.
// Run: node bt_strat.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const world = { '2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm' }[season];
const base = { puntMode: 'off', basis: 'total', missW: 1, ilSpots: 3, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'light', order: '3rr', scoring: 'h2h', field: 'average',
  slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, realAdp: true, proj: world, oppProj: world };
const S4 = ['z', 'h2h', 'board', 'adp'], N = 14;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rows = [], t0 = Date.now();
for (let seed = s0; seed <= s1; seed++) {
  const list = S4.concat(S4, S4, [S4[seed % 4], S4[(seed + 1) % 4]]), r = rng(seed * 9973 + season.charCodeAt(3));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const slot = list.indexOf('board') + 1;
  const ro = draft(season, slot, seed, base, { trueSd: 'v2', strat: list });
  const sc = scoreLeague(season, ro, { seed, target: true, il: 3 });
  const t = titleScore(sc.weekTot, { rsMode: 'each', rsWeeks: 17, rounds: [[17, 18], [19, 20], [21, 22]] });
  for (let m = 0; m < N; m++) rows.push({ season, seed, team: m + 1, strat: list[m], me: sc.rates[m], made: t.made[m], rounds: t.roundsWon[m], title: t.title[m] });
}
require('fs').writeFileSync(require('./results_path').resultPath(`bt_strat_${season}_${s0}-${s1}.json`), JSON.stringify({ rows }));
console.log(season, s0 + '-' + s1, ((Date.now() - t0) / 1000).toFixed(0) + 's');
