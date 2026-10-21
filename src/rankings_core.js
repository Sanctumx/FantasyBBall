// Rankings core (2026-10-21): per-game lines from any source → Zscore table. Pure; browser and Node.
// Rule (user, 2026-10-21): a source's Zscore is calculated on the top X players by H2H-adjusted value within that source,
// X = teams × roster size, re-ranked until the pool settles. No ADP or roster pool, so a last-week table is relative to
// last-week lines. The engine is only called, never changed (the Model pick and Win do not see any of this).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), InLeague = root.InLeague || require('./inseason_league.js'), LeagueStore = root.LeagueStore || require('./league_store.js');

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
  function projSource(PLAYERS, proj) { return InPlayers.projLines(PLAYERS, proj).map(q => ({ pid: q.id, n: q.n, t: q.t, pos: q.pos, g: q.g, line: q.line, adp: q.adp, ftx: PLAYERS[q.id].ftx != null ? PLAYERS[q.id].ftx : null })); }

  // ESPN season-to-date averages → source rows. The engine gets gp × 80 / (most games played) games so a Season-basis
  // table counts games played; `gp` stays the real count for display. Percentages come from makes / attempts.
  function seasonSource(espn, PLAYERS) {
    const played = ((espn && espn.players) || []).filter(r => r.gp > 0), maxGp = Math.max(1, ...played.map(r => r.gp));
    const list = PLAYERS.map((r, i) => ({ n: r.n, t: r.t, id: i }));
    return played.map((r, i) => {
      const m = InPlayers.matchTo(list, InPlayers.OVERRIDES.espn[r.id] || r.n, r.t);
      return { pid: i, espnId: r.id, n: r.n, t: InLeague.toProjTeam(r.t) || r.t, pos: m ? PLAYERS[m.id].p : '', gp: r.gp, g: r.gp * 80 / maxGp, line: InPlayers.espnLine(r), adp: m ? InPlayers.projLines([PLAYERS[m.id]], 'avg')[0].adp : null };
    });
  }

  // who owns each row: Map pid → {owner (Fantrax team id), slot}. Every rostered Fantrax player goes to the one row his name and
  // team match (IR included); two Fantrax players claiming one row go to the one whose team matches.
  function ownersOf(rows, fxPlayers, rosters) {
    const list = rows.map(r => ({ n: r.n, t: r.t, id: r.pid })), best = new Map();
    Object.keys(rosters || {}).forEach(team => rosters[team].forEach(x => {
      const info = (fxPlayers && fxPlayers[x.fid]) || null; if (!info) return;
      const m = InPlayers.matchTo(list, InPlayers.OVERRIDES.fx[x.fid] || info.name, info.team); if (!m) return;
      const score = info.team && InLeague.toProjTeam(info.team) === m.t ? 1 : 0, cur = best.get(m.id);
      if (!cur || score > cur.score) best.set(m.id, { score, owner: team, slot: x.slot });
    }));
    return new Map([...best].map(([pid, v]) => [pid, { owner: v.owner, slot: v.slot }]));
  }

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

  // ---- playoffs: his team's games in your playoff weeks, and the board's Playoff boost ----
  const PO_LAMBDA = { off: 0, light: 0.25, medium: 0.5, strong: 0.75, vstrong: 1 };   // strength, as in app.html
  // returns {byTeam: {ABBR: {per[], total}}, avg}; s = league settings {asb, poStart, poFmt}
  function playoffGames(SCHED, s) {
    const { plan, rounds } = LeagueStore.playoffRounds(SCHED, s), byTeam = {};
    Object.keys(SCHED.games).forEach(t => {
      const g = SCHED.games[t], per = rounds.filter(ws => ws.length).map(ws => ws.reduce((a, w) => a + plan.idx[w - 1].reduce((b, i) => b + g[i], 0), 0));
      byTeam[t] = { per, total: per.reduce((a, b) => a + b, 0) };
    });
    const tot = Object.values(byTeam).map(x => x.total);
    return { byTeam, avg: tot.reduce((a, b) => a + b, 0) / (tot.length || 1) };
  }
  // table rows + playoff games (po, per) and multiplier (mult); a boost scales z and every category, then re-ranks
  function withPlayoffs(tab, rows, pg, level) {
    const lam = PO_LAMBDA[level] || 0, team = new Map(rows.map(r => [r.pid, r.t]));
    const out = tab.map(x => {
      const g = pg.byTeam[team.get(x.pid)], mult = lam && g && pg.avg ? Math.max(0.5, Math.min(1.5, 1 + lam * (g.total / pg.avg - 1))) : 1;
      return Object.assign({}, x, { po: g ? g.total : null, per: g ? g.per : null, mult, z: x.z == null ? null : x.z * mult, cats: x.cats && x.cats.map(v => v * mult) });
    });
    return lam ? out.filter(x => x.z != null).sort((a, b) => b.z - a.z).concat(out.filter(x => x.z == null)) : out;
  }

  // ---- Win C / Win M: Engine.evaluate exactly as the Draft tab runs it (season-long, gain over a replacement-level slot) ----
  // Projection rows use the Fantrax ADP the board uses; season rows have none, so the table's value order stands in.
  // "Average player" view = gain minus the gain of an average Zscore-pool player (a made-up entry behind every real player,
  // so it stays out of the replacement window; early in the season, with few live rows, it can sit inside the engine's wider
  // typical-player window and move real gains by under 0.01 points) in the same run. With no league: all picks empty, slot 1 (the board
  // at pick 1). With a league: o.lists = [my pids, then each other team's pids] (non-IR, best first, up to roster size) fill
  // their slots; my weakest player's slot is open, so a free agent is measured in place of him. My own players each get a run with
  // their slot open (step()), since a player already on the team has no gain in the main run.
  // winStart(rows, tab, o) → {rep, avg: Map pid → {c, m}, pending: [pids], step()}; c = Win C (hundredths), m = Win M (points)
  function winStart(rows, tab, o) {
    const cfg = cfgFor(o), N = cfg.teams, Rr = cfg.roster;
    const live = rows.filter(r => r.g > 0).sort((a, b) => a.pid - b.pid), idx = new Map(live.map((r, i) => [r.pid, i]));
    const rank = new Map(tab.filter(t => t.z != null).map((t, i) => [t.pid, i + 1]));
    const P = Eng.prepPlayers(live.map(r => Object.assign({}, r.line, { g: r.g, ftx: r.ftx !== undefined ? r.ftx : (rank.get(r.pid) || null) })));
    const ctx = Eng.buildContext(P, cfg), n0 = P.length;
    // average-player entry from the Zscore pool; needs enough real players that the replacement window never reaches it
    let ai = -1;
    const pool = tab.filter(t => t.inPool && idx.has(t.pid)).map(t => P[idx.get(t.pid)]);
    if (pool.length && n0 >= N * Rr + 8) {
      const x = Array.from(pool[0].x, (_, c) => pool.reduce((a, p) => a + p.x[c], 0) / pool.length), pv = Array.from(pool[0].pv, (_, c) => pool.reduce((a, p) => a + p.pv[c], 0) / pool.length);
      const a = Object.assign({}, pool[0], { id: n0, x: Float64Array.from(x), pv: Float64Array.from(pv), adpUse: 1e4, sd: 1, fieldV: -1e9, boardRaw: -1e9, adpE: 1e4, sdE: 1 });
      P.push(a); ai = n0;
    }
    const gains = (picks, owner) => {
      Eng.evaluate(P, ctx, cfg, { picks, owner });
      const base = ai < 0 ? { c: 0, m: 0 } : { c: P[ai].gain * 100, m: P[ai].gainM * 100 };
      return { g: P.slice(0, n0).map(p => ({ c: p.gain * 100, m: p.gainM * 100 })), base };
    };
    const rep = new Map(), avg = new Map(), put = (r, pid) => { const i = idx.get(pid), v = r.g[i]; rep.set(pid, v); avg.set(pid, { c: v.c - r.base.c, m: v.m - r.base.m }); };
    const lists = o.lists || null;
    const full = lists ? lists.map(l => l.filter(pid => idx.has(pid)).slice(0, Rr)) : null;
    const build = skip => {   // my team in slots 0..R-1 (minus the skipped pid), team t in slots t*R..
      const picks = new Array(N * Rr).fill(null), owner = new Array(N * Rr);
      for (let k = 0; k < N * Rr; k++) owner[k] = Math.floor(k / Rr);
      if (full) full.forEach((l, t) => l.forEach((pid, s) => { if (pid !== skip) picks[t * Rr + s] = idx.get(pid); }));
      return { picks, owner };
    };
    const weakest = full && full[0].length >= Rr ? full[0][full[0].length - 1] : null;
    const main = build(weakest), r0 = gains(main.picks, lists ? main.owner : undefined);
    live.forEach(r => put(r0, r.pid));
    const pending = full ? full[0].filter(pid => pid !== weakest) : [];
    return { rep, avg, pending, hasAvg: ai >= 0, step() { const pid = pending.shift(); if (pid == null) return null; const b = build(pid); put(gains(b.picks, b.owner), pid); return pid; } };
  }

  const api = { WEIGHTS, TYPES, PO_LAMBDA, cfgFor, projSource, seasonSource, ownersOf, table, playoffGames, withPlayoffs, winStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Rankings = api;
})(this);
