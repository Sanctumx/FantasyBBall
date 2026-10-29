// In-season prize-equity screens (ideas 161-163): model arm pickers and gate arithmetic (src/ipe_core.js).
const test = require('node:test'), assert = require('node:assert');
const { scoreLeague } = require('../../stream_sim.js');
const DATA = require('../../bt_data.json');
const core = require('../../ipe_core.js');

const SEASON = '2025-26', ME = 3;
const pids = DATA[SEASON].players.map(p => p.pid);
const rosters = Array.from({ length: 14 }, (_, t) => Array.from({ length: 12 }, (_, i) => pids[i * 14 + t]));
const base = { seed: 5, target: true, il: 3, me: ME };

// Collect the first n contexts of a hook, answering with the baseline so the simulation is unchanged.
function collect(kind, n) {
  const got = [];
  const hook = ctx => { if (got.length < n) got.push(ctx); return kind === 'stream' ? ctx.baseline : null; };
  scoreLeague(SEASON, rosters, Object.assign({}, base, kind === 'stream' ? { streamPick: hook } : { lineupRank: hook }));
  return got;
}

test('stream pick is a pool member and never scores below the baseline pick', () => {
  const m = core.makeModel(SEASON, { k: 1 });
  const got = collect('stream', 4);
  assert.strictEqual(got.length, 4);
  for (const ctx of got) {
    const pick = m.streamPick(ctx);
    assert.ok(ctx.pool.includes(pick));
    assert.ok(m.scorePick(ctx, pick) >= m.scorePick(ctx, ctx.baseline) - 1e-12);
  }
});

test('stream pick is the same at k .5, .72 and 1 (the shrink is monotone)', () => {
  const ms = [0.5, 0.72, 1].map(k => core.makeModel(SEASON, { k }));
  for (const ctx of collect('stream', 4)) {
    const picks = ms.map(m => m.streamPick(ctx));
    assert.strictEqual(picks[0], picks[1]); assert.strictEqual(picks[1], picks[2]);
  }
});

test('lineup rank is a permutation of the playing players and k-invariant', () => {
  const ms = [0.5, 1].map(k => core.makeModel(SEASON, { k }));
  let seen = 0;
  for (const ctx of collect('lineup', 400)) {
    const a = ms[0].lineupRank(ctx), b = ms[1].lineupRank(ctx);
    assert.deepStrictEqual(a.slice().sort(), ctx.playing.slice().sort());
    assert.deepStrictEqual(a, b); seen++;
  }
  assert.ok(seen > 0);
});

test('a model arm run completes and the placebo-style null returns identical rows', () => {
  const plain = JSON.stringify(scoreLeague(SEASON, rosters, Object.assign({}, base, { me: undefined })));
  const nullArm = JSON.stringify(scoreLeague(SEASON, rosters, Object.assign({}, base, { streamPick: c => c.baseline, lineupRank: () => null })));
  assert.strictEqual(nullArm, plain);
});

test('gate: threshold is the smaller of half an SE and delta', () => {
  assert.strictEqual(core.gateT(0.4, 100, 0.3), 0.02);
  assert.strictEqual(core.gateT(4, 4, 0.3), 0.3);
});

test('gate: run the full simulation unless the upper bound is under the threshold', () => {
  assert.strictEqual(core.decide(0.05, 0.02), 'run');
  assert.strictEqual(core.decide(0.02, 0.02), 'run');
  assert.strictEqual(core.decide(0.01, 0.02), 'does-not-matter');
});
