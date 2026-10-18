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
  ['NEW + IL fill 0.70', { slideEngine: false, look2: 4, look2Engine: true, puntMode: 'off', ilShare: 0.7 }],
  // value early, then fit (2026-10-17): value = 50/50 soft −1 Zscore + Win C, fit = Win M + look-ahead; Punt Off
  ['NEW + value first 2 picks', { slideEngine: false, puntMode: 'off', slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 50 } }],
  ['NEW + fast slide t^0.25', { slideEngine: false, puntMode: 'off', slide: { value: 'blend', fit: 'look2', alpha: 0.5, p: 0.25 } }],
  // logistic drop: value share = 1 / (1 + e^(k (pick − 2.5))), pick 1-based (mid 1.5 on the 0-based index)
  ['NEW + logistic value k=2', { slideEngine: false, puntMode: 'off', slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 } }],
  ['NEW + logistic value k=3', { slideEngine: false, puntMode: 'off', slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 3 } }],
  ['NEW + logistic k=2, value = Win C only', { slideEngine: false, puntMode: 'off', slide: { value: 'wincOnly', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 } }],
  // punt re-test on the current board (logistic k=2 blend; baseline = arm 23, Punt Off)
  ['K2 + Auto as is', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'auto' }],
  ['K2 + Auto, commitment firms up (tau 0.05 to 0.01 by pick 6)', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'auto', tauSched: [0.05, 0.01, 5] }],
  ['K2 + opportunistic punt (from pick 6, weakest category < 25%)', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', oppPunt: { from: 5, thr: 0.25 } }],
  // projections blended toward ADP-implied value (adp_fit.py, LOSO ADP weight ≈ 0.25); baseline = arm 23 (current board)
  ['K2 + ADP blend w 0.25', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', adpBlend: 0.25 }],
  ['K2 + ADP blend w 0.4', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', adpBlend: 0.4 }],
  // 2-week playoff matchups have less noise: matchup noise variance × 0.5 (pure 2-week) / × 0.75 (halfway); baseline = arm 23
  ['K2 + matchup noise × 0.5 (2-week)', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', noiseK: 0.5 }],
  ['K2 + matchup noise × 0.75', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', noiseK: 0.75 }],
  // IL stashes (2026-10-17): known-injured players credited back 0.85 × their projected missed games (≈ usual availability);
  // arm 33 = only in your last 3 picks, arm 34 = every pick. Baseline = arm 23.
  ['K2 + IL stash, last 3 picks', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', stash: { last: 3, w: 0.85 } }],
  ['K2 + known injuries credited, all picks', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', knownW: 0.85 }],
  // Loose field (2026-10-17): 2 of the 5 ADP drafters are sloppy (spread × 2.5); arm 35 = current board in that league,
  // 36 = board told the field is Easy, 37 = board assumes 1.5× the ADP spread. Compare 36/37 with 35 (same league).
  ['SLOPPY: current board', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'sloppy' }],
  ['SLOPPY: Draft field Easy', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'sloppy', field: 'easy' }],
  ['SLOPPY: ADP spread x1.5', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'sloppy', sdK: 1.5 }],
  // True Zscore in the Model pick's value side (2026-10-18): 50/50 soft −1 TRUE Zscore + Win C, and true Zscore alone; baseline = arm 23
  ['K2 + value = true Zscore + Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, zTrue: true }, puntMode: 'off' }],
  ['K2 + value = true Zscore only', { slideEngine: false, slide: { value: 'z', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, zTrue: true }, puntMode: 'off' }],
  // Zscore grid in the value blend (2026-10-18), each 50/50 with Win C; alpha 0 = Normal, 0.5 = −1 50% (arm 23 = adjusted −1 50%, arm 38 = true −1 50%)
  ['K2 + value = true Zscore Normal + Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0, mid: 1.5, k: 2, zTrue: true }, puntMode: 'off' }],
  ['K2 + value = H2H Zscore Normal + Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0, mid: 1.5, k: 2, zH: true }, puntMode: 'off' }],
  ['K2 + value = H2H Zscore -1 50% + Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, zH: true }, puntMode: 'off' }],
  ['K2 + value = adjusted Zscore Normal + Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0, mid: 1.5, k: 2 }, puntMode: 'off' }],
  // Pure H2H-adjusted Zscore as the value side, no Win C (2026-10-18): Normal / −1 50% / −1 100% (worst negative category left out)
  ['K2 + value = H2H Zscore Normal only', { slideEngine: false, slide: { value: 'z', fit: 'look2', alpha: 0, mid: 1.5, k: 2, zH: true }, puntMode: 'off' }],
  ['K2 + value = H2H Zscore -1 50% only', { slideEngine: false, slide: { value: 'z', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, zH: true }, puntMode: 'off' }],
  ['K2 + value = H2H Zscore -1 100% only', { slideEngine: false, slide: { value: 'z', fit: 'look2', alpha: 1, mid: 1.5, k: 2, zH: true }, puntMode: 'off' }],
  // Turnover weight inside the value side's soft −1 (2026-10-18): the room drafts as if TO counted ×0; baseline arm 23 = TO ×1
  ['K2 + value TO x0', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, toW: 0 }, puntMode: 'off' }],
  ['K2 + value TO x0.5', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, toW: 0.5 }, puntMode: 'off' }],
  // Fit objective (2026-10-18): the regular season ranks by share of categories won (Win C's objective); playoffs by matchups (Win M)
  ['K2 + fit = Win C + look-ahead', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, fitC: 'c' }, puntMode: 'off' }],
  ['K2 + fit = 50/50 Win C and Win M + look-ahead', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, fitC: 'mix' }, puntMode: 'off' }],
  ['K2 + value blend 70% Zscore / 30% Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, wc: 0.3 }, puntMode: 'off' }],
  ['K2 + value blend 30% Zscore / 70% Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, wc: 0.7 }, puntMode: 'off' }],
  // Basis re-check on the current board (2026-10-18): share of projected missed games that counts (1 = Season, 0.5 = Mix)
  ['K2 + basis: 75% of missed games count', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', missW: 0.75 }],
  ['K2 + basis Mix (50%)', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', missW: 0.5 }],
  // League where sharp drafters rank by Standard Zscore TO ×0.5 (2026-10-18): 55 = current board there, 56 = board whose field
  // model ranks the same way (cfg.fieldZ 'std', as the page now does). Compare 56 with 55.
  ['STDFIELD: current board', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'stdField' }],
  ['STDFIELD: board field = Standard TO 0.5', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'stdField', fieldZ: 'std' }],
  // Basis 2×2 (2026-10-18): value-side basis × fit-side basis at Season (1) / Mix (0.5). Cells: (1,1) = arm 23, (0.5,0.5) = arm 54,
  // 57 = value Mix only, 58 = fit Mix only. Main effects and interaction from four cells of 160 drafts.
  ['K2 + basis: value side Mix, fit Season', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, valueMissW: 0.5 }, puntMode: 'off' }],
  ['K2 + basis: value side Season, fit Mix', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, valueMissW: 1 }, puntMode: 'off', missW: 0.5 }],
  // Value blend follow-up (2026-10-18): 52 (30/70) was +0.9 ± 0.8 on seeds 145-152; run 31 re-runs 52 on 153-160 and adds 20/80
  ['K2 + value blend 20% Zscore / 80% Win C', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2, wc: 0.8 }, puntMode: 'off' }],
  // Draft field misspecification (2026-10-18): cost of telling the board Easy in an Average room (60 vs 23) against telling it
  // Average in an Easy room (61 vs 62). Easy room = 10 ADP drafters, 2 sharp, 1 punter, no value drafters (engine FIELD_F easy 0.08)
  ['K2 + board told Easy, room Average', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', field: 'easy' }],
  ['EASY ROOM: board told Average', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'easy' }],
  ['EASY ROOM: board told Easy', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', opp: 'easy', field: 'easy' }],
  // New category scarcity (2026-10-18: concentration + depletion, engine catIdx) as a boost on Win / Win M, vs arm 23.
  // The old drop-based scarcity cost about 5 points when boosted (handoff); this re-tests the new measure.
  ['K2 + category scarcity boost Light', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', scarZ: 'light' }],
  ['K2 + category scarcity boost Medium', { slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, puntMode: 'off', scarZ: 'medium' }]];
const [name, c] = ARMS[arm], rows = [], t0 = Date.now();
for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
  const { fmt, opp: oppKind, ...cx } = c, old = fmt === 'old';
  const ro = draft(season, slot, seed, Object.assign({}, base, cx), oppKind === 'sloppy' ? { trueSd: 'v2', mix: Object.assign({}, OPP.mix, { sloppy: 2 }) } : oppKind === 'stdField' ? Object.assign({}, OPP, { stdField: true }) : oppKind === 'easy' ? { trueSd: 'v2', mix: { model: 0, punt: 1, sharp: 2, sharpW: 0.5 } } : OPP);
  const sc = scoreLeague(season, ro, { seed, target: true, il: old ? 2 : 3 });
  const t = titleScore(sc.weekTot, old ? {} : { rsMode: 'each', rsWeeks: 17, rounds: [[17, 18], [19, 20], [21, 22]] }), m = slot - 1;
  rows.push({ season, arm, slot, seed, me: sc.rates[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
}
require('fs').writeFileSync(`bt_real_${season}_a${arm}_${s0}-${s1}.json`, JSON.stringify({ name, rows }));
console.log(season, name, ((Date.now() - t0) / 1000).toFixed(0) + 's');
