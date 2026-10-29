// In-season trade screen (idea 163). One draft per (slot, seed) on the arm 23 board, then every trade rule is replayed on those rosters, so the arms are
// paired exactly (rows have the bt_real.js format, so prize_equity.py reads them):
//   66 baseline (no trades)   70 trades chosen by Win M (Trade.evaluateTrade)   71 chosen by value z-sum   72 random offer   73 lowest z gain (controls)
// Offers come at weeks 3, 7, 11 (ipe_trade_core.js); one trade is accepted per checkpoint at most.
// Run: node ipe_trade.js <season> <s0> <s1> [slots, default 1,4,7,10,14] [arms, default 66,70,71,72,73] [flips]
//   flips: no replays; writes ipe_trade_flips.txt, how often rules 70 and 71 choose differently on the same offers
const fs = require('fs');
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const slots = (process.argv[5] || '1,4,7,10,14').split(',').map(Number), want = (process.argv[6] || '66,70,71,72,73').split(',').map(Number), flipsMode = process.argv[7] === 'flips';
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });   // as bt_real.js
const { draft } = require('./backtest.js'); const { scoreLeague, initialCores } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const { planTrades, choose, simCtx, offers, CHECKPOINTS } = require('./ipe_trade_core.js');

// arm 23 (the baseline board) is read from bt_real.js itself so the two files cannot drift
const src = fs.readFileSync(require('path').join(__dirname, 'bt_real.js'), 'utf8');
const a0 = src.indexOf('const ARMS = ') + 'const ARMS = '.length, a1 = src.indexOf('const [name, c] = ARMS[arm]');
const ARMS = new Function('return ' + src.slice(a0, a1).trim().replace(/;$/, ''))();
const world = { '2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm' }[season];
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 3, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'light', order: '3rr', scoring: 'h2h', field: 'average',
  slideEngine: true, realAdp: true, proj: world, oppProj: world };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
const { fmt, opp, ...cx } = ARMS[23][1];
if (fmt || opp) throw new Error('arm 23 is expected to be a plain board');

const ARM = {
  66: ['IPE trade baseline (no trades)', null],
  70: ['IPE trades by Win M (evaluateTrade dA)', 'winM'],
  71: ['IPE trades by value z-sum', 'z'],
  72: ['IPE trades, random offer (control)', 'random'],
  73: ['IPE trades, lowest z gain (control)', 'antiZ'],
};
const out = {}; want.forEach(a => { out[a] = []; });
const flips = [];
const t0 = Date.now();
for (const slot of slots) for (let seed = s0; seed <= s1; seed++) {
  const ro = draft(season, slot, seed, Object.assign({}, base, cx), OPP), m = slot - 1, cores = initialCores(season, ro);
  if (flipsMode) {
    // walk rule 70's chain; at each checkpoint compare what 70 and 71 would take from the same offers
    let cur = cores.map(c => c.slice());
    for (const w of CHECKPOINTS) {
      const ctx = simCtx(season, w, cur, m, world), s = seed * 1000 + m * 50 + w, offs = offers(ctx, s, 3);
      const a = choose(ctx, offs, 'winM'), b = choose(ctx, offs, 'z'), key = x => x ? x.other + ':' + x.give + '>' + x.get : '-';
      flips.push({ slot, seed, w, offers: offs.length, winM: !!a, z: !!b, differ: key(a) !== key(b), dA: a ? a.dA : null });
      if (a) { const orig = new Map(cur.flat().map(p => [String(p), p])), o = +a.other, give = a.give.map(k => orig.get(k)), get = a.get.map(k => orig.get(k));
        cur[m] = cur[m].filter(p => !give.includes(p)).concat(get); cur[o] = cur[o].filter(p => !get.includes(p)).concat(give); }
    }
    continue;
  }
  for (const a of want) {
    const plan = ARM[a][1] ? planTrades(season, cores, { rule: ARM[a][1], seed, me: m, world }) : { trades: [] };
    const sc = scoreLeague(season, ro, { seed, target: true, il: 3, me: m, trades: plan.trades });
    const t = titleScore(sc.weekTot, { rsMode: 'each', rsWeeks: 17, rounds: [[17, 18], [19, 20], [21, 22]] });
    out[a].push({ season, arm: a, slot, seed, me: sc.rates[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], ntr: plan.trades.length, roster: ro[m].slice().sort().join(',') });
  }
}
const n = slots.length * (s1 - s0 + 1), secs = ((Date.now() - t0) / 1000);
if (flipsMode) {
  const pct = x => (100 * x).toFixed(1) + '%', has = flips.filter(x => x.offers > 0), N = flips.length;
  const txt = [`${season} seeds ${s0}-${s1} slots ${slots.join(',')}: ${n} drafts, ${N} checkpoints, ${has.length} with offers`,
    `rule 70 (Win M) accepts at ${pct(flips.filter(x => x.winM).length / N)} of checkpoints; rule 71 (z) at ${pct(flips.filter(x => x.z).length / N)}`,
    `70 and 71 choose differently at ${pct(flips.filter(x => x.differ).length / N)} of checkpoints (${pct(flips.filter(x => x.differ).length / Math.max(1, has.length))} of those with offers)`,
    `mean dA of the trade 70 takes: ${(flips.filter(x => x.winM).reduce((s, x) => s + x.dA, 0) / Math.max(1, flips.filter(x => x.winM).length)).toFixed(2)} pts of Win M`,
    `${secs.toFixed(0)}s, ${(secs / n).toFixed(1)}s per draft`].join('\n');
  fs.writeFileSync(require('path').join(__dirname, 'ipe_trade_flips.txt'), txt + '\n'); console.log(txt);
} else {
  // IPE_OUT: write somewhere else (smoke runs), so they do not enter the prize_equity.py fit
  const dest = fn => process.env.IPE_OUT ? require('path').join(process.env.IPE_OUT, fn) : require('./results_path').resultPath(fn);
  for (const a of want) fs.writeFileSync(dest(`bt_real_${season}_a${a}_${s0}-${s1}.json`), JSON.stringify({ name: ARM[a][0], rows: out[a] }));
  console.log(season, `${n} drafts x ${want.length} arms`, secs.toFixed(0) + 's', (secs / n).toFixed(1) + 's per draft');
}
