// Team tab win numbers (#131 PR 2, 2026-10-25; moved onto the Rankings / Draft-tab engine 2026-10-26): the matrix of the previewed
// roster against every other team, each player's Win C / Win M contribution, and the player-list module scores. Pure; browser and
// Node. Nothing here changes the saved league, ctx or the pool. Every team's players get their remaining Plays % games per
// average week (mine and every opponent's, with the nightly cap), turned into season-equivalent games (x WEEKS) and summed into
// one forecast per team with Engine.entryVec; Engine.evaluate then gives every pairing's category and match chances, with the
// engine's own noise (SIGMA_G2 games variance); the chances are then pulled toward 0.5 by SHRINK (#139).
// Units follow Rankings: m = Win M points (100 x the change in the match chance), c = Win C hundredths (100 x the change in
// the summed category chances, averaged over the opponents).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Team = root.Team || require('./team_core.js'), Pts = root.Points || require('./points_core.js'), WinK = root.WinK || require('./win_k.js');
  const NC = Eng.NC;

  // the engine context of a ctx's player pool: noise and pool averages from simulated drafts of the real league (rostered players
  // first), IL fill off because Plays % already counts the games a player misses. Built once per ctx and category count.
  const ectxs = new WeakMap();
  // Points leagues (#137): w = the point values; the engine view puts one FP total in category slot Points.FP_SLOT and the rest is unchanged.
  function engCtx(ctx, nc, w) {
    let by = ectxs.get(ctx); if (!by) ectxs.set(ctx, by = {});
    const bk = w ? 'p|' + Pts.key(w) : nc;
    if (!by[bk]) {
      const N = Object.keys(ctx.roster).length, R = ctx.L.maxActive, adp = p => p.adp == null ? 1e9 : p.adp;
      const list = ctx.pool.players.filter(p => p.g > 0).sort((a, b) => (a.owner ? 0 : 1) - (b.owner ? 0 : 1) || adp(a) - adp(b));
      by[bk] = engCtxFrom(list.map(p => Object.assign({}, p.line, { g: p.g })), N, R, nc, w);
    }
    return by[bk];
  }

  // the engine context of a list of stat lines (with g) in draft order: N teams of R players, nc categories. engCtx's body, shared with calib_ros.js
  function engCtxFrom(lines, N, R, nc, w) {
    const P = Eng.prepPlayers(lines.map((p, i) => Object.assign({}, p, { ftx: i + 1 })));
    const cfg = { teams: N, roster: R, slot: 1, order: '3rr', scoring: 'h2h', cats: nc, ilSpots: 0, field: 'easy', fieldZ: 'std', puntMode: 'off', puntLock: '',
      catW: InPlayers.WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0, basis: 'total' };
    const cx = Eng.buildContext(P, cfg);
    return w ? { ctx: Pts.engineView(P, cx, cfg, w).ctx, cfg, w } : { ctx: cx, cfg };
  }

  // one team's forecast: the sum of its entries' category vectors and projection variances. Entries are { p: stat line, games per
  // average week, sign? } (sign -1 takes an entry out of the team).
  function teamVec(e, entries) {
    const mu = new Float64Array(NC), v = new Float64Array(NC);
    entries.forEach(en => {
      const s = en.sign || 1, ev = e.w ? Pts.entry(en.p, en.games * Eng.WEEKS, e.ctx, e.w) : Eng.entryVec(en.p, e.ctx, en.games * Eng.WEEKS);
      for (let c = 0; c < NC; c++) { mu[c] += s * ev.x[c]; v[c] += s * ev.pv[c]; }
    });
    return { mu, v };
  }

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

  // pairMatchup entries for the active and reserve players: games = Plays % games per average week (hypothetical rows never count)
  function side(ctx, state, W) {
    const r = Team.playsPct(ctx, state);
    return state.order.filter(k => Team.COUNTED.includes(state.slots[k]) && !r[k].hypo)
      .map(k => ({ key: k, p: ctx.pool.byKey.get(k).line, games: r[k].played / W }));
  }

  // ctx must be treated as immutable (the cache is keyed on the object; makeCtx builds a new one per change)
  // opponents' forecasts are the same for every previewed roster that removes the same players from them, so they are cached per ctx
  const memos = new WeakMap();
  function oppTeam(ctx, e, nc, tid, exclude, W) {   // e carries the point values, so the memo key must too
    let memo = memos.get(ctx);
    if (!memo) { memo = new Map(); memos.set(ctx, memo); }
    const gone = ctx.roster[tid].filter(f => exclude.has(f)).sort(), id = tid + '|' + gone.join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '');
    if (!memo.has(id)) memo.set(id, teamVec(e, side(ctx, oppState(ctx, tid, exclude), W)));
    return memo.get(id);
  }

  // my previewed roster against every other team. -> { weeks, teams: [{ id, cat[9], match, winC }], mean: { cat, match, winC } }
  // (cat entries beyond the league's category count are null). opts: cats 9 | 8. Players I hold leave their old team's side.
  function matrix(ctx, state, opts) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return { weeks: 0, teams: [], mean: null };
    return matrixOf(ctx, side(ctx, state, W), new Set(state.order), W, opts);
  }

  // the matrix for any set of my entries [{ p, games, sign? }] (games per average week, W = weeks left); `exclude` = the keys that left
  // their old team's side (everyone on my roster, and a candidate I bring in)
  // Shrink toward 50%, fitted leave-one-season-out on 3 seasons of rest-of-season forecasts (#139, calib_ros_k.js): pooled k 0.43 match,
  // 0.65 per category (one k per category did not beat one k); unshrunk was about twice too confident. Shipped at 0.6 / 0.75 (user, 2026-10-26):
  // the backtest keeps draft rosters and preseason lines, so the live app is likely less overconfident. opts.shrink overrides.
  const SHRINK = WinK.SHRINK, shr = WinK.shrink;
  function matrixOf(ctx, mine, exclude, W, o) {
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster).filter(t => t !== ctx.me);
    const tv = [teamVec(e, mine)].concat(ids.map(id => oppTeam(ctx, e, nc, id, exclude, W)));
    const out = evalVecs(e, tv);
    if (e.w) {   // one points total: the match chance is the single-slot chance (not shrunk: the k was fitted on categories); no category or Win C numbers
      const F = Pts.FP_SLOT, teams = ids.map((id, i) => ({ id, cat: null, match: out.catProb(out.teams[0], out.teams[i + 1], F), winC: null, ppw: tv[i + 1].mu[F] / Eng.WEEKS }));
      return { weeks: W, teams, mean: { cat: null, match: teams.reduce((s, t) => s + t.match, 0) / (teams.length || 1), winC: null, ppw: tv[0].mu[F] / Eng.WEEKS } };   // ppw = points in an average week
    }
    const k = (o && o.shrink) || SHRINK;
    const teams = ids.map((id, i) => {
      const A = out.teams[0], B = out.teams[i + 1], cat = Array.from({ length: 9 }, (_, c) => c >= nc ? null : shr(out.catProb(A, B, c), k.cat));
      return { id, cat, match: shr(out.pairProb(A, B), k.match), winC: cat.reduce((s, v) => s + (v == null ? 0 : v), 0) };
    });
    const avg = f => teams.reduce((s, t) => s + f(t), 0) / (teams.length || 1);
    return { weeks: W, teams, mean: { cat: Array.from({ length: 9 }, (_, c) => (c >= nc ? null : avg(t => t.cat[c]))), match: avg(t => t.match), winC: avg(t => t.winC) } };
  }

  // The state of team t holding the fantrax ids `fids` (a trade's roster): its players keep their Fantrax slots, IL players count for
  // an IL player counts as healthy (user, 2026-10-26): his per-game line in an Active slot, his games from the projection, which
  // already includes the time he is expected to miss (Hashtag), and the Reserve refills the nights he is out. Each incoming player
  // takes a slot the outgoing ones left (Active first), else the reserve. Incoming players are sorted, so the slots do not depend on
  // the order of `fids` (the leagueWin memo key sorts them)
  function tradeState(ctx, t, fids) {
    const keep = new Set(fids), was = new Set(ctx.roster[t]), slotOf = f => { const s = ctx.pool.byKey.get(f).slot; return s === 'IR' ? 'ACTIVE' : s; };
    const rows = ctx.roster[t].filter(f => keep.has(f)).map(f => ({ fid: f, slot: slotOf(f) }));
    const free = ctx.roster[t].filter(f => !keep.has(f)).map(slotOf).sort((a, b) => (a === 'ACTIVE' ? 0 : 1) - (b === 'ACTIVE' ? 0 : 1));
    fids.filter(f => !was.has(f)).sort().forEach(f => rows.push({ fid: f, slot: free.length ? free.shift() : 'RESERVE' }));
    return Team.initState(rows);
  }

  // Every team's chance against every other team with the rosters R (fantrax ids per team; default the saved ones), rest of season, from one
  // Engine.evaluate run: the forecaster the Team tab shows, with the same SHRINK. -> { W, ids, P } with P[i][j] = team i's match chance
  // against team j (null on the diagonal); opts.rows (team ids) fills only those rows. null with no weeks left.
  // opts: cats 9 | 8, points, shrink. Team forecasts are cached per ctx (team, its roster, weeks, categories, point values)
  const lwMemos = new WeakMap();
  function leagueWin(ctx, R, o) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return null;
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster), rows = new Set((o && o.rows) || ids), k = (o && o.shrink) || SHRINK;
    let memo = lwMemos.get(ctx); if (!memo) lwMemos.set(ctx, memo = new Map());
    const vecs = ids.map(t => {
      const id = t + '|' + (R || ctx.roster)[t].slice().sort().join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '');
      if (!memo.has(id)) memo.set(id, teamVec(e, side(ctx, tradeState(ctx, t, (R || ctx.roster)[t]), W)));
      return memo.get(id);
    });
    const out = evalVecs(e, vecs), F = Pts.FP_SLOT;
    const P = ids.map((a, i) => !rows.has(a) ? null : ids.map((b, j) => i === j ? null : e.w ? out.catProb(out.teams[i], out.teams[j], F) : shr(out.pairProb(out.teams[i], out.teams[j]), k.match)));
    return { W, ids, P };
  }

  // one Engine.evaluate run with one entry per team (vecs from teamVec); out.teams[i] is vecs[i], then out.pairProb / out.catProb
  function evalVecs(e, vecs) {
    const pl = vecs.map((t, i) => ({ id: i, x: t.mu, pv: t.v, adpUse: 1, sd: 1, adpE: 1, sdE: 1, fieldV: 0, boardRaw: 0 }));
    return Eng.evaluate(pl, e.ctx, Object.assign({}, e.cfg, { teams: pl.length, roster: 1, slot: 1 }), { picks: pl.map((_, i) => i), owner: pl.map((_, i) => i) });
  }

  const dCats = (a, b) => a.mean.cat ? a.mean.cat.map((v, c) => v == null ? 0 : 100 * (v - b.mean.cat[c])) : null;
  const gain = (a, b) => ({ c: a.mean.winC == null ? null : 100 * (a.mean.winC - b.mean.winC), m: 100 * (a.mean.match - b.mean.match), dCat: dCats(a, b) });
  const sub = (x, y) => x == null || y == null ? null : x - y, subV = (x, y) => x && y ? x.map((v, c) => v - y[c]) : null;

  // each roster player's contribution to my Win C / Win M: active and reserve = the team minus the team without him (the reserve
  // refills his nights); IL = the team with him in the reserve minus the team (hypo: true). -> { key: { c, m, dCat[9], hypo? } }
  // one player's contribution given the current roster's matrix `base` (playerWin's per-player step, so a page can score one at a time)
  // opts.baseline 'avg' (Vs average): see avgParts; my own Active / Reserve player X = the team minus (the team with X replaced by an average
  // player); my IL player = a candidate. Default 'rep' = the raw contribution.
  function playerGain(ctx, state, k, base, opts) {
    if (!base.mean) return { c: 0, m: 0, dCat: new Array(9).fill(0) };   // (points: the zero gain keeps its category zeros; nothing shows them)
    if (opts && opts.baseline === 'avg') {
      const ap = (opts.ap) || avgParts(ctx, state, base.weeks);
      if (ap) { const own = Team.COUNTED.includes(state.slots[k]); return own ? gain(base, avgOwn(ctx, state, ap, k, opts)) : Object.assign(gain(avgCandidate(ctx, state, ap, k, opts), base), { hypo: true }); }
    }
    const s = state.slots[k], counted = Team.COUNTED.includes(s), without = Team.applySwap(state, [k], []);
    return counted ? gain(base, matrix(ctx, without, opts)) : Object.assign(gain(matrix(ctx, Team.moveSlot(state, k, 'reserve'), opts), base), { hypo: true });
  }

  // the made-up average player of Vs average (user 2026-10-26). n = my counted players, tot = their games per week, M = the Active spots
  // (ctx.L.maxActive), mean = the games-weighted mean line with tot / M games (so his totals are one M-th of the team's), share = the games my
  // counted players get out of the games their own team schedules allow, with no nightly cap (the team's average lineup share).
  // -> null with no counted player or no games
  function avgParts(ctx, state, W) {
    const mine = side(ctx, state, W), n = mine.length, tot = mine.reduce((a, e) => a + e.games, 0), M = ctx.L.maxActive || n;
    const allowed = Team.counted(state).reduce((a, k) => a + Team.windowGames(ctx, [k], null)[0], 0);   // each player alone: no nightly cap
    if (!n || !(tot > 0) || !(allowed > 0)) return null;
    return { W, mine, n, tot, M, share: tot * W / allowed, mean: { p: Team.teamLine(mine.map(e => ({ line: e.p, pct: e.games })), tot), games: tot / M } };
  }

  // a player not counted on my team replaces the average player: current team - average + him, his games times the share
  function avgCandidate(ctx, state, ap, key, opts) {
    const g = Team.windowGames(ctx, [key], null)[0] / ap.W * ap.share;
    const mine = ap.mine.concat(Object.assign({}, ap.mean, { sign: -1 }), { p: ctx.pool.byKey.get(key).line, games: g });
    return matrixOf(ctx, mine, new Set(state.order).add(key), ap.W, opts);
  }

  // my counted player replaced by an average-line player who keeps his games (so a Reserve player is judged on his quality, not his slot)
  function avgOwn(ctx, state, ap, key, opts) {
    const e = ap.mine.find(x => x.key === key);
    return matrixOf(ctx, ap.mine.filter(x => x.key !== key).concat(Object.assign({}, ap.mean, { games: e.games })), new Set(state.order), ap.W, opts);
  }

  // points my counted players produce in an average remaining week: sum of FP per game x Plays % games per week
  function pointsPerWeek(ctx, state, w) {
    const Wk = weeksLeft(ctx); if (!(Wk > 0)) return 0;
    return side(ctx, state, Wk).reduce((t, e) => t + Pts.perGame(e.p, w) * e.games, 0);
  }

  function playerWin(ctx, state, opts) {
    const base = matrix(ctx, state, opts), res = {};
    state.order.forEach(k => { res[k] = playerGain(ctx, state, k, base, opts); });
    return res;
  }

  // Player-list scores for the Team tab module. Baselines: 'rep' = the player replaces my worst Active / Reserve player (lowest Win M
  // contribution); 'avg' = the same minus what an average-player entry in his place would give, as on the Rankings tab (the entry is
  // the mean per-game line of my Active and Reserve players, with the worst player's team schedule). dM / dC are the real changes in my
  // Win M (points) / Win C (hundredths); weights (0-1 per category) only change the sort: by dM when all are 1, else by the weighted
  // sum of the change in each category's chance. My own Active / Reserve players are their contribution minus the worst player's (the
  // worst shows 0); my IL / Reserve players are a swap for the worst, like a candidate.
  // opts: baseline 'rep' | 'avg', weights, cats, k, candidates (keys; default every pool player, my own included)
  // -> [{ key, owner, dM, dC, dCat[], sort }] sorted by sort, highest first (ties keep candidate order)
  // the scoring split in three so a page can score one candidate at a time (TeamView.moduleJob): moduleSetup does the work every row
  // shares (the matrix, each counted player's contribution, the worst player, the average-entry offset) and returns null with no
  // games left or no counted player; moduleRow scores one key; moduleSort orders rows (a copy). Each row also carries old / new, my
  // Win M in points before and after: new = the current Win M + the raw change, old = the current Win M + the baseline offset (0 for
  // 'rep'), so new - old = dM in both baselines.
  // opts.base / opts.pw: the matrix and per-player gains when already computed (a job gets them one piece at a time)
  function moduleSetup(ctx, state, opts) {
    const o = opts || {}, mo = { cats: o.cats, k: o.k, mode: o.mode, points: o.points }, base = o.base || matrix(ctx, state, mo);
    if (!base.mean) return null;
    if (o.baseline === 'avg') { const ap = avgParts(ctx, state, base.weeks); return ap ? { base, ap, mo, avg: true } : null; }
    const pw = o.pw || playerWin(ctx, state, mo), counted = Team.counted(state);
    if (!counted.length) return null;
    const worst = counted.reduce((a, b) => pw[b].m < pw[a].m ? b : a), wSlot = state.slots[worst];
    return { base, pw, worst, wSlot, mo, off: { c: o.points ? null : 0, m: 0, dCat: o.points ? null : new Array(9).fill(0) }, avg: false };
  }

  // the preview with `key` in the worst player's slot (Active when that is the Reserve), scored against the current team
  function swapScore(ctx, state, su, cx, key) {
    const s0 = key in state.slots ? Team.applySwap(state, [su.worst], []) : Team.applySwap(state, [su.worst], [key]);
    return gain(matrix(cx, Team.moveSlot(s0, key, su.wSlot === 'reserve' ? 'active' : su.wSlot), su.mo), su.base);   // Active claims nights before the Reserve, so a Reserve slot would score him on leftovers
  }

  function moduleRow(ctx, state, su, key) {
    const own = key in state.slots, s = own ? state.slots[key] : null, owner = own ? ctx.me : ((ctx.pool.byKey.get(key) || {}).owner || null), cur = 100 * su.base.mean.match;
    if (su.avg) {
      const counted = own && Team.COUNTED.includes(s), a = counted ? avgOwn(ctx, state, su.ap, key, su.mo) : avgCandidate(ctx, state, su.ap, key, su.mo), g = counted ? gain(su.base, a) : gain(a, su.base);
      return { key, owner, dM: g.m, dC: g.c, dCat: g.dCat, old: counted ? cur - g.m : cur, new: counted ? cur : cur + g.m };
    }
    const pw = su.pw, zero = () => su.mo.points ? null : new Array(9).fill(0);
    let r;
    if (key === su.worst) r = { c: su.mo.points ? null : 0, m: 0, dCat: zero() };
    else if (own && Team.COUNTED.includes(s)) r = { c: sub(pw[key].c, pw[su.worst].c), m: pw[key].m - pw[su.worst].m, dCat: subV(pw[key].dCat, pw[su.worst].dCat) };
    else r = swapScore(ctx, state, su, ctx, key);
    return { key, owner, dM: r.m - su.off.m, dC: sub(r.c, su.off.c), dCat: subV(r.dCat, su.off.dCat), old: cur + su.off.m, new: cur + r.m };
  }

  function moduleSort(rows, weights) {
    const weighted = weights && weights.some(w => w != null && w !== 1) && rows.every(r => r.dCat);
    return rows.map((r, i) => Object.assign({}, r, { sort: weighted ? r.dCat.reduce((a, v, c) => a + v * (weights[c] == null ? 1 : weights[c]), 0) : r.dM, i }))
      .sort((a, b) => b.sort - a.sort || a.i - b.i).map(r => { delete r.i; return r; });
  }

  function moduleScores(ctx, state, opts) {
    const o = opts || {}, su = moduleSetup(ctx, state, o);
    if (!su) return [];
    return moduleSort((o.candidates || ctx.pool.players.map(p => p.key)).map(k => moduleRow(ctx, state, su, k)), o.weights);
  }

  const api = { SHRINK, engCtxFrom, teamVec, evalVecs, tradeState, leagueWin, pointsPerWeek, weeksLeft, oppState, side, matrix, matrixOf, avgParts, playerGain, playerWin, moduleSetup, moduleRow, moduleSort, moduleScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamWin = api;
})(typeof self !== 'undefined' ? self : this);
