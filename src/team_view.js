// Team tab page logic (#131 PR 3, 2026-10-25): the roster table rows and team average, the stepwise Win scoring job with its cache, and the
// swap-box helpers. Pure; browser and Node. team.html only draws what this returns. Nothing here touches ctx, the pool or the saved league.
// Plays % is a team-makeup share (who gets a lineup slot each night); GL is projected games left (team games x g/82, which already
// covers injuries and rest), so GL is never multiplied by Plays %. Only the team average and Win always use Plays %; the player rows use
// it only when the "adjust by Plays %" box is checked (opts.adjust).
(function (root) {
  'use strict';
  const Team = root.Team || require('./team_core.js'), TeamWin = root.TeamWin || require('./team_win.js');
  const SLOT_ORDER = Team.SLOTS;
  const COUNT = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];

  // projected remaining games: the team's games to the end of the NBA season times the player's availability (g/82)
  const gamesLeft = (ctx, pp) => Team.seasonGamesLeft(ctx, pp.t) * Math.min(1, pp.g / 82);

  // a per-game line times f; percentages stay, attempts and counting stats scale
  function scaled(line, f) {
    const o = { fgp: line.fgp, ftp: line.ftp, fga: line.fga * f, fta: line.fta * f };
    COUNT.forEach(k => { o[k] = line[k] * f; });
    return o;
  }

  // opts: zCats (pool player -> per-game category Zs[9], or null), weights (0-1 per category), cats (9 | 8), adjust (bool),
  // view 'game' (per game) | 'ros' (per game x GL). -> { groups: [{ slot, rows }], rows, avg, avgZ }
  // row: { key, n, t, pos, slot, gl, pct, hypo, stat, cats, z }; avg is Team.teamLine over the counted players (Plays % always in),
  // avgZ is the Plays % weighted Z per lineup slot (null without zCats)
  function rows(ctx, state, opts) {
    const o = opts || {}, plays = Team.playsPct(ctx, state), nc = o.cats === 8 ? 8 : 9, slots = ctx.L.maxActive;
    const all = state.order.map(key => {
      const pp = ctx.pool.byKey.get(key), p = plays[key], gl = gamesLeft(ctx, pp), f = o.adjust ? (p.pct == null ? 0 : p.pct) : 1;
      const cats = o.zCats ? o.zCats(pp) : null;
      return { key, n: pp.n, t: pp.t, pos: pp.pos, slot: state.slots[key], gl, pct: p.pct, hypo: !!p.hypo,
        stat: scaled(pp.line, (o.view === 'ros' ? gl : 1) * f),
        cats: cats && cats.map(v => v * f), z: cats ? Team.weightedZ(cats.map(v => v * f), o.weights, nc) : null };
    });
    const groups = SLOT_ORDER.map(slot => ({ slot, rows: all.filter(r => r.slot === slot) }));
    const avg = Team.teamLine(state.order.map(k => ({ line: ctx.pool.byKey.get(k).line, pct: plays[k].pct, hypo: plays[k].hypo })), slots);
    let avgCats = null;
    if (o.zCats) {
      avgCats = Array(9).fill(0);
      state.order.forEach(k => { const p = plays[k], c = o.zCats(ctx.pool.byKey.get(k)); if (!p.hypo && p.pct != null && c) c.forEach((v, i) => { avgCats[i] += p.pct * v / slots; }); });
    }
    const avgZ = avgCats ? Team.weightedZ(avgCats, o.weights, nc) : null;
    return { groups, rows: all, avg, avgZ, avgCats };
  }

  // each category's share of the weighted Z (cats x base weight x user weight), so the parts add up to Team.weightedZ
  function zParts(cats, weights, nc) {
    return cats.map((v, c) => Team.weightedZ(cats.map((x, i) => i === c ? x : 0), weights, nc));
  }

  // ---- Win scoring, one piece per step() so the page stays responsive: the matrix first, then one roster player per step ----
  // -> { done, matrix, players, step() }; step() returns true while there is more to do. players: { key: { c, m, dCat[9], hypo? } }
  function winJob(ctx, state, opts) {
    const keys = state.order.slice(), job = { done: false, matrix: null, players: {}, step() {
      if (job.done) return false;
      if (!job.matrix) job.matrix = TeamWin.matrix(ctx, state, opts);
      else {
        const k = keys[Object.keys(job.players).length];
        job.players[k] = TeamWin.playerGain(ctx, state, k, job.matrix, opts);
      }
      if (job.matrix && Object.keys(job.players).length === keys.length) job.done = true;
      return true;
    } };
    return job;
  }

  // ---- player list scoring (the Team tab module), in pieces of about `budgetMs` so the page stays responsive ----
  // pieces: the matrix, one raw gain per counted player, the setup (the average-entry offset for 'avg'), then one candidate row each.
  // opts: baseline 'rep' | 'avg', cats, k, mode (weights are not an input: they only re-sort, TeamWin.moduleSort). candidates default to the whole pool.
  // -> { done, rows (unsorted, in candidate order), n, total, step(budgetMs, clock) }; step() returns true while it did work
  function moduleJob(ctx, state, opts, candidates) {
    const o = opts || {}, mo = { cats: o.cats, k: o.k, mode: o.mode }, cand = candidates || ctx.pool.players.map(p => p.key);
    const counted = state.order.filter(k => state.slots[k] === 'active' || state.slots[k] === 'bench');
    let base = null, pw = {}, su = null;
    const job = { done: false, rows: [], n: 0, total: cand.length, step(budgetMs, clock) {
      if (job.done) return false;
      const now = clock || Date.now, t0 = now();
      do {
        if (!base) { base = TeamWin.matrix(ctx, state, mo); if (!base.mean || !counted.length) { job.done = true; break; } }
        else if (Object.keys(pw).length < state.order.length) { const k = state.order[Object.keys(pw).length]; pw[k] = TeamWin.playerGain(ctx, state, k, base, mo); }
        else if (!su) { su = TeamWin.moduleSetup(ctx, state, Object.assign({}, o, { base, pw })); if (!su) { job.done = true; break; } }
        else { job.rows.push(TeamWin.moduleRow(ctx, state, su, cand[job.n++])); if (job.n >= cand.length) job.done = true; }
      } while (!job.done && now() - t0 < budgetMs);
      return true;
    } };
    return job;
  }

  // the first job that is not done, or null (the page steps one job per tick: roster Win first, then the list)
  const nextJob = jobs => jobs.find(j => j && !j.done) || null;

  const signature = state => state.order.map(k => k + ':' + state.slots[k]).join('|');

  // finished and half-finished jobs by ctx object, roster and win options (cats, mode); the weights are not an input, so moving a slider never rescores
  function createScorer() {
    const by = new WeakMap();
    const bucket = ctx => { let m = by.get(ctx); if (!m) by.set(ctx, m = new Map()); return m; };
    const keyOf = (state, o) => signature(state) + '#' + (o.cats || '') + '#' + (o.mode || '') + '#' + (o.baseline || '');
    return {
      get(ctx, state, opts) {
        const m = bucket(ctx), sig = keyOf(state, opts || {});
        if (!m.has(sig)) m.set(sig, winJob(ctx, state, opts));
        return m.get(sig);
      },
      getModule(ctx, state, opts) {
        const m = bucket(ctx), sig = 'module#' + keyOf(state, opts || {});
        if (!m.has(sig)) m.set(sig, moduleJob(ctx, state, opts));
        return m.get(sig);
      } };
  }

  // ---- the list as drawn ----
  const SLOT_LABEL = { active: 'Active', bench: 'Bench', il: 'IL', reserve: 'Reserve' };
  // rows: TeamWin.moduleSort output. opts: owner 'all' | 'fa' | 'me' | team id, query, limit (default 50).
  // -> { rows: [{ ...row, n, t, pos, label }], total (after the filters), more (not shown) }. My players sent out of the preview are
  // free agents here ("Sent out"). The search only filters (Team.search would reorder by name match), so the Win M order stays.
  function moduleView(rows, ctx, state, opts) {
    const o = opts || {}, me = ctx.me, teamName = id => ((ctx.L.teams || []).find(t => t.id === id) || {}).name || String(id);
    let list = rows.map(r => {
      const pp = ctx.pool.byKey.get(r.key) || {}, mine = r.key in state.slots, sent = !mine && pp.owner === me;
      const label = mine ? 'You · ' + SLOT_LABEL[state.slots[r.key]] : sent ? 'Sent out' : pp.owner ? teamName(pp.owner) : 'Free agent';
      return Object.assign({}, r, { n: pp.n, t: pp.t, pos: pp.pos, label, _own: mine ? 'me' : (sent || !pp.owner) ? 'fa' : pp.owner });
    });
    if (o.owner && o.owner !== 'all') list = list.filter(r => r._own === o.owner);
    if (o.query) { const hit = new Set(Team.search(list, o.query, Infinity).map(r => r.key)); list = list.filter(r => hit.has(r.key)); }
    const limit = o.limit || 50;
    return { rows: list.slice(0, limit).map(r => { const x = Object.assign({}, r); delete x._own; return x; }), total: list.length, more: Math.max(0, list.length - limit) };
  }

  // ---- drops from the list ----
  // a list player dropped on a roster row takes that player's slot (one of mine: the two trade slots); dropped on a slot group he joins it
  function dropSwap(state, inKey, outKey) {
    if (inKey in state.slots) return Team.moveSlot(Team.moveSlot(state, inKey, state.slots[outKey]), outKey, state.slots[inKey]);
    return Team.moveSlot(Team.applySwap(state, [outKey], [inKey]), inKey, state.slots[outKey]);
  }
  const dropIn = (state, key, slot) => key in state.slots ? Team.moveSlot(state, key, slot) : Team.moveSlot(Team.applySwap(state, [], [key]), key, slot);

  // ---- slots ----
  // a move to another slot; the same slot returns the same state object
  const move = (state, key, slot) => state.slots[key] === slot ? state : Team.moveSlot(state, key, slot);
  // players per slot; over is set only for Active above the league limit
  function slotCounts(state, maxActive) {
    const o = {};
    SLOT_ORDER.forEach(sl => { const n = state.order.filter(k => state.slots[k] === sl).length; o[sl] = { n, over: sl === 'active' && n > maxActive }; });
    return o;
  }

  // ---- swap boxes ----
  const sendOutList = (ctx, state) => state.order.map(k => ctx.pool.byKey.get(k));
  const bringInList = (ctx, state) => ctx.pool.players.filter(p => !(p.key in state.slots));
  const pick = (chips, item) => (item && !chips.some(c => c.key === item.key) ? chips.concat([item]) : chips);
  const apply = (state, outs, ins) => Team.applySwap(state, outs.map(x => x.key), ins.map(x => x.key));

  const api = { gamesLeft, rows, zParts, move, slotCounts, winJob, moduleJob, nextJob, moduleView, dropSwap, dropIn, createScorer, signature, sendOutList, bringInList, search: Team.search, pick, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamView = api;
})(typeof self !== 'undefined' ? self : this);
