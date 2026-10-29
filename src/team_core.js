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

  // Plays % over the window: active players claim the nightly slots first (best per-game players when over the limit), the
  // reserve takes what is left; IL rows show what they would get as one more reserve player (hypo: true, so teamLine
  // leaves them out). Roster order breaks ties. -> { key: { gl, played, pct, hypo? } }; pct is null when the team has no games left
  function playsPct(ctx, state) {
    if (ctx.teamTab) return tabPlays(ctx, state);
    const w = window(ctx), by = slot => state.order.filter(k => state.slots[k] === slot);
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, byKey = ctx.pool.byKey, max = ctx.L.maxActive;
    const act = by('active'), bench = by('reserve'), res = {};
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
    by('il').forEach(k => {
      const g = windowGames(ctx, bench.concat(k), used);
      done(k, g[g.length - 1], true);
    });
    return res;
  }

  // one player's games over the window with no nightly cap (the games his own team's schedule allows him), under the same rule as playsPct
  function soloGames(ctx, key) {
    const pp = ctx.pool.byKey.get(key), w = window(ctx);
    if (!ctx.teamTab || ctx.basis === 'pergame') return windowGames(ctx, [key], null)[0];
    return InLeague.rosterGames([{ t: pp.t, a: avail(ctx, pp), from: w.from, to: w.to }], ctx.DAYS, ctx.L.maxActive, null)[0];
  }

  // With the Active slots full on a seasonal basis, the k IL players share the slots of the k worst Active players (lowest nightly value):
  // -> [[active key, il key]], the n-th IL player with the n-th worst Active player (wrapping when there are more IL than Active). [] otherwise
  function ilPairs(ctx, state) {
    if (!ctx.teamTab || ctx.basis === 'pergame') return [];
    const c = countedSlots(ctx), keys = state.order.filter(k => c.includes(state.slots[k])), act = keys.filter(k => state.slots[k] === 'active'), il = keys.filter(k => state.slots[k] === 'il');
    if (!(act.length >= ctx.L.maxActive) || !act.length || !il.length) return [];
    const v = k => Matchup.nightValue(ctx, ctx.pool.byKey.get(k)), worst = act.slice().sort((a, b) => v(a) - v(b));
    return il.map((k, n) => [worst[n % worst.length], k]);
  }

  // Plays % on the Team tab (ctx.teamTab): Reserve is parked and plays 0%, never hypo. Per game: Active players claim the nights as above
  // (everyone is there for every team game; IL gets none). Seasonal bases: Active and IL players are there for avail(g) of the team's games,
  // capped per night at the league's active limit (InLeague.rosterGames); pct is the lineup share of the games a player is there for, so
  // availability (which GL carries) is not counted twice
  function tabPlays(ctx, state) {
    const w = window(ctx), byKey = ctx.pool.byKey, res = {}, c = countedSlots(ctx), keys = state.order.filter(k => c.includes(state.slots[k]));
    const done = (k, played, a) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl && a > 0 ? played / (gl * a) : gl ? 0 : null }; };
    state.order.forEach(k => { if (!c.includes(state.slots[k])) done(k, 0, 1); });
    if (ctx.basis === 'pergame') windowGames(ctx, keys, null).forEach((g, i) => done(keys[i], g, 1));
    else {
      // with the active slots full an IL player shares the worst active player's slot: his games come out of that player's games
      // (IL 20, worst 80 -> IL 20, worst 60), and their Plays % split what that player's was. Open slots are filled as before.
      const act = keys.filter(k => state.slots[k] === 'active'), full = act.length >= ctx.L.maxActive;
      const lineup = full ? act : keys, v = k => Matchup.nightValue(ctx, byKey.get(k));
      const items = lineup.map(k => ({ t: byKey.get(k).t, a: avail(ctx, byKey.get(k)), v: v(k), from: w.from, to: w.to }));
      InLeague.rosterGames(items, ctx.DAYS, ctx.L.maxActive, null).forEach((g, i) => done(lineup[i], g, items[i].a));
      if (full) {
        ilPairs(ctx, state).forEach(([wk, k]) => {
          const base = res[wk], take = Math.min(soloGames(ctx, k), base.played), share = base.played > 0 ? take / base.played : 0;
          res[k] = { gl: gamesLeft(ctx, byKey.get(k).t), played: take, pct: base.pct == null ? null : base.pct * share };
          res[k].wt = res[k].gl ? take / res[k].gl : null;
          base.played -= take; base.wt = base.gl ? base.played / base.gl : null; if (base.pct != null) base.pct *= 1 - share;
        });
      }
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

  const api = { SLOTS, COUNTED, countedSlots, counted, avail, windowGames, soloGames, ilPairs, initState, tabState, moveSlot, applySwap, window, gamesLeft, seasonGamesLeft, playsPct, weightedZ, teamLine, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this);
