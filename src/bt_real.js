// Real projections + the user's league format (2026-10-17). Board and opponents draft with real preseason projections
// (bt_proj.json) and the market follows real preseason ADP; league = 14 teams, 3RR, H2H each category, 3 IL spots,
// playoff boost Light, Draft field Average; title scoring: regular season = weeks 1-17 ranked by share of categories won,
// top 8, playoff rounds 2-2-2 (weeks 18-19, 20-21, 22-23). 2024-25: the league's world is the BBM/Hashtag average;
// 2025-26: BBM (the kit's Hashtag tab is stale). Arms 4-6 change only the board's projections (opponents and market fixed).
// Run: node bt_real.js <season> <arm> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, arm, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });   // unmatched players: BBM-style shrunk games
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const world = { '2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm' }[season];   // 2022-24 kits: Hashtag only (2023-24 market = Hashtag rank)
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 3, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'light', order: '3rr', scoring: 'h2h', field: 'average',
  slideEngine: true, realAdp: true, proj: world, oppProj: world };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const ARMS = [['Current board', {}], ['Win M + look-ahead (no slide)', { slideEngine: false, look2: 4, look2Engine: true }], ['Mix basis', { missW: 0.5 }], ['Punt Off', { puntMode: 'off' }],
  ['Board on BBM', { proj: 'bbm' }], ['Board on Hashtag', { proj: 'hs' }], ["Board on last season's stats", { proj: null }],
  ['No slide + Punt Off', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off' }],
  // split tests: 8/9 = current board / no slide in the OLD league format (snake, most categories, 2 IL, 1-2-2) with real projections;
  // 10/11 = current board / no slide in the user's format but with the OLD projections (last season's stats, synthetic ADP) for everyone
  ['OLD FORMAT: current board', { order: 'snake', scoring: 'most', ilSpots: 2, fmt: 'old' }], ['OLD FORMAT: no slide', { order: 'snake', scoring: 'most', ilSpots: 2, fmt: 'old', slideEngine: false, look2: 4, look2Engine: true }],
  ['OLD PROJECTIONS: current board', { proj: null, oppProj: null, realAdp: false }], ['OLD PROJECTIONS: no slide', { proj: null, oppProj: null, realAdp: false, slideEngine: false, look2: 4, look2Engine: true }],
  // settings re-check on the NEW board (Win M + look-ahead, Punt Off = arm 7), 2026-10-17
  ['NEW + Mix basis', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', missW: 0.5 }],
  ['NEW + playoff boost Off', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', poBoost: 'off' }],
  ['NEW + playoff boost Medium', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', poBoost: 'medium' }],
  ['NEW + Draft field None', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', field: null }],
  ['NEW + Draft field Strong', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', field: 'strong' }],
  ['NEW + IL fill 0.60', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', ilShare: 0.6 }],
  ['NEW + look-ahead 8 candidates', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', look2: 8 }],
  ['NEW + IL fill 0.50', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', ilShare: 0.5 }],
  ['NEW + IL fill 0.70', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', ilShare: 0.7 }]];
const [name, c] = ARMS[arm], rows = [], t0 = Date.now();
for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
  const { fmt, ...cx } = c, old = fmt === 'old';
  const ro = draft(season, slot, seed, Object.assign({}, base, cx), OPP);
  const sc = scoreLeague(season, ro, { seed, target: true, il: old ? 2 : 3 });
  const t = titleScore(sc.weekTot, old ? {} : { rsMode: 'each', rsWeeks: 17, rounds: [[17, 18], [19, 20], [21, 22]] }), m = slot - 1;
  rows.push({ season, arm, slot, seed, me: sc.rates[m], made: t.made[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
}
require('fs').writeFileSync(`bt_real_${season}_a${arm}_${s0}-${s1}.json`, JSON.stringify({ name, rows }));
console.log(season, name, ((Date.now() - t0) / 1000).toFixed(0) + 's');
