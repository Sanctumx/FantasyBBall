// Scoring helpers for calib_ros.js (#139, 2026-10-26): Brier, calibration slope, the shrink k, reliability bins and a week-clustered
// bootstrap, over rows kept as typed arrays. D = { n, y, wk, cat (0-8, 9 = matchup), ck (checkpoint index), p: { src: Float32Array } }.
// An arm is { src, kM, kC }: the forecast source and the shrink toward 0.5 for matchup / category rows (p' = .5 + k(p - .5)).
// o = { kind: 'M' (matchup) | 'C' (nine categories pooled) | 0-8 (one category), ck? (one checkpoint only) }.
const rng = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const shr = (p, k) => 0.5 + k * (p - 0.5);
const keep = (D, i, o) => { const c = D.cat[i]; return (o.kind === 'M' ? c === 9 : o.kind === 'C' ? c < 9 : c === o.kind) && (o.ck == null || D.ck[i] === o.ck); };
const kOf = (a, o) => (o.kind === 'M' ? a.kM : a.kC);

// OLS shrink: k* = sum (p - .5)(y - .5) / sum (p - .5)^2
function fitK(D, src, o) {
  const p = D.p[src]; let sxy = 0, sxx = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const d = p[i] - 0.5; sxy += d * (D.y[i] - 0.5); sxx += d * d; }
  return sxy / sxx;
}
function brier(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o); let s = 0, n = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const e = shr(p[i], k) - D.y[i]; s += e * e; n++; }
  return s / n;
}
// OLS slope of the outcome on the (shrunk) chance
function slope(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o); let n = 0, mx = 0, my = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { mx += shr(p[i], k); my += D.y[i]; n++; }
  mx /= n; my /= n; let sxy = 0, sxx = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const x = shr(p[i], k) - mx; sxy += x * (D.y[i] - my); sxx += x * x; }
  return sxy / sxx;
}
// 10 bins of the chance: { n, p (mean chance), obs (mean outcome) }
function bins(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o), b = Array.from({ length: 10 }, () => ({ n: 0, p: 0, obs: 0 }));
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const q = shr(p[i], k), j = Math.min(9, Math.floor(q * 10)); b[j].n++; b[j].p += q; b[j].obs += D.y[i]; }
  b.forEach(x => { if (x.n) { x.p /= x.n; x.obs /= x.n; } });
  return b;
}
// per outcome week: [squared error, rows] for the arm
function weekSse(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o), W = new Float64Array(2 * 64);
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const e = shr(p[i], k) - D.y[i], w = D.wk[i]; W[2 * w] += e * e; W[2 * w + 1]++; }
  return W;
}
// Brier(a) - Brier(b) and its bootstrap SE over outcome weeks (each week takes all its seeds, checkpoints and pairs)
function diffSE(D, a, b, o, nBoot = 500) {
  const A = weekSse(D, a, o), Bw = weekSse(D, b, o), ws = [];
  for (let w = 0; w < 64; w++) if (A[2 * w + 1] > 0) ws.push([A[2 * w], Bw[2 * w], A[2 * w + 1]]);
  const tot = ws.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]), d = (tot[0] - tot[1]) / tot[2], r = rng(99), ds = [];
  for (let t = 0; t < nBoot; t++) { let s1 = 0, s2 = 0, n = 0; for (let k = 0; k < ws.length; k++) { const q = ws[Math.floor(r() * ws.length)]; s1 += q[0]; s2 += q[1]; n += q[2]; } ds.push((s1 - s2) / n); }
  const m = ds.reduce((s, x) => s + x, 0) / ds.length;
  return { d, se: Math.sqrt(ds.reduce((s, x) => s + (x - m) ** 2, 0) / (ds.length - 1)) };
}
module.exports = { rng, shr, fitK, brier, slope, bins, weekSse, diffSE };
