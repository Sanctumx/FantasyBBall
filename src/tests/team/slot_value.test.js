// Slot value (#169): week weights, profile lookup and the slot term for uneven trades.
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), W = require('../../team_win.js'), SV = require('../../slot_value.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2026, 9, 21, 12) });
const per = W.periodsLeft(ctx, 'all'), sum = a => a.reduce((s, x) => s + x, 0), DAY = 864e5;
const flat = { delta: 1, playoff: 1 };
const constant = c => ({ weeks: [{ w: 1, s: c, s14: c }, { w: 40, s: c, s14: c }] });
const ramp = { weeks: Array.from({ length: 40 }, (_, i) => ({ w: i + 1, s: i + 1, s14: 100 + i + 1 })) };

test('weights sum to 1 and a flat curve gives w proportional to phi', () => {
  const w = SV.weights(ctx, flat);
  assert.strictEqual(w.length, per.length);
  assert.ok(Math.abs(sum(w.map(x => x.w)) - 1) < 1e-12);
  const tot = sum(per.map(p => p.phi));
  w.forEach((x, i) => assert.ok(Math.abs(x.w - per[i].phi / tot) < 1e-12));
});

test('delta 0.9 gives decreasing regular weights; playoff 3 triples the playoff/regular ratio', () => {
  const d = SV.weights(ctx, { delta: 0.9, playoff: 1 }), idx = per.map((p, i) => i).filter(i => !per[i].playoff && per[i].phi === 1);
  for (let i = 1; i < idx.length; i++) assert.ok(d[idx[i]].w < d[idx[i - 1]].w);
  const a = SV.weights(ctx, flat), b = SV.weights(ctx, { delta: 1, playoff: 3 }), i0 = per.findIndex(p => p.playoff), j0 = idx[0];
  assert.ok(Math.abs(b[i0].w / b[j0].w - 3 * a[i0].w / a[j0].w) < 1e-12);
});

test('a constant profile gives slotTerm = the constant', () => {
  assert.ok(Math.abs(SV.slotTerm(ctx, flat, constant(0.7)) - 0.7) < 1e-12);
});

test('a profile s(w) = w gives the hand-computed term; 14-day periods read s14', () => {
  const w = SV.weights(ctx, flat), t0 = ctx.L.periods[0].start;
  let want = 0;
  w.forEach((x, i) => {
    const p = per[i], long = p.to - p.from > 8 * DAY;
    const wk = long ? 1 + Math.floor((p.from - t0) / (7 * DAY)) : 1 + Math.floor(((p.from + p.to) / 2 - t0) / (7 * DAY));
    want += x.w * (long ? 100 + wk : wk);
  });
  assert.ok(per.some(p => p.to - p.from > 8 * DAY), 'fixture has 14-day periods');
  assert.ok(Math.abs(SV.slotTerm(ctx, flat, ramp) - want) < 1e-9);
});

test('shipped constants (analyst gate 2): approach 1, slot 0.70 / 0.83 on every week, flat curve, keep 5, slot not in the sort', () => {
  assert.strictEqual(SV.APPROACH, 1);
  assert.strictEqual(SV.SLOT_IN_SORT, false);
  assert.strictEqual(SV.KEEP_2X1, 5);
  assert.deepStrictEqual(SV.CURVE, { delta: 1, playoff: 1 });
  assert.strictEqual(SV.PROFILE.form, 'constant');
  per.forEach(p => assert.strictEqual(SV.slotOfPeriod(ctx, p), p.to - p.from > 8 * DAY ? 0.83 : 0.7));
});

test('SIG changes with the curve', () => {
  assert.notStrictEqual(SV.sig(flat), SV.sig({ delta: 0.9, playoff: 1 }));
  assert.strictEqual(SV.SIG, SV.sig(SV.CURVE));
});
