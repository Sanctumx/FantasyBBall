// Team tab win numbers (#131 PR 2, 2026-10-25): the matchup matrix of the previewed roster against every other team, each
// player's Win C / Win M contribution, and the player-list module scores. Pure; browser and Node. Nothing here changes the
// saved league, ctx or the pool. One matrix cell is one AVERAGE remaining week (decision D1): every player's games are his
// remaining Plays % games divided by the weeks left, so it is not the Trade Analyzer's per-week Win M. Chances come from
// Engine.pairMatchup with the Matchup Analyzer's games variance, shrunk toward 0.5 (K_CAT / K_MATCH, user 2026-10-25).
// Units follow Rankings: m = Win M points (100 x the change in the match chance), c = Win C hundredths (100 x the change in
// the summed category chances, averaged over the opponents).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), Matchup = root.Matchup || require('./matchup_core.js'), Team = root.Team || require('./team_core.js');
  const shrink = (p, k) => p == null ? p : 0.5 + k * (p - 0.5);
  const AVG_KEY = '__avg__';

  // remaining regular-season weeks: each period counts the share of it that lies in the Team.window
  function weeksLeft(ctx) {
    const w = Team.window(ctx);
    return ctx.L.periods.filter(p => p.n <= ctx.L.lastRegular).reduce((s, p) => s + Math.max(0, Math.min(p.end, w.to) - Math.max(p.start, w.from)) / (p.end - p.start), 0);
  }

  // a Team.initState for another team from its Fantrax slots; IL players and the excluded keys (players I brought in) are left out
  function oppState(ctx, teamId, exclude) {
    const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f)) && ctx.pool.byKey.get(f).slot !== 'IR').map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
    return Team.initState(rows);
  }

  // pairMatchup entries for the active and bench players: games = Plays % games per average week (hypothetical rows never count)
  function side(ctx, state, W) {
    const r = Team.playsPct(ctx, state);
    return state.order.filter(k => (state.slots[k] === 'active' || state.slots[k] === 'bench') && !r[k].hypo)
      .map(k => ({ p: ctx.pool.byKey.get(k).line, games: r[k].played / W, gVar: Matchup.GVAR }));
  }

  // opponents' sides are the same for every previewed roster that removes the same players from them, so they are cached per ctx
  const memos = new WeakMap();
  function oppSide(ctx, tid, exclude, W) {
    let memo = memos.get(ctx);
    if (!memo) { memo = new Map(); memos.set(ctx, memo); }
    const gone = ctx.roster[tid].filter(f => exclude.has(f)).sort(), id = tid + '|' + gone.join(',') + '|' + W;
    if (!memo.has(id)) memo.set(id, side(ctx, oppState(ctx, tid, exclude), W));
    return memo.get(id);
  }

  // my previewed roster against every other team. -> { weeks, teams: [{ id, cat[9], match, winC }], mean: { cat, match, winC } }
  // (cat entries beyond the league's category count are null). opts: cats 9 | 8, k { match, cat } (default K_MATCH, K_CAT).
  // Players I hold leave their old team's side.
  function matrix(ctx, state, opts) {
    const o = opts || {}, nc = o.cats === 8 ? 8 : 9, km = o.k && o.k.match != null ? o.k.match : Matchup.K_MATCH, kc = o.k && o.k.cat != null ? o.k.cat : Matchup.K_CAT;
    const W = weeksLeft(ctx);
    if (!(W > 0)) return { weeks: 0, teams: [], mean: null };
    const exclude = new Set(state.order), mine = side(ctx, state, W);
    const teams = Object.keys(ctx.roster).filter(t => t !== ctx.me).map(id => {
      const r = Eng.pairMatchup(mine, oppSide(ctx, id, exclude, W), { cats: nc }), cat = r.cat.map(p => shrink(p, kc));
      return { id, cat, match: shrink(r.match, km), winC: cat.reduce((s, v) => s + (v == null ? 0 : v), 0) };
    });
    const avg = f => teams.reduce((s, t) => s + f(t), 0) / (teams.length || 1);
    return { weeks: W, teams, mean: { cat: Array.from({ length: 9 }, (_, c) => (c >= nc ? null : avg(t => t.cat[c]))), match: avg(t => t.match), winC: avg(t => t.winC) } };
  }

  const gain = (a, b) => ({ c: 100 * (a.mean.winC - b.mean.winC), m: 100 * (a.mean.match - b.mean.match) });

  // each roster player's contribution to my Win C / Win M: active and bench = the team minus the team without him (the bench
  // refills his nights); IL and reserve = the team with him on the bench minus the team (hypo: true). -> { key: { c, m, hypo? } }
  function playerWin(ctx, state, opts) {
    const base = matrix(ctx, state, opts), res = {};
    if (!base.mean) { state.order.forEach(k => { res[k] = { c: 0, m: 0 }; }); return res; }
    state.order.forEach(k => {
      const s = state.slots[k];
      if (s === 'active' || s === 'bench') res[k] = gain(base, matrix(ctx, Team.moveSlot(state, k, 'reserve'), opts));
      else res[k] = Object.assign(gain(matrix(ctx, Team.moveSlot(state, k, 'bench'), opts), base), { hypo: true });
    });
    return res;
  }

  // ctx with one made-up player in the pool (ctx.pool itself is never touched)
  function withPlayer(ctx, pp) {
    const byKey = new Map(ctx.pool.byKey);
    byKey.set(pp.key, pp);
    return Object.assign({}, ctx, { pool: Object.assign({}, ctx.pool, { byKey }) });
  }

  // Player-list scores for the Team tab module. Baselines: 'rep' = the player replaces my worst Active / Bench player (lowest Win M
  // contribution); 'avg' = the same minus what an average-player entry in his place would give, as on the Rankings tab (the entry is
  // the mean per-game line of my Active and Bench players, with the worst player's team schedule). dM / dC are the real changes in my
  // Win M (points) / Win C (hundredths); weights (0-1 per category) only change the sort: by dM when all are 1, else by the weighted
  // sum of the change in each category's chance. My own Active / Bench players are their contribution minus the worst player's (the
  // worst shows 0); my IL / Reserve players are a swap for the worst, like a candidate.
  // opts: baseline 'rep' | 'avg', weights, cats, k, candidates (keys; default every pool player not on my roster)
  // -> [{ key, owner, dM, dC, dCat[], sort }] sorted by sort, highest first (ties keep candidate order)
  function moduleScores(ctx, state, opts) {
    const o = opts || {}, mo = { cats: o.cats, k: o.k }, base = matrix(ctx, state, mo);
    if (!base.mean) return [];
    const pw = playerWin(ctx, state, mo), counted = state.order.filter(k => state.slots[k] === 'active' || state.slots[k] === 'bench');
    if (!counted.length) return [];
    const worst = counted.reduce((a, b) => pw[b].m < pw[a].m ? b : a), wSlot = state.slots[worst], wPlayer = ctx.pool.byKey.get(worst), zero = () => new Array(9).fill(0);
    // the preview with `key` in the worst player's slot, scored against the current team
    const swapScore = (cx, key) => {
      const s0 = key in state.slots ? Team.applySwap(state, [worst], []) : Team.applySwap(state, [worst], [key]), m = matrix(cx, Team.moveSlot(s0, key, wSlot), mo);
      return Object.assign(gain(m, base), { dCat: m.mean.cat.map((v, c) => v == null ? 0 : 100 * (v - base.mean.cat[c])) });
    };
    let off = { c: 0, m: 0, dCat: zero() };
    if (o.baseline === 'avg') {
      const line = Team.teamLine(counted.map(k => ({ line: ctx.pool.byKey.get(k).line, pct: 1 })), counted.length);
      const actx = withPlayer(ctx, { key: AVG_KEY, n: 'Average player', t: wPlayer.t, line, g: wPlayer.g, slot: null, owner: null });
      off = swapScore(actx, AVG_KEY);
    }
    const cand = o.candidates || ctx.pool.players.filter(p => !(p.key in state.slots)).map(p => p.key);
    const weighted = o.weights && o.weights.some(w => w != null && w !== 1);
    const rows = cand.map((key, i) => {
      const own = key in state.slots, s = own ? state.slots[key] : null;
      let r;
      if (key === worst) r = { c: 0, m: 0, dCat: zero() };
      else if (own && (s === 'active' || s === 'bench')) r = { c: pw[key].c - pw[worst].c, m: pw[key].m - pw[worst].m, dCat: zero() };
      else r = swapScore(ctx, key);
      const dCat = r.dCat.map((v, c) => v - off.dCat[c]), dM = r.m - off.m;
      return { key, owner: own ? ctx.me : ((ctx.pool.byKey.get(key) || {}).owner || null), dM, dC: r.c - off.c, dCat, sort: weighted ? dCat.reduce((a, v, c) => a + v * (o.weights[c] == null ? 1 : o.weights[c]), 0) : dM, i };
    });
    rows.sort((a, b) => b.sort - a.sort || a.i - b.i);
    rows.forEach(r => { delete r.i; });
    return rows;
  }

  const api = { AVG_KEY, weeksLeft, oppState, side, matrix, playerWin, moduleScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamWin = api;
})(typeof self !== 'undefined' ? self : this);
