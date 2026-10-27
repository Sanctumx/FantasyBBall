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

test('bins hold every row once; ck and single-category filters restrict rows', () => {
  const D = synth(10000, 1, 3), a = { src: 'A', kM: 1, kC: 1 };
  assert.strictEqual(S.bins(D, a, { kind: 'C' }).reduce((s, b) => s + b.n, 0), 9000);
  assert.strictEqual(S.bins(D, a, { kind: 'M' }).reduce((s, b) => s + b.n, 0), 1000);
  assert.strictEqual(S.bins(D, a, { kind: 3 }).reduce((s, b) => s + b.n, 0), 1000);
  assert.strictEqual(S.bins(D, a, { kind: 'M', ck: 1 }).reduce((s, b) => s + b.n, 0), 500);   // matchup rows are i % 10 == 9, ck 1 is i % 4 == 1: i % 20 == 9
});
