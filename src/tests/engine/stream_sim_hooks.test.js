// In-season prize-equity hooks (idea 161-163): opts.me, opts.streamPick, opts.lineupRank, opts.trades.
// With the hooks absent or returning the baseline, scoreLeague must be byte-identical.
const test = require('node:test'), assert = require('node:assert');
const { scoreLeague } = require('../../stream_sim.js');
const DATA = require('../../bt_data.json');

const SEASON = '2025-26', ME = 3, OTHER = 8;
const pids = DATA[SEASON].players.map(p => p.pid);
const rosters = Array.from({ length: 14 }, (_, t) => Array.from({ length: 12 }, (_, i) => pids[i * 14 + t]));
const base = { seed: 5, target: true, il: 3 };
const run = o => scoreLeague(SEASON, rosters, Object.assign({}, base, o));
const json = x => JSON.stringify(x);

test('null hooks give byte-identical output', () => {
  const plain = json(run({}));
  assert.strictEqual(json(run({ me: ME })), plain);
  assert.strictEqual(json(run({ me: ME, streamPick: ctx => ctx.baseline, lineupRank: () => null })), plain);
});

test('hooks are called for team me only', () => {
  const seen = new Set(), seenL = new Set();
  run({ me: ME, streamPick: ctx => { seen.add(ctx.t); return ctx.baseline; }, lineupRank: ctx => { seenL.add(ctx.t); return null; } });
  assert.deepStrictEqual([...seen], [ME]);
  assert.deepStrictEqual([...seenL], [ME]);
});

test('streamPick context carries the pool and the baseline pick', () => {
  let ctx0 = null;
  run({ me: ME, streamPick: ctx => { ctx0 = ctx0 || ctx; return ctx.baseline; } });
  assert.ok(Array.isArray(ctx0.pool) && ctx0.pool.length > 0 && ctx0.pool.length <= 15);
  assert.ok(ctx0.pool.includes(ctx0.baseline));
  for (const k of ['t', 'w', 'h', 's0', 's1', 'roster', 'val', 'gamesIn', 'field', 'active']) assert.ok(k in ctx0, k);
  assert.strictEqual(ctx0.field.length, 14);
  assert.strictEqual(ctx0.active, 10);
});

test('lineupRank context carries the field and the active cap', () => {
  let c0 = null;
  run({ me: ME, lineupRank: ctx => { c0 = c0 || ctx; return null; } });
  assert.strictEqual(c0.field.length, 14);
  assert.strictEqual(c0.active, 10);
  assert.ok(typeof c0.gamesIn === 'function');
});

test('a different streamPick changes me and is applied', () => {
  const plain = run({ me: ME });
  const worst = run({ me: ME, streamPick: ctx => ctx.pool[ctx.pool.length - 1] });
  assert.notStrictEqual(json(worst.weekTot[ME]), json(plain.weekTot[ME]));
});

test('lineupRank order replaces the value order for me', () => {
  const plain = run({ me: ME });
  const reversed = run({ me: ME, lineupRank: ctx => ctx.playing.slice().sort((a, b) => ctx.val[a] - ctx.val[b]) });
  assert.notStrictEqual(json(reversed.weekTot[ME]), json(plain.weekTot[ME]));
});

test('a week-0 trade of two core players equals the swapped draft', () => {
  const best = ro => ro.slice().sort((a, b) => (valOf(b) - valOf(a)))[0];
  const probe = {};
  run({ me: ME, streamPick: ctx => { probe.val = ctx.val; return ctx.baseline; } });
  const valOf = p => probe.val[p];
  const give = best(rosters[ME]), get = best(rosters[OTHER]);
  const swapped = rosters.map(ro => ro.map(p => p === give ? get : p === get ? give : p));
  const viaDraft = json(scoreLeague(SEASON, swapped, base));
  const viaTrade = json(run({ me: ME, trades: [{ w: 0, other: OTHER, give: [give], get: [get] }] }));
  assert.strictEqual(viaTrade, viaDraft);
});
