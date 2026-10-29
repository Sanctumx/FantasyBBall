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

  // a Team.initState for another team from its Fantrax slots; IL players and the excluded keys (players I brought in) are left out;
  // recv = the players it receives in a previewed trade [{ key, slot }] (see received), who join in the slot they take
  // The Team tab (ctx.teamTab) keeps his IL players (they count on the seasonal bases) and his bench is Active, as on my side (Team.tabState)
  function oppState(ctx, teamId, exclude, recv) {
    const byKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;   // the received players join in key order, as the cache key sorts them
    if (ctx.teamTab) {
      const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f))).map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
      (recv || []).slice().sort(byKey).forEach(r => rows.push({ fid: r.key, slot: ctx.pool.byKey.get(r.key).slot === 'IR' ? 'IR' : 'ACTIVE' }));
      return Team.tabState(rows);
    }
    const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f)) && ctx.pool.byKey.get(f).slot !== 'IR').map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
    (recv || []).filter(r => ctx.pool.byKey.get(r.key).slot !== 'IR').sort(byKey).forEach(r => rows.push({ fid: r.key, slot: r.slot === 'active' ? 'ACTIVE' : 'RESERVE' }));
    return Team.initState(rows);
  }

  // D3 (user 2026-10-26): a candidate I bring in from an opponent's roster leaves that team, and the team receives the player I send out
  // (a previewed trade; state.moves records each swap). One opponent among the incoming players gets every outgoing player: the first take
  // the vacated slots in order, the rest go to the reserve. Incoming players from several opponents pair with the outgoing ones in order
  // (extras go to nobody). Free agents send nothing back, a vacated IL slot becomes the reserve, and a player who is back on my preview
  // roster is not received. -> { teamId: [{ key, slot: 'active' | 'reserve' }] }
  // The swaps are replayed with each player's current holder, so a swap-back or a later trade of a received player moves him again.
  // trade -> { recv, gone }: recv as above; gone = every opponent player not on his original team now (they leave that team's side)
  function trade(ctx, state) {
    const slotOf = k => ctx.pool.byKey.get(k).slot === 'ACTIVE' ? 'active' : 'reserve', loc = new Map(), slots = new Map(), pools = k => (ctx.pool.byKey.get(k) || {}).owner;
    const at = k => loc.has(k) ? loc.get(k) : (pools(k) || null);
    (state.moves || []).forEach(m => {
      const ins = m.in.map(k => { const o = at(k); return o && o !== ctx.me && ctx.roster[o] ? { o, slot: slotOf(k) } : null; }), found = ins.filter(Boolean), owners = [...new Set(found.map(x => x.o))], to = m.out.map(() => null);
      if (owners.length === 1) m.out.forEach((k, i) => { to[i] = { t: owners[0], slot: i < found.length ? found[i].slot : 'reserve' }; });
      else if (owners.length) m.out.forEach((k, i) => { if (ins[i]) to[i] = { t: ins[i].o, slot: ins[i].slot }; });
      m.in.forEach(k => loc.set(k, ctx.me));
      m.out.forEach((k, i) => loc.set(k, to[i] ? to[i].t : null));
      m.out.forEach((k, i) => { if (to[i]) slots.set(k, to[i].slot); });
    });
    const recv = {}, gone = new Set();
    loc.forEach((h, k) => {
      const own = pools(k);
      if (h && h !== ctx.me && h !== own) (recv[h] = recv[h] || []).push({ key: k, slot: slots.get(k) || 'reserve' });
      if (h !== own && own && own !== ctx.me && ctx.roster[own]) gone.add(k);
    });
    Object.values(recv).forEach(r => r.forEach(x => gone.add(x.key)));
    return { recv, gone };
  }
  const received = (ctx, state) => trade(ctx, state).recv;
  const goneKeys = (ctx, state) => [...trade(ctx, state).gone].sort();

  // Team.playsPct with the drop order of team o.tid (default mine): when the IL players' return pushes the roster over the player limit, the
  // players with the lowest Win M contribution go (dropRank). o: tid, cats, points, e (the engine context when the caller has it), noDrop
  function plays(ctx, state, o) {
    o = o || {};
    if (!ctx.teamTab || ctx.basis === 'pergame' || o.noDrop) return Team.playsPct(ctx, state, { noDrop: o.noDrop });
    let rank = null;
    return Team.playsPct(ctx, state, { extra: o.extra, rank: k => (rank || (rank = dropRank(ctx, o.tid != null ? o.tid : ctx.me, o)))(k) });   // built only if a player has to go
  }

  // The drop order of team tid on the Team tab (IL timeline, user 2026-10-29: drop by Win M contribution): rank(k) = minus the team's mean match
  // chance (the category chance of the points total for points leagues) when k is the one dropped from its saved roster at the first IL
  // return, so the lowest rank costs the least Win M. It is the realized chance, not the loss from removing him altogether: that one would
  // drop an IL player (who then never plays) before a weak healthy player who still plays until the return, and the team would end up
  // worse (Paragua: Ingram out would have cost 1.5 Win M points against dropping Keldon Johnson). The field's saved rosters are taken whole,
  // nobody dropped. A player off the saved roster (a candidate, a trade arrival) ranks Infinity and is never dropped. With several drops at
  // once the order is each player's cost as the single drop. Memoised per ctx, team, weeks, categories, point values and basis.
  // o: cats, points, e. -> rank(key)
  const dropMemos = new WeakMap();
  function dropRank(ctx, tid, o) {
    o = o || {};
    const Wk = weeksLeft(ctx), nc = o.cats === 8 ? 8 : 9, pts = o.points;
    if (!(Wk > 0) || !ctx.teamTab || ctx.basis === 'pergame' || !ctx.roster[tid]) return () => 0;
    let memo = dropMemos.get(ctx); if (!memo) dropMemos.set(ctx, memo = new Map());
    const id = [tid, Wk, nc, pts ? Pts.key(pts) : '', ctx.basis].join('|');
    if (!memo.has(id)) {
      const e = o.e || engCtx(ctx, nc, pts), F = Pts.FP_SLOT, none = { noDrop: true };
      const field = Object.keys(ctx.roster).filter(t => t !== tid).map(t => teamVec(e, side(ctx, oppState(ctx, t), Wk, none))), saved = oppState(ctx, tid);
      const meanOf = vec => {
        const out = evalVecs(e, [vec].concat(field));
        return field.reduce((s, _, j) => s + (e.w ? out.catProb(out.teams[0], out.teams[j + 1], F) : shr(out.pairProb(out.teams[0], out.teams[j + 1]), SHRINK.match)), 0) / (field.length || 1);
      };
      const u = new Map();
      Team.counted(saved, ctx).forEach(k => u.set(k, -meanOf(teamVec(e, sideOf(ctx, saved, Team.playsPct(ctx, saved, { force: 1, rank: x => (x === k ? -1 : 0) }), Wk)))));
      memo.set(id, k => (u.has(k) ? u.get(k) : Infinity));
    }
    return memo.get(id);
  }

  // my side's options from a matrix opts (cats, points)
  const sideOpts = opts => ({ cats: opts && opts.cats, points: opts && opts.points });

  // pairMatchup entries for the active and reserve players: games = Plays % games per average week (hypothetical rows never count)
  // o: see plays (tid defaults to mine)
  function side(ctx, state, W, o) {
    return sideOf(ctx, state, plays(ctx, state, o), W);
  }
  const sideOf = (ctx, state, r, W) => {
    const c = Team.countedSlots(ctx);
    return state.order.filter(k => c.includes(state.slots[k]) && !r[k].hypo)
      .map(k => ({ key: k, p: ctx.pool.byKey.get(k).line, games: r[k].played / W }));
  };

  // ctx must be treated as immutable (the cache is keyed on the object; makeCtx builds a new one per change)
  // opponents' forecasts are the same for every previewed roster that removes the same players from them, so they are cached per ctx
  const memos = new WeakMap();
  function oppTeam(ctx, e, nc, tid, exclude, W, recv) {   // e carries the point values, so the memo key must too
    let memo = memos.get(ctx);
    if (!memo) { memo = new Map(); memos.set(ctx, memo); }
    const gone = ctx.roster[tid].filter(f => exclude.has(f)).sort(), id = tid + '|' + gone.join(',') + '|' + (recv || []).map(r => r.key + ':' + r.slot).sort().join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '');
    if (!memo.has(id)) memo.set(id, teamVec(e, side(ctx, oppState(ctx, tid, exclude, recv), W, { tid, cats: nc, points: e.w, e })));
    return memo.get(id);
  }

  // my previewed roster against every other team. -> { weeks, teams: [{ id, cat[9], match, winC }], mean: { cat, match, winC } }
  // (cat entries beyond the league's category count are null). opts: cats 9 | 8. Players I hold leave their old team's side, and the
  // teams my candidates came from receive the players I send out (received).
  function matrix(ctx, state, opts) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return { weeks: 0, teams: [], mean: null };
    const t = trade(ctx, state);
    return matrixOf(ctx, side(ctx, state, W, sideOpts(opts)), new Set(state.order.concat([...t.gone])), W, Object.assign({}, opts, { recv: t.recv }));
  }

  // the matrix for any set of my entries [{ p, games, sign? }] (games per average week, W = weeks left); `exclude` = the keys that left
  // their old team's side (everyone on my roster, and a candidate I bring in)
  // Shrink toward 50%, fitted leave-one-season-out on 3 seasons of rest-of-season forecasts (#139, calib_ros_k.js): pooled k 0.43 match,
  // 0.65 per category (one k per category did not beat one k); unshrunk was about twice too confident. Shipped at 0.6 / 0.75 (user, 2026-10-26):
  // the backtest keeps draft rosters and preseason lines, so the live app is likely less overconfident. opts.shrink overrides.
  const SHRINK = WinK.SHRINK, shr = WinK.shrink;
  function matrixOf(ctx, mine, exclude, W, o) {
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster).filter(t => t !== ctx.me);
    const tv = [teamVec(e, mine)].concat(ids.map(id => oppTeam(ctx, e, nc, id, exclude, W, o && o.recv && o.recv[id])));
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

  // The ctx the Trade Analyzer scores on (#151, user 2026-10-27): the Team tab's rules on the Season basis (Reserve parked, IL players
  // count at their availability g/82), as the Team tab and Rankings do. A shallow copy so Team.* see the flags; cached per ctx and basis
  // (never one per call: engCtx and lwMemos are keyed on the original ctx and rebuilding them per candidate would be ~2000 engine builds)
  const tabViews = new WeakMap();
  function tabView(ctx, basis) {
    const b = basis || 'total';
    if (ctx.teamTab && ctx.basis === b) return ctx;
    let by = tabViews.get(ctx); if (!by) tabViews.set(ctx, by = {});
    return by[b] || (by[b] = Object.assign({}, ctx, { teamTab: true, basis: b }));
  }

  // The state of team t holding the fantrax ids `fids` (a trade's roster), as the Team tab opens it (Team.tabState): its players keep their
  // Fantrax slots, the bench is Active and an IR player stays IL; he counts at his availability g/82 of the team's games (the seasonal basis).
  // Incoming players join like oppState's received ones (IR stays IR, the rest Active). They are sorted, so the slots do not depend on
  // the order of `fids` (the leagueWin memo key sorts them)
  function tradeState(ctx, t, fids) {
    const keep = new Set(fids), was = new Set(ctx.roster[t]), slotOf = f => ctx.pool.byKey.get(f).slot === 'IR' ? 'IR' : 'ACTIVE';
    const rows = ctx.roster[t].filter(f => keep.has(f)).map(f => ({ fid: f, slot: slotOf(f) }));
    fids.filter(f => !was.has(f)).sort().forEach(f => rows.push({ fid: f, slot: slotOf(f) }));
    return Team.tabState(rows);
  }

  // Every team's chance against every other team with the rosters R (fantrax ids per team; default the saved ones), rest of season, from one
  // Engine.evaluate run: the forecaster the Team tab shows, with the same SHRINK. -> { W, ids, P } with P[i][j] = team i's match chance
  // against team j (null on the diagonal); opts.rows (team ids) fills only those rows. null with no weeks left.
  // opts: cats 9 | 8, points, shrink, basis (default 'total': the Team tab's Season rules, tabView). Team forecasts are cached per ctx
  // (team, its roster, weeks, categories, point values, basis)
  const lwMemos = new WeakMap();
  function leagueWin(ctx, R, o) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return null;
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster), rows = new Set((o && o.rows) || ids), k = (o && o.shrink) || SHRINK;
    const tv = tabView(ctx, o && o.basis);
    let memo = lwMemos.get(ctx); if (!memo) lwMemos.set(ctx, memo = new Map());
    const vecs = ids.map(t => {
      const id = t + '|' + (R || ctx.roster)[t].slice().sort().join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '') + '|' + tv.basis;
      if (!memo.has(id)) memo.set(id, teamVec(e, side(tv, tradeState(ctx, t, (R || ctx.roster)[t]), W, { tid: t, cats: nc, points: o && o.points, e })));
      return memo.get(id);
    });
    const out = evalVecs(e, vecs), F = Pts.FP_SLOT;
    const P = ids.map((a, i) => !rows.has(a) ? null : ids.map((b, j) => i === j ? null : e.w ? out.catProb(out.teams[i], out.teams[j], F) : shr(out.pairProb(out.teams[i], out.teams[j]), k.match)));
    if (!(o && o.detail)) return { W, ids, P };
    // detail (the League tab): C[i][j][c] = team i's shrunk chance in category c against team j (null past nc, on the diagonal and in points mode), as the matrix's `cat`
    const C = ids.map((a, i) => !rows.has(a) ? null : ids.map((b, j) => i === j ? null : e.w ? null : Array.from({ length: 9 }, (_, c) => c >= nc ? null : shr(out.catProb(out.teams[i], out.teams[j], c), k.cat))));
    return { W, ids, P, C, swing: e.ctx.swing };
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
      const ap = (opts.ap) || avgParts(ctx, state, base.weeks, opts);
      if (ap) { const own = Team.countedSlots(ctx).includes(state.slots[k]); return own ? gain(base, avgOwn(ctx, state, ap, k, opts)) : Object.assign(gain(avgCandidate(ctx, state, ap, k, opts), base), { hypo: true }); }
    }
    // a player who does not count (IL; on the Team tab also Reserve, and IL on Per game) is scored as the one more player he would be: the plain
    // ctx adds him to the reserve, the Team tab to Active
    const s = state.slots[k], counted = Team.countedSlots(ctx).includes(s), without = Team.applySwap(state, [k], []);
    return counted ? gain(base, matrix(ctx, without, opts)) : Object.assign(gain(matrix(ctx, Team.moveSlot(state, k, ctx.teamTab ? 'active' : 'reserve'), opts), base), { hypo: true });
  }

  // the made-up average player of Vs average (user 2026-10-26). n = my counted players, tot = their games per week, M = the Active spots
  // (ctx.L.maxActive), mean = the games-weighted mean line with tot / M games (so his totals are one M-th of the team's), share = the games my
  // counted players get out of the games their own team schedules allow, with no nightly cap (the team's average lineup share).
  // -> null with no counted player or no games
  function avgParts(ctx, state, W, opts) {
    const r = plays(ctx, state, sideOpts(opts)), mine = sideOf(ctx, state, r, W), n = mine.length, tot = mine.reduce((a, e) => a + e.games, 0), M = ctx.L.maxActive || n;
    const allowed = Team.counted(state, ctx).reduce((a, k) => a + Team.soloGames(ctx, k, r[k].drop), 0);   // each player alone: no nightly cap; a dropped one only until he leaves
    if (!n || !(tot > 0) || !(allowed > 0)) return null;
    return { W, mine, n, tot, M, plays: r, share: tot * W / allowed, mean: { p: Team.teamLine(mine.map(e => ({ line: e.p, pct: e.games })), tot), games: tot / M } };
  }

  // a player not counted on my team replaces the average player: current team - average + him, his games times the share
  function avgCandidate(ctx, state, ap, key, opts) {
    const g = Team.soloGames(ctx, key) / ap.W * ap.share;
    const mine = ap.mine.concat(Object.assign({}, ap.mean, { sign: -1 }), { p: ctx.pool.byKey.get(key).line, games: g });
    const t = trade(ctx, state);
    return matrixOf(ctx, mine, new Set(state.order.concat([...t.gone])).add(key), ap.W, Object.assign({}, opts, { recv: t.recv }));
  }

  // my counted player replaced by an average-line player who gets the games his slot allows, as a candidate does (avgCandidate): his games
  // times the team's share, not the games he plays, so a player who never plays costs what his slot would hold (user 2026-10-29, reverses #138's
  // "keeps his games") and the list and the roster agree
  // A player who is dropped at an IL return (non-IL) is replaced by an average player who cannot be dropped, so the drop moves on to the
  // next-ranked player (the roster is the same size): without that he would read far below the replacement for games he never plays.
  // The average player counts against the player limit but takes no nightly slot (a: 0 item); the rest of the team is replayed without D
  function avgOwn(ctx, state, ap, key, opts) {
    const pk = ap.plays && ap.plays[key], isDrop = pk && pk.drop != null, il = state.slots[key] === 'il';
    const t = trade(ctx, state), g = Team.soloGames(ctx, key, il && isDrop ? pk.drop : undefined) / ap.W * ap.share, so = sideOpts(opts);   // a dropped IL player never plays: 0 games, as in avgParts
    const dropped = !il && isDrop;
    let mine = ap.mine.filter(x => x.key !== key);
    if (dropped) {
      const w = Team.window(ctx), without = Team.applySwap(state, [key], []), A0 = { t: ctx.pool.byKey.get(key).t, a: 0, v: 0, from: w.from, to: w.from };
      mine = sideOf(ctx, without, plays(ctx, without, Object.assign({ extra: [A0] }, so)), ap.W);
    }
    return matrixOf(ctx, mine.concat(Object.assign({}, ap.mean, { games: g })), new Set(state.order.concat([...t.gone])), ap.W, Object.assign({}, opts, { recv: t.recv }));
  }

  // points my counted players produce in an average remaining week: sum of FP per game x Plays % games per week
  function pointsPerWeek(ctx, state, w) {
    const Wk = weeksLeft(ctx); if (!(Wk > 0)) return 0;
    return side(ctx, state, Wk, { points: w }).reduce((t, e) => t + Pts.perGame(e.p, w) * e.games, 0);
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
    if (o.baseline === 'avg') { const ap = avgParts(ctx, state, base.weeks, mo); return ap ? { base, ap, mo, avg: true } : null; }
    const pw = o.pw || playerWin(ctx, state, mo), counted = Team.counted(state, ctx);
    if (!counted.length) return null;
    // The replacement level is the counted player with the lowest contribution who plays and is not on IL: a candidate takes his slot. An IL
    // player cannot be it (a healthy candidate cannot take an IL slot) and neither can a player who never plays (nothing to replace, so he
    // would read 0 and every other row would be measured from a player who is worth nothing) and neither can one who is dropped at an IL
    // return (a candidate does not take a slot that is closing); they read below it instead. With no such player
    // every counted player is a candidate
    const pl = plays(ctx, state, sideOpts(mo)), playing = k => pl[k] && pl[k].played > 0;
    const pool = counted.filter(k => state.slots[k] !== 'il' && playing(k) && pl[k].drop == null), cand = pool.length ? pool : counted;
    const worst = cand.reduce((a, b) => pw[b].m < pw[a].m ? b : a), ref = pw[worst], wSlot = state.slots[worst];
    return { base, pw, worst, grp: [worst], ref, wSlot, mo, off: { c: o.points ? null : 0, m: 0, dCat: o.points ? null : new Array(9).fill(0) }, avg: false };
  }

  // the preview with `key` in the worst player's slot (Active when that is the Reserve), scored against the current team
  function swapScore(ctx, state, su, cx, key) {
    const s0 = key in state.slots ? Team.applySwap(state, su.grp, []) : Team.applySwap(state, su.grp, [key]);
    return gain(matrix(cx, Team.moveSlot(s0, key, swapSlot(ctx, s0, su.wSlot)), su.mo), su.base);
  }
  // The slot a candidate takes in the worst player's place. Active claims nights before the Reserve, so a Reserve slot would score him on leftovers.
  // Plain ctx: the worst's slot (Active for a Reserve one). Team tab: Active while it has room under the roster limit, else the IL slot the worst
  // vacated on the seasonal bases (the slot Apply swap gives him, TeamView.apply), so the list and the roster after Apply agree
  function swapSlot(ctx, s0, wSlot) {
    if (!ctx.teamTab) return wSlot === 'reserve' ? 'active' : wSlot;
    const max = ctx.L.maxPlayers || ctx.L.maxActive, n = s0.order.filter(k => s0.slots[k] === 'active').length;
    return n >= max && wSlot === 'il' && Team.countedSlots(ctx).includes('il') ? 'il' : 'active';
  }

  function moduleRow(ctx, state, su, key) {
    const own = key in state.slots, s = own ? state.slots[key] : null, owner = own ? ctx.me : ((ctx.pool.byKey.get(key) || {}).owner || null), cur = 100 * su.base.mean.match;
    if (su.avg) {
      const counted = own && Team.countedSlots(ctx).includes(s), a = counted ? avgOwn(ctx, state, su.ap, key, su.mo) : avgCandidate(ctx, state, su.ap, key, su.mo), g = counted ? gain(su.base, a) : gain(a, su.base);
      return { key, owner, dM: g.m, dC: g.c, dCat: g.dCat, old: counted ? cur - g.m : cur, new: counted ? cur : cur + g.m };
    }
    const pw = su.pw, zero = () => su.mo.points ? null : new Array(9).fill(0);
    let r;
    const vs = (a, b) => ({ c: sub(a.c, b.c), m: a.m - b.m, dCat: subV(a.dCat, b.dCat) });
    if (su.grp.includes(key)) r = { c: su.mo.points ? null : 0, m: 0, dCat: zero() };
    else if (own && Team.countedSlots(ctx).includes(s)) r = vs(pw[key], su.ref);
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

  const api = { SHRINK, engCtx, engCtxFrom, teamVec, plays, dropRank, evalVecs, tabView, tradeState, leagueWin, pointsPerWeek, weeksLeft, oppState, received, goneKeys, side, matrix, matrixOf, avgParts, playerGain, playerWin, moduleSetup, moduleRow, moduleSort, moduleScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamWin = api;
})(typeof self !== 'undefined' ? self : this);
