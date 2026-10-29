// In-season trade screen (idea 163): stream_sim hooks and the planning core
const test = require('node:test'), assert = require('node:assert');
const season = '2025-26';
const DATA = require('../../bt_data.json'), FIT = require('../../games_fit.json'), DAILY = require('../../bt_daily.json');
const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });   // as ipe_run.js
const { draft } = require('../../backtest.js'), { scoreLeague, initialCores } = require('../../stream_sim.js');
const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 3, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'light', order: '3rr', scoring: 'h2h', field: 'average', slideEngine: true, realAdp: true, proj: 'bbm', oppProj: 'bbm' };
const ro = draft(season, 4, 301, base, { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } });
const OPT = { seed: 301, target: true, il: 3, me: 3 };

test('initialCores is the core scoreLeague starts from: trading one of its players does not throw, a drafted bench player does', () => {
  const C = initialCores(season, ro);
  assert.strictEqual(C.length, 14); C.forEach((c, t) => { assert.strictEqual(c.length, ro[t].length - 2); c.forEach(x => assert.ok(ro[t].includes(x))); });
  const tr = [{ w: 3, me: 3, other: 5, give: [C[3][0]], get: [C[5][0]] }];
  assert.doesNotThrow(() => scoreLeague(season, ro, Object.assign({ trades: tr }, OPT)));
  const bench = ro[3].find(x => !C[3].includes(x));
  assert.throws(() => scoreLeague(season, ro, Object.assign({ trades: [{ w: 3, me: 3, other: 5, give: [bench], get: [C[5][0]] }] }, OPT)), /not in the core/);
});

test('a player on the IL cannot be traded away', () => {
  const C = initialCores(season, ro), daily = DAILY[season].daily;
  const idle = C.flatMap((c, t) => c.map(pid => [t, pid])).filter(([t, pid]) => !(daily[pid] || []).some(r => r[0] >= 7 && r[0] <= 20));
  if (!idle.length) return;   // nobody sat out weeks 2-3 in this draft
  let threw = false;
  for (const [t, pid] of idle) { if (t === 3) continue; try { scoreLeague(season, ro, Object.assign({ trades: [{ w: 3, me: 3, other: t, give: [C[3][0]], get: [pid] }] }, OPT)); } catch (e) { if (/IL/.test(e.message)) threw = true; } }
  assert.ok(threw, 'an idle player was traded without the IL guard firing');
});

const { simCtx } = require('../../ipe_trade_core.js'), TeamWin = require('../../team_win.js');
test('simCtx: the Team tab forecaster runs on the synthetic league and sees only games before the checkpoint', () => {
  const C = initialCores(season, ro), ctx = simCtx(season, 3, C, 3);
  assert.strictEqual(Object.keys(ctx.roster).length, 14); assert.strictEqual(ctx.me, '3');
  assert.strictEqual(ctx.cur, 4);   // week 3 (0-based) is period 4
  const lw = TeamWin.leagueWin(ctx, null, { rows: ['3'] });
  assert.ok(lw && lw.W > 12 && lw.W < 14.01, 'weeks left ' + (lw && lw.W));
  const row = lw.P[lw.ids.indexOf('3')].filter(x => x != null);
  assert.strictEqual(row.length, 13); row.forEach(x => assert.ok(x > 0 && x < 1));
  const p = ctx.pool.byKey.get(String(C[3][0]));
  assert.ok(p.actual.gp <= 21 && p.actual.gp > 0); assert.strictEqual(p.owner, '3');
});

const { offers, planTrades } = require('../../ipe_trade_core.js'), InPlayers = require('../../inseason_players.js');
const played = (pid, w) => (DAILY[season].daily[pid] || []).some(r => r[0] >= 7 * w - 7 && r[0] < 7 * w);
test('offers: K one-for-one or two-for-two swaps with distinct opponents, inside the value band, of players who just played', () => {
  const C = initialCores(season, ro), ctx = simCtx(season, 7, C, 3), z = k => { const p = ctx.pool.byKey.get(k); return InPlayers.valueZ(p.line, p.g, ctx.ref); };
  const o = offers(ctx, 301 * 100 + 7, 3);
  assert.strictEqual(o.length, 3); assert.strictEqual(new Set(o.map(x => x.other)).size, 3);
  o.forEach(x => {
    assert.ok(x.give.length === x.get.length && x.give.length >= 1 && x.give.length <= 2);
    x.give.forEach(k => { assert.ok(ctx.roster['3'].includes(k)); assert.ok(played(k, 7)); });
    x.get.forEach(k => { assert.ok(ctx.roster[x.other].includes(k)); assert.ok(played(k, 7)); });
    assert.ok(Math.abs(x.get.reduce((s, k) => s + z(k), 0) - x.give.reduce((s, k) => s + z(k), 0)) <= 0.5 + 1e-9);
    assert.notStrictEqual(x.other, '3');
  });
  assert.deepStrictEqual(offers(ctx, 301 * 100 + 7, 3), o);
  assert.notDeepStrictEqual(offers(ctx, 302 * 100 + 7, 3), o);
});

test('planTrades: valid opts.trades for every rule; z accepts only a positive z gain; the empty plan is the baseline', () => {
  const C = initialCores(season, ro), plain = scoreLeague(season, ro, OPT);
  assert.deepStrictEqual(scoreLeague(season, ro, Object.assign({ trades: [] }, OPT)).rates, plain.rates);
  for (const rule of ['winM', 'z', 'random', 'antiZ']) {
    const plan = planTrades(season, C, { rule, seed: 301, me: 3 });
    const ws = plan.trades.map(t => t.w);
    assert.ok(ws.every(w => [3, 7, 11].includes(w)) && new Set(ws).size === ws.length, rule + ' weeks ' + ws);
    plan.trades.forEach(t => { assert.strictEqual(t.me, 3); assert.ok(typeof t.other === 'number' && t.give.length === t.get.length); });
    assert.doesNotThrow(() => scoreLeague(season, ro, Object.assign({ trades: plan.trades }, OPT)), rule);
    if (rule === 'random' || rule === 'antiZ') assert.strictEqual(plan.trades.length, 3);
  }
  const zp = planTrades(season, C, { rule: 'z', seed: 301, me: 3 });
  zp.log.forEach(l => { if (l.pick) assert.ok(l.pick.zGain > 0); });
});

test('arm 72 (random) picks differently across seeds, not the same offer index every time', () => {
  const C = initialCores(season, ro), picks = new Set();
  for (let seed = 301; seed < 321; seed++) planTrades(season, C, { rule: 'random', seed, me: 3 }).log.forEach(l => picks.add(l.pick && l.pick.other + ':' + l.pick.give));
  assert.ok(picks.size > 20, 'only ' + picks.size + ' distinct picks in 60 checkpoints');
});

test('simCtx with a projection world uses the draft projections, not the prior-season lines', () => {
  const C = initialCores(season, ro), a = simCtx(season, 3, C, 3), b = simCtx(season, 3, C, 3, 'bbm');
  const diff = b.pool.players.filter(p => a.pool.byKey.get(p.key).line.pts !== p.line.pts).length;
  assert.ok(diff > 100, 'only ' + diff + ' lines changed');
});
