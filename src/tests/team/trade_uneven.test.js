// Uneven trades (#169): evaluateTrade with a pickup (aAdds), the 2x1 breakdown, the slot term and B's drop in the likelihood.
const test = require('node:test'), assert = require('node:assert');
const I = require('../../inseason_league.js'), Pl = require('../../inseason_players.js'), M = require('../../matchup_core.js'), T = require('../../trade_core.js'), TW = require('../../team_win.js'), SV = require('../../slot_value.js'), PLAYERS = require('../../players.json');
const fx = n => require('../fixtures/' + n), DAYS = require('../../sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, other = L.teams[1].id, NOW = Date.UTC(2026, 9, 21, 12);
const ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: NOW });
const nonIR = t => ctx.roster[t].filter(f => pool.byKey.get(f).slot !== 'IR'), il = t => ctx.roster[t].filter(f => pool.byKey.get(f).slot === 'IR');
const vz = f => { const p = pool.byKey.get(f); return Pl.valueZ(p.line, p.g, ctx.ref); };
const fas = pool.players.filter(p => !p.owner).map(p => p.key).sort((a, b) => vz(b) - vz(a));
const mine = nonIR(me).sort((a, b) => vz(a) - vz(b)), theirs = nonIR(other).sort((a, b) => vz(b) - vz(a));
const give2 = [mine[0], mine[1]], target = theirs[0], f = fas[0];
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const trade = (extra, o) => T.evaluateTrade(ctx, Object.assign({ a: me, b: other, aGets: [target], bGets: give2, aAdds: [f] }, extra), o);
const OPT = { basis: 'total' };

test('1x1 with a B drop keeps today\'s likelihood (no decision 2 on even trades)', () => {
  const ilKey = il(other)[0];
  if (!ilKey) return;
  const r = T.evaluateTrade(ctx, { a: me, b: other, aGets: [ilKey], bGets: [mine[0]] });
  const pv = fs => fs.reduce((s, k) => s + T.perceived(ctx, pool.byKey.get(k), other).pv, 0);
  const gap = pv([mine[0]]) - pv([ilKey]);
  assert.ok(near(r.gapB, gap));
});

test('2x1 likelihood subtracts B\'s drop', () => {
  const r = trade({ aAdds: [] });
  assert.ok(r.multi);
  const pv = fs => fs.reduce((s, k) => s + T.perceived(ctx, pool.byKey.get(k), other).pv, 0);
  const want = pv(give2) - pv([target]) - pv(r.drops[other]);
  assert.strictEqual(r.drops[other].length, 1, 'B is at the limit, receiving 2 for 1 forces one drop');
  assert.ok(near(r.gapB, want));
  assert.ok(near(r.likelihood, 1 / (1 + Math.exp(-(T.TRADE_W.slope * r.gapB + T.TRADE_W.winM * r.dB + T.TRADE_W.bias)))));
});

test('aAdds owned throws "is not a free agent"', () => {
  assert.throws(() => trade({ aAdds: [theirs[1]] }), /is not a free agent/);
});

test('approach 2 telescopes: dAPlayer + dAPickup = 100 (M(R_T) - M(R0)) and dA = dAPlayer + slot + dAPickup', () => {
  const r = trade({}, OPT);
  const R = Object.assign({}, ctx.roster, { [me]: ctx.roster[me].filter(k => !give2.includes(k)).concat([target, f]), [other]: ctx.roster[other].filter(k => k !== target).concat(give2) });
  const R0 = r.drops[other].length ? R : R;
  R0[other] = R0[other].filter(k => !r.drops[other].includes(k));
  const m = (RR) => { const w = SV.weights(ctx, SV.CURVE), lw = TW.leagueWinByPeriod(ctx, RR, { rows: [me], basis: 'total' }), i = lw.ids.indexOf(me);
    return lw.periods.reduce((s, p, k) => s + w[k].w * (p.P[i].filter(x => x != null).reduce((a, b) => a + b, 0) / (lw.ids.length - 1)), 0); };
  assert.ok(near(r.dAPlayer + r.dAPickup, 100 * (m(R0) - m(ctx.roster)), 1e-7));
  assert.ok(near(r.dA, r.dAPlayer + r.slot + r.dAPickup));
});

test('approach 1: dAPlayer + dAPickup is the plain rosMeans change', () => {
  const r = trade({}, Object.assign({ approach: 1 }, OPT)), plain = trade({}, Object.assign({ approach: 1 }, OPT));
  const R = Object.assign({}, ctx.roster, { [me]: ctx.roster[me].filter(k => !give2.includes(k)).concat([target, f]), [other]: ctx.roster[other].filter(k => k !== target).concat(give2).filter(k => !r.drops[other].includes(k)) });
  const after = T.rosMeans(ctx, R, [me], OPT)[me].mean, base = T.rosMeans(ctx, ctx.roster, [me], OPT)[me].mean;
  assert.ok(near(r.dAPlayer + r.dAPickup, 100 * (after - base), 1e-7));
  assert.deepStrictEqual(plain.dA, r.dA);
});

test('IL give frees nothing: slot 0 and freed false', () => {
  const ilKey = il(me)[0], r = trade({ bGets: [ilKey, mine[0]], aGets: [target] });
  assert.strictEqual(r.freed, false);
  assert.strictEqual(r.slot, 0);
});

test('slot equals SlotValue.slotTerm when a slot is freed; sortKey = dAPlayer, plus slot with slotInSort', () => {
  const r = trade({}, OPT);
  assert.strictEqual(r.freed, true);
  assert.ok(near(r.slot, SV.slotTerm(ctx, SV.CURVE)));
  assert.ok(near(r.sortKey, r.dAPlayer));
  const s = trade({}, Object.assign({ slotInSort: true }, OPT));
  assert.ok(near(s.sortKey, s.dAPlayer + s.slot));
});

test('even trades ignore approach: a 1x1 gives the same dA as plain', () => {
  const a = T.evaluateTrade(ctx, { a: me, b: other, aGets: [target], bGets: [mine[0]] }, OPT), b = T.evaluateTrade(ctx, { a: me, b: other, aGets: [target], bGets: [mine[0]] }, Object.assign({ approach: 2 }, OPT));
  assert.deepStrictEqual(a.dA, b.dA);
  assert.strictEqual(a.sortKey, a.dA);
});

test('a pickup worse than my worst: dAPickup is 0', () => {
  const worst = fas[fas.length - 1], r = T.evaluateTrade(ctx, { a: me, b: other, aGets: [target], bGets: [mine[0]], aAdds: [worst] }, OPT);
  assert.ok(near(r.dAPickup, 0, 1e-9));
});

// ---- tradeCandidates2x1 ----
const pairOf = ks => ks.slice().sort();
const isFAWW = p => !p.owner && (p.fxStatus === 'FA' || p.fxStatus === 'WW');

test('pickupShortlist: free agents and waivers, not out, best first', () => {
  const s = T.pickupShortlist(ctx, 10);
  assert.strictEqual(s.length, 10);
  assert.ok(s.every(p => isFAWW(p) && !ctx.out.has(p.key)));
  for (let i = 1; i < s.length; i++) assert.ok(vz(s[i - 1].key) >= vz(s[i].key));
  assert.strictEqual(T.isWaiver({ fxStatus: 'WW' }), true);
  assert.strictEqual(T.isWaiver({ fxStatus: 'FA' }), false);
});

test('givePairs: all pairs of my roster, or only those with the one give', () => {
  const n = ctx.roster[me].length;
  assert.strictEqual(T.givePairs(ctx, 'any').length, n * (n - 1) / 2);
  const g = T.givePairs(ctx, mine[0]);
  assert.strictEqual(g.length, n - 1);
  assert.ok(g.every(p => p.includes(mine[0]) && p[0] < p[1]));
});

test('candidates2x1ForPair: rows are mine/theirs, match evaluateTrade, at most keep, pickup is the argmax', () => {
  const pair = pairOf(give2), rows = T.candidates2x1ForPair(ctx, pair, OPT, 3);
  assert.ok(rows.length > 0 && rows.length <= 3 * (Object.keys(ctx.roster).length - 1));
  rows.forEach((r, i) => {
    assert.strictEqual(r.type, '2x1');
    assert.deepStrictEqual(r.gives.map(p => p.key).sort(), pair);
    assert.ok(ctx.roster[r.team].includes(r.targets[0].key));
    assert.ok(isFAWW(r.pickup) && !ctx.out.has(r.pickup.key));
    const e = T.evaluateTrade(ctx, { a: me, b: r.team, aGets: [r.targets[0].key], bGets: pair, aAdds: [r.pickup.key] }, OPT);
    ['dA', 'dB', 'likelihood', 'dAPlayer', 'dAPickup', 'slot', 'sortKey'].forEach(k => assert.ok(near(r[k], e[k]), k));
    if (i) assert.ok(rows[i - 1].sortKey >= r.sortKey);
  });
  const best = T.pickupShortlist(ctx, 10).map(p => ({ k: p.key, m: T.rosMeans(ctx, Object.assign({}, ctx.roster, { [me]: ctx.roster[me].filter(k => !pair.includes(k)).concat([p.key]) }), [me], OPT)[me].mean })).sort((x, y) => y.m - x.m)[0];
  assert.strictEqual(rows[0].pickup.key, best.k);
});

test('candidates2x1ForPair: a pair that frees no slot has no pickup and slot 0', () => {
  const ilKey = il(me)[0], rows = T.candidates2x1ForPair(ctx, pairOf([ilKey, mine[0]]), OPT, 2);
  assert.ok(rows.length > 0 && rows.every(r => r.pickup === null && r.slot === 0));
});

test('tradeCandidates2x1: one give covers every pair that holds it', () => {
  const rows = T.tradeCandidates2x1(ctx, mine[0], OPT);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.gives.some(p => p.key === mine[0])));
});

// ---- tradeCandidates2x2 ----
test('tradeCandidates2x2: exact plain rows, both targets from one team, capped, one give only, input untouched', () => {
  const one = T.tradeCandidates(ctx, 'any', OPT), snap = JSON.stringify(one.map(r => [r.give.key, r.target.key, r.dA, r.dB, r.likelihood]));
  const rows = T.tradeCandidates2x2(ctx, 'any', one, OPT, { top: 12 });
  assert.ok(rows.length > 0 && rows.length <= 12);
  rows.forEach((r, i) => {
    assert.strictEqual(r.type, '2x2');
    assert.strictEqual(r.gives.length, 2); assert.strictEqual(r.targets.length, 2);
    assert.ok(r.targets.every(p => ctx.roster[r.team].includes(p.key)));
    const e = T.evaluateTrade(ctx, { a: me, b: r.team, aGets: r.targets.map(p => p.key), bGets: r.gives.map(p => p.key) }, OPT);
    ['dA', 'dB', 'likelihood'].forEach(k => assert.ok(near(r[k], e[k]), k));
    assert.strictEqual(r.sortKey, r.dA); assert.strictEqual(r.pickup, null);
    if (i) assert.ok(rows[i - 1].sortKey >= r.sortKey);
  });
  const one1 = T.tradeCandidates2x2(ctx, mine[0], one, OPT, { top: 12 });
  assert.ok(one1.length > 0 && one1.every(r => r.gives.some(p => p.key === mine[0])));
  assert.strictEqual(JSON.stringify(one.map(r => [r.give.key, r.target.key, r.dA, r.dB, r.likelihood])), snap);
});

test('2x1 with no free agent: pickup null, slot 0; no periods left: empty list', () => {
  const owned = Object.assign({}, ROS), none = M.makeCtx({ L, pool: Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS }), DAYS, rosters: ROS, me, nowMs: NOW });
  none.pool.players.forEach(p => { if (!p.owner) p.fxStatus = 'T'; });
  const rows = T.candidates2x1ForPair(none, pairOf(give2), OPT, 2);
  assert.ok(rows.length > 0 && rows.every(r => r.pickup === null && r.slot === 0));
  const late = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2027, 5, 1) });
  assert.deepStrictEqual(T.tradeCandidates2x1(late, 'any', OPT), []);
});
