// League page math (2026-10-18): every team's projected stats and its win chances against every other team, from one
// engine evaluation of the league's picks. Settings follow the Model pick (Basis Season, Playoff boost Off) so the numbers
// equal the Draft Kit's Your team panel when the board uses those settings.
(function (root) {
  'use strict';
  const E = root.Engine || require('./engine.js'), Shared = root.Shared || require('./shared.js');

  // Players for a projection choice, plus the source's extras (players missing from the projections, ids
  // PLAYERS.length + i when saved). An extra that is really a projected player maps to him (old duplicate copies).
  function playersFor(PLAYERS, proj, extra, picks) {
    const P = E.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, proj))));
    P.forEach(p => { p.key = Shared.norm(p.n); });
    const map = {};
    (extra || []).forEach((raw, i) => {
      const q = Shared.findListed(P, raw.n, raw.t);
      if (q) { map[PLAYERS.length + i] = q.id; return; }
      let e = P.find(x => x.unlisted && x.n === raw.n);
      if (!e) { e = E.prepPlayers([raw])[0]; e.id = P.length; e.key = Shared.norm(raw.n); e.unlisted = true; P.push(e); }
      map[PLAYERS.length + i] = e.id;
    });
    const pk = (picks || []).map(id => id != null && map[id] != null ? map[id] : (id != null && id < P.length ? id : null));
    return { P, picks: pk };
  }

  // raw projected season totals in board category order: FG%, FT%, 3PM, PTS, REB, AST, ST, BLK, TO
  function rawTotals(roster) {
    let fgm = 0, fga = 0, ftm = 0, fta = 0; const t = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    roster.forEach(p => { const g = p.g; fgm += p.fgp * p.fga * g; fga += p.fga * g; ftm += p.ftp * p.fta * g; fta += p.fta * g;
      t[2] += p.tpm * g; t[3] += p.pts * g; t[4] += p.reb * g; t[5] += p.ast * g; t[6] += p.stl * g; t[7] += p.blk * g; t[8] += p.to * g; });
    t[0] = fga ? fgm / fga : 0; t[1] = fta ? ftm / fta : 0;
    return t;
  }

  function computeLeague(PLAYERS, src, proj) {
    const cfg = Object.assign({}, src.cfg, { basis: 'total', poBoost: 'off', proj });
    const N = cfg.teams, total = N * cfg.roster;
    const { P, picks } = playersFor(PLAYERS, proj, src.extra, (src.picks || []).slice(0, total).concat(new Array(Math.max(0, total - (src.picks || []).length)).fill(null)));
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
    const raw = rosters.map(rawTotals), weeks = Math.max(1, (cfg.poStart || 18) - 1);
    const perWeek = raw.map(r => r.map((v, c) => c < 2 ? v : v / weeks));
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
    return { N, nc: cats.length, cats, me, names, picked: picks.filter(v => v != null).length, total, cfg,
      match, cat, expCats, standings, rosters, raw, perWeek, z, rank, profile };
  }

  // ---------- sources ----------
  // League settings a saved board may lack (the Draft Kit's defaults for these keys)
  const LEAGUE_DEF = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', fieldZ: 'std',
    catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], poStart: 18, asb: 'merged', adpSrc: 'ftx', puntMode: 'off', puntLock: '', proj: 'avg', scarZ: 'off', scarP: 'off', zdrop: 0 };
  const KEYS = { board: 'courtside-board-v1', saved: 'courtside-saved-drafts-v1', leagues: 'courtside-leagues-v1' };
  const read = (store, k) => { try { return JSON.parse(store.getItem(k) || 'null'); } catch (e) { return null; } };
  const fxNames = (fx, N) => fx && fx.names && fx.order ? Array.from({ length: N }, (_, t) => fx.names[fx.order[t]] || null) : null;
  const cfgOf = c => Object.assign({}, LEAGUE_DEF, c || {}, { fieldZ: 'std', puntMode: 'off', puntLock: '' });

  // every league the page can load: the Draft Kit's current draft (when it has picks), saved drafts newest first, saved leagues
  function listSources(store) {
    const out = [], b = read(store, KEYS.board);
    if (b && Array.isArray(b.picks) && b.picks.some(v => v != null)) out.push({ id: 'board', kind: 'board', label: 'Draft Kit · current draft' });
    const sv = read(store, KEYS.saved);
    if (Array.isArray(sv)) sv.slice().sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0)).forEach(d => { if (d && d.name) out.push({ id: 'saved:' + d.name, kind: 'saved', label: d.name }); });
    const lg = read(store, KEYS.leagues);
    if (Array.isArray(lg)) lg.slice().sort((x, y) => (y.used || 0) - (x.used || 0)).forEach(l => { if (l && l.id) out.push({ id: 'fx:' + l.id, kind: 'fantrax', label: l.name || 'League ' + l.id, leagueId: l.id, myTeam: l.myTeam || null }); });
    return out;
  }
  // {cfg, picks, owner, extra, names} for the current draft or a saved draft (Fantrax leagues load with sourceFromFantrax)
  function sourceFromStore(store, id) {
    const d = id === 'board' ? read(store, KEYS.board) : id.startsWith('saved:') ? (read(store, KEYS.saved) || []).find(x => x && x.name === id.slice(6)) : null;
    if (!d) return null;
    const cfg = cfgOf(d.cfg);
    return { cfg, picks: (d.picks || []).slice(), owner: (d.owner || []).slice(), extra: (d.extra || []).slice(), names: fxNames(d.fx, cfg.teams) };
  }
  const swapName = n => { const i = String(n).indexOf(','); return i < 0 ? String(n) : (n.slice(i + 1) + ' ' + n.slice(0, i)).trim(); };
  // a Fantrax league's draft results as a source: teams in draft order, picks matched by name (unknown players become
  // waiver-level extras, as on the Draft Kit), traded picks on the team that made them
  function sourceFromFantrax(league, draft, fxPlayers, PLAYERS, baseCfg, myTeam) {
    const order = draft.draftOrder && draft.draftOrder.length ? draft.draftOrder : Object.keys((league && league.teamInfo) || {});
    const N = order.length, list = (draft.draftPicks || []).filter(d => d && d.round);
    const maxRound = list.reduce((m, d) => Math.max(m, d.round), 0), listsAll = list.some(d => !d.playerId);
    const cfg = cfgOf(Object.assign({}, baseCfg, { teams: Math.min(20, Math.max(4, N)) }));
    cfg.roster = Math.min(25, Math.max(8, listsAll ? maxRound : Math.max(cfg.roster, maxRound)));
    const mi = myTeam ? order.indexOf(myTeam) : -1; if (mi >= 0) cfg.slot = mi + 1;
    const P = PLAYERS.map((r, i) => ({ n: r.n, t: r.t, id: i, key: Shared.norm(r.n) }));
    const tail = PLAYERS.slice().sort((a, b) => b.rk - a.rk).slice(0, 15), avg = f => tail.reduce((s, q) => s + q[f], 0) / tail.length;
    const picks = new Array(cfg.teams * cfg.roster).fill(null), owner = [], extra = [], byFid = {};
    for (const d of list) {
      const k = d.pickInRound ? (d.round - 1) * N + (d.pickInRound - 1) : d.pick - 1;
      if (k < 0 || k >= picks.length) continue;
      const t = order.indexOf(d.teamId); if (t >= 0) owner[k] = t;
      if (!d.playerId) continue;
      const info = fxPlayers && fxPlayers[d.playerId]; if (!info || !info.name) continue;
      const name = swapName(info.name), q = Shared.findListed(P, name, info.team);
      if (q) { picks[k] = q.id; continue; }
      if (byFid[d.playerId] == null) {
        extra.push({ n: name, t: info.team || '', p: String(info.position || '').replace(/,/g, '/'), g: Math.round(avg('g')), m: Math.round(avg('m')),
          pts: avg('pts'), tpm: avg('tpm'), reb: avg('reb'), ast: avg('ast'), stl: avg('stl'), blk: avg('blk'), fgp: avg('fgp'), fga: avg('fga'), ftp: avg('ftp'), fta: avg('fta'), to: avg('to'),
          adp: null, ftx: null, rk: 999, inj: '', risk: '', note: 'Not in the projections. Counted as a waiver-level player.', fid: d.playerId });
        byFid[d.playerId] = PLAYERS.length + extra.length - 1;
      }
      picks[k] = byFid[d.playerId];
    }
    const ti = (league && league.teamInfo) || {}, names = order.map(id => (ti[id] && ti[id].name) || null);
    return { cfg, picks, owner, extra, names };
  }

  const api = { computeLeague, rawTotals, playersFor, listSources, sourceFromStore, sourceFromFantrax, LEAGUE_DEF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.League = api;
})(this);
