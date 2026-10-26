// Weekly Matchup Analyzer core (2026-10-20): projects a team's matchup week from expected games, and ranks single waiver adds.
// Pure; browser and Node. Chances come from Engine.pairMatchup with games variance GVAR on every entry, shrunk toward 0.5
// (calibrated on 2024-26 weeks, src/calib_pair.js; refit k on in-season projections).
(function (root) {
  'use strict';
  const Engine = root.Engine || require('./engine.js'), InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js');

  const GVAR = 1.87, K_MATCH = 0.72, K_CAT = 0.82;
  // whole games with the recent-play filter (outSet) calibrate looser than the fractional ones (calib_pair.js PM-act, 2025-26 / 2024-25: ideal k .83 matchup, .85 categories)
  const KW_MATCH = 0.83, KW_CAT = 0.85;
  const shrink = (p, k) => p == null ? p : 0.5 + k * (p - 0.5);

  const periodOf = (L, n) => L.periods.find(p => p.n === n);

  function makeCtx({ L, pool, DAYS, rosters, me, nowMs, ref, box, nightOf }) {
    const roster = {};
    Object.keys(rosters).forEach(t => { roster[t] = rosters[t].map(x => x.fid); });
    const projected = pool.players.filter(p => p.src === 'proj');
    const ctx = { L, pool, DAYS, me, nowMs, cur: InLeague.currentPeriod(L, nowMs), ref: ref || InPlayers.makeValueRef(projected.map(p => ({ adp: p.adp, g: p.g, line: p.line }))), roster };
    const per = periodOf(L, ctx.cur);
    ctx.curEnd = per ? per.end : 0; ctx.out = outSet(ctx, box); ctx.box = box;
    if (nightOf) ctx.nightOf = nightOf;   // points leagues: who plays a crowded night, by the player's own value (the Matchup Analyzer never sets it)
    return ctx;
  }

  // Players who sat out their team's last 3 boxed games are out for the rest of the current week: a player who is playing now most
  // likely plays his next 3-4 games. A player with no box line at all counts as out too (a failed name match would count him out as well). A team with fewer than 3 boxed games is not judged.
  function outSet(ctx, files) {
    const games = {}, seen = new Map(), out = new Set();
    (files || []).filter(Boolean).forEach(f => {
      const mi = f.cols.indexOf('min');
      Object.keys(f.games || {}).forEach(id => {
        const g = f.games[id];
        Object.keys(g.teams).forEach(abbr => {
          const t = InLeague.toProjTeam(abbr) || abbr, ids = new Set();
          g.teams[abbr].forEach(l => { if (l[mi + 1] > 0) { ids.add(l[0]); seen.set(l[0], { id: l[0], n: InPlayers.OVERRIDES.espn[l[0]] || (f.names || {})[l[0]] || String(l[0]), t }); } });
          (games[t] || (games[t] = [])).push({ d: g.d, ids });
        });
      });
    });
    const list = Array.from(seen.values());
    const keys = [].concat(...Object.keys(ctx.roster).map(tid => ctx.roster[tid]), ctx.pool.players.filter(p => !p.owner && (p.fxStatus === 'FA' || p.fxStatus === 'WW')).map(p => p.key));
    keys.forEach(key => {
      const p = ctx.pool.byKey.get(key), recent = (games[p.t] || []).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0).slice(-3), m = recent.length >= 3 && InPlayers.matchTo(list, p.n, p.t);
      if (recent.length >= 3 && (!m || !recent.some(g => g.ids.has(m.id)))) out.add(key);
    });
    return out;
  }

  // whole-period window; IR players sit out only in the current period
  function teamSegments(ctx, teamId, n, keys) {
    const per = periodOf(ctx.L, n), list = keys || ctx.roster[teamId].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR');
    return list.map(key => ({ key, from: per.start, to: per.end }));
  }

  // games per segment. Default (Trade Analyzer): expected games, availability g/82 per team game, capped per local day at the
  // league's active-player limit. whole (Matchup Analyzer): each real team game in the window counts 1, and on a night with more
  // players than the limit (less the `used` slots) only the best per-game players play
  function segGames(ctx, segs, used, whole) {
    if (!whole) {
      const pp = segs.map(s => ctx.pool.byKey.get(s.key));
      return InLeague.rosterGames(segs.map((s, i) => ({ t: pp[i].t, a: Math.min(1, pp[i].g / 82), from: s.from, to: s.to })), ctx.DAYS, ctx.L.maxActive, used);
    }
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, pp = segs.map(s => ctx.pool.byKey.get(s.key)), byDay = {}, out = segs.map(() => 0);
    segs.forEach((s, i) => (ctx.out && ctx.out.has(s.key) && s.from < ctx.curEnd ? [] : G[pp[i].t] || []).map(x => x * 1000).filter(ms => ms >= s.from && ms < s.to).forEach(ms => {
      const d = InLeague.localDay(ms);
      (byDay[d] || (byDay[d] = [])).push(i);
    }));
    Object.keys(byDay).forEach(d => {
      const cap = Math.max(0, ctx.L.maxActive - ((used && used[d]) || 0));
      byDay[d].map(i => ({ i, v: nightValue(ctx, pp[i]) })).sort((a, b) => b.v - a.v || a.i - b.i).slice(0, cap).forEach(x => { out[x.i] += 1; });
    });
    return out;
  }
  function scoreSegments(ctx, segsA, segsB, whole) {
    const side = segs => {
      const g = segGames(ctx, segs, null, whole);
      return { games: g.reduce((s, x) => s + x, 0), entries: segs.map((s, i) => ({ p: ctx.pool.byKey.get(s.key).line, games: g[i], gVar: GVAR })) };
    };
    const A = side(segsA), B = side(segsB), r = Engine.pairMatchup(A.entries, B.entries);
    return { mu: r.mu, cat: r.cat.map(p => shrink(p, whole ? KW_CAT : K_CAT)), match: shrink(r.match, whole ? KW_MATCH : K_MATCH), games: [A.games, B.games] };
  }
  function projectWeek(ctx, teamId, n) {
    const opp = InLeague.opponentOf(ctx.L, teamId, n);
    if (!opp) return { opp: null };
    return Object.assign({ opp }, scoreSegments(ctx, teamSegments(ctx, teamId, n), teamSegments(ctx, opp, n), n === ctx.cur));
  }

  // ---- week status: box-score totals so far + the games still to play (idea 118, 2026-10-21) ----
  const KCOLS = ['fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
  const zeroK = () => { const k = {}; KCOLS.forEach(c => { k[c] = 0; }); return k; };
  const kOf = (k0, r) => k0 + (1 - k0) * (1 - r);   // shrink eases to 1 as the week ends (r = share of the week's games still to play)

  // monthly stats/box-YYYY-MM.json objects → the period's lines per player and each team's latest game date (ESPN abbreviations mapped)
  function boxLines(files, per) {
    const from = InLeague.nyDay(per.start), to = InLeague.nyDay(per.end - 1), players = new Map(), lastDay = {};
    (files || []).filter(Boolean).forEach(f => Object.keys(f.games || {}).forEach(id => {
      const g = f.games[id];
      if (g.d < from || g.d > to) return;
      Object.keys(g.teams).forEach(abbr => {
        const t = InLeague.toProjTeam(abbr) || abbr;
        if (!lastDay[t] || g.d > lastDay[t]) lastDay[t] = g.d;
        g.teams[abbr].forEach(l => {
          const v = {}; f.cols.forEach((c, i) => { v[c] = l[i + 1]; });
          if (!(v.min > 0)) return;
          const a = players.get(l[0]) || { id: l[0], n: InPlayers.OVERRIDES.espn[l[0]] || (f.names || {})[l[0]] || String(l[0]), t, d: '', lines: [] };
          if (g.d >= a.d) { a.d = g.d; a.t = t; }
          a.lines.push({ d: g.d, v }); players.set(l[0], a);
        });
      });
    }));
    return { players, lastDay };
  }
  // the instant after a team's latest boxed game tipped off (the period's start when it has none yet)
  function cutoffOf(ctx, bx, team, per) {
    const day = bx.lastDay[team];
    if (!day) return per.start;
    const tip = ((ctx.DAYS.games || ctx.DAYS)[team] || []).map(s => s * 1000).find(ms => InLeague.nyDay(ms) === day);
    return Math.max(per.start, (tip != null ? tip : Date.parse(day + 'T00:00:00Z') + 28 * 3600e3) + 1);
  }

  // Both teams' status for period n: so-far totals (box lines of the current non-IR roster, at most maxActive players per day),
  // the rest of the week projected from each team's own cutoff, and chances for the final result. FG% / FT% come from summed makes and
  // attempts. Variance of the remaining games scales with the share of games left; the shrink eases from K to 1 with that share.
  function weekStatus(ctx, files, teamId, n) {
    const opp = InLeague.opponentOf(ctx.L, teamId, n);
    if (!opp) return { opp: null };
    return Object.assign({ opp }, statusCore(ctx, files, teamSegments(ctx, teamId, n), teamSegments(ctx, opp, n), n));
  }
  // the status of any two segment lists (a roster with moves applied, say): a player added after the period began carries no
  // box lines (they were played for another team). Box lines and name matches are cached per context.
  function statusCore(ctx, files, segsA, segsB, n) {
    const per = periodOf(ctx.L, n), cache = ctx.statusCache || (ctx.statusCache = {});
    const c = cache[n] && cache[n].files === files ? cache[n] : (cache[n] = { files, bx: boxLines(files, per), match: new Map() }), bx = c.bx;
    const list = c.list || (c.list = Array.from(bx.players.values()).map(p => ({ n: p.n, t: p.t, id: p.id })));
    const side = segs => {
      const pp = segs.map(s => ctx.pool.byKey.get(s.key)), known = zeroK(), byDay = {}, own = {};
      pp.forEach((p, i) => {
        if (segs[i].from > per.start) return;   // relies on every real roster segment starting at per.start: only hypothetical adds start later
        if (!c.match.has(p.key)) { const m = InPlayers.matchTo(list, p.n, p.t); c.match.set(p.key, m && bx.players.get(m.id)); }
        const b = c.match.get(p.key);
        if (b) b.lines.forEach(l => (byDay[l.d] || (byDay[l.d] = [])).push({ p, v: l.v }));
      });
      Object.keys(byDay).forEach(d => byDay[d].sort((a, b) => nightValue(ctx, b.p) - nightValue(ctx, a.p)).slice(0, ctx.L.maxActive).forEach(x => KCOLS.forEach(c => { known[c] += x.v[c] || 0; (own[x.p.key] || (own[x.p.key] = zeroK()))[c] += x.v[c] || 0; })));
      const rest = segs.map((s, i) => ({ key: s.key, from: Math.max(s.from, cutoffOf(ctx, bx, pp[i].t, per)), to: s.to }));
      // a night partly played keeps its lineup limit: players already counted that day use up slots
      const used = {}; Object.keys(byDay).forEach(d => { used[d] = Math.min(ctx.L.maxActive, byDay[d].length); });
      const whole = segGames(ctx, segs, null, true), left = segGames(ctx, rest, used, true);
      const players = segs.map((sg, i) => {
        const p = pp[i], k = own[p.key] || zeroK(), g = left[i], l = p.line;
        const cur = [k.fga ? k.fgm / k.fga : 0, k.fta ? k.ftm / k.fta : 0, k.tpm, k.pts, k.reb, k.ast, k.stl, k.blk, k.to];
        const fga = k.fga + l.fga * g, fta = k.fta + l.fta * g;
        const proj = [fga ? (k.fgm + l.fgp * l.fga * g) / fga : 0, fta ? (k.ftm + l.ftp * l.fta * g) / fta : 0, k.tpm + l.tpm * g, k.pts + l.pts * g, k.reb + l.reb * g, k.ast + l.ast * g, k.stl + l.stl * g, k.blk + l.blk * g, k.to + l.to * g];
        return { key: p.key, n: p.n, pos: p.pos, t: p.t, games: g, cur, proj, out: !!(ctx.out && ctx.out.has(p.key)) };
      });
      return { players, known, wholeG: whole.reduce((a, x) => a + x, 0), leftG: left.reduce((a, x) => a + x, 0),
        entries: segs.map((s, i) => ({ p: pp[i].line, games: left[i], gVar: GVAR * Math.min(1, whole[i] > 0 ? left[i] / whole[i] : 1) })) };
    };
    const A = side(segsA), B = side(segsB), r = Engine.pairMatchup(A.entries, B.entries, { known: [A.known, B.known] });
    const rest = Engine.pairMatchup(A.entries, B.entries).mu, share = A.wholeG + B.wholeG > 0 ? (A.leftG + B.leftG) / (A.wholeG + B.wholeG) : 1;
    const started = share < 1 || A.known.pts + B.known.pts + A.known.fga + B.known.fga > 0;
    return { started, cat: r.cat.map(p => shrink(p, kOf(KW_CAT, share))), match: shrink(r.match, kOf(KW_MATCH, share)), mu: r.mu, total: r.mu, rest,
      known: [A.known, B.known], games: [A.leftG, B.leftG], share, roster: [A.players, B.players] };
  }

  // the add tools' scorer: the current week counts the box scores so far (as the headline does), any other week is the whole-week projection
  function scoreWeek(ctx, segsA, segsB, n) {
    if (n !== ctx.cur || !ctx.box || !ctx.box.length) return scoreSegments(ctx, segsA, segsB, true);
    const s = statusCore(ctx, ctx.box, segsA, segsB, n);
    return { cat: s.cat, match: s.match, mu: s.mu, games: s.games };
  }

  function addFrom(ctx, n) {
    const per = periodOf(ctx.L, n);
    return n === ctx.cur ? Math.max(per.start, InLeague.nextDayStart(ctx.nowMs)) : per.start;
  }

  const valueOf = (ctx, pp) => InPlayers.valueZ(pp.line, pp.g, ctx.ref);
  // who plays on a crowded night: the better per-game player (a full 82-game season at his line), games played drop out
  const nightValue = (ctx, pp) => ctx.nightOf ? ctx.nightOf(pp) : InPlayers.valueZ(pp.line, 82, ctx.ref);
  // keep: player keys on the team that are never dropped
  function lowestValue(ctx, teamId, k, keep) {
    const kept = new Set(keep || []);
    return ctx.roster[teamId].map(f => ctx.pool.byKey.get(f)).filter(p => p.slot !== 'IR' && !kept.has(p.key)).sort((a, b) => valueOf(ctx, a) - valueOf(ctx, b)).slice(0, k);
  }

  // keep: my player keys never offered as drops. Every add paired with each of the `drops` lowest-value players (or the open spot), best Win M switches first
  function simpleAdds(ctx, n, { limit = 20, drops = 5, keep } = {}) {
    const per = periodOf(ctx.L, n), opp = InLeague.opponentOf(ctx.L, ctx.me, n);
    if (!opp) return [];
    const mine = teamSegments(ctx, ctx.me, n), oppSegs = teamSegments(ctx, opp, n), from = addFrom(ctx, n);
    const base = scoreWeek(ctx, mine, oppSegs, n), baseG = segGames(ctx, mine, null, true);
    const active = ctx.roster[ctx.me].filter(f => ctx.pool.byKey.get(f).slot !== 'IR').length;
    const dropList = active < ctx.L.maxPlayers ? [null] : lowestValue(ctx, ctx.me, drops, keep);
    if (!dropList.length) return [];   // full roster and every player kept: no add can be made
    const opts = dropList.map(drop => {
      const di = drop ? mine.findIndex(s => s.key === drop.key) : -1;
      const kept = drop ? mine.map((s, i) => i === di ? { key: s.key, from: s.from, to: Math.max(s.from, Math.min(s.to, from)) } : s) : mine;
      return { drop, kept, lost: drop ? baseG[di] - segGames(ctx, kept, null, true)[di] : 0 };
    });
    // every add against the lowest-value drop first; the best 20 adds are then tried against the other drops
    const score = (add, { drop, kept, lost }) => {
      const segs = kept.concat([{ key: add.key, from, to: per.end }]), g = segGames(ctx, segs, null, true), games = g[g.length - 1];
      if (!(games > 0)) return null;
      const r = scoreWeek(ctx, segs, oppSegs, n);
      return { add, drop, games, lost, match: r.match, dMatch: r.match - base.match, dCat: r.cat.map((p, c) => p - base.cat[c]) };
    };
    const first = ctx.pool.players.filter(add => !add.owner && (add.fxStatus === 'FA' || add.fxStatus === 'WW') && from < per.end).map(add => score(add, opts[0])).filter(Boolean);
    const rows = first.slice();
    first.sort((a, b) => b.dMatch - a.dMatch).slice(0, 20).forEach(r => opts.slice(1).forEach(o => { const x = score(r.add, o); if (x) rows.push(x); }));
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

  function addPlan(ctx, { addsLeft = 4, candidates = 30, droppable, periods, keep } = {}) {
    const L = ctx.L, n = ctx.cur;
    if (periods && !(periods.length === 1 && periods[0] === n)) return { start: null, end: null, moves: [], droppable: [], note: 'Plans cover the current week only' };
    const per = periodOf(L, n), opp = InLeague.opponentOf(L, ctx.me, n);
    const drops = lowestValue(ctx, ctx.me, droppable == null ? L.maxPlayers - L.maxActive : Math.min(droppable, L.maxPlayers - L.maxActive), keep), dropSet = new Set(drops.map(p => p.key));
    const oppSegs = opp ? teamSegments(ctx, opp, n) : [], score = moves => scoreWeek(ctx, applyMoves(ctx, n, moves), oppSegs, n).match;
    const start = opp ? score([]) : null, plan = { start, end: start, moves: [], droppable: drops, note: null };
    if (!opp) return plan;
    const days = []; for (let t = addFrom(ctx, n); t < per.end; t += 24 * 3600e3) days.push(t);
    const cands = simpleAdds(ctx, n, { limit: candidates, keep, drops: Math.min(5, droppable == null ? Infinity : droppable) }).map(r => r.add), moves = [];
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

  const api = { GVAR, K_MATCH, K_CAT, KW_MATCH, KW_CAT, segGames, makeCtx, outSet, teamSegments, scoreSegments, projectWeek, weekStatus, boxLines, addFrom, lowestValue, simpleAdds, addPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Matchup = api;
})(this);
