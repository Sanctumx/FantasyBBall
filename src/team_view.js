// Team tab page logic (#131 PR 3, 2026-10-25): the roster table rows and totals, the stepwise Win scoring job with its cache, and the
// swap-box helpers. Pure; browser and Node. team.html only draws what this returns. Nothing here touches ctx, the pool or the saved league.
// Plays % is a team-makeup share (who gets a lineup slot each night); GL is projected games left (team games x g/82, which already
// covers injuries and rest), so GL is never multiplied by Plays %. Only the team totals and Win always use Plays %; the player rows use
// it only when the "adjust by Plays %" box is checked (opts.adjust).
(function (root) {
  'use strict';
  const Team = root.Team || require('./team_core.js'), TeamWin = root.TeamWin || require('./team_win.js');
  const SLOT_ORDER = Team.SLOTS;
  const COUNT = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];

  // projected games left: the team's remaining games times the player's availability (g/82, as the Trade Analyzer reads it)
  const gamesLeft = (ctx, pp) => Team.gamesLeft(ctx, pp.t) * Math.min(1, pp.g / 82);

  // a per-game line times f; percentages stay, attempts and counting stats scale
  function scaled(line, f) {
    const o = { fgp: line.fgp, ftp: line.ftp, fga: line.fga * f, fta: line.fta * f };
    COUNT.forEach(k => { o[k] = line[k] * f; });
    return o;
  }

  // opts: zCats (pool player -> per-game category Zs[9], or null), weights (0-1 per category), cats (9 | 8), adjust (bool),
  // view 'game' (per game) | 'ros' (per game x GL). -> { groups: [{ slot, rows }], rows, avg, total }
  // row: { key, n, t, pos, slot, gl, pct, hypo, stat, cats, z }; avg is Team.teamLine over the counted players (Plays % always in),
  // total is the same per night for the whole lineup (counting stats x the active limit)
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
    const total = Object.assign({}, avg, { fga: avg.fga * slots, fta: avg.fta * slots });
    COUNT.forEach(k => { total[k] = avg[k] * slots; });
    return { groups, rows: all, avg, total };
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

  const signature = state => state.order.map(k => k + ':' + state.slots[k]).join('|');

  // finished and half-finished jobs by ctx object, roster and win options (cats, mode); the weights are not an input, so moving a slider never rescores
  function createScorer() {
    const by = new WeakMap();
    return { get(ctx, state, opts) {
      let m = by.get(ctx); if (!m) by.set(ctx, m = new Map());
      const o = opts || {}, sig = signature(state) + '#' + (o.cats || '') + '#' + (o.mode || '');
      if (!m.has(sig)) m.set(sig, winJob(ctx, state, opts));
      return m.get(sig);
    } };
  }

  // ---- swap boxes ----
  const sendOutList = (ctx, state) => state.order.map(k => ctx.pool.byKey.get(k));
  const bringInList = (ctx, state) => ctx.pool.players.filter(p => !(p.key in state.slots));
  const pick = (chips, item) => (item && !chips.some(c => c.key === item.key) ? chips.concat([item]) : chips);
  const apply = (state, outs, ins) => Team.applySwap(state, outs.map(x => x.key), ins.map(x => x.key));

  const api = { gamesLeft, rows, winJob, createScorer, signature, sendOutList, bringInList, search: Team.search, pick, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamView = api;
})(typeof self !== 'undefined' ? self : this);
