// Trade core (2026-10-20): rest-of-season Win M for a roster change, perceived player value and trade likelihood.
// Pure; browser and Node. Builds on matchup_core (a team's week vs its real opponent) and inseason_players (value scale).
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Matchup = root.Matchup || require('./matchup_core.js');

  const TRADE_W = { cur: 0.4, proj: 0.3, adp: 0.3, shrinkGames: 20, slope: 2.0, winM: 0.1, tagGap: 0.5 };

  // mean Win M over the remaining regular-season matchups with the rosters as given (fids per team, IR rule as in the current week)
  function rosWinM(ctx, roster, teamId) {
    if (ctx.cur == null) return { mean: null, periods: [] };
    const segs = (t, n) => Matchup.teamSegments(ctx, t, n, roster[t].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR'));
    const periods = [];
    InLeague.regularFrom(ctx.L, ctx.cur).forEach(n => {
      const opp = InLeague.opponentOf(ctx.L, teamId, n);
      if (opp) periods.push({ n, opp, p: Matchup.scoreSegments(ctx, segs(teamId, n), segs(opp, n)).match });
    });
    return { mean: periods.length ? periods.reduce((s, x) => s + x.p, 0) / periods.length : null, periods };
  }

  // projected players' values, best first (the ADP-implied value of a rank)
  function projValues(ctx) {
    if (!ctx._projVals) ctx._projVals = ctx.pool.players.filter(p => p.src === 'proj').map(p => InPlayers.valueZ(p.line, p.g, ctx.ref)).sort((a, b) => b - a);
    return ctx._projVals;
  }
  function perceived(ctx, pp) {
    const proj = InPlayers.valueZ(pp.line, pp.g, ctx.ref), cur = InPlayers.valueZ(InPlayers.curLine(pp, TRADE_W.shrinkGames), pp.g, ctx.ref);
    const vals = projValues(ctx), rank = Math.max(1, Math.min(vals.length, Math.round(pp.adp == null ? 168 : pp.adp)));
    const adp = vals[rank - 1];
    return { cur, proj, adp, pv: TRADE_W.cur * cur + TRADE_W.proj * proj + TRADE_W.adp * adp, rv: proj };
  }

  function baseline(ctx, t) {
    ctx._ros = ctx._ros || {};
    return ctx._ros[t] === undefined ? (ctx._ros[t] = rosWinM(ctx, ctx.roster, t).mean) : ctx._ros[t];
  }
  // aGets: fids A receives from B; bGets: fids B receives from A. dA, dB in percentage points of rest-of-season Win M.
  function evaluateTrade(ctx, { a, b, aGets, bGets }) {
    if (a === b) throw new Error('A trade needs two different teams');
    const ra = new Set(ctx.roster[a]), rb = new Set(ctx.roster[b]);
    aGets.forEach(f => { if (!rb.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); if (bGets.includes(f)) throw new Error('Player ' + f + ' is on both sides'); });
    bGets.forEach(f => { if (!ra.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); });
    const R = Object.assign({}, ctx.roster);
    R[a] = ctx.roster[a].filter(f => !bGets.includes(f)).concat(aGets);
    R[b] = ctx.roster[b].filter(f => !aGets.includes(f)).concat(bGets);
    const mean = t => rosWinM(ctx, R, t).mean;
    const dA = 100 * (mean(a) - baseline(ctx, a)), dB = 100 * (mean(b) - baseline(ctx, b));
    const pvSum = fs => fs.reduce((s, f) => s + perceived(ctx, ctx.pool.byKey.get(f)).pv, 0);
    const gapB = pvSum(bGets) - pvSum(aGets);
    return { dA, dB, total: dA + dB, likelihood: 1 / (1 + Math.exp(-(TRADE_W.slope * gapB + TRADE_W.winM * dB))), gapB, multi: aGets.length !== bGets.length };
  }

  const api = { TRADE_W, rosWinM, perceived, evaluateTrade };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trade = api;
})(this);
