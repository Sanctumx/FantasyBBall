// Team tab core (#131, 2026-10-25): preview roster state and swaps. Pure; browser and Node. Nothing here touches the saved league.
// Slots: active, reserve, il. Fantrax RESERVE is the reserve (it fills the nights Active leaves open, so it counts); IL does not count.
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), Matchup = root.Matchup || require('./matchup_core.js'),
    Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Shared = root.Shared || require('./shared.js');
  const SLOTS = ['active', 'reserve', 'il'];
  const FROM_FANTRAX = { ACTIVE: 'active', RESERVE: 'reserve', IR: 'il' };
  // the slots that count in the team's stats, Win C and Win M
  const COUNTED = ['active', 'reserve'];
  // The Team tab (ctx.teamTab, set by TeamView.sourceCtx; the Trade Analyzer's and Rankings' plain ctxs never carry it): Reserve is only a
  // parking place and counts for nothing; IL counts only on the seasonal bases, where availability (avail) scales its games
  const countedSlots = ctx => !ctx || !ctx.teamTab ? COUNTED : ctx.basis === 'pergame' ? ['active'] : ['active', 'il'];
  const counted = (state, ctx) => { const c = countedSlots(ctx); return state.order.filter(k => c.includes(state.slots[k])); };
  // share of the team's games a player is there for: Per game compares everyone at peak non-injury performance (1), the seasonal basis uses
  // his projected games (g/82), Mix halfway; a plain ctx has no availability
  const avail = (ctx, pp) => {
    if (!ctx || !ctx.teamTab || ctx.basis === 'pergame') return 1;
    const a = Math.min(1, pp.g / 82);
    return ctx.basis === 'mix' ? (1 + a) / 2 : a;
  };

  // rows: parseRosters entries [{ fid, slot }] for my team
  function initState(rows) {
    const slots = {}, order = [];
    rows.forEach(x => { slots[x.fid] = FROM_FANTRAX[x.slot] || 'reserve'; order.push(x.fid); });
    return { slots, order, moves: [] };
  }

  // the Team tab's starting state: Courtside Active = the league's active + bench (Fantrax RESERVE), IR is il; there is no Reserve until a player is parked
  function tabState(rows) {
    const s = initState(rows);
    s.order.forEach(k => { if (s.slots[k] === 'reserve') s.slots[k] = 'active'; });
    return s;
  }

  function moveSlot(state, key, slot) {
    if (!(key in state.slots)) throw new Error('player not on the preview roster: ' + key);
    if (!SLOTS.includes(slot)) throw new Error('unknown slot: ' + slot);
    return { slots: Object.assign({}, state.slots, { [key]: slot }), order: state.order.slice(), moves: state.moves || [] };
  }

  // any number of players out and in; incoming players start in the reserve. state.moves records each swap ({ out, in }) so the Team tab
  // can hand the players I send out to the teams the incoming ones came from (TeamWin.received); an empty swap records nothing
  function applySwap(state, outKeys, inKeys) {
    outKeys.forEach(k => { if (!(k in state.slots)) throw new Error('player not on the preview roster: ' + k); });
    if (new Set(outKeys).size !== outKeys.length || new Set(inKeys).size !== inKeys.length) throw new Error('duplicate player in swap');
    inKeys.forEach(k => { if (k in state.slots && !outKeys.includes(k)) throw new Error('player already on the roster: ' + k); });
    const slots = Object.assign({}, state.slots), out = new Set(outKeys);
    outKeys.forEach(k => { delete slots[k]; });
    inKeys.forEach(k => { slots[k] = 'reserve'; });
    const moves = (state.moves || []).concat(outKeys.length && inKeys.length ? [{ out: outKeys.slice(), in: inKeys.slice() }] : []);
    return { slots, order: state.order.filter(k => !out.has(k)).concat(inKeys.filter(k => !state.order.includes(k) || out.has(k))), moves };
  }

  // remaining regular season: from now to the end of the last regular period (schedule times are in seconds, ctx times in ms)
  function window(ctx) {
    const last = ctx.L.periods.find(p => p.n === ctx.L.lastRegular);
    return { from: ctx.nowMs, to: last ? last.end : ctx.nowMs };
  }

  // team games left in the window; says nothing about Plays %
  function gamesLeft(ctx, team) {
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, w = window(ctx);
    return (G[team] || []).filter(s => s * 1000 >= w.from && s * 1000 < w.to).length;
  }

  // team games from now to the end of the NBA schedule (past the league's last regular week); the GL column reads this
  function seasonGamesLeft(ctx, team) {
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {};
    return (G[team] || []).filter(s => s * 1000 >= ctx.nowMs).length;
  }

  // games per key over the window. segGames zeroes an "out" player's segment when it starts before ctx.curEnd, which is meant
  // for the rest of the current week only, so the window is cut at curEnd and the two parts are summed
  function windowGames(ctx, keys, used) {
    const w = window(ctx), cut = Math.min(Math.max(ctx.curEnd || 0, w.from), w.to), seg = (key, from, to) => ({ key, from, to });
    if (cut <= w.from || cut >= w.to) return Matchup.segGames(ctx, keys.map(k => seg(k, w.from, w.to)), used, true);
    const a = Matchup.segGames(ctx, keys.map(k => seg(k, w.from, cut)), used, true), b = Matchup.segGames(ctx, keys.map(k => seg(k, cut, w.to)), used, true);
    return a.map((x, i) => x + b[i]);
  }

  // windowGames split into buckets (cuts: ascending ms, bucket i = [cuts[i], cuts[i+1])) -> keys × buckets, row sums equal windowGames.
  // One segGames call per part of the window carries every key's segment of every bucket, so the nightly caps see the same players as the
  // unsplit call (keys stay in order, so ties break the same way). Games outside the cuts are dropped from the buckets
  function windowGamesBy(ctx, keys, used, cuts) {
    const w = window(ctx), nb = cuts.length - 1, cut = Math.min(Math.max(ctx.curEnd || 0, w.from), w.to), out = keys.map(() => new Array(nb).fill(0));
    const part = (pf, pt) => {
      const segs = [];
      keys.forEach(key => { for (let b = 0; b < nb; b++) { const from = Math.max(cuts[b], pf), to = Math.min(cuts[b + 1], pt); segs.push({ key, from, to: Math.max(from, to) }); } });
      Matchup.segGames(ctx, segs, used, true).forEach((g, j) => { out[Math.floor(j / nb)][j % nb] += g; });
    };
    if (cut <= w.from || cut >= w.to) part(w.from, w.to); else { part(w.from, cut); part(cut, w.to); }
    return out;
  }

  // Plays % over the window: active players claim the nightly slots first (best per-game players when over the limit), the
  // reserve takes what is left; IL rows show what they would get as one more reserve player (hypo: true, so teamLine
  // leaves them out). Roster order breaks ties. -> { key: { gl, played, pct, hypo? } }; pct is null when the team has no games left
  function playsPct(ctx, state, o) {
    if (ctx.teamTab) return tabPlays(ctx, state, o);
    const w = window(ctx), by = slot => state.order.filter(k => state.slots[k] === slot);
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, byKey = ctx.pool.byKey, max = ctx.L.maxActive;
    const act = by('active'), bench = by('reserve'), res = {};
    const cuts = o && o.cuts, nb = cuts ? cuts.length - 1 : 0;
    const done = (k, played, hypo, by) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl ? played / gl : null }; if (hypo) res[k].hypo = true; if (cuts) res[k].by = by || new Array(nb).fill(0); };
    const gA = windowGames(ctx, act, null), count = {}, used = {}, byA = cuts ? windowGamesBy(ctx, act, null, cuts) : null;
    act.forEach((k, i) => {
      done(k, gA[i], false, byA && byA[i]);
      const out = ctx.out && ctx.out.has(k);
      (G[byKey.get(k).t] || []).map(s => s * 1000).filter(ms => ms >= w.from && ms < w.to && !(out && ms < ctx.curEnd)).forEach(ms => { const d = InLeague.localDay(ms); count[d] = (count[d] || 0) + 1; });
    });
    Object.keys(count).forEach(d => { used[d] = Math.min(max, count[d]); });
    const gB = windowGames(ctx, bench, used), byB = cuts ? windowGamesBy(ctx, bench, used, cuts) : null;
    bench.forEach((k, i) => done(k, gB[i], false, byB && byB[i]));
    by('il').forEach(k => {
      const g = windowGames(ctx, bench.concat(k), used);
      done(k, g[g.length - 1], true, cuts ? windowGamesBy(ctx, bench.concat(k), used, cuts).pop() : null);
    });
    return res;
  }

  // one player's games over the window with no nightly cap (the games his own team's schedule allows him), under the same rule as playsPct
  // (`to`, ms, cuts the window short: a dropped player's games up to his leave time)
  function soloGames(ctx, key, to) {
    const pp = ctx.pool.byKey.get(key), w = window(ctx);
    if (!ctx.teamTab || ctx.basis === 'pergame') return windowGames(ctx, [key], null)[0];
    return InLeague.rosterGames([{ t: pp.t, a: avail(ctx, pp), from: w.from, to: to != null ? Math.min(to, w.to) : w.to }], ctx.DAYS, ctx.L.maxActive, null)[0];
  }

  // The availability of a typical player in the league: the median of avail over the rostered players who are not on IR (cached per ctx).
  // Per game and plain ctxs have none (avail is 1)
  const typMemo = new WeakMap();
  function typicalAvail(ctx) {
    if (!ctx || !ctx.teamTab || ctx.basis === 'pergame') return 1;
    if (typMemo.has(ctx)) return typMemo.get(ctx);
    const a = ctx.pool.players.filter(p => p.owner && p.slot !== 'IR').map(p => avail(ctx, p)).sort((x, y) => x - y), n = a.length;
    const med = n ? (a[Math.floor((n - 1) / 2)] + a[Math.ceil((n - 1) / 2)]) / 2 : 1;
    typMemo.set(ctx, med);
    return med;
  }

  // An IL player on the timeline (user 2026-10-29; there are no return dates yet): his projected games (avail) carry both his current absence
  // and the generic chance of missing games later that every player has, so only the part of his missed games above a typical player's goes up
  // front. He is out for the first nOut of his team's games in the window (until tRet, ms), then plays at rate a, which keeps his total at
  // avail x GL. -> { nOut, tRet, a }; a real return date would replace nOut / tRet
  function ilReturn(ctx, key) {
    const pp = ctx.pool.byKey.get(key), w = window(ctx), a0 = avail(ctx, pp), aT = typicalAvail(ctx), G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {};
    const times = (G[pp.t] || []).map(s => s * 1000).filter(ms => ms >= w.from && ms < w.to).sort((x, y) => x - y), gl = times.length;
    // the cap keeps the rate after the return at 1 or below, so rounding never costs him games
    const nOut = Math.min(Math.floor(gl * (1 - a0) + 1e-9), aT > 0 ? Math.round(gl * Math.max(0, 1 - a0 / aT)) : 0);
    return { nOut, tRet: nOut ? (times[nOut] != null ? times[nOut] : w.to) : w.from, a: gl > nOut ? Math.min(1, a0 * gl / (gl - nOut)) : 0 };
  }

  // Plays % on the Team tab (ctx.teamTab): Reserve is parked and plays 0%, never hypo. Per game: Active players claim the nights as above
  // (everyone is there for every team game; IL gets none). Seasonal bases: Active players are there for avail(g) of the team's games and an IL
  // player from his return (ilReturn) on; one call fills the nights best value first, capped per night at the league's active limit
  // (InLeague.rosterGames). So the cover plays until the IL player is back and whoever is worst by value then loses nights. When the roster
  // would exceed the league's player limit (maxPlayers) once the IL players are back, the Reserve players go first and then counted players
  // in order of o.rank(key) (lower goes first; ties by nightValue, then key; the caller ranks by Win M contribution, TeamWin.dropRank).
  // The j-th drop leaves at the j-th time a spot is missing (each IL return past the limit; already over it, the window start), and that
  // row carries drop: leaveMs. A dropped IL player never plays. o.extra = rosterGames items that sit on the roster too (count against the
  // limit, never dropped, not returned). pct is the lineup share of the games a player is there for, so availability (which GL carries) is
  // not counted twice
  function tabPlays(ctx, state, o) {
    o = o || {};
    const w = window(ctx), byKey = ctx.pool.byKey, res = {}, c = countedSlots(ctx), keys = state.order.filter(k => c.includes(state.slots[k])), extra = o.extra || [];
    const cuts = o.cuts, nb = cuts ? cuts.length - 1 : 0;   // o.cuts: also return res[k].by, the games in each bucket [cuts[i], cuts[i+1]) (the sums equal played)
    const done = (k, played, a, drop, by) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl && a > 0 ? played / (gl * a) : gl ? 0 : null }; if (drop != null) res[k].drop = drop; if (cuts) res[k].by = by || new Array(nb).fill(0); };
    state.order.forEach(k => { if (!c.includes(state.slots[k])) done(k, 0, 1); });
    if (ctx.basis === 'pergame') { const byG = cuts ? windowGamesBy(ctx, keys, null, cuts) : null; windowGames(ctx, keys, null).forEach((g, i) => done(keys[i], g, 1, undefined, byG && byG[i])); }
    else {
      const il = keys.filter(k => state.slots[k] === 'il'), ret = {}, v = k => Matchup.nightValue(ctx, byKey.get(k));
      il.forEach(k => { ret[k] = ilReturn(ctx, k); });
      const lim = ctx.L.maxPlayers, parked = state.order.filter(k => state.slots[k] === 'reserve').length;
      const onRoster = state.order.filter(k => state.slots[k] !== 'il').length + extra.length - parked;   // the players on the roster now, Reserve ones aside
      const need = typeof lim === 'number' && il.length ? Math.max(0, onRoster + il.length - lim) : 0;
      const nDrop = o.noDrop ? 0 : Math.max(need, o.force || 0);   // o.noDrop: everyone stays; o.force: at least that many go, at the first return (the window's middle with no IL player) - TeamWin.dropRank's trial runs
      if (nDrop && typeof o.rank !== 'function') throw new Error('tabPlays: the roster is over the player limit, o.rank is needed to choose who is dropped');
      const rk = o.rank, order = !nDrop ? keys : keys.slice().sort((x, y) => (rk(x) === rk(y) ? 0 : rk(x) < rk(y) ? -1 : 1) || (v(x) - v(y)) || (x < y ? -1 : x > y ? 1 : 0));
      const dropped = new Set(order.slice(0, nDrop)), keptRet = il.filter(k => !dropped.has(k)).map(k => ret[k].tRet).sort((x, y) => x - y);
      const s = Number.isFinite(lim) ? lim - onRoster : Infinity, times = s >= 0 ? keptRet.slice(s) : new Array(-s).fill(w.from).concat(keptRet), leave = {}, outs = order.slice(0, nDrop).filter(k => !il.includes(k));
      while (times.length < outs.length) times.unshift(keptRet.length ? keptRet[0] : w.from + (w.to - w.from) / 2);   // only a forced drop is short of a time
      outs.forEach((k, j) => { leave[k] = times[j]; });
      il.forEach(k => { if (dropped.has(k)) leave[k] = w.from; });   // a dropped IL player never plays: he left at the start
      const items = keys.map(k => il.includes(k)
        ? (dropped.has(k) ? { t: byKey.get(k).t, a: 0, v: v(k), from: w.from, to: w.from } : { t: byKey.get(k).t, a: ret[k].a, v: v(k), from: ret[k].tRet, to: w.to })
        : { t: byKey.get(k).t, a: avail(ctx, byKey.get(k)), v: v(k), from: w.from, to: leave[k] != null ? leave[k] : w.to });
      const byG = cuts ? InLeague.rosterGamesBy(items.concat(extra), ctx.DAYS, ctx.L.maxActive, null, cuts) : null;
      InLeague.rosterGames(items.concat(extra), ctx.DAYS, ctx.L.maxActive, null).forEach((g, i) => { if (i < keys.length) done(keys[i], g, avail(ctx, byKey.get(keys[i])), leave[keys[i]], byG && byG[i]); });
    }
    return res;
  }

  // Zscore with a 0-1 weight per category (punt lens): the Rankings Zscore is sum(cats[c] x base weight[c]); weights default to 1
  // nCats = the league's category count (9 or 8; turnovers carry no weight in 8), as in Rankings.table
  function weightedZ(cats, weights, nCats) {
    const W = Eng.catWeights({ catW: InPlayers.WEIGHTS, cats: nCats || 9 });
    return cats.reduce((s, v, c) => s + v * W[c] * (weights && weights[c] != null ? weights[c] : 1), 0);
  }

  // my team's per-game line: entries [{ line, pct, hypo }] (pct = Plays %, null counts for nothing; hypo rows are left out); counting stats are
  // sum(pct x stat) / slots, the percentages come from summed makes and attempts
  function teamLine(entries, slots) {
    const S = { fga: 0, fgm: 0, fta: 0, ftm: 0, tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 };
    entries.forEach(e => {
      if (e.hypo) return;
      const p = e.pct || 0, l = e.line;
      S.fga += p * l.fga; S.fgm += p * l.fga * l.fgp; S.fta += p * l.fta; S.ftm += p * l.fta * l.ftp;
      ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'].forEach(k => { S[k] += p * l[k]; });
    });
    const out = { fgp: S.fga ? S.fgm / S.fga : 0, fga: S.fga / slots, ftp: S.fta ? S.ftm / S.fta : 0, fta: S.fta / slots };
    ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'].forEach(k => { out[k] = S[k] / slots; });
    return out;
  }

  // type-ahead matcher: accent- and case-insensitive; every typed word must start a word of the name or sit inside one.
  // Names with a matching word start come first; list order breaks ties. -> up to `limit` items of `list` (items have .n)
  function search(list, query, limit) {
    const q = Shared.norm(query).split(/\s+/).filter(Boolean);
    if (!q.length) return [];
    const hits = [[], []];
    list.forEach(x => {
      const n = Shared.norm(x.n), words = n.split(/\s+/);
      if (!q.every(t => n.includes(t))) return;
      hits[q.every(t => words.some(w => w.startsWith(t))) ? 0 : 1].push(x);
    });
    return hits[0].concat(hits[1]).slice(0, limit || 50);
  }

  const api = { SLOTS, COUNTED, countedSlots, counted, avail, windowGames, soloGames, typicalAvail, ilReturn, initState, tabState, moveSlot, applySwap, window, gamesLeft, seasonGamesLeft, playsPct, weightedZ, teamLine, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this);
