// Team tab core (#131, 2026-10-25): preview roster state and swaps. Pure; browser and Node. Nothing here touches the saved league.
// Slots: active, bench, il, reserve. Fantrax RESERVE is the bench; "reserve" is the Team tab's own uncounted slot.
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), Matchup = root.Matchup || require('./matchup_core.js'),
    Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Shared = root.Shared || require('./shared.js');
  const SLOTS =['active', 'bench', 'il', 'reserve'];
  const FROM_FANTRAX = { ACTIVE: 'active', RESERVE: 'bench', IR: 'il' };

  // rows: parseRosters entries [{ fid, slot }] for my team
  function initState(rows) {
    const slots = {}, order = [];
    rows.forEach(x => { slots[x.fid] = FROM_FANTRAX[x.slot] || 'bench'; order.push(x.fid); });
    return { slots, order };
  }

  function moveSlot(state, key, slot) {
    if (!(key in state.slots)) throw new Error('player not on the preview roster: ' + key);
    if (!SLOTS.includes(slot)) throw new Error('unknown slot: ' + slot);
    return { slots: Object.assign({}, state.slots, { [key]: slot }), order: state.order.slice() };
  }

  // any number of players out and in; incoming players start on the bench
  function applySwap(state, outKeys, inKeys) {
    outKeys.forEach(k => { if (!(k in state.slots)) throw new Error('player not on the preview roster: ' + k); });
    if (new Set(outKeys).size !== outKeys.length || new Set(inKeys).size !== inKeys.length) throw new Error('duplicate player in swap');
    inKeys.forEach(k => { if (k in state.slots && !outKeys.includes(k)) throw new Error('player already on the roster: ' + k); });
    const slots = Object.assign({}, state.slots), out = new Set(outKeys);
    outKeys.forEach(k => { delete slots[k]; });
    inKeys.forEach(k => { slots[k] = 'bench'; });
    return { slots, order: state.order.filter(k => !out.has(k)).concat(inKeys.filter(k => !state.order.includes(k) || out.has(k))) };
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

  // Plays % over the window: active players claim the nightly slots first (best per-game players when over the limit), the
  // bench takes what is left; IL and reserve rows show what they would get as one more bench player (hypo: true, so teamLine
  // leaves them out). Roster order breaks ties. -> { key: { gl, played, pct, hypo? } }; pct is null when the team has no games left
  function playsPct(ctx, state) {
    const w = window(ctx), by = slot => state.order.filter(k => state.slots[k] === slot);
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, byKey = ctx.pool.byKey, max = ctx.L.maxActive;
    const act = by('active'), bench = by('bench'), res = {};
    const done = (k, played, hypo) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl ? played / gl : null }; if (hypo) res[k].hypo = true; };
    const gA = windowGames(ctx, act, null), count = {}, used = {};
    act.forEach((k, i) => {
      done(k, gA[i]);
      const out = ctx.out && ctx.out.has(k);
      (G[byKey.get(k).t] || []).map(s => s * 1000).filter(ms => ms >= w.from && ms < w.to && !(out && ms < ctx.curEnd)).forEach(ms => { const d = InLeague.localDay(ms); count[d] = (count[d] || 0) + 1; });
    });
    Object.keys(count).forEach(d => { used[d] = Math.min(max, count[d]); });
    const gB = windowGames(ctx, bench, used);
    bench.forEach((k, i) => done(k, gB[i]));
    state.order.filter(k => state.slots[k] === 'il' || state.slots[k] === 'reserve').forEach(k => {
      const g = windowGames(ctx, bench.concat(k), used);
      done(k, g[g.length - 1], true);
    });
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

  const api = { SLOTS, initState, moveSlot, applySwap, window, gamesLeft, seasonGamesLeft, playsPct, weightedZ, teamLine, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this);
