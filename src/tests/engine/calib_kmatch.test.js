// #158 K_MATCH re-fit: the pure parts (games of a later week, pooling over seasons, the decision rule fixed before any result)
const test = require('node:test'), assert = require('node:assert');
const K = require('../../calib_kmatch.js');

test('pfGames is the team games of that week x min(1, g/82), 0 when the week is missing', () => {
  const rows = [3, 4, 2];
  assert.strictEqual(K.pfGames(rows, 1, 82), 4);
  assert.strictEqual(K.pfGames(rows, 1, 41), 2);
  assert.strictEqual(K.pfGames(rows, 2, 100), 2);
  assert.strictEqual(K.pfGames(rows, 5, 82), 0);
  assert.strictEqual(K.pfGames(undefined, 0, 82), 0);
});

test('pooled is the inverse-variance mean, and its SE is never below half the spread of the seasons', () => {
  const p = K.pooled([{ k: 0.8, se: 0.02 }, { k: 0.8, se: 0.02 }, { k: 0.8, se: 0.02 }, { k: 0.8, se: 0.02 }]);
  assert.ok(Math.abs(p.k - 0.8) < 1e-12);
  assert.ok(Math.abs(p.se - 0.01) < 1e-12);   // sqrt(1 / (4 / .02^2)) = .01, spread 0
  const q = K.pooled([{ k: 0.6, se: 0.02 }, { k: 0.9, se: 0.02 }]);
  assert.ok(Math.abs(q.k - 0.75) < 1e-12);
  assert.ok(Math.abs(q.se - 0.2121320 / 2) < 1e-6);   // sd([.6, .9]) / 2 = .106, above the inverse-variance SE .014
});

const mk = (ks, se, d) => ({ seasons: ks.map(k => ({ k, se })), dBrier: d });

test('verdict KEEP needs pooled > .75, > .72 + 2 SE, 3 of 4 seasons above .75 and Brier(.78) not worse', () => {
  assert.strictEqual(K.verdict(mk([0.82, 0.8, 0.79, 0.81], 0.02, -0.0002)).call, 'KEEP .78');
  assert.strictEqual(K.verdict(mk([0.82, 0.8, 0.79, 0.81], 0.02, 0.0003)).call, 'INCONCLUSIVE');       // Brier worse
  assert.strictEqual(K.verdict(mk([0.82, 0.8, 0.74, 0.7], 0.02, -0.0002)).call, 'INCONCLUSIVE');       // only 2 seasons above .75
  assert.strictEqual(K.verdict(mk([0.76, 0.77, 0.76, 0.76], 0.05, -0.0002)).call, 'INCONCLUSIVE');     // not 2 SE above .72
});

test('verdict REVERT needs pooled <= .75, < .78 - 2 SE and 3 of 4 seasons at or below .75', () => {
  assert.strictEqual(K.verdict(mk([0.72, 0.7, 0.74, 0.73], 0.02, 0.0002)).call, 'REVERT .72');
  assert.strictEqual(K.verdict(mk([0.72, 0.7, 0.74, 0.73], 0.08, 0.0002)).call, 'INCONCLUSIVE');       // too noisy
  assert.strictEqual(K.verdict(mk([0.72, 0.7, 0.8, 0.85], 0.02, 0.0002)).call, 'INCONCLUSIVE');        // seasons disagree
});

test('verdict notes a pooled k more than 2 SE below .72', () => {
  const v = K.verdict(mk([0.6, 0.62, 0.58, 0.6], 0.02, 0.001));
  assert.strictEqual(v.call, 'REVERT .72');
  assert.ok(v.note && /below \.72/.test(v.note));
});
