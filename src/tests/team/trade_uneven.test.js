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
