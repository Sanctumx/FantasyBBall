// k by lag (#157, 2026-10-28). Pure. Matchup rows are reduced to cells per (outcome week, checkpoint, seed): with d = p - .5 and e = y - .5 a cell keeps
// n, dd = sum d^2, de = sum d e, ee = sum e^2, so the Brier of any k that depends on the cell is (ee - 2 k de + k^2 dd) / n, and a fit of k = beta . x(cell)
// (least squares on the objective of fitK) and its cluster bootstraps need only the cells. Saving the cells means a later variant needs no re-run.
const { rng } = require('./calib_ros_stats.js');
const lagBucket = lag => (lag <= 1 ? 0 : lag <= 3 ? 1 : lag <= 7 ? 2 : lag <= 11 ? 3 : 4), LAG_NAMES = ['0-1', '2-3', '4-7', '8-11', '12+'];
const sdOf = ds => { const m = ds.reduce((s, x) => s + x, 0) / ds.length; return Math.sqrt(ds.reduce((s, x) => s + (x - m) ** 2, 0) / (ds.length - 1)); };

// cks[ck] = the checkpoint's week, tck[ck] = t (days played / 175); lag = outcome week - checkpoint week
function cellSums(D, src, cks, tck) {
  const p = D.p[src], m = new Map();
  for (let i = 0; i < D.n; i++) if (D.cat[i] === 9) {
    const sd = D.sd ? D.sd[i] : 0, key = (D.wk[i] * 64 + D.ck[i]) * 256 + sd;
    let c = m.get(key); if (!c) m.set(key, c = { wk: D.wk[i], ck: D.ck[i], sd, n: 0, lag: D.wk[i] - cks[D.ck[i]], t: tck[D.ck[i]], dd: 0, de: 0, ee: 0 });
    const d = p[i] - 0.5, e = D.y[i] - 0.5; c.n++; c.dd += d * d; c.de += d * e; c.ee += e * e;
  }
  return [...m.values()];
}
function brierCells(cells, kFn) {
  let s = 0, n = 0;
  for (const c of cells) { const k = kFn(c); s += c.ee - 2 * k * c.de + k * k * c.dd; n += c.n; }
  return s / n;
}

const oneHot = c => { const v = [0, 0, 0, 0, 0]; v[lagBucket(c.lag)] = 1; return v; };
const FEATURES = {
  K0: () => [1],                                     // one k
  K1: c => [1, c.t],                                 // k = a + b t (#156)
  KL: oneHot,                                        // one k per lag bucket
  KLt: c => oneHot(c).concat([c.t]),                 // k per lag bucket plus b t
  KLs: c => [1, Math.log(1 + c.lag)],                // smooth in the lag; printed only
};
const dot = (b, x) => b.reduce((s, v, j) => s + v * x[j], 0);

// solve A x = b (A m x m, row-major, symmetric); a column whose pivot is tiny against the largest diagonal is left at 0
function solve(A, b, m) {
  const a = A.slice(), r = b.slice(), tiny = 1e-9 * Math.max(...Array.from({ length: m }, (_, j) => Math.abs(a[j * m + j])), 1e-300), skip = [];
  const row = [...Array(m).keys()];
  for (let j = 0; j < m; j++) {
    let piv = j; for (let i = j + 1; i < m; i++) if (Math.abs(a[row[i] * m + j]) > Math.abs(a[row[piv] * m + j])) piv = i;
    [row[j], row[piv]] = [row[piv], row[j]];
    const pj = a[row[j] * m + j];
    if (!(Math.abs(pj) > tiny)) { skip[j] = true; continue; }
    for (let i = j + 1; i < m; i++) { const f = a[row[i] * m + j] / pj; if (f) { for (let q = j; q < m; q++) a[row[i] * m + q] -= f * a[row[j] * m + q]; r[row[i]] -= f * r[row[j]]; } }
  }
  const x = new Array(m).fill(0);
  for (let j = m - 1; j >= 0; j--) {
    if (skip[j]) continue;
    let s = r[row[j]]; for (let q = j + 1; q < m; q++) s -= a[row[j] * m + q] * x[q];
    x[j] = s / a[row[j] * m + j];
  }
  return x;
}
// normal equations of sum_cells (e - beta.x d)^2: sum dd x x' beta = sum de x
function normal(cells, xFn, m) {
  const A = new Array(m * m).fill(0), b = new Array(m).fill(0);
  for (const c of cells) { const x = xFn(c); for (let i = 0; i < m; i++) { b[i] += c.de * x[i]; for (let j = 0; j < m; j++) A[i * m + j] += c.dd * x[i] * x[j]; } }
  return { A, b };
}
function fitKX(cells, xFn) { const m = xFn(cells[0]).length, { A, b } = normal(cells, xFn, m); return solve(A, b, m); }

// clusters of cells by outcome week or by seed, ascending key
function clusters(cells, key) {
  const m = new Map();
  for (const c of cells) { const k = c[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  return [...m.keys()].sort((a, b) => a - b).map(k => m.get(k));
}
// bootstrap SE of coefficient j: the larger of the week and the seed clusters (as kLinSE)
function fitKXSE(cells, xFn, j) {
  const m = xFn(cells[0]).length;
  const one = key => {
    const cl = clusters(cells, key).map(g => normal(g, xFn, m)).filter(q => { let t = 0; for (let i = 0; i < m; i++) t += q.A[i * m + i]; return t > 0; });
    const r = rng(55), bs = [];
    for (let t = 0; t < 500; t++) {
      const A = new Array(m * m).fill(0), b = new Array(m).fill(0);
      for (let q = 0; q < cl.length; q++) { const g = cl[Math.floor(r() * cl.length)]; for (let i = 0; i < m * m; i++) A[i] += g.A[i]; for (let i = 0; i < m; i++) b[i] += g.b[i]; }
      bs.push(solve(A, b, m)[j]);
    }
    return sdOf(bs);
  };
  return Math.max(one('wk'), one('sd'));
}
// Brier(kA) - Brier(kB) and its bootstrap SE (the larger of the week and the seed clusters), as diffSE in calib_ros_stats.js
function diffCells(cells, kA, kB) {
  const one = key => {
    const ws = clusters(cells, key).map(g => [brierSum(g, kA), brierSum(g, kB), g.reduce((s, c) => s + c.n, 0)]), r = rng(99), ds = [];
    const tot = ws.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]);
    for (let t = 0; t < 500; t++) { let s1 = 0, s2 = 0, n = 0; for (let k = 0; k < ws.length; k++) { const q = ws[Math.floor(r() * ws.length)]; s1 += q[0]; s2 += q[1]; n += q[2]; } ds.push((s1 - s2) / n); }
    return { d: (tot[0] - tot[1]) / tot[2], se: sdOf(ds) };
  };
  const w = one('wk'), s = one('sd');
  return { d: w.d, se: Math.max(w.se, s.se), seWeek: w.se, seSeed: s.se };
}
const brierSum = (cells, kFn) => { let s = 0; for (const c of cells) { const k = kFn(c); s += c.ee - 2 * k * c.de + k * k * c.dd; } return s; };

// k and SE of one lag bucket (bootstrap over week and seed clusters, rng 77 as kSE)
function kBucket(cells, bucket) {
  const sub = cells.filter(c => lagBucket(c.lag) === bucket), k = sums => sums[0] / sums[1];
  const one = key => {
    const cl = clusters(sub, key).map(g => [g.reduce((s, c) => s + c.de, 0), g.reduce((s, c) => s + c.dd, 0)]).filter(q => q[1] > 0), r = rng(77), ks = [];
    for (let t = 0; t < 500; t++) { let a = 0, b = 0; for (let j = 0; j < cl.length; j++) { const q = cl[Math.floor(r() * cl.length)]; a += q[0]; b += q[1]; } ks.push(a / b); }
    return sdOf(ks);
  };
  return { k: k([sub.reduce((s, c) => s + c.de, 0), sub.reduce((s, c) => s + c.dd, 0)]), se: Math.max(one('wk'), one('sd')) };
}
module.exports = { lagBucket, LAG_NAMES, cellSums, brierCells, FEATURES, dot, fitKX, fitKXSE, diffCells, kBucket };
