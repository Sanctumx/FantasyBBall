// Slide shapes with blend value + look-ahead fit, paired with bt_cur arm 4 (√t). Fresh-seed test vs the current board (look-ahead, 24 pairs). Slide from value to fit (step 1: value measure; linear w). Early rounds by Win C or Zscore instead of the Model pick. Re-tests in the realistic league (2026-10-17), paired with bt_league.js's board arm (same seeds 113-128).
// Run: node bt_retest.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1, armIx] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5]], out = [];
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'medium' };   // engine default = 24 pairs (the current board)
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const arms = [['Blend+LA √t, Auto-weighted value + Win C', { slide: { value: 'blend', fit: 'look2', p: 0.5, zval: 'auto' } }]];
for (const [name, c] of (armIx != null ? [arms[+armIx]] : arms)) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), OPP);
    const sc = scoreLeague(season, ro, { seed, target: true }), t = titleScore(sc.weekTot), m = slot - 1;
    rows.push({ season, slot, seed, me: sc.rates[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync(require('./results_path').resultPath('bt_punt_' + season + '_' + s0 + '-' + s1 + (armIx != null ? '_arm' + armIx : '') + '.json'), JSON.stringify(out));
  console.log(season, name, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
