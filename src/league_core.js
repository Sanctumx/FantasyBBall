// League page math (2026-10-18): every team's projected stats and its win chances against every other team, from one
// engine evaluation of the league's picks. Settings follow the Model pick (Basis Season, Playoff boost Off) so the numbers
// equal the Draft Kit's Your team panel when the board uses those settings.
(function (root) {
  'use strict';
  const E = root.Engine || require('./engine.js'), Shared = root.Shared || require('./shared.js');

  // Players for a projection choice, plus the source's extras (players missing from the projections, ids
  // base + i when saved, base = the list length at save time, 234 when a save has none). An extra that is really a projected player maps to him (old duplicate copies).
  function playersFor(PLAYERS, proj, extra, picks, base) {
    base = base == null ? 234 : base;
    const P = E.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, proj))));
    P.forEach(p => { p.key = Shared.norm(p.n); });
    const map = {};
    (extra || []).forEach((raw, i) => {
      const q = Shared.findListed(P, raw.n, raw.t);
      if (q) { map[base + i] = q.id; return; }
      let e = P.find(x => x.unlisted && x.n === raw.n);
      if (!e) { e = E.prepPlayers([raw])[0]; e.id = P.length; e.key = Shared.norm(raw.n); e.unlisted = true; P.push(e); }
      map[base + i] = e.id;
    });
    const pk = (picks || []).map(id => id != null && map[id] != null ? map[id] : (id != null && id < P.length ? id : null));
    return { P, picks: pk };
  }

  // a player's projected season line (gm = 1: per-game line): FG makes, FG attempts, FT makes, FT attempts, 3PM, PTS, REB, AST, ST, BLK, TO
  const line = (p, gm) => { const g = gm || p.g; return [p.fgp * p.fga * g, p.fga * g, p.ftp * p.fta * g, p.fta * g, p.tpm * g, p.pts * g, p.reb * g, p.ast * g, p.stl * g, p.blk * g, p.to * g]; };
  // summed lines → totals in board category order: FG%, FT%, 3PM, PTS, REB, AST, ST, BLK, TO
  const finish = a => [a[1] ? a[0] / a[1] : 0, a[3] ? a[2] / a[3] : 0, a[4], a[5], a[6], a[7], a[8], a[9], a[10]];
  const addTo = (acc, l, w) => { for (let i = 0; i < 11; i++) acc[i] += w * l[i]; };
  // raw projected season totals of a list of players
  function rawTotals(roster) { const a = new Array(11).fill(0); roster.forEach(p => addTo(a, line(p), 1)); return finish(a); }

  // basis 'total' (Season: projected games count, as the Model pick) or 'pergame' (missed games don't count): the win
  // chances use it, and the stats show season totals or per-game lines
  function computeLeague(PLAYERS, src, proj, basis) {
    basis = basis === 'pergame' ? 'pergame' : 'total';
    const cfg = Object.assign({}, src.cfg, { basis, poBoost: 'off', proj });
    const N = cfg.teams, total = N * cfg.roster;
    cfg.slot = Math.min(Math.max(1, Math.round(+cfg.slot) || 1), N);   // a slot from another league can't point past this one
    const { P, picks } = playersFor(PLAYERS, proj, src.extra, (src.picks || []).slice(0, total).concat(new Array(Math.max(0, total - (src.picks || []).length)).fill(null)), src.base);
    P.forEach(p => { p.poMult = 1; });
    const ctx = E.buildContext(P, cfg), state = { picks, owner: src.owner || [] };
    const res = E.evaluate(P, ctx, cfg, state);
    const cats = []; for (let c = 0; c < E.NC; c++) if (c !== E.TO || cfg.cats === 9) cats.push(c);
    const T = res.teams, me = Math.max(0, Math.min(N - 1, (cfg.slot || 1) - 1));
    const match = [], cat = [], expCats = [];
    for (let i = 0; i < N; i++) {
      match.push([]); cat.push([]); expCats.push([]);
      for (let j = 0; j < N; j++) {
        if (i === j) { match[i].push(null); cat[i].push(null); expCats[i].push(null); continue; }
        const cp = new Array(E.NC).fill(null); let ex = 0;
        cats.forEach(c => { cp[c] = res.catProb(T[i], T[j], c); ex += cp[c]; });
        match[i].push(res.pairProb(T[i], T[j])); cat[i].push(cp); expCats[i].push(ex);
      }
    }
    const key = cfg.scoring === 'roto' ? 'roto' : cfg.scoring === 'h2h' ? 'cats' : 'match';
    const order = res.standings.slice().sort((a, b) => b[key] - a[key]).map(s => s.t);
    const standings = res.standings.map(s => ({ rank: order.indexOf(s.t) + 1, catsPerWeek: s.cats, matchAvg: s.match / (N - 1), roto: s.roto }));
    const rosters = T.map(t => t.roster.map(r => r.p));
    // open picks count a typical player at that pick in the raw stats too, the same window the engine uses for the win chances
    // (players by expected draft slot, Gaussian weights around the j-th upcoming pick)
    // only the active lineup scores: the best-ranked rostered players fill the active slots, open picks fill what is left
    const active = (Array.isArray(cfg.luFx) && cfg.luFx.length) ? cfg.luFx.length : ['luC', 'luG', 'luF', 'luGC', 'luFC', 'luU'].reduce((a, k) => a + (+cfg[k] || 0), 0) || Math.max(1, cfg.roster - 2);
    const acc = rosters.map(() => new Array(11).fill(0)), accG = rosters.map(() => new Array(11).fill(0)), open = new Array(N).fill(0), left = new Array(N).fill(active);
    rosters.forEach((r, t) => r.slice().sort((a, b) => a.rk - b.rk).slice(0, active).forEach(p => { addTo(acc[t], line(p), 1); addTo(accG[t], line(p, 1), 1); left[t]--; }));
    const av = res.avail, A = av.length, tAt = k => (state.owner && state.owner[k] != null) ? state.owner[k] : E.teamAt(k, N, cfg.order);
    res.unfilled.forEach((k, j) => {
      const t = tAt(k); open[t]++; if (!A || left[t] <= 0) return;
      left[t]--;
      const c0 = Math.min(j, A - 1), w = 1.5 + 0.12 * j, lo = Math.max(0, Math.floor(c0 - 3 * w)), hi = Math.min(A - 1, Math.ceil(c0 + 3 * w));
      let ws = 0; for (let i = lo; i <= hi; i++) ws += Math.exp(-0.5 * Math.pow((i - c0) / w, 2));
      for (let i = lo; i <= hi; i++) { const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2)) / ws; addTo(acc[t], line(av[i]), wt); addTo(accG[t], line(av[i], 1), wt); }
    });
    // per game = the team's per-game line (active players), per week = season totals over the 24 NBA weeks (82 games / 3.42)
    const perGame = accG.map(finish), weeks = 24;
    const raw = basis === 'pergame' ? perGame : acc.map(finish);
    const perWeek = basis === 'pergame' ? null : raw.map(r => r.map((v, c) => c < 2 ? v : v / weeks));
    const z = raw.map(() => new Array(E.NC).fill(0)), rank = raw.map(() => new Array(E.NC).fill(0));
    for (let c = 0; c < E.NC; c++) {
      const col = raw.map(r => r[c]), m = col.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / N) || 1;
      const sign = c === E.TO ? -1 : 1;
      col.forEach((v, t) => { z[t][c] = sign * (v - m) / sd; });
      col.map((v, t) => [sign * v, t]).sort((a, b) => b[0] - a[0]).forEach(([, t], k) => { rank[t][c] = k + 1; });
    }
    const names = Array.from({ length: N }, (_, t) => (src.names && src.names[t]) || 'Team ' + (t + 1));
    const profile = t => cats.map(c => {
      let w = 0; for (let j = 0; j < N; j++) if (j !== t) w += cat[t][j][c] / (N - 1);
      return { c, win: w, raw: raw[t][c], rank: rank[t][c] };
    });
    return { N, nc: cats.length, cats, me, names, open, basis, perGame, picked: picks.filter(v => v != null).length, total, cfg,
      match, cat, expCats, standings, rosters, raw, perWeek, z, rank, profile, swing: ctx.swing };
  }

  // ---------- source: the loaded Fantrax league's current rosters ----------
  // League settings a board may lack (the Draft Kit's defaults for the keys that are not league settings)
  const LEAGUE_DEF = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', fieldZ: 'std',
    catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], poStart: 18, asb: 'merged', adpSrc: 'ftx', puntMode: 'off', puntLock: '', proj: 'avg', scarZ: 'off', scarP: 'off', zdrop: 0 };
  const cfgOf = c => Object.assign({}, LEAGUE_DEF, c || {}, { fieldZ: 'std', puntMode: 'off', puntLock: '' });
  const swapName = n => { const i = String(n).indexOf(','); return i < 0 ? String(n) : (n.slice(i + 1) + ' ' + n.slice(0, i)).trim(); };
  // a Fantrax player id as a projected player (index into PLAYERS) or, when he is not in the projections, a waiver-level extra
  // (the average of the 15 lowest-ranked projected players, as on the Draft Kit)
  function matchFx(fid, fxPlayers, PLAYERS, P, tail, extra, byFid) {
    const info = fxPlayers && fxPlayers[fid]; if (!info || !info.name) return null;
    const name = swapName(info.name), q = Shared.findListed(P, name, info.team);
    if (q) return { id: q.id, name: PLAYERS[q.id].n };
    if (byFid[fid] == null) {
      const avg = f => tail.reduce((s, r) => s + r[f], 0) / tail.length;
      extra.push({ n: name, t: info.team || '', p: String(info.position || '').replace(/,/g, '/'), g: Math.round(avg('g')), m: Math.round(avg('m')),
        pts: avg('pts'), tpm: avg('tpm'), reb: avg('reb'), ast: avg('ast'), stl: avg('stl'), blk: avg('blk'), fgp: avg('fgp'), fga: avg('fga'), ftp: avg('ftp'), fta: avg('fta'), to: avg('to'),
        adp: null, ftx: null, rk: 999, inj: '', risk: '', note: 'Not in the projections. Counted as a waiver-level player.', fid });
      byFid[fid] = PLAYERS.length + extra.length - 1;
    }
    return { id: byFid[fid], name };
  }
  // The league as it stands now: each team's non-IR players on the board (IR players are left out and listed in `ir`; counting them
  // is tabled, #109). Teams run by standings rank, then name. Rosters go round by round, so open spots are the late picks of their
  // team. `rosters` and `standings` are the Worker's answers (what=rosters, what=standings).
  function sourceFromRosters(league, rosters, standings, fxPlayers, PLAYERS, settings, myTeam) {
    const ti = (league && league.teamInfo) || {}, tids = Object.keys(ti);
    if (!tids.length) throw new Error('This league has no teams yet.');
    const rank = {}; (Array.isArray(standings) ? standings : []).forEach(r => { if (r && r.teamId && r.rank != null && !isNaN(+r.rank)) rank[r.teamId] = +r.rank; });
    const label = t => (ti[t] && ti[t].name) || t;
    const ids = tids.slice().sort((x, y) => ((rank[x] == null ? 1e9 : rank[x]) - (rank[y] == null ? 1e9 : rank[y])) || String(label(x)).localeCompare(String(label(y)), undefined, { numeric: true }));
    const N = ids.length, body = (rosters && rosters.rosters) || {};
    const P = PLAYERS.map((r, i) => ({ n: r.n, t: r.t, id: i, key: Shared.norm(r.n) }));
    const tail = PLAYERS.filter(q => q.src !== 'hs').sort((a, b) => b.rk - a.rk).slice(0, 15), extra = [], byFid = {}, ir = [];
    const per = ids.map((tid, t) => {
      const out = [];
      ((body[tid] && body[tid].rosterItems) || []).forEach(x => {
        const m = matchFx(x.id, fxPlayers, PLAYERS, P, tail, extra, byFid); if (!m) return;
        if (x.status === 'INJURED_RESERVE') ir.push({ t, fid: x.id, name: m.name }); else out.push(m.id);
      });
      return out;
    });
    const R = Math.max((settings && settings.roster) || 0, ...per.map(r => r.length));
    const cfg = cfgOf(Object.assign({}, settings, { teams: N, roster: R }));
    const mi = myTeam ? ids.indexOf(myTeam) : -1; cfg.slot = mi >= 0 ? mi + 1 : 1;
    const picks = new Array(N * R).fill(null), owner = new Array(N * R);
    for (let j = 0; j < R; j++) for (let t = 0; t < N; t++) { const k = j * N + t; owner[k] = t; if (j < per[t].length) picks[k] = per[t][j]; }
    return { cfg, picks, owner, extra, base: PLAYERS.length, names: ids.map(label), ids, ir };
  }

  const api = { computeLeague, rawTotals, playersFor, sourceFromRosters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.League = api;
})(this);
