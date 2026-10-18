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

  const api = { computeLeague, rawTotals, playersFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.League = api;
})(this);
