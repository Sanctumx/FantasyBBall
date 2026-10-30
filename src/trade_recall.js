// Recall of the two trade searches against exact enumeration (#169, plan Task 11), on the fixture league at Oct 21.
//   2x2: every give-pair x every target pair of one team scored with evaluateTrade, against tradeCandidates2x2's screen (top 400).
//   2x1: every target weighted (keep = all), against the two stages for keep k in 5, 10, 15, 25.
// Usage: node src/trade_recall.js [--smoke]   (smoke = one give pair / one give). Writes src/results/trade_recall_<date>.json
'use strict';
const fs = require('fs'), path = require('path');
const I = require('./inseason_league.js'), Pl = require('./inseason_players.js'), M = require('./matchup_core.js'), T = require('./trade_core.js'), SV = require('./slot_value.js'), PLAYERS = require('./players.json');
const fx = n => require('./tests/fixtures/' + n), DAYS = require('./sched_days.json');
const L = I.parseLeague(fx('fx_league.json')), ROS = I.parseRosters(fx('fx_rosters.json'));
const pool = Pl.buildPool({ PLAYERS, fxPlayers: fx('fx_players.json'), espn: fx('espn_2025_26.json'), L, rosters: ROS });
const me = L.teams[0].id, ctx = M.makeCtx({ L, pool, DAYS, rosters: ROS, me, nowMs: Date.UTC(2026, 9, 21, 12) });
const smoke = process.argv.includes('--smoke'), OPT = { basis: 'total' }, FLOOR = 0.02;
const overlap = (a, b, n) => { const s = new Set(b.slice(0, n)); return a.slice(0, n).filter(x => s.has(x)).length; };
const top = (rows, n, f) => rows.slice().sort((x, y) => y.sortKey - x.sortKey).slice(0, n).map(f);
const out = { made: new Date().toISOString().slice(0, 10), smoke, fixture: 'Oct 21 2026, my team ' + me };

// ---- 2x2 ----
{
  const t0 = Date.now(), one = T.tradeCandidates(ctx, 'any', OPT), tOne = Date.now() - t0;
  const pairs = smoke ? T.givePairs(ctx, ctx.roster[me][0]).slice(0, 1) : T.givePairs(ctx, 'any'), exact = [];
  const t1 = Date.now();
  Object.keys(ctx.roster).forEach(t => {
    if (t === me) return;
    const ts = ctx.roster[t].slice().sort();
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) pairs.forEach(g => {
      const r = T.evaluateTrade(ctx, { a: me, b: t, aGets: [ts[i], ts[j]], bGets: g }, OPT);
      if (r.likelihood >= FLOOR && r.dA > 0) exact.push({ sortKey: r.dA, key: g.join('+') + '>' + ts[i] + '+' + ts[j] + '@' + t });
    });
  });
  const tExact = Date.now() - t1, t2 = Date.now();
  const rows = T.tradeCandidates2x2(ctx, smoke ? ctx.roster[me][0] : 'any', one, OPT, { top: 400, likFloor: FLOOR }), tScreen = Date.now() - t2;
  const key = r => r.gives.map(p => p.key).sort().join('+') + '>' + r.targets.map(p => p.key).sort().join('+') + '@' + r.team;
  const ex = top(exact, 25, r => r.key), sc = top(rows.filter(r => r.likelihood >= FLOOR && r.dA > 0), 25, key), exTop = new Set(ex), miss = ex.filter(k => !rows.some(r => key(r) === k));
  out.x22 = { exactCount: exact.length, screenRows: rows.length, top25Overlap: overlap(sc, ex, 25), top10Overlap: overlap(sc, ex, 10), missedTop25: miss.length,
    msOneRows: tOne, msExact: tExact, msScreenPlusScore: tScreen };
  console.log('2x2', JSON.stringify(out.x22));
}

// ---- 2x1 ----
{
  const pairs = smoke ? T.givePairs(ctx, ctx.roster[me][0]).slice(0, 1) : T.givePairs(ctx, 'any'), key = r => r.gives.map(p => p.key).sort().join('+') + '>' + r.targets[0].key + '@' + r.team;
  const run = keep => { const t0 = Date.now(), rows = []; pairs.forEach(p => T.candidates2x1ForPair(ctx, p, OPT, keep).forEach(r => rows.push(r))); return { rows, ms: Date.now() - t0 }; };
  const exact = run(1e9), ex = top(exact.rows, 25, key), res = { exactRows: exact.rows.length, msExact: exact.ms, byKeep: {} };
  [5, 10, 15, 25].forEach(k => { const g = run(k); res.byKeep[k] = { rows: g.rows.length, ms: g.ms, top25Overlap: overlap(top(g.rows, 25, key), ex, 25), top10Overlap: overlap(top(g.rows, 10, key), ex, 10) }; });
  out.x21 = res;
  console.log('2x1', JSON.stringify(res));
}

const file = path.join(__dirname, 'results', 'trade_recall_' + out.made + (smoke ? '_smoke' : '') + '.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('wrote', file);
