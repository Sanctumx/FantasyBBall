// #144 early-season availability: pure helpers of calib_avail.js (shrunk games-played rate, day/week alignment, n0 fit, gp counting, gates A1-A5, arm games)
const test = require('node:test'), assert = require('node:assert');
const CA = require('../../calib_avail.js');

const row = (day, min = 30) => [day, 3, 6, 1, 2, 1, 8, 4, 2, 1, 0, 1, min];

test('rate: n0 = 0 is gp / tg, tg = 0 falls back to g / 82, n0 = inf is exactly g / 82, gp > tg clamps to 1', () => {
  assert.strictEqual(CA.rate(5, 10, 60, 0), 0.5);
  assert.strictEqual(CA.rate(0, 0, 41, 0), 0.5);
  assert.strictEqual(CA.rate(7, 10, 82, 10) , (7 + 10 * 1) / 20);
  assert.strictEqual(CA.rate(3, 10, 41, Infinity), Math.min(1, 41 / 82));
  assert.strictEqual(CA.rate(0, 10, 0, Infinity), 0);
  assert.strictEqual(CA.rate(11, 10, 70, 0), 1);
  assert.strictEqual(CA.rate(12, 10, 100, 5), 1);
  assert.ok(Math.abs(CA.rate(2, 8, 60, 4) - (2 + 4 * 60 / 82) / 12) < 1e-12);
});

test('tgAt sums the team games of the weeks before the checkpoint; tgAfter the rest; alignCheck counts weeks where a player has more rows than the team has games', () => {
  const G = { AAA: [3, 4, 2, 4, 0, 3] };
  assert.strictEqual(CA.tgAt(G.AAA, 0), 0);
  assert.strictEqual(CA.tgAt(G.AAA, 3), 9);
  assert.strictEqual(CA.tgAfter(G.AAA, 3, 6), 7);
  const daily = { 1: [row(0), row(2), row(4), row(7), row(8)], 2: [row(0), row(1), row(2), row(3)] };   // player 2 has 4 rows in week 0, AAA plays 3
  const a = CA.alignCheck([{ pid: 1, t: 'AAA' }, { pid: 2, t: 'AAA' }], daily, G, 6);
  assert.strictEqual(a.over, 1);
  assert.strictEqual(a.cells, 5);   // week 4 has no games
  const ok = CA.alignCheck([{ pid: 1, t: 'AAA' }], daily, G, 6);
  assert.strictEqual(ok.over, 0); assert.strictEqual(ok.exact, 1);   // week 0 has 3 rows = 3 games
});

test('gpAt counts rows up to day 7 * w0 - 1 only, and never a 0-minute row', () => {
  const rows = [row(0), row(6), row(7), row(13), row(14), row(15, 0), row(3, 0)];
  assert.strictEqual(CA.gpAt(rows, 1), 2);
  assert.strictEqual(CA.gpAt(rows, 2), 4);
  assert.strictEqual(CA.gpAt(rows, 3), 5);
  assert.strictEqual(CA.gpAt([], 3), 0);
});

test('makeAvailSample: gp and tg before the checkpoint, games played and team games after it', () => {
  const G = { AAA: [3, 4, 2, 4] }, rows = [row(1), row(3), row(8), row(15), row(16), row(22)];
  const s = CA.makeAvailSample({ pid: 7, t: 'AAA', g: 70 }, rows, G, 2, 4);
  assert.deepStrictEqual([s.gp, s.tg, s.gpAfter, s.tgAfter, s.g], [3, 7, 3, 6, 70]);
});

test('fitN0: players who play every game push n0 toward 0 with a g/82 prior of 1 and toward the prior when games are noise; the loss is weighted by team games after', () => {
  const mk = (gp, tg, g, gpAfter, tgAfter) => ({ gp, tg, g, gpAfter, tgAfter });
  // early rate says 0.5 but the truth is the g/82 prior (1): n0 should be large
  const noisy = Array.from({ length: 50 }, () => mk(1, 2, 82, 20, 20));
  assert.ok(CA.fitN0(noisy) >= 40);
  // the early rate is the truth (steady 0.5), the prior (1) is wrong: n0 = 0
  const steady = Array.from({ length: 50 }, () => mk(5, 10, 82, 10, 20));
  assert.strictEqual(CA.fitN0(steady), 0);
  // rows with no games after the checkpoint carry no weight
  assert.strictEqual(CA.fitN0(steady.concat([mk(0, 10, 82, 0, 0)])), 0);
  assert.ok(Number.isInteger(CA.fitN0(noisy)));
});

test('n0For never lets the held-out season (or the training season) into the fit', () => {
  const mk = (gp, tg, g, gpAfter, tgAfter) => ({ gp, tg, g, gpAfter, tgAfter });
  const bySeason = { A: [mk(5, 10, 82, 10, 20)], B: [mk(5, 10, 82, 10, 20)], C: [mk(1, 2, 82, 20, 20)], D: [mk(5, 10, 82, 10, 20)] };
  const seen = [];
  const fit = s => { seen.push(s.length); return 0; };
  CA.n0For(bySeason, ['A', 'B', 'C', 'D'], 'B', 'A', fit);
  assert.deepStrictEqual(seen, [2]);   // C and D only
  seen.length = 0; CA.n0For(bySeason, ['A', 'B', 'C', 'D'], null, 'C', fit);
  assert.deepStrictEqual(seen, [3]);
  // C is the only noisy season: holding it out must change the answer
  const withC = CA.n0For(bySeason, ['A', 'B', 'C', 'D'], null, 'A');
  const withoutC = CA.n0For(bySeason, ['A', 'B', 'C', 'D'], null, 'C');
  assert.ok(withC > withoutC);
});

test('binsOk ignores bins under 200 rows', () => {
  assert.ok(CA.binsOk([{ n: 500, p: .5, obs: .53 }, { n: 100, p: .2, obs: .6 }]));
  assert.ok(!CA.binsOk([{ n: 500, p: .5, obs: .56 }]));
  assert.ok(CA.binsOk([{ n: 200, p: .5, obs: .55 }]));
});

test('gate A1: R beats W by >= 2 SE in every season and category d <= 0', () => {
  const d = (x, se) => ({ d: x, se });
  assert.ok(CA.gateA1([d(-.002, .001), d(-.004, .001)], [d(0, 0), d(-.001, 0)]));
  assert.ok(!CA.gateA1([d(-.0019, .001)], [d(-.1, 0)]));
  assert.ok(!CA.gateA1([d(-.004, .001)], [d(.0001, 0)]));
});

test('gate A2: R beats G0 by >= 1 SE in every season', () => {
  const d = (x, se) => ({ d: x, se });
  assert.ok(CA.gateA2([d(-.001, .001), d(-.002, .001)]));
  assert.ok(!CA.gateA2([d(-.00099, .001)]));
});

test('gate A3: late-checkpoint harm must be strictly below +1 SE in each season, matchup and category, against W and G0', () => {
  const d = (x, se) => ({ d: x, se });
  assert.ok(CA.gateA3([d(.0009, .001), d(-.01, .001)]));
  assert.ok(!CA.gateA3([d(.001, .001)]));
});

test('gate A4: slope no further from 1 than W and the reliability bins pass', () => {
  assert.ok(CA.gateA4({ slopeR: 1.05, slopeW: .9, binsOk: true }));
  assert.ok(CA.gateA4({ slopeR: .95, slopeW: 1.05, binsOk: true }));
  assert.ok(!CA.gateA4({ slopeR: 1.2, slopeW: 1.1, binsOk: true }));
  assert.ok(!CA.gateA4({ slopeR: 1, slopeW: 1.1, binsOk: false }));
});

test('gate A5: harness d strictly below 0, live d at or below 0 (sign test only)', () => {
  assert.ok(CA.gateA5Harness({ d: -.0001 }));
  assert.ok(!CA.gateA5Harness({ d: 0 }));
  assert.ok(CA.gateA5Live([{ d: 0 }, { d: -.01 }]));
  assert.ok(!CA.gateA5Live([{ d: 0 }, { d: .0001 }]));
});

test('gate edges: exactly 1 SE passes A2, exactly 2 SE passes A1', () => {
  assert.ok(CA.gateA2([{ d: -.001, se: .001 }]));
  assert.ok(CA.gateA1([{ d: -.002, se: .001 }], [{ d: 0 }]));
});

test('gamesFor: W keeps the stand-in at full games, G0 is g/82 for everyone, R the shrunk rate with no stand-in, RIL R with the stand-in, R0 the raw rate', () => {
  const whole = 3.5, share = 0.6, a = 0.8, a0 = 0.5;
  const base = { whole, share, a, a0 };
  assert.strictEqual(CA.gamesFor('W', Object.assign({ recent: true }, base)), whole);
  assert.strictEqual(CA.gamesFor('W', Object.assign({ recent: false }, base)), 0);
  for (const recent of [true, false]) {
    assert.strictEqual(CA.gamesFor('G0', Object.assign({ recent }, base)), whole * share);
    assert.strictEqual(CA.gamesFor('R', Object.assign({ recent }, base)), whole * a);
    assert.strictEqual(CA.gamesFor('R0', Object.assign({ recent }, base)), whole * a0);
  }
  assert.strictEqual(CA.gamesFor('RIL', Object.assign({ recent: true }, base)), whole * a);
  assert.strictEqual(CA.gamesFor('RIL', Object.assign({ recent: false }, base)), 0);
});

test('gamesFor at n0 = inf: R equals G0 and RIL equals the old g/82 arm, bit for bit', () => {
  for (const g of [0, 12, 41, 60, 71, 82, 90]) for (const whole of [0, 2.5, 3.3333333333333335]) for (const recent of [true, false]) {
    const share = Math.min(1, g / 82), a = CA.rate(4, 9, g, Infinity), w = recent ? whole : 0, base = { recent, whole, share, a, a0: 0 };
    assert.ok(Object.is(CA.gamesFor('R', base), CA.gamesFor('G0', base)));
    assert.ok(Object.is(CA.gamesFor('RIL', base), w * share));
  }
});
