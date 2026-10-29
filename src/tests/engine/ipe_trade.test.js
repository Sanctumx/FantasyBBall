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
