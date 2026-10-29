// Scoring helpers of the rest-of-season calibration (#139, 2026-10-26)
const test = require('node:test'), assert = require('node:assert');
const S = require('../../calib_ros_stats.js');

// synthetic rows: chance p, outcomes drawn from p' = .5 + trueK (p - .5), so the fitted k should come back as trueK
function synth(n, trueK, seed) {
  const r = S.rng(seed), p = new Float32Array(n), y = new Float32Array(n), wk = new Uint8Array(n), cat = new Uint8Array(n), ck = new Uint8Array(n);
  for (let i = 0; i < n; i++) { p[i] = 0.02 + 0.96 * r(); y[i] = r() < S.shr(p[i], trueK) ? 1 : 0; wk[i] = i % 20; cat[i] = i % 10; ck[i] = i % 4; }
  return { n, y, wk, cat, ck, p: { A: p } };
}

test('fitK recovers the true shrink on synthetic outcomes', () => {
  const D = synth(200000, 0.7, 1);
  assert.ok(Math.abs(S.fitK(D, 'A', { kind: 'C' }) - 0.7) < 0.03);
  assert.ok(Math.abs(S.fitK(D, 'A', { kind: 'M' }) - 0.7) < 0.06);
});

test('a fitted k beats k = 1 on Brier and puts the slope near 1', () => {
  const D = synth(200000, 0.7, 2), k = S.fitK(D, 'A', { kind: 'C' }), raw = { src: 'A', kM: 1, kC: 1 }, fit = { src: 'A', kM: k, kC: k }, o = { kind: 'C' };
  assert.ok(S.brier(D, fit, o) < S.brier(D, raw, o));
  assert.ok(Math.abs(S.slope(D, fit, o) - 1) < 0.05);
  assert.ok(S.slope(D, raw, o) < 0.8);
  const d = S.diffSE(D, fit, raw, o); assert.ok(d.d < 0 && d.se > 0);
});

// rows whose truth is k(t) = a + b t with t by checkpoint index (#156)
function synthLin(n, a, b, tck, seed) {
  const D = synth(n, 1, seed), r = S.rng(seed + 100);
  for (let i = 0; i < n; i++) D.y[i] = r() < S.shr(D.p.A[i], a + b * tck[D.ck[i]]) ? 1 : 0;
  return D;
}
const TCK = [0.1, 0.3, 0.5, 0.7];

test('fitKLin recovers a and b; with b = 0 it is fitK (#156)', () => {
  const D = synthLin(400000, 0.4, 0.5, TCK, 5), f = S.fitKLin(D, 'A', { kind: 'C' }, TCK);
  assert.ok(Math.abs(f.a - 0.4) < 0.05 && Math.abs(f.b - 0.5) < 0.1, JSON.stringify(f));
  const flat = synthLin(200000, 0.6, 0, TCK, 6), g = S.fitKLin(flat, 'A', { kind: 'C' }, TCK);
  assert.ok(Math.abs(g.b) < 0.1);
  const z = S.fitKLin(flat, 'A', { kind: 'C' }, TCK.map(() => 0.3));   // t constant: a and b are not separable, a + b t is fitK
  assert.ok(Math.abs(z.a + z.b * 0.3 - S.fitK(flat, 'A', { kind: 'C' })) < 1e-6);
});

test('a per-checkpoint k table equals a constant k when the table is flat (#156)', () => {
  const D = synth(20000, 0.7, 7), c = { src: 'A', kM: 0.7, kC: 0.7 }, t = { src: 'A', kM: [0.7, 0.7, 0.7, 0.7], kC: [0.7, 0.7, 0.7, 0.7] };
  for (const kind of ['M', 'C']) {
    assert.strictEqual(S.brier(D, t, { kind }), S.brier(D, c, { kind })); assert.strictEqual(S.slope(D, t, { kind }), S.slope(D, c, { kind }));
    assert.deepStrictEqual(S.bins(D, t, { kind }), S.bins(D, c, { kind }));
  }
  const D2 = Object.assign({ sd: Uint8Array.from({ length: 20000 }, (_, i) => i % 5) }, D);
  assert.deepStrictEqual(S.diffSE(D2, t, c, { kind: 'C' }), S.diffSE(D2, c, c, { kind: 'C' }));
});

test('kLinSE gives a positive SE on b, and the o.f predicate restricts rows (#156)', () => {
  const D = Object.assign({ sd: Uint8Array.from({ length: 100000 }, (_, i) => i % 5) }, synthLin(100000, 0.4, 0.5, TCK, 8));
  const e = S.kLinSE(D, 'A', { kind: 'C' }, TCK); assert.ok(e.seB > 0 && e.seB < 1 && Number.isFinite(e.b));
  assert.strictEqual(S.bins(D, { src: 'A', kM: 1, kC: 1 }, { kind: 'C', f: i => D.ck[i] < 2 }).reduce((s, b) => s + b.n, 0), 45000);
});

test('bins hold every row once; ck and single-category filters restrict rows', () => {
  const D = synth(10000, 1, 3), a = { src: 'A', kM: 1, kC: 1 };
  assert.strictEqual(S.bins(D, a, { kind: 'C' }).reduce((s, b) => s + b.n, 0), 9000);
  assert.strictEqual(S.bins(D, a, { kind: 'M' }).reduce((s, b) => s + b.n, 0), 1000);
  assert.strictEqual(S.bins(D, a, { kind: 3 }).reduce((s, b) => s + b.n, 0), 1000);
  assert.strictEqual(S.bins(D, a, { kind: 'M', ck: 1 }).reduce((s, b) => s + b.n, 0), 500);   // matchup rows are i % 10 == 9, ck 1 is i % 4 == 1: i % 20 == 9
});
