// Rankings core (2026-10-21): per-game lines from any source → Zscore table. Pure; browser and Node.
// Rule (user, 2026-10-21): a source's Zscore is calculated on the top X players by H2H-adjusted value within that source,
// X = teams × roster size, re-ranked until the pool settles. No ADP or roster pool, so a last-week table is relative to
// last-week lines. The engine is only called, never changed (the Model pick and Win do not see any of this).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js');

  const WEIGHTS = InPlayers.WEIGHTS;   // fixed: every category x1, TO x0.5 (user ruling D2)
  const TYPES = ['classic', 'h2h', 'adj'];   // Standard, H2H-Adjusted, ROTO-Adjusted

  // engine config for a league: the board's defaults except teams / roster / categories
  function cfgFor(o) {
    o = o || {};
    return { teams: o.teams || 14, roster: o.roster || 12, slot: 1, order: '3rr', scoring: 'h2h', cats: o.cats || 9, ilSpots: o.ilSpots == null ? 3 : o.ilSpots,
      field: 'easy', fieldZ: 'std', puntMode: 'off', puntLock: '', catW: WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0,
      basis: o.basis || 'total' };
  }

  // every projected player as a source row: {pid, n, t, pos, g, line, adp}
  function projSource(PLAYERS, proj) { return InPlayers.projLines(PLAYERS, proj).map(q => ({ pid: q.id, n: q.n, t: q.t, pos: q.pos, g: q.g, line: q.line, adp: q.adp })); }

  const SAME = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // rows → [{pid, z, cats[9], inPool}] best first; players with no games get z null and sort last.
  // opts: {teams, roster, type 'classic' | 'h2h' | 'adj', basis 'total' | 'pergame' | 'mix', cats 9 | 8}
  function table(rows, opts) {
    const cfg = cfgFor(opts), type = TYPES.includes(opts.type) ? opts.type : 'classic';
    const live = rows.filter(r => r.g > 0).sort((a, b) => a.pid - b.pid);   // fixed order: the engine's draft sims draw noise by index
    const dead = rows.filter(r => !(r.g > 0));
    const out = [];
    if (live.length) {
      const mk = adpOf => Eng.prepPlayers(live.map((r, i) => Object.assign({}, r.line, { g: r.g, ftx: adpOf(r, i) })));
      // pass 1 ranks by the room's value (ADP where known, else last); pass 2 drafts in that order, so the engine's spread
      // numbers describe this source's own player pool
      const P1 = mk(r => r.adp != null ? r.adp : 400); Eng.buildContext(P1, cfg);
      const order = P1.map((p, i) => i).sort((a, b) => P1[b].fieldV - P1[a].fieldV), rank = new Array(live.length);
      order.forEach((i, k) => { rank[i] = k + 1; });
      const P = mk((r, i) => rank[i]), ctx = Eng.buildContext(P, cfg);
      const W = Eng.catWeights(cfg), NC = Eng.NC, K = Math.min(P.length, cfg.teams * cfg.roster);
      const X = P.map(p => p.x), val = (x, m) => { let v = 0; for (let c = 0; c < NC; c++) v += (x[c] - m[c]) / ctx.sdH[c] * W[c]; return v; };
      let mean = Array.from(ctx.avgX), pool = [];
      for (let it = 0; it < 40; it++) {
        const v = X.map(x => val(x, mean)), next = v.map((q, i) => [q, i]).sort((a, b) => b[0] - a[0]).slice(0, K).map(a => a[1]).sort((a, b) => a - b);
        const same = SAME(next, pool); pool = next;
        mean = Array.from({ length: NC }, (_, c) => pool.reduce((s, i) => s + X[i][c], 0) / K);
        if (same) break;
      }
      const sd = type === 'h2h' ? ctx.sdH : type === 'adj' ? ctx.teamSd
        : Array.from({ length: NC }, (_, c) => Math.sqrt(Math.max(1e-9, pool.reduce((s, i) => s + (X[i][c] - mean[c]) ** 2, 0) / K)));
      const inPool = new Set(pool);
      P.forEach((p, i) => {
        const cats = Array.from({ length: NC }, (_, c) => (p.x[c] - mean[c]) / sd[c]);
        out.push({ pid: live[i].pid, z: cats.reduce((s, v, c) => s + v * W[c], 0), cats, inPool: inPool.has(i) });
      });
      out.sort((a, b) => b.z - a.z);
    }
    return out.concat(dead.map(r => ({ pid: r.pid, z: null, cats: null, inPool: false })));
  }

  const api = { WEIGHTS, TYPES, cfgFor, projSource, table };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Rankings = api;
})(this);
