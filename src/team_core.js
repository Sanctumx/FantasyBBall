// Team tab core (#131, 2026-10-25): preview roster state and swaps. Pure; browser and Node. Nothing here touches the saved league.
// Slots: active, bench, il, reserve. Fantrax RESERVE is the bench; "reserve" is the Team tab's own uncounted slot.
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), Matchup = root.Matchup || require('./matchup_core.js');
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

  // Plays % over the window: active players claim the nightly slots first (best per-game players when over the limit), the
  // bench takes what is left; IL and reserve rows show what they would get as one more bench player. Roster order breaks ties.
  // -> { key: { gl, played, pct } }; pct is null when the team has no games left
  function playsPct(ctx, state) {
    const w = window(ctx), seg = key => ({ key, from: w.from, to: w.to }), by = slot => state.order.filter(k => state.slots[k] === slot);
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, byKey = ctx.pool.byKey, max = ctx.L.maxActive;
    const act = by('active'), bench = by('bench'), res = {};
    const done = (k, played) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl ? played / gl : null }; };
    const gA = Matchup.segGames(ctx, act.map(seg), null, true), count = {}, used = {};
    act.forEach((k, i) => {
      done(k, gA[i]);
      (G[byKey.get(k).t] || []).map(s => s * 1000).filter(ms => ms >= w.from && ms < w.to).forEach(ms => { const d = InLeague.localDay(ms); count[d] = (count[d] || 0) + 1; });
    });
    Object.keys(count).forEach(d => { used[d] = Math.min(max, count[d]); });
    const gB = Matchup.segGames(ctx, bench.map(seg), used, true);
    bench.forEach((k, i) => done(k, gB[i]));
    state.order.filter(k => state.slots[k] === 'il' || state.slots[k] === 'reserve').forEach(k => {
      const g = Matchup.segGames(ctx, bench.concat(k).map(seg), used, true);
      done(k, g[g.length - 1]);
    });
    return res;
  }

  const api = { SLOTS, initState, moveSlot, applySwap, window, gamesLeft, playsPct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this);
