// Steps 1-2 of the #139 follow-up (2026-10-26): is the shrink robust, and does a k per category beat one k?
// Usage: node --max-old-space-size=4096 calib_ros_k.js [seeds=20] [season,season,season=2025-26,2024-25,2023-24]  -> results_calib_ros_k.txt
// Leave-one-season-out (LOSO): k fitted on the other seasons, scored on the held-out one, E-ROS forecasts (whole games, as the Team tab).
// SE = the larger of a bootstrap over outcome weeks and one over draft seeds (rows share weeks and seeds, so each alone is too small).
// Gate 1 (fixed before the results): the single fitted k beats unshrunk by >= 2 SE on matchup AND cats in EVERY held-out season.
// Gate 2: k per category (9 values + matchup k) beats the single cats k by >= 2 SE in EVERY held-out season, else keep the single k.
const fs = require('fs');
const C = require('./calib_ros.js'), S = require('./calib_ros_stats.js');
const SEASONS = (process.argv[3] || '2025-26,2024-25,2023-24').split(',');
const OUT = []; const log = s => { OUT.push(s); console.log(s); };

// an arm = (D, i) -> shrunk chance; kfn(cat) gives the k for a row (cat 9 = matchup)
const arm = (kfn, src = 'W') => (D, i) => S.shr(D.p[src][i], kfn(D.cat[i]));
const sel = (D, i, kind) => (kind === 'M' ? D.cat[i] === 9 : D.cat[i] < 9);
function sseBy(D, f, kind, key) {
  const W = new Float64Array(2 * 256);
  for (let i = 0; i < D.n; i++) if (sel(D, i, kind)) { const e = f(D, i) - D.y[i], k = key[i]; W[2 * k] += e * e; W[2 * k + 1]++; }
  return W;
}
function brier(D, f, kind) { const W = sseBy(D, f, kind, new Uint8Array(D.n)); return W[0] / W[1]; }
function slope(D, f, kind) {
  let n = 0, mx = 0, my = 0; for (let i = 0; i < D.n; i++) if (sel(D, i, kind)) { mx += f(D, i); my += D.y[i]; n++; }
  mx /= n; my /= n; let sxy = 0, sxx = 0;
  for (let i = 0; i < D.n; i++) if (sel(D, i, kind)) { const x = f(D, i) - mx; sxy += x * (D.y[i] - my); sxx += x * x; }
  return sxy / sxx;
}
function binsOk(D, f, kind) {
  const b = Array.from({ length: 10 }, () => [0, 0, 0]);
  for (let i = 0; i < D.n; i++) if (sel(D, i, kind)) { const q = f(D, i), j = Math.min(9, Math.floor(q * 10)); b[j][0]++; b[j][1] += q; b[j][2] += D.y[i]; }
  return b.every(([n, p, o]) => n < 200 || Math.abs(p / n - o / n) <= 0.05);
}
// Brier(a) - Brier(b) with a bootstrap over the groups in `key`
function diffKey(D, fa, fb, kind, key) {
  const A = sseBy(D, fa, kind, key), B = sseBy(D, fb, kind, key), g = [];
  for (let k = 0; k < 256; k++) if (A[2 * k + 1] > 0) g.push([A[2 * k], B[2 * k], A[2 * k + 1]]);
  const tot = g.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]), d = (tot[0] - tot[1]) / tot[2], r = S.rng(99), ds = [];
  for (let t = 0; t < 500; t++) { let s1 = 0, s2 = 0, n = 0; for (let k = 0; k < g.length; k++) { const q = g[Math.floor(r() * g.length)]; s1 += q[0]; s2 += q[1]; n += q[2]; } ds.push((s1 - s2) / n); }
  const m = ds.reduce((s, x) => s + x, 0) / ds.length;
  return { d, se: Math.sqrt(ds.reduce((s, x) => s + (x - m) ** 2, 0) / (ds.length - 1)) };
}
function diff(D, fa, fb, kind) {
  const w = diffKey(D, fa, fb, kind, D.wk), s = diffKey(D, fa, fb, kind, D.sd);
  return { d: w.d, se: Math.max(w.se, s.se), seW: w.se, seS: s.se };
}
// OLS shrink on the rows of the given seasons: kind 'M', 'C' (pooled) or a category 0-8
function fitK(Ds, kind) {
  let sxy = 0, sxx = 0;
  for (const D of Ds) for (let i = 0; i < D.n; i++) {
    const c = D.cat[i]; if (!(kind === 'M' ? c === 9 : kind === 'C' ? c < 9 : c === kind)) continue;
    const d = D.p.W[i] - 0.5; sxy += d * (D.y[i] - 0.5); sxx += d * d;
  }
  return sxy / sxx;
}
const f2 = x => x.toFixed(2), f4 = x => (x < 0 ? '' : ' ') + x.toFixed(4);

const R_ = SEASONS.map(s => C.build(s)), res = { seeds: process.argv[2] || 20, folds: [] };
log(`#139 steps 1-2  ${new Date().toISOString().slice(0, 10)}  seeds ${res.seeds}  seasons ${SEASONS.join(', ')}  (LOSO, E-ROS whole games)`);
const PROV = { kM: 0.6, kC: 0.75 };
let g1 = true, g2 = true;
for (const test of R_) {
  const rest = R_.filter(r => r !== test).map(r => r.D), D = test.D;
  const kM = fitK(rest, 'M'), kC = fitK(rest, 'C'), kCat = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => fitK(rest, c));
  const un = arm(() => 1), one = arm(c => (c === 9 ? kM : kC)), per = arm(c => (c === 9 ? kM : kCat[c])), prov = arm(c => (c === 9 ? PROV.kM : PROV.kC));
  log(`\n== held out ${test.season}: fitted on the other seasons k_M ${f2(kM)}, k_C ${f2(kC)}, per category ${kCat.map(f2).join(' ')}`);
  const fold = { season: test.season, kM, kC, kCat, rows: {} };
  for (const [lab, kind] of [['matchup', 'M'], ['cats', 'C']]) {
    const dF = diff(D, one, un, kind), dP = diff(D, prov, un, kind);
    const ok = dF.d <= -2 * dF.se; if (!ok) g1 = false;
    log(`  ${lab.padEnd(7)} Brier unshrunk ${brier(D, un, kind).toFixed(4)} | fitted k ${brier(D, one, kind).toFixed(4)} d ${f4(dF.d)} +-${dF.se.toFixed(4)} (weeks ${dF.seW.toFixed(4)}, seeds ${dF.seS.toFixed(4)}) ${ok ? 'ok' : 'FAIL'} slope ${f2(slope(D, one, kind))} bins ${binsOk(D, one, kind) ? 'ok' : 'FAIL'} | provisional .6/.75 d ${f4(dP.d)} +-${dP.se.toFixed(4)} slope ${f2(slope(D, prov, kind))} bins ${binsOk(D, prov, kind) ? 'ok' : 'FAIL'}`);
    fold.rows[lab] = { dFit: dF, dProv: dP };
  }
  const d2 = diff(D, per, one, 'C'), ok2 = d2.d <= -2 * d2.se; if (!ok2) g2 = false;
  log(`  step 2  cats: k per category vs single k_C  d ${f4(d2.d)} +-${d2.se.toFixed(4)} ${ok2 ? 'ok' : 'FAIL'}`);
  fold.step2 = d2; res.folds.push(fold);
}
// pooled k over all seasons (for step 3)
const all = R_.map(r => r.D), kMall = fitK(all, 'M'), kCall = fitK(all, 'C'), kCatAll = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => fitK(all, c));
log(`\n== pooled over all seasons: k_M ${f2(kMall)}, k_C ${f2(kCall)}, per category ${kCatAll.map(f2).join(' ')}`);
const spread = a => Math.max(...a) - Math.min(...a);
log(`   k_M by held-out fold ${res.folds.map(f => f2(f.kM)).join(' / ')}; per-season in-sample k_M spread ${f2(spread(R_.map(r => fitK([r.D], 'M'))))}, k_C spread ${f2(spread(R_.map(r => fitK([r.D], 'C'))))}`);
log(`\nGate 1 (shrink beats unshrunk >= 2 SE, both kinds, every held-out season): ${g1 ? 'PASS' : 'FAIL'}`);
log(`Gate 2 (k per category beats single k_C >= 2 SE in every held-out season): ${g2 ? 'PASS, use per-category k' : 'FAIL, keep the single k'}`);
Object.assign(res, { pooled: { kM: kMall, kC: kCall, kCat: kCatAll }, g1, g2 });
fs.writeFileSync('results_calib_ros_k.txt', OUT.join('\n') + '\n');
fs.writeFileSync('calib_ros_k.json', JSON.stringify(res));
