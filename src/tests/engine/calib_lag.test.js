// k by lag (#157, 2026-10-28): cell sums per (outcome week, checkpoint, seed) and the shrink fits built on them
const test = require('node:test'), assert = require('node:assert');
const S = require('../../calib_ros_stats.js'), L = require('../../calib_lag.js'), KW = require('../../calib_kwl.js');

const CKS = [1, 3, 5, 7], TCK = CKS.map(w => 7 * w / 175);
// rows with a truth k that depends on the lag (outcome week - checkpoint week); matchup rows only unless noted
function synth(n, kOfLag, seed, withCats) {
  const r = S.rng(seed), p = new Float32Array(n), y = new Float32Array(n), wk = new Uint8Array(n), cat = new Uint8Array(n), ck = new Uint8Array(n), sd = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    ck[i] = i % 4; wk[i] = CKS[ck[i]] + (Math.floor(i / 4) % 14); sd[i] = Math.floor(i / 56) % 9; cat[i] = withCats && i % 5 === 0 ? 3 : 9;
    p[i] = 0.02 + 0.96 * r(); y[i] = r() < S.shr(p[i], kOfLag(wk[i] - CKS[ck[i]])) ? 1 : 0;
  }
  return { n, y, wk, cat, ck, sd, p: { A: p } };
}

test('lagBucket cuts at 1 / 3 / 7 / 11', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4, 7, 8, 11, 12, 20].map(L.lagBucket), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('cellSums gives the exact sums per cell and skips category rows', () => {
  const D = { n: 4, y: Float32Array.from([1, 0, 1, 1]), wk: Uint8Array.from([5, 5, 5, 6]), sd: Uint8Array.from([1, 1, 1, 1]), cat: Uint8Array.from([9, 9, 3, 9]), ck: Uint8Array.from([0, 0, 0, 1]), p: { A: Float32Array.from([0.75, 0.25, 0.9, 0.5]) } };
  const cells = L.cellSums(D, 'A', [1, 3], [0.1, 0.2]);
  assert.strictEqual(cells.length, 2);
  const c = cells.find(x => x.ck === 0);
  assert.deepStrictEqual([c.wk, c.sd, c.n, c.lag, c.t], [5, 1, 2, 4, 0.1]);
  assert.ok(Math.abs(c.dd - (0.25 ** 2 + 0.25 ** 2)) < 1e-12);
  assert.ok(Math.abs(c.de - (0.25 * 0.5 + -0.25 * -0.5)) < 1e-12);
  assert.ok(Math.abs(c.ee - 0.5) < 1e-12);
  const c1 = cells.find(x => x.ck === 1);
  assert.deepStrictEqual([c1.lag, c1.n, c1.dd], [3, 1, 0]);
});

test('brierCells equals the row Brier for a constant k and for a table by checkpoint', () => {
  const D = synth(4000, () => 0.7, 3), cells = L.cellSums(D, 'A', CKS, TCK), tab = [0.5, 0.6, 0.7, 0.8];
  assert.ok(Math.abs(L.brierCells(cells, () => 0.63) - S.brier(D, { src: 'A', kM: 0.63, kC: 1 }, { kind: 'M' })) < 1e-9);
  assert.ok(Math.abs(L.brierCells(cells, c => tab[c.ck]) - S.brier(D, { src: 'A', kM: tab, kC: 1 }, { kind: 'M' })) < 1e-9);
});

test('fitKX with [1] reproduces fitK and with [1, t] reproduces fitKLin', () => {
  const D = synth(20000, lag => 0.9 - 0.03 * lag, 4, true), cells = L.cellSums(D, 'A', CKS, TCK), o = { kind: 'M' };
  assert.ok(Math.abs(L.fitKX(cells, L.FEATURES.K0)[0] - S.fitK(D, 'A', o)) < 1e-9);
  const lin = S.fitKLin(D, 'A', o, TCK), b = L.fitKX(cells, L.FEATURES.K1);
  assert.ok(Math.abs(b[0] - lin.a) < 1e-9 && Math.abs(b[1] - lin.b) < 1e-9);
});

test('KL recovers one k per lag bucket', () => {
  const D = synth(300000, lag => (lag <= 1 ? 0.9 : lag <= 3 ? 0.8 : lag <= 7 ? 0.6 : lag <= 11 ? 0.5 : 0.4), 5), cells = L.cellSums(D, 'A', CKS, TCK), b = L.fitKX(cells, L.FEATURES.KL);
  [0.9, 0.8, 0.6, 0.5, 0.4].forEach((k, j) => assert.ok(Math.abs(b[j] - k) < 0.05, `bucket ${j}: ${b[j]}`));
});

test('a singular design falls back to 0 for the unidentified coefficient, no NaN', () => {
  const cells = [{ wk: 3, ck: 0, sd: 1, n: 2, lag: 2, t: 0.1, dd: 1, de: 0.5, ee: 0.4 }, { wk: 4, ck: 0, sd: 1, n: 2, lag: 3, t: 0.1, dd: 1, de: 0.7, ee: 0.4 }];
  const b = L.fitKX(cells, L.FEATURES.K1);   // t is constant: collinear with the intercept
  assert.ok(b.every(Number.isFinite));
  assert.ok(Math.abs(L.brierCells(cells, c => b[0] + b[1] * c.t) - L.brierCells(cells, () => 0.6)) < 1e-9);   // best constant is 1.2 / 2
});

test('fitKXSE with [1, t] matches kLinSE', () => {
  const D = synth(20000, lag => 0.9 - 0.03 * lag, 6), cells = L.cellSums(D, 'A', CKS, TCK), se = S.kLinSE(D, 'A', { kind: 'M' }, TCK);
  assert.ok(Math.abs(L.fitKXSE(cells, L.FEATURES.K1, 1) - se.seB) < 1e-6);
});

test('diffCells matches diffSE', () => {
  const D = synth(20000, lag => 0.9 - 0.03 * lag, 7), cells = L.cellSums(D, 'A', CKS, TCK), o = { kind: 'M' };
  const dc = L.diffCells(cells, () => 0.5, () => 0.8), ds = S.diffSE(D, { src: 'A', kM: 0.5, kC: 1 }, { src: 'A', kM: 0.8, kC: 1 }, o);
  assert.ok(Math.abs(dc.d - ds.d) < 1e-9 && Math.abs(dc.se - ds.se) < 1e-9);
  assert.ok(Math.abs(dc.seWeek - ds.seWeek) < 1e-9 && Math.abs(dc.seSeed - ds.seSeed) < 1e-9);
});

test('kBucket gives k and SE of one lag bucket', () => {
  const D = synth(100000, lag => (lag <= 1 ? 0.8 : 0.4), 8), cells = L.cellSums(D, 'A', CKS, TCK), r = L.kBucket(cells, 0);
  assert.ok(Math.abs(r.k - 0.8) < 0.08 && r.se > 0 && r.se < 0.2);
});

test('gate O: t term under 2 SE and k(lag) over K1 by 1 SE in every fold', () => {
  const f = (b, seB, d, se) => ({ bT: { b, seB }, dKL: { d, se } });
  assert.strictEqual(KW.gateO([f(0.1, 0.1, -0.0004, 0.0002), f(-0.05, 0.1, -0.0003, 0.0003), f(0.0, 0.1, -0.0005, 0.0002)], { d: -0.0001 }).pass, true);
  const slope = KW.gateO([f(0.4, 0.1, -0.0004, 0.0002), f(0.1, 0.1, -0.0004, 0.0002), f(0.1, 0.1, -0.0004, 0.0002)], { d: -0.0001 });
  assert.strictEqual(slope.pass, false); assert.strictEqual(slope.slope, false);
  const br = KW.gateO([f(0.1, 0.1, -0.0001, 0.0002), f(0.1, 0.1, -0.0004, 0.0002), f(0.1, 0.1, -0.0004, 0.0002)], { d: -0.0001 });
  assert.strictEqual(br.pass, false); assert.strictEqual(br.brier, false);
  const conf = KW.gateO([f(0, 0.1, -0.0004, 0.0002), f(0, 0.1, -0.0004, 0.0002), f(0, 0.1, -0.0004, 0.0002)], { d: 0.0001 });
  assert.strictEqual(conf.pass, true); assert.strictEqual(conf.conf, false);
});

test('gate O flags a t term that is unidentified (SE over twice the K1 SE)', () => {
  const f = { bT: { b: 0.1, seB: 0.5 }, dKL: { d: -0.001, se: 0.0002 }, k1SeB: 0.1 };
  assert.strictEqual(KW.gateO([f, f, f], { d: -0.0001 }).unidentified, true);
});
