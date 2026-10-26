// Team tab win numbers (#131 PR 2, 2026-10-25; moved onto the Rankings / Draft-tab engine 2026-10-26): the matrix of the previewed
// roster against every other team, each player's Win C / Win M contribution, and the player-list module scores. Pure; browser and
// Node. Nothing here changes the saved league, ctx or the pool. Every team's players get their remaining Plays % games per
// average week (mine and every opponent's, with the nightly cap), turned into season-equivalent games (x WEEKS) and summed into
// one forecast per team with Engine.entryVec; Engine.evaluate then gives every pairing's category and match chances, with the
// engine's own noise (SIGMA_G2 games variance) and no shrink toward 0.5.
// Units follow Rankings: m = Win M points (100 x the change in the match chance), c = Win C hundredths (100 x the change in
// the summed category chances, averaged over the opponents).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Team = root.Team || require('./team_core.js');
  const NC = Eng.NC;

  // the engine context of a ctx's player pool: noise and pool averages from simulated drafts of the real league (rostered players
  // first), IL fill off because Plays % already counts the games a player misses. Built once per ctx and category count.
  const ectxs = new WeakMap();
  function engCtx(ctx, nc) {
    let by = ectxs.get(ctx); if (!by) ectxs.set(ctx, by = {});
    if (!by[nc]) {
      const N = Object.keys(ctx.roster).length, R = ctx.L.maxActive, adp = p => p.adp == null ? 1e9 : p.adp;
      const list = ctx.pool.players.filter(p => p.g > 0).sort((a, b) => (a.owner ? 0 : 1) - (b.owner ? 0 : 1) || adp(a) - adp(b));
      const P = Eng.prepPlayers(list.map((p, i) => Object.assign({}, p.line, { g: p.g, ftx: i + 1 })));
      const cfg = { teams: N, roster: R, slot: 1, order: '3rr', scoring: 'h2h', cats: nc, ilSpots: 0, field: 'easy', fieldZ: 'std', puntMode: 'off', puntLock: '',
        catW: InPlayers.WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0, basis: 'total' };
      by[nc] = { ctx: Eng.buildContext(P, cfg), cfg };
    }
    return by[nc];
  }

  // one team's forecast: the sum of its entries' category vectors and projection variances. Entries are { p: stat line, games per
  // average week, sign? } (sign -1 takes an entry out of the team).
  function teamVec(e, entries) {
    const mu = new Float64Array(NC), v = new Float64Array(NC);
    entries.forEach(en => {
      const s = en.sign || 1, ev = Eng.entryVec(en.p, e.ctx, en.games * Eng.WEEKS);
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
  function oppState(ctx, teamId, exclude, recv) {
    const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f)) && ctx.pool.byKey.get(f).slot !== 'IR').map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
    (recv || []).filter(r => ctx.pool.byKey.get(r.key).slot !== 'IR').forEach(r => rows.push({ fid: r.key, slot: r.slot === 'active' ? 'ACTIVE' : 'RESERVE' }));
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

  // pairMatchup entries for the active and reserve players: games = Plays % games per average week (hypothetical rows never count)
  function side(ctx, state, W) {
    const r = Team.playsPct(ctx, state);
    return state.order.filter(k => Team.COUNTED.includes(state.slots[k]) && !r[k].hypo)
      .map(k => ({ key: k, p: ctx.pool.byKey.get(k).line, games: r[k].played / W }));
  }

  // ctx must be treated as immutable (the cache is keyed on the object; makeCtx builds a new one per change)
  // opponents' forecasts are the same for every previewed roster that removes the same players from them, so they are cached per ctx
  const memos = new WeakMap();
  function oppTeam(ctx, e, nc, tid, exclude, W, recv) {
    let memo = memos.get(ctx);
    if (!memo) { memo = new Map(); memos.set(ctx, memo); }
    const gone = ctx.roster[tid].filter(f => exclude.has(f)).sort(), id = tid + '|' + gone.join(',') + '|' + (recv || []).map(r => r.key + ':' + r.slot).sort().join(',') + '|' + W + '|' + nc;
    if (!memo.has(id)) memo.set(id, teamVec(e, side(ctx, oppState(ctx, tid, exclude, recv), W)));
    return memo.get(id);
  }

  // my previewed roster against every other team. -> { weeks, teams: [{ id, cat[9], match, winC }], mean: { cat, match, winC } }
  // (cat entries beyond the league's category count are null). opts: cats 9 | 8. Players I hold leave their old team's side, and the
  // teams my candidates came from receive the players I send out (received).
  function matrix(ctx, state, opts) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return { weeks: 0, teams: [], mean: null };
    const recv = received(ctx, state), keys = [].concat(...Object.values(recv)).map(r => r.key);
    return matrixOf(ctx, side(ctx, state, W), new Set(state.order.concat(keys)), W, Object.assign({}, opts, { recv }));
  }

  // the matrix for any set of my entries [{ p, games, sign? }] (games per average week, W = weeks left); `exclude` = the keys that left
  // their old team's side (everyone on my roster, and a candidate I bring in)
  function matrixOf(ctx, mine, exclude, W, o) {
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc), ids = Object.keys(ctx.roster).filter(t => t !== ctx.me);
    const tv = [teamVec(e, mine)].concat(ids.map(id => oppTeam(ctx, e, nc, id, exclude, W, o && o.recv && o.recv[id])));
    const pl = tv.map((t, i) => ({ id: i, x: t.mu, pv: t.v, adpUse: 1, sd: 1, adpE: 1, sdE: 1, fieldV: 0, boardRaw: 0 }));
    const out = Eng.evaluate(pl, e.ctx, Object.assign({}, e.cfg, { teams: pl.length, roster: 1, slot: 1 }), { picks: pl.map((_, i) => i), owner: pl.map((_, i) => i) });
    const teams = ids.map((id, i) => {
      const A = out.teams[0], B = out.teams[i + 1], cat = Array.from({ length: 9 }, (_, c) => c >= nc ? null : out.catProb(A, B, c));
      return { id, cat, match: out.pairProb(A, B), winC: cat.reduce((s, v) => s + (v == null ? 0 : v), 0) };
    });
    const avg = f => teams.reduce((s, t) => s + f(t), 0) / (teams.length || 1);
    return { weeks: W, teams, mean: { cat: Array.from({ length: 9 }, (_, c) => (c >= nc ? null : avg(t => t.cat[c]))), match: avg(t => t.match), winC: avg(t => t.winC) } };
  }

  const dCats = (a, b) => a.mean.cat.map((v, c) => v == null ? 0 : 100 * (v - b.mean.cat[c]));
  const gain = (a, b) => ({ c: 100 * (a.mean.winC - b.mean.winC), m: 100 * (a.mean.match - b.mean.match), dCat: dCats(a, b) });

  // each roster player's contribution to my Win C / Win M: active and reserve = the team minus the team without him (the reserve
  // refills his nights); IL = the team with him in the reserve minus the team (hypo: true). -> { key: { c, m, dCat[9], hypo? } }
  // one player's contribution given the current roster's matrix `base` (playerWin's per-player step, so a page can score one at a time)
  // opts.baseline 'avg' (Vs average): see avgParts; my own Active / Reserve player X = the team minus (the team with X replaced by an average
  // player); my IL player = a candidate. Default 'rep' = the raw contribution.
  function playerGain(ctx, state, k, base, opts) {
    if (!base.mean) return { c: 0, m: 0, dCat: new Array(9).fill(0) };
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
    const t = trade(ctx, state);
    return matrixOf(ctx, mine, new Set(state.order.concat([...t.gone])).add(key), ap.W, Object.assign({}, opts, { recv: t.recv }));
  }

  // my counted player replaced by an average-line player who keeps his games (so a Reserve player is judged on his quality, not his slot)
  function avgOwn(ctx, state, ap, key, opts) {
    const e = ap.mine.find(x => x.key === key), t = trade(ctx, state);
    return matrixOf(ctx, ap.mine.filter(x => x.key !== key).concat(Object.assign({}, ap.mean, { games: e.games })), new Set(state.order.concat([...t.gone])), ap.W, Object.assign({}, opts, { recv: t.recv }));
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
    const o = opts || {}, mo = { cats: o.cats, k: o.k, mode: o.mode }, base = o.base || matrix(ctx, state, mo);
    if (!base.mean) return null;
    if (o.baseline === 'avg') { const ap = avgParts(ctx, state, base.weeks); return ap ? { base, ap, mo, avg: true } : null; }
    const pw = o.pw || playerWin(ctx, state, mo), counted = Team.counted(state);
    if (!counted.length) return null;
    const worst = counted.reduce((a, b) => pw[b].m < pw[a].m ? b : a), wSlot = state.slots[worst];
    return { base, pw, worst, wSlot, mo, off: { c: 0, m: 0, dCat: new Array(9).fill(0) }, avg: false };
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
    const pw = su.pw, zero = () => new Array(9).fill(0);
    let r;
    if (key === su.worst) r = { c: 0, m: 0, dCat: zero() };
    else if (own && Team.COUNTED.includes(s)) r = { c: pw[key].c - pw[su.worst].c, m: pw[key].m - pw[su.worst].m, dCat: pw[key].dCat.map((v, c) => v - pw[su.worst].dCat[c]) };
    else r = swapScore(ctx, state, su, ctx, key);
    return { key, owner, dM: r.m - su.off.m, dC: r.c - su.off.c, dCat: r.dCat.map((v, c) => v - su.off.dCat[c]), old: cur + su.off.m, new: cur + r.m };
  }

  function moduleSort(rows, weights) {
    const weighted = weights && weights.some(w => w != null && w !== 1);
    return rows.map((r, i) => Object.assign({}, r, { sort: weighted ? r.dCat.reduce((a, v, c) => a + v * (weights[c] == null ? 1 : weights[c]), 0) : r.dM, i }))
      .sort((a, b) => b.sort - a.sort || a.i - b.i).map(r => { delete r.i; return r; });
  }

  function moduleScores(ctx, state, opts) {
    const o = opts || {}, su = moduleSetup(ctx, state, o);
    if (!su) return [];
    return moduleSort((o.candidates || ctx.pool.players.map(p => p.key)).map(k => moduleRow(ctx, state, su, k)), o.weights);
  }

  const api = { weeksLeft, oppState, received, side, matrix, matrixOf, avgParts, playerGain, playerWin, moduleSetup, moduleRow, moduleSort, moduleScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamWin = api;
})(typeof self !== 'undefined' ? self : this);
