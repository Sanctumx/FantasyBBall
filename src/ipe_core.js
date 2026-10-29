// Model arms for the in-season prize-equity screens (ideas 161-163) and the gate arithmetic.
// The model arm ranks by expected category share against the rest of the league (the regular season is all-play, title_score
// rsMode 'each'), from Engine.pairMatchup on the backtest player lines. The baseline is stream_sim's own rule (value, then games).
// Both arms see the same lines and the same schedule (gamesIn). The shrink k cannot change a pick: it is monotone in each
// category, so the argmax is the same at any k; k is kept as a parameter only so the test can prove it.
const Engine = require('./engine.js');
const DATA = require('./bt_data.json');
const GVAR = 1.87;   // games variance per entry, as matchup_core.GVAR

function makeModel(season, { k = 1, cats = 9 } = {}) {
  const line = new Map(DATA[season].players.map(p => [p.pid, p]));
  const shrink = p => 0.5 + k * (p - 0.5);
  // games per player over days [s0, s1): played days, with the best `active` players by value counting on a crowded day
  function periodGames(roster, s0, s1, ctx) {
    const g = new Map(roster.map(pid => [pid, 0]));
    for (let d = s0; d < s1; d++) {
      const on = roster.filter(pid => ctx.gamesIn(pid, d, d + 1) > 0).sort((a, b) => ctx.val[b] - ctx.val[a]).slice(0, ctx.active);
      on.forEach(pid => g.set(pid, g.get(pid) + 1));
    }
    return g;
  }
  const entries = g => [...g].filter(([pid, n]) => n > 0 && line.has(pid)).map(([pid, n]) => ({ p: line.get(pid), games: n, gVar: GVAR }));
  // mean over opponents and categories of the (shrunk) category win chance
  function share(mine, opps) {
    let s = 0;
    for (const o of opps) { const r = Engine.pairMatchup(mine, o, { cats }); s += r.cat.slice(0, cats).reduce((a, p) => a + shrink(p), 0) / cats; }
    return s / opps.length;
  }
  const oppEntries = (ctx, s0, s1) => ctx.field.filter((_, i) => i !== ctx.t).map(core => entries(periodGames(core, s0, s1, ctx)));
  const poolKey = new WeakMap();   // ctx -> opponent entries, so every candidate of one pick shares them
  const opps = ctx => { if (!poolKey.has(ctx)) poolKey.set(ctx, oppEntries(ctx, ctx.s0, ctx.s1)); return poolKey.get(ctx); };

  // expected category share of ctx.roster plus candidate c for the period
  function scorePick(ctx, c) { return share(entries(periodGames(ctx.roster.concat([c]), ctx.s0, ctx.s1, ctx)), opps(ctx)); }
  function streamPick(ctx) {
    let best = ctx.baseline, bs = scorePick(ctx, best);
    for (const c of ctx.pool) { if (c === ctx.baseline) continue; const s = scorePick(ctx, c); if (s > bs + 1e-12) { bs = s; best = c; } }
    return best;
  }

  // lineup: rank the playing players by what the team loses without each one over the whole week (leave-one-out share)
  const weekCache = new Map();
  function lineupRank(ctx) {
    const key = ctx.t + '|' + ctx.d0 + '|' + ctx.roster.join(',');
    let probe = weekCache.get(key);
    if (!probe) {
      const g = new Map(ctx.roster.map(pid => [pid, ctx.gamesIn(pid, ctx.d0, ctx.d1)]));
      const O = oppEntries(Object.assign({}, ctx, { gamesIn: ctx.gamesIn }), ctx.d0, ctx.d1);
      const all = share(entries(g), O);
      probe = new Map();
      for (const pid of ctx.roster) { const h = new Map(g); h.set(pid, 0); probe.set(pid, all - share(entries(h), O)); }
      if (weekCache.size > 200) weekCache.clear();
      weekCache.set(key, probe);
    }
    return ctx.playing.slice().sort((a, b) => (probe.get(b) ?? 0) - (probe.get(a) ?? 0) || ctx.val[b] - ctx.val[a]);
  }
  return { streamPick, lineupRank, scorePick };
}

// Gate (fixed from the pilot before any screen result is read): T = min(0.5 SE of the paired estimator at n drafts, delta).
const gateT = (se1, n, delta) => Math.min(0.5 * se1 / Math.sqrt(n), delta);
// Run the full prize-equity simulation unless the upper bound of the screen's effect is below T. An interval that cannot
// exclude T is not "does not matter".
const decide = (upper, T) => upper >= T ? 'run' : 'does-not-matter';

module.exports = { makeModel, gateT, decide };
