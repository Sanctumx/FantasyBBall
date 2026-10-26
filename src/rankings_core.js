// Rankings core (2026-10-21): per-game lines from any source → Zscore table. Pure; browser and Node.
// Rule (user, 2026-10-21): a source's Zscore is calculated on the top X players by H2H-adjusted value within that source,
// X = teams × roster size, re-ranked until the pool settles. No ADP or roster pool, so a last-week table is relative to
// last-week lines. The engine is only called, never changed (the Model pick and Win do not see any of this).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), InLeague = root.InLeague || require('./inseason_league.js'), Shared = root.Shared || require('./shared.js'), LeagueStore = root.LeagueStore || require('./league_store.js');

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
  function projSource(PLAYERS, proj) { return InPlayers.projLines(PLAYERS, proj).map(q => ({ pid: q.id, n: q.n, t: q.t, pos: q.pos, g: q.g, line: q.line, adp: q.adp, m: Shared.projOf(PLAYERS[q.id], proj).m, ftx: PLAYERS[q.id].ftx != null ? PLAYERS[q.id].ftx : null })); }

  // ESPN season-to-date averages → source rows. The engine gets gp × 80 / (most games played) games so a Season-basis
  // table counts games played; `gp` stays the real count for display. Percentages come from makes / attempts.
  function seasonSource(espn, PLAYERS) { return fromAverages(((espn && espn.players) || []), PLAYERS); }
  function fromAverages(recs, PLAYERS) {
    const played = recs.filter(r => r.gp > 0), maxGp = Math.max(1, ...played.map(r => r.gp));
    const list = PLAYERS.map((r, i) => ({ n: r.n, t: r.t, id: i }));
    return played.map((r, i) => {
      const m = InPlayers.matchTo(list, InPlayers.OVERRIDES.espn[r.id] || r.n, r.t);
      return { pid: i, espnId: r.id, n: r.n, t: InLeague.toProjTeam(r.t) || r.t, pos: m ? PLAYERS[m.id].p : '', gp: r.gp, m: r.min, g: r.gp * 80 / maxGp, line: InPlayers.espnLine(r), adp: m ? InPlayers.projLines([PLAYERS[m.id]], 'avg')[0].adp : null };
    });
  }

  // the last `days` calendar days (New York dates, as the box files store them) of box-score games → source rows. `files` are the
  // monthly stats/box-YYYY-MM.json objects. The window ends on the newest game date in the files. Per-game averages are sums of
  // box lines over games played (minutes > 0), so FG% / FT% come from summed makes / attempts; team = his latest game's team.
  // Returns {rows, from, to} (rows [] and from / to null when there are no games).
  function windowSource(files, days, PLAYERS) {
    const fs = (files || []).filter(Boolean), games = [];
    fs.forEach(f => Object.keys(f.games || {}).forEach(id => games.push({ d: f.games[id].d, teams: f.games[id].teams, cols: f.cols, names: f.names })));
    if (!games.length) return { rows: [], from: null, to: null };
    const to = games.reduce((a, g) => g.d > a ? g.d : a, ''), start = new Date(to + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - (days - 1));
    const from = start.toISOString().slice(0, 10), acc = {};
    games.filter(g => g.d >= from && g.d <= to).forEach(g => Object.keys(g.teams).forEach(t => g.teams[t].forEach(l => {
      const min = l[1]; if (!(min > 0)) return;
      const a = acc[l[0]] || (acc[l[0]] = { id: l[0], n: g.names[l[0]] || l[0], t, d: g.d, gp: 0, sum: {} });
      if (g.d >= a.d) { a.d = g.d; a.t = t; }
      a.gp++; g.cols.forEach((c, i) => { a.sum[c] = (a.sum[c] || 0) + l[i + 1]; });
    })));
    const recs = Object.values(acc).map(a => { const r = { id: a.id, n: a.n, t: a.t, gp: a.gp }; Object.keys(a.sum).forEach(c => { r[c] = a.sum[c] / a.gp; }); return r; });
    return { rows: fromAverages(recs, PLAYERS), from, to };
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

  // ---- sources (shared by the Rankings and Team tabs, 2026-10-26): the lines a player is judged on ----
  const SOURCES = ['season', 'w7', 'w14', 'w30', 'avg', 'bbm', 'hs'], WINDAYS = { season: 400, w7: 7, w14: 14, w30: 30 };
  function sourceRows(src, PLAYERS, box) { return WINDAYS[src] ? windowSource(box, WINDAYS[src], PLAYERS).rows : projSource(PLAYERS, src); }

  // monthly box-score files (stats/box-YYYY-MM.json) from the season's first month to this month; missing months are skipped
  async function loadBox(fetchFn, now) {
    const out = [], d = now || new Date(); let y = 2026, m = 10;
    while (y < d.getFullYear() || (y === d.getFullYear() && m <= d.getMonth() + 1)) {
      try { const r = await fetchFn('stats/box-' + y + '-' + String(m).padStart(2, '0') + '.json', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.games) out.push(j); } } catch (e) {}
      if (++m > 12) { m = 1; y++; }
    }
    return out;
  }

  // which source row is which Fantrax player: -> { byKey: Map key -> row, byPid: Map row pid -> key }. Projection rows go by the pool player's
  // pid; box rows by name and team as ownersOf does, each row to one player (the rostered one, then the one whose team matches).
  function matchRows(src, rows, pool, fxPlayers) {
    const byKey = new Map(), byPid = new Map();
    if (!WINDAYS[src]) {
      const row = new Map(rows.map(r => [r.pid, r]));
      pool.players.forEach(pp => { if (pp.pid != null && row.has(pp.pid)) { byKey.set(pp.key, row.get(pp.pid)); byPid.set(pp.pid, pp.key); } });
      return { byKey, byPid };
    }
    const list = rows.map(r => ({ n: r.n, t: r.t, id: r.pid })), rowOf = new Map(rows.map(r => [r.pid, r])), best = new Map();
    pool.players.forEach(pp => {
      const info = (fxPlayers && fxPlayers[pp.key]) || { name: pp.n, team: pp.t }, m = InPlayers.matchTo(list, InPlayers.OVERRIDES.fx[pp.key] || info.name, info.team); if (!m) return;
      const score = (pp.owner ? 2 : 0) + (info.team && InLeague.toProjTeam(info.team) === m.t ? 1 : 0), cur = best.get(m.id);
      if (!cur || score > cur.score) best.set(m.id, { score, key: pp.key });
    });
    best.forEach((v, pid) => { byKey.set(v.key, rowOf.get(pid)); byPid.set(pid, v.key); });
    return { byKey, byPid };
  }

  // a copy of the pool whose lines (and minutes) are the source's. Everything else (key, games, owner, slot, team) stays; a player with no
  // usable line in the source keeps his projection line and gets lineFb: true.
  function sourcePool(pool, match) {
    const ok = r => r && r.line && r.g > 0 && Object.keys(r.line).every(k => Number.isFinite(r.line[k]));
    const players = pool.players.map(pp => {
      const r = match.byKey.get(pp.key);
      return ok(r) ? Object.assign({}, pp, { line: r.line, mpg: r.m == null ? null : r.m, lineFb: false }) : Object.assign({}, pp, { lineFb: true });
    });
    return { players, byKey: new Map(players.map(p => [p.key, p])), unmatched: pool.unmatched, stats: pool.stats };
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
  // "Average player" view = gain minus the gain of an average player (with a league: the average of my roster; else the Zscore pool; a made-up entry behind every real player,
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
    const lists = o.lists || null;
    const full = lists ? lists.map(l => l.filter(pid => idx.has(pid)).slice(0, Rr)) : null;
    // average-player entry: the average player on my roster when a league is loaded, else the Zscore pool's average; needs enough
    // real players that the replacement window never reaches it
    let ai = -1;
    const pool = full && full[0].length ? full[0].map(pid => P[idx.get(pid)]) : tab.filter(t => t.inPool && idx.has(t.pid)).map(t => P[idx.get(t.pid)]);
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

  const api = { WEIGHTS, TYPES, PO_LAMBDA, cfgFor, projSource, seasonSource, windowSource, ownersOf, SOURCES, WINDAYS, sourceRows, loadBox, matchRows, sourcePool, table, playoffGames, withPlayoffs, winStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Rankings = api;
})(this);
