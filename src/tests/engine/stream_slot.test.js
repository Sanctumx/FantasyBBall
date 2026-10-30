const test = require('node:test'), assert = require('node:assert/strict');
const { scoreLeague, weekShares, blockShares } = require('../../stream_sim.js');
const D = require('../../bt_data.json');
const SEASON = '2025-26';
// deterministic rosters: first 168 pids (sorted), shuffled with a fixed LCG (seed 3), dealt 12 each to 14 teams
function dealt() {
  let s = 3; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pids = D[SEASON].players.map(p => p.pid).sort((a, b) => a < b ? -1 : 1).slice(0, 168);
  pids.sort(() => r() - 0.5);
  return Array.from({ length: 14 }, (_, t) => pids.slice(t * 12, t * 12 + 12));
}
const SNAP = [0.29384615384615387, 0.4430769230769231, 0.23846153846153847, 0.46923076923076923, 0.6784615384615384, 0.2953846153846154, 0.6676923076923077, 0.6076923076923076, 0.6723076923076923, 0.20923076923076922, 0.6492307692307693, 0.4276923076923077, 0.6215384615384615, 0.7261538461538461];
const base = { seed: 5, target: true };

test('no slotArm: rates equal SNAP exactly', () => {
  assert.deepStrictEqual(scoreLeague(SEASON, dealt(), base).rates, SNAP);
});

test('weekShares averages to rates', () => {
  const res = scoreLeague(SEASON, dealt(), base), ws = weekShares(res.weekTot);
  res.rates.forEach((rate, t) => {
    const v = ws[t].filter(x => x != null);
    assert.ok(Math.abs(v.reduce((a, x) => a + x, 0) / v.length - rate) < 1e-12);
  });
  assert.equal(ws[0].length, res.weekTot[0].length);
});

test('blockShares of size 2 start at every week but the last', () => {
  const res = scoreLeague(SEASON, dealt(), base), bs = blockShares(res.weekTot, 2);
  assert.equal(bs[0].length, res.weekTot[0].length - 1);
  for (let w = 0; w < bs[0].length; w++) assert.ok(bs.reduce((a, t) => a + t[w], 0) > 0);
});

test('static arm holds one pid every week >= from', () => {
  const log = [], from = 3;
  scoreLeague(SEASON, dealt(), { ...base, slotArm: { team: 6, mode: 'static', from, adds: 4, log } });
  const rows = log.filter(x => x.w >= from);
  assert.ok(rows.length > 10);
  const pick = rows[0].pickup;
  assert.ok(pick != null);
  rows.forEach(x => { assert.equal(x.pickup, pick); assert.ok(x.rosters.every(ro => ro.includes(pick))); assert.equal(x.core, 9); });
  assert.ok(log.filter(x => x.w < from).every(x => x.pickup == null && x.core === 10));
});

test('stream arm has core 9 + 3 stream spots for the team', () => {
  const log = [], from = 1;
  scoreLeague(SEASON, dealt(), { ...base, slotArm: { team: 2, mode: 'stream', from, adds: 4, log } });
  const rows = log.filter(x => x.w >= from);
  assert.ok(rows.length > 10);
  rows.forEach(x => { assert.equal(x.core, 9); assert.equal(x.streamSlots, 3); assert.equal(x.pickup, null); });
  assert.ok(log.filter(x => x.w < from).every(x => x.core === 10 && x.streamSlots === 2));
});

test('arms are identical to the default before week from (V1)', () => {
  const a = scoreLeague(SEASON, dealt(), base), b = scoreLeague(SEASON, dealt(), { ...base, slotArm: { team: 4, mode: 'stream', from: 1, adds: 4 } });
  assert.deepStrictEqual(b.weekTot.map(t => t[0]), a.weekTot.map(t => t[0]));
});
