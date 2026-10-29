// In-season prize-equity runs (ideas 161-163). One draft per (slot, seed) on the arm 23 board, then every in-season arm is scored on
// those same rosters, so the arms are paired exactly. Rows have the bt_real.js format, so prize_equity.py reads them:
//   66 baseline (stream_sim as is)   67 placebo (second-best streamer in odd weeks)   68 model streaming   69 model lineup
// Run: node ipe_run.js <season> <s0> <s1> [slots, default 1,4,7,10,14] [arms, default 66,67,68,69]
const fs = require('fs');
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const slots = (process.argv[5] || '1,4,7,10,14').split(',').map(Number), want = (process.argv[6] || '66,67,68,69').split(',').map(Number);
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });   // as bt_real.js
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const { titleScore } = require('./title_score.js');
const { makeModel } = require('./ipe_core.js');

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

const model = makeModel(season, { k: 1 });
const ARM = {
  66: ['IPE baseline (stream_sim as is)', () => ({})],
  67: ['IPE placebo (second-best streamer in odd weeks)', () => ({ streamPick: ctx => (ctx.w % 2 ? ctx.pool[1] ?? ctx.baseline : ctx.baseline) })],
  68: ['IPE model streaming (category share)', () => ({ streamPick: model.streamPick })],
  69: ['IPE model lineup (leave-one-out share)', () => ({ lineupRank: model.lineupRank })],
};
const out = {}; want.forEach(a => { out[a] = []; });
const t0 = Date.now();
for (const slot of slots) for (let seed = s0; seed <= s1; seed++) {
  const ro = draft(season, slot, seed, Object.assign({}, base, cx), OPP), m = slot - 1;
  for (const a of want) {
    const sc = scoreLeague(season, ro, Object.assign({ seed, target: true, il: 3, me: m }, ARM[a][1]()));
    const t = titleScore(sc.weekTot, { rsMode: 'each', rsWeeks: 17, rounds: [[17, 18], [19, 20], [21, 22]] });
    out[a].push({ season, arm: a, slot, seed, me: sc.rates[m], made: t.made[m], poAll: t.poAll[m], rounds: t.roundsWon[m], title: t.title[m], roster: ro[m].slice().sort().join(',') });
  }
}
// IPE_OUT: write somewhere else (smoke runs), so they do not enter the prize_equity.py fit
const dest = fn => process.env.IPE_OUT ? require('path').join(process.env.IPE_OUT, fn) : require('./results_path').resultPath(fn);
for (const a of want) fs.writeFileSync(dest(`bt_real_${season}_a${a}_${s0}-${s1}.json`), JSON.stringify({ name: ARM[a][0], rows: out[a] }));
const n = slots.length * (s1 - s0 + 1);
console.log(season, `${n} drafts x ${want.length} arms`, ((Date.now() - t0) / 1000).toFixed(0) + 's', ((Date.now() - t0) / 1000 / n).toFixed(1) + 's per draft');
