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
    // rest-of-season matchups are cached per (team, the two changed rosters)
    const sig = t => R[t].slice().sort().join(','), cache = ctx._rosCache = ctx._rosCache || new Map(), sab = sig(a) + '|' + sig(b);
    const mean = t => { const k = t + '#' + sab; if (!cache.has(k)) cache.set(k, rosWinM(ctx, R, t).mean); return cache.get(k); };
    const dA = 100 * (mean(a) - baseline(ctx, a)), dB = 100 * (mean(b) - baseline(ctx, b));
    const pvSum = fs => fs.reduce((s, f) => s + perceived(ctx, ctx.pool.byKey.get(f)).pv, 0);
    const gapB = pvSum(bGets) - pvSum(aGets);
    return { dA, dB, total: dA + dB, likelihood: 1 / (1 + Math.exp(-(TRADE_W.slope * gapB + TRADE_W.winM * dB))), gapB, multi: aGets.length !== bGets.length };
  }

  // ---- finder ----
  const oneForOne = (ctx, give, target, team) => {
    const r = evaluateTrade(ctx, { a: ctx.me, b: team, aGets: [target.key], bGets: [give.key] }), v = perceived(ctx, target);
    return { give, target, team, likelihood: r.likelihood, dA: r.dA, dB: r.dB, total: r.total, buyLow: v.rv - v.pv >= TRADE_W.tagGap };
  };
  const byValue = (a, b) => b.dA * b.likelihood - a.dA * a.likelihood;
  // every one-for-one trade that helps me for one of my players (myKey), unfiltered; 'any' offers each of my players
  function tradeCandidates(ctx, myKey) {
    const gives = myKey === 'any' ? ctx.roster[ctx.me] : [myKey], rows = [];
    gives.forEach(g => {
      const give = ctx.pool.byKey.get(g);
      Object.keys(ctx.roster).forEach(t => {
        if (t === ctx.me) return;
        ctx.roster[t].forEach(f => { const r = oneForOne(ctx, give, ctx.pool.byKey.get(f), t); if (r.dA > 0) rows.push(r); });
      });
    });
    return rows;
  }
  // minLikelihood is 0-1; minDA and minDB are Win M points. The filters run before the limit.
  function filterTrades(rows, { limit = 25, minLikelihood = 0, minDA = 0, minDB = -Infinity } = {}) {
    return rows.filter(r => r.likelihood >= minLikelihood && r.dA >= minDA && r.dB >= minDB).sort(byValue).slice(0, limit);
  }
  // Text box input. Likelihood: "50%", "0.5" or "50" (above 1 means percent; a bare 1 is 100%). Win M points: "2", "2%".
  // Blank is no limit (null); anything else that is not a number is invalid (undefined).
  function parseFilter(kind, text) {
    const t = String(text == null ? '' : text).trim().toLowerCase();
    if (t === '' || t === 'any') return null;
    const m = /^(-?\d*\.?\d+)\s*(%|pts?|points?)?$/.exec(t);
    if (!m) return undefined;
    const v = parseFloat(m[1]);
    if (kind === 'lik') { const f = m[2] === '%' || v > 1 ? v / 100 : v; return f >= 0 && f <= 1 ? f : undefined; }
    return v;
  }
  const findTrades = (ctx, myKey, opts) => filterTrades(tradeCandidates(ctx, myKey), opts);
  function sellHighBuyLow(ctx, { limit = 8, targets = 3 } = {}) {
    const tag = (pp, sign) => { const v = perceived(ctx, pp); return { player: pp, gap: sign * (v.pv - v.rv) }; };
    const mine = ctx.roster[ctx.me].map(f => tag(ctx.pool.byKey.get(f), 1)).filter(x => x.gap >= TRADE_W.tagGap).sort((a, b) => b.gap - a.gap).slice(0, limit);
    const sellHigh = mine.map(x => ({ player: x.player, gap: x.gap, trades: findTrades(ctx, x.player.key, { limit: targets }) }));
    const theirs = [];
    Object.keys(ctx.roster).forEach(t => { if (t !== ctx.me) ctx.roster[t].forEach(f => { const x = tag(ctx.pool.byKey.get(f), -1); if (x.gap >= TRADE_W.tagGap) theirs.push(Object.assign(x, { team: t })); }); });
    const buyLow = theirs.sort((a, b) => b.gap - a.gap).slice(0, limit).map(x => ({
      player: x.player, gap: x.gap,
      trades: ctx.roster[ctx.me].map(f => oneForOne(ctx, ctx.pool.byKey.get(f), x.player, x.team)).filter(r => r.dA > 0).sort(byValue).slice(0, targets)
    }));
    return { sellHigh, buyLow };
  }

  const api = { TRADE_W, rosWinM, perceived, evaluateTrade, tradeCandidates, filterTrades, parseFilter, findTrades, sellHighBuyLow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trade = api;
})(this);
