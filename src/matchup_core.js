// Weekly Matchup Analyzer core (2026-10-20): projects a team's matchup week from expected games, and ranks single waiver adds.
// Pure; browser and Node. Chances come from Engine.pairMatchup with games variance GVAR on every entry, shrunk toward 0.5
// (calibrated on 2024-26 weeks, src/calib_pair.js; refit k on in-season projections).
(function (root) {
  'use strict';
  const Engine = root.Engine || require('./engine.js'), InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js');

  const GVAR = 1.87, K_MATCH = 0.72, K_CAT = 0.82;
  const shrink = (p, k) => p == null ? p : 0.5 + k * (p - 0.5);

  const periodOf = (L, n) => L.periods.find(p => p.n === n);

  function makeCtx({ L, pool, DAYS, rosters, me, nowMs, ref }) {
    const roster = {};
    Object.keys(rosters).forEach(t => { roster[t] = rosters[t].map(x => x.fid); });
    const projected = pool.players.filter(p => p.src === 'proj');
    return { L, pool, DAYS, me, nowMs, cur: InLeague.currentPeriod(L, nowMs), ref: ref || InPlayers.makeValueRef(projected.map(p => ({ adp: p.adp, g: p.g, line: p.line }))), roster };
  }

  // whole-period window; IR players sit out only in the current period
  function teamSegments(ctx, teamId, n, keys) {
    const per = periodOf(ctx.L, n), list = keys || ctx.roster[teamId].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR');
    return list.map(key => ({ key, from: per.start, to: per.end }));
  }

  // expected games per segment, capped per local day at the league's active-player limit
  function segGames(ctx, segs) {
    const pp = segs.map(s => ctx.pool.byKey.get(s.key));
    return InLeague.rosterGames(segs.map((s, i) => ({ t: pp[i].t, a: Math.min(1, pp[i].g / 82), from: s.from, to: s.to })), ctx.DAYS, ctx.L.maxActive);
  }
  function scoreSegments(ctx, segsA, segsB) {
    const side = segs => {
      const g = segGames(ctx, segs);
      return { games: g.reduce((s, x) => s + x, 0), entries: segs.map((s, i) => ({ p: ctx.pool.byKey.get(s.key).line, games: g[i], gVar: GVAR })) };
    };
    const A = side(segsA), B = side(segsB), r = Engine.pairMatchup(A.entries, B.entries);
    return { mu: r.mu, cat: r.cat.map(p => shrink(p, K_CAT)), match: shrink(r.match, K_MATCH), games: [A.games, B.games] };
  }
  function projectWeek(ctx, teamId, n) {
    const opp = InLeague.opponentOf(ctx.L, teamId, n);
    if (!opp) return { opp: null };
    return Object.assign({ opp }, scoreSegments(ctx, teamSegments(ctx, teamId, n), teamSegments(ctx, opp, n)));
  }

  function addFrom(ctx, n) {
    const per = periodOf(ctx.L, n);
    return n === ctx.cur ? Math.max(per.start, InLeague.nextDayStart(ctx.nowMs)) : per.start;
  }

  const valueOf = (ctx, pp) => InPlayers.valueZ(pp.line, pp.g, ctx.ref);
  function lowestValue(ctx, teamId, k) {
    return ctx.roster[teamId].map(f => ctx.pool.byKey.get(f)).filter(p => p.slot !== 'IR').sort((a, b) => valueOf(ctx, a) - valueOf(ctx, b)).slice(0, k);
  }

  function simpleAdds(ctx, n, { limit = 20 } = {}) {
    const per = periodOf(ctx.L, n), opp = InLeague.opponentOf(ctx.L, ctx.me, n);
    if (!opp) return [];
    const mine = teamSegments(ctx, ctx.me, n), oppSegs = teamSegments(ctx, opp, n), from = addFrom(ctx, n);
    const base = scoreSegments(ctx, mine, oppSegs), baseG = segGames(ctx, mine);
    const active = ctx.roster[ctx.me].filter(f => ctx.pool.byKey.get(f).slot !== 'IR').length;
    const drop = active < ctx.L.maxPlayers ? null : lowestValue(ctx, ctx.me, 1)[0] || null;
    const di = drop ? mine.findIndex(s => s.key === drop.key) : -1;
    const kept = drop ? mine.map((s, i) => i === di ? { key: s.key, from: s.from, to: Math.max(s.from, Math.min(s.to, from)) } : s) : mine;
    const lost = drop ? baseG[di] - segGames(ctx, kept)[di] : 0;
    const rows = [];
    ctx.pool.players.forEach(add => {
      if (add.owner || (add.fxStatus !== 'FA' && add.fxStatus !== 'WW') || from >= per.end) return;
      const segs = kept.concat([{ key: add.key, from, to: per.end }]), g = segGames(ctx, segs), games = g[g.length - 1];
      if (!(games > 0)) return;
      const r = scoreSegments(ctx, segs, oppSegs);
      rows.push({ add, drop, games, lost, match: r.match, dMatch: r.match - base.match, dCat: r.cat.map((p, c) => p - base.cat[c]) });
    });
    return rows.sort((a, b) => b.dMatch - a.dMatch).slice(0, limit);
  }

  // ---- waiver add plan (current week) ----
  // My segments after applying moves {day ms, add key, drop key|null} in list order.
  function applyMoves(ctx, n, moves) {
    const per = periodOf(ctx.L, n), segs = teamSegments(ctx, ctx.me, n);
    moves.forEach(m => {
      if (m.drop) { const s = segs.filter(x => x.key === m.drop && x.to > m.t).pop(); s.to = Math.max(s.from, m.t); }
      segs.push({ key: m.add, from: m.t, to: per.end });
    });
    return segs;
  }
  // Is the move set legal? Drops come from the droppable set or earlier adds, a roster spot must be open for an add with no drop,
  // and nobody is added twice.
  function legalMoves(ctx, n, moves, droppable) {
    const held = new Set(ctx.roster[ctx.me].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR')), addedAt = new Map();
    for (const m of moves.slice().sort((a, b) => a.t - b.t)) {
      if (addedAt.has(m.add) || held.has(m.add)) return false;
      if (m.drop) {
        if (!held.has(m.drop) || !(droppable.has(m.drop) || (addedAt.has(m.drop) && addedAt.get(m.drop) < m.t))) return false;
        held.delete(m.drop);
      } else if (held.size >= ctx.L.maxPlayers) return false;
      held.add(m.add); addedAt.set(m.add, m.t);
    }
    return true;
  }

  function addPlan(ctx, { addsLeft = 4, candidates = 30, droppable, periods } = {}) {
    const L = ctx.L, n = ctx.cur;
    if (periods && !(periods.length === 1 && periods[0] === n)) return { start: null, end: null, moves: [], droppable: [], note: 'Plans cover the current week only' };
    const per = periodOf(L, n), opp = InLeague.opponentOf(L, ctx.me, n);
    const drops = lowestValue(ctx, ctx.me, droppable == null ? L.maxPlayers - L.maxActive : droppable), dropSet = new Set(drops.map(p => p.key));
    const oppSegs = opp ? teamSegments(ctx, opp, n) : [], score = moves => scoreSegments(ctx, applyMoves(ctx, n, moves), oppSegs).match;
    const start = opp ? score([]) : null, plan = { start, end: start, moves: [], droppable: drops, note: null };
    if (!opp) return plan;
    const days = []; for (let t = addFrom(ctx, n); t < per.end; t += 24 * 3600e3) days.push(t);
    const cands = simpleAdds(ctx, n, { limit: candidates }).map(r => r.add), moves = [];
    let cur = start;
    for (let round = 0; round < addsLeft; round++) {
      let best = null;
      const dropKeys = Array.from(dropSet).concat(moves.map(m => m.add), [null]);
      cands.forEach(add => days.forEach(t => dropKeys.forEach(d => {
        const m = { t, add: add.key, drop: d }, trial = moves.concat([m]);
        if (!legalMoves(ctx, n, trial, dropSet)) return;
        const p = score(trial);
        if (!best || p > best.p) best = { m, p };
      })));
      if (!best || best.p - cur <= 1e-4) break;
      moves.push(best.m); cur = best.p;
      plan.moves.push({ period: n, day: InLeague.localDay(best.m.t), add: ctx.pool.byKey.get(best.m.add), drop: best.m.drop ? ctx.pool.byKey.get(best.m.drop) : null, match: cur });
    }
    plan.end = cur;
    return plan;
  }

  const api = { GVAR, K_MATCH, K_CAT, makeCtx, teamSegments, scoreSegments, projectWeek, addFrom, lowestValue, simpleAdds, addPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Matchup = api;
})(this);
