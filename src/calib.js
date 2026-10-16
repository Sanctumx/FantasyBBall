const E = require('./engine.js'); const { draft, setup } = require('./backtest.js'); const DATA = require('./bt_data.json');
const N = 14, nc = 9;
function matchProb(ps) { let dist = [1]; for (const q of ps) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; } let w = 0; for (let i = 0; i < dist.length; i++) { if (2 * i > nc) w += dist[i]; else if (2 * i === nc) w += 0.5 * dist[i]; } return w; }
const model = process.argv[2] || 'indep';
const out = [];
for (const season of ['2024-25', '2025-26']) for (const slot of [1, 4, 7, 10, 14]) for (let seed = 1; seed <= 3; seed++) {
  const ro = draft(season, slot, seed, { puntMode: 'off' });
  const { P, ctx, cfg } = setup(season, { puntMode: 'off' });
  const r = E.evaluate(P, ctx, Object.assign({}, cfg, { slot, corr: model === 'old' ? 'off' : 'on' }), { picks: ro.picks });
  const pred = (A, B) => { if (model !== 'indep') return r.pairProb(A, B); const ps = []; for (let c = 0; c < nc; c++) ps.push(E.Phi((A.mu[c] - B.mu[c]) / Math.sqrt(A.v[c] + B.v[c] + ctx.h2hNoise[c]))); return matchProb(ps); };
  // actual weekly outcomes
  const { weekly, nweeks } = DATA[season];
  const tot = ro.map(pids => { const w = Array.from({ length: nweeks }, () => new Array(11).fill(0)); pids.forEach(pid => { const pw = weekly[String(pid)] || {}; for (const k in pw) for (let c = 0; c < 11; c++) w[k][c] += pw[k][c]; }); return w; });
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  const teamOf = t => r.teams[t];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    const p = pred(teamOf(a), teamOf(b)); let wins = 0, n = 0, br = 0;
    for (let w = 0; w < nweeks; w++) { if (tot[a][w][5] === 0 && tot[b][w][5] === 0) continue; const ca = cats(tot[a][w]), cb = cats(tot[b][w]); let wa = 0, wb = 0; for (let c = 0; c < 9; c++) { if (ca[c] > cb[c]) wa++; else if (ca[c] < cb[c]) wb++; } const o = wa > wb ? 1 : wa === wb ? 0.5 : 0; wins += o; n++; br += (p - o) ** 2; }
    out.push({ p, act: wins / n, brier: br / n });
  }
}
const brier = out.reduce((s, x) => s + x.brier, 0) / out.length;
console.log(model, 'pairs', out.length, 'weekly Brier', brier.toFixed(4));
const bins = [[0, .2], [.2, .35], [.35, .5], [.5, .65], [.65, .8], [.8, 1.01]];
for (const [lo, hi] of bins) { const xs = out.filter(x => x.p >= lo && x.p < hi); if (!xs.length) continue; console.log(`predicted ${lo.toFixed(2)}-${Math.min(hi, 1).toFixed(2)}: n=${String(xs.length).padStart(4)} mean pred ${(xs.reduce((s, x) => s + x.p, 0) / xs.length * 100).toFixed(1)}%  actual ${(xs.reduce((s, x) => s + x.act, 0) / xs.length * 100).toFixed(1)}%`); }
