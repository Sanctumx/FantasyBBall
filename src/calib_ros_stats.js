// Scoring helpers for calib_ros.js (#139, 2026-10-26): Brier, calibration slope, the shrink k, reliability bins and a week-clustered
// bootstrap, over rows kept as typed arrays. D = { n, y, wk, cat (0-8, 9 = matchup), ck (checkpoint index), p: { src: Float32Array } }.
// An arm is { src, kM, kC }: the forecast source and the shrink toward 0.5 for matchup / category rows (p' = .5 + k(p - .5)).
// o = { kind: 'M' (matchup) | 'C' (nine categories pooled) | 0-8 (one category), ck? (one checkpoint only) }.
const rng = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const shr = (p, k) => 0.5 + k * (p - 0.5);
const keep = (D, i, o) => { const c = D.cat[i]; return (o.kind === 'M' ? c === 9 : o.kind === 'C' ? c < 9 : c === o.kind) && (o.ck == null || D.ck[i] === o.ck) && (o.f == null || o.f(i)); };
// #156: o.f is an optional row predicate; an arm's k may be one number or a table by checkpoint index (D.ck)
const kOf = (a, o) => (o.kind === 'M' ? a.kM : a.kC);
const kAt = (k, D, i) => (typeof k === 'number' ? k : k[D.ck[i]]);

// OLS shrink: k* = sum (p - .5)(y - .5) / sum (p - .5)^2
function fitK(D, src, o) {
  const p = D.p[src]; let sxy = 0, sxx = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const d = p[i] - 0.5; sxy += d * (D.y[i] - 0.5); sxx += d * d; }
  return sxy / sxx;
}
function brier(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o); let s = 0, n = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const e = shr(p[i], kAt(k, D, i)) - D.y[i]; s += e * e; n++; }
  return s / n;
}
// OLS slope of the outcome on the (shrunk) chance
function slope(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o); let n = 0, mx = 0, my = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { mx += shr(p[i], kAt(k, D, i)); my += D.y[i]; n++; }
  mx /= n; my /= n; let sxy = 0, sxx = 0;
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const x = shr(p[i], kAt(k, D, i)) - mx; sxy += x * (D.y[i] - my); sxx += x * x; }
  return sxy / sxx;
}
// 10 bins of the chance: { n, p (mean chance), obs (mean outcome) }
function bins(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o), b = Array.from({ length: 10 }, () => ({ n: 0, p: 0, obs: 0 }));
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const q = shr(p[i], kAt(k, D, i)), j = Math.min(9, Math.floor(q * 10)); b[j].n++; b[j].p += q; b[j].obs += D.y[i]; }
  b.forEach(x => { if (x.n) { x.p /= x.n; x.obs /= x.n; } });
  return b;
}
// per outcome week: [squared error, rows] for the arm
function weekSse(D, a, o) {
  const p = D.p[a.src], k = kOf(a, o), W = new Float64Array(2 * 64);
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const e = shr(p[i], kAt(k, D, i)) - D.y[i], w = D.wk[i]; W[2 * w] += e * e; W[2 * w + 1]++; }
  return W;
}
// per cluster (key = D.wk or D.sd): [squared error, rows] for the arm
function clusterSse(D, a, o, key) {
  const p = D.p[a.src], k = kOf(a, o), W = new Float64Array(2 * 256);
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const e = shr(p[i], kAt(k, D, i)) - D.y[i], w = key[i]; W[2 * w] += e * e; W[2 * w + 1]++; }
  return W;
}
const sdOf = ds => { const m = ds.reduce((s, x) => s + x, 0) / ds.length; return Math.sqrt(ds.reduce((s, x) => s + (x - m) ** 2, 0) / (ds.length - 1)); };
function bootD(A, Bw) {
  const ws = [];
  for (let w = 0; w < 256; w++) if (A[2 * w + 1] > 0) ws.push([A[2 * w], Bw[2 * w], A[2 * w + 1]]);
  const tot = ws.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]), r = rng(99), ds = [];
  for (let t = 0; t < 500; t++) { let s1 = 0, s2 = 0, n = 0; for (let k = 0; k < ws.length; k++) { const q = ws[Math.floor(r() * ws.length)]; s1 += q[0]; s2 += q[1]; n += q[2]; } ds.push((s1 - s2) / n); }
  return { d: (tot[0] - tot[1]) / tot[2], se: sdOf(ds) };
}
// Brier(a) - Brier(b) and its bootstrap SE: the larger of the outcome-week bootstrap (a week takes all its seeds, checkpoints and pairs) and the
// draft-seed bootstrap (#145; paired). seWeek and seSeed are returned too; a D without seeds (D.sd) gets the week SE only.
function diffSE(D, a, b, o) {
  const w = bootD(clusterSse(D, a, o, D.wk), clusterSse(D, b, o, D.wk)), s = D.sd ? bootD(clusterSse(D, a, o, D.sd), clusterSse(D, b, o, D.sd)) : w;
  return { d: w.d, se: Math.max(w.se, s.se), seWeek: w.se, seSeed: s.se };
}
// k* and its bootstrap SE (the larger of the week and the seed clusters)
function kSE(D, src, o) {
  const one = key => {
    const p = D.p[src], C = new Float64Array(2 * 256);
    for (let i = 0; i < D.n; i++) if (keep(D, i, o)) { const d = p[i] - 0.5; C[2 * key[i]] += d * (D.y[i] - 0.5); C[2 * key[i] + 1] += d * d; }
    const cl = []; for (let c = 0; c < 256; c++) if (C[2 * c + 1] > 0) cl.push([C[2 * c], C[2 * c + 1]]);
    const r = rng(77), ks = [];
    for (let t = 0; t < 500; t++) { let a = 0, b = 0; for (let j = 0; j < cl.length; j++) { const q = cl[Math.floor(r() * cl.length)]; a += q[0]; b += q[1]; } ks.push(a / b); }
    return sdOf(ks);
  };
  const w = one(D.wk), s = D.sd ? one(D.sd) : w;
  return { k: fitK(D, src, o), se: Math.max(w, s), seWeek: w, seSeed: s };
}
// #156: k = a + b t by checkpoint (tck[ck] = t), least squares on the same objective as fitK; a constant t is not separable, so b = 0 and a = fitK
function linSums(D, src, o, tck, keyOf) {
  const p = D.p[src], C = new Float64Array(5 * (keyOf ? 256 : 1));
  for (let i = 0; i < D.n; i++) if (keep(D, i, o)) {
    const d = p[i] - 0.5, y = D.y[i] - 0.5, t = tck[D.ck[i]], q = keyOf ? 5 * keyOf[i] : 0, dd = d * d;
    C[q] += dd; C[q + 1] += dd * t; C[q + 2] += dd * t * t; C[q + 3] += d * y; C[q + 4] += d * y * t;
  }
  return C;
}
function solveLin(s) {
  const det = s[0] * s[2] - s[1] * s[1];
  if (!(Math.abs(det) > 1e-9 * s[0] * s[2])) return { a: s[3] / s[0], b: 0 };
  return { a: (s[3] * s[2] - s[1] * s[4]) / det, b: (s[0] * s[4] - s[1] * s[3]) / det };
}
function fitKLin(D, src, o, tck) { return solveLin(linSums(D, src, o, tck)); }
// b and its bootstrap SE (the larger of the week and the seed clusters)
function kLinSE(D, src, o, tck) {
  const one = key => {
    const C = linSums(D, src, o, tck, key), cl = []; for (let c = 0; c < 256; c++) if (C[5 * c] > 0) cl.push(C.subarray(5 * c, 5 * c + 5));
    const r = rng(55), bs = [];
    for (let t = 0; t < 500; t++) { const s = [0, 0, 0, 0, 0]; for (let j = 0; j < cl.length; j++) { const q = cl[Math.floor(r() * cl.length)]; for (let m = 0; m < 5; m++) s[m] += q[m]; } bs.push(solveLin(s).b); }
    return sdOf(bs);
  };
  const w = one(D.wk), s = D.sd ? one(D.sd) : w, f = fitKLin(D, src, o, tck);
  return { a: f.a, b: f.b, seB: Math.max(w, s), seWeek: w, seSeed: s };
}
module.exports = { rng, shr, fitKLin, kLinSE, fitK, brier, slope, bins, weekSse, clusterSse, diffSE, kSE };
