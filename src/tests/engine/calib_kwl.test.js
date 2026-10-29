// Fold plan, probit shrink and gates K-N of #156 (design: docs/superpowers/specs/2026-10-28-calib-kwl-design.md)
const test = require('node:test'), assert = require('node:assert');
const K = require('../../calib_kwl.js');

const PRIMARY = ['2025-26', '2024-25', '2023-24'], CONFIRM = '2022-23';

test('nested n0 pool never holds the training season or the held-out one', () => {
  const all = PRIMARY.concat(CONFIRM);
  for (const T of PRIMARY) for (const A of PRIMARY.filter(x => x !== T)) {
    const pool = K.nestedPool(all, A, T);
    assert.ok(!pool.includes(A) && !pool.includes(T)); assert.ok(pool.includes(CONFIRM)); assert.strictEqual(pool.length, 2);
  }
  assert.deepStrictEqual(K.nestedPool(all, null, '2025-26').sort(), ['2022-23', '2023-24', '2024-25']);
});

test('fold plan: primary folds train on the other primary seasons, the confirmation fold on all three; 2022-23 never trains k', () => {
  const plan = K.foldPlan(PRIMARY, CONFIRM);
  assert.strictEqual(plan.length, 4);
  for (const f of plan) { assert.ok(!f.train.includes(CONFIRM)); assert.ok(!f.train.includes(f.test)); assert.ok(f.nTrainBuilds === f.train.length); }
  assert.deepStrictEqual(plan.find(f => f.test === CONFIRM).train.sort(), PRIMARY.slice().sort());
  assert.strictEqual(plan.filter(f => f.confirm).length, 1);
});

test('probit shrink: scale 1 is the identity, scale 0 is .5, and it pulls toward .5', () => {
  for (const p of [0.02, 0.2, 0.5, 0.8, 0.97]) { assert.ok(Math.abs(K.probitShrink(p, 1) - p) < 1e-6); assert.ok(Math.abs(K.probitShrink(p, 0) - 0.5) < 1e-9); }
  assert.ok(K.probitShrink(0.8, 0.5) < 0.8 && K.probitShrink(0.8, 0.5) > 0.5);
  assert.ok(Math.abs(K.probitShrink(0.3, 0.6) + K.probitShrink(0.7, 0.6) - 1) < 1e-9);
});

test('spread of k* / predicted k across checkpoints', () => {
  assert.strictEqual(K.ratioSpread([0.4, 0.6], [0.4, 0.6]), 0);
  assert.ok(Math.abs(K.ratioSpread([0.4, 0.6], [0.5, 0.5]) - 0.4) < 1e-9);   // ratios .8 and 1.2
});

const d = (d_, se) => ({ d: d_, se });
const fold = o => Object.assign({ dK1: d(-0.001, 0.0005), train: { b: 0.6, seB: 0.1 }, spreadK0: 0.5, spreadK1: 0.2, dCk: d(0, 0.001) }, o);

test('gate K needs all four parts', () => {
  const ok = [fold(), fold(), fold()], conf = d(-0.0004, 0.0004);
  assert.strictEqual(K.gateK(ok, conf).pass, true);
  assert.strictEqual(K.gateK([fold({ dK1: d(-0.0004, 0.0005) }), fold(), fold()], conf).pass, false);          // < 1 SE in a fold
  assert.strictEqual(K.gateK([fold({ train: { b: 0.6, seB: 0.4 } }), fold(), fold()], conf).pass, false);      // b under 2 SE
  assert.strictEqual(K.gateK([fold({ train: { b: -0.2, seB: 0.05 } }), fold(), fold()], conf).pass, false);    // b <= 0
  assert.strictEqual(K.gateK([fold({ spreadK1: 0.9 }), fold({ spreadK1: 0.9 }), fold()], conf).pass, false);   // spread smaller in only 1 of 3
  assert.strictEqual(K.gateK([fold({ spreadK1: 0.9 }), fold(), fold()], conf).pass, true);                     // 2 of 3 is enough
  assert.strictEqual(K.gateK(ok, d(0.0002, 0.0004)).pass, false);                                              // 2022-23 d >= 0
});

test('gate L: per-checkpoint k replaces the straight line only at 2 SE in every fold', () => {
  assert.strictEqual(K.gateL([fold({ dCk: d(-0.002, 0.001) }), fold({ dCk: d(-0.003, 0.001) }), fold({ dCk: d(-0.0025, 0.001) })]).pass, true);
  assert.strictEqual(K.gateL([fold({ dCk: d(-0.002, 0.001) }), fold({ dCk: d(-0.003, 0.001) }), fold({ dCk: d(-0.0015, 0.001) })]).pass, false);
});

test('gate M: a window needs 1 SE and better player loss in all seasons; best pooled d wins; otherwise STD', () => {
  const w = (dd, player = true) => ({ d: d(dd, 0.0004), player });
  const folds = ws => [0, 1, 2].map(i => ({ dW: Object.fromEntries(Object.entries(ws).map(([k, v]) => [k, v[i]])) }));
  const pass = [w(-0.001), w(-0.001), w(-0.001)], close = [w(-0.0002), w(-0.001), w(-0.001)], noPlayer = [w(-0.002), w(-0.002, false), w(-0.002)];
  assert.strictEqual(K.gateM(folds({ L30: close, L60: close, L90: close })).pick, 'STD');
  assert.strictEqual(K.gateM(folds({ L30: close, L60: pass, L90: close })).pick, 'L60');
  assert.strictEqual(K.gateM(folds({ L30: pass, L60: [w(-0.002), w(-0.002), w(-0.002)], L90: noPlayer })).pick, 'L60');
  assert.strictEqual(K.gateM(folds({ L30: noPlayer, L60: noPlayer, L90: noPlayer })).pick, 'STD');
});

test('gate N flags a mid-season k level that varies by more than .10 across seasons', () => {
  assert.strictEqual(K.gateN([0.45, 0.50, 0.52]).uncertain, false);
  assert.strictEqual(K.gateN([0.37, 0.60, 0.48]).uncertain, true);
});
