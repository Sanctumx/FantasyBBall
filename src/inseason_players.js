// In-season player pool (2026-10-20): the one projection loader, Fantrax / ESPN → players.json name matching, each
// rostered or available player's line, and the value scale the in-season tools share. Pure; browser and Node.
(function (root) {
  'use strict';
  const Shared = root.Shared || require('./shared.js'), InLeague = root.InLeague || require('./inseason_league.js');

  const SHRINK_GAMES = 20;   // actual stats count as this many games of projection (Trade Analyzer's current-performance line)
  const WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 1, 0.5];   // FG%, FT%, 3PM, PTS, REB, AST, STL, BLK, TO: the board's default weights
  // Genuine spelling differences found between sources: Fantrax id → the name to look up, ESPN id → the name to list it under
  const OVERRIDES = { fx: {}, espn: {} };

  const swapName = n => { const i = String(n).indexOf(','); return i < 0 ? String(n) : (n.slice(i + 1) + ' ' + n.slice(0, i)).trim(); };
  const lineOf = r => ({ fgp: r.fgp, fga: r.fga, ftp: r.ftp, fta: r.fta, tpm: r.tpm, pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, to: r.to });

  // THE projection loader: every projected player's per-game line, games and ADP, from players.json
  function projLines(PLAYERS, proj) {
    return PLAYERS.map((r, i) => {
      const q = Shared.projOf(r, proj || 'avg');
      return { id: i, n: r.n, t: r.t, pos: r.p, g: q.g, line: lineOf(q), adp: r.ftx != null ? r.ftx : (r.adp != null ? r.adp : null), rk: r.rk };
    });
  }

  // the item of list ({n, t}) a Fantrax / ESPN name means, or null
  function matchTo(list, name, team) { return Shared.findListed(list, swapName(name), InLeague.toProjTeam(team)); }

  const espnLine = r => ({ fgp: r.fga ? r.fgm / r.fga : 0, fga: r.fga, ftp: r.fta ? r.ftm / r.fta : 0, fta: r.fta, tpm: r.tpm, pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, to: r.to });

  // the average of the 15 lowest-ranked projected players, as League.sourceFromFantrax counts unknown players
  function waiverLevel(projP) {
    const tail = projP.slice().sort((a, b) => b.rk - a.rk).slice(0, 15), avg = f => tail.reduce((s, q) => s + f(q), 0) / tail.length;
    const line = {}; Object.keys(tail[0].line).forEach(k => { line[k] = avg(q => q.line[k]); });
    return { line, g: avg(q => q.g) };
  }

  function buildPool({ PLAYERS, fxPlayers, espn, L, rosters, proj }) {
    const projP = projLines(PLAYERS, proj), projList = projP.map(p => ({ n: p.n, t: p.t, id: p.id }));
    const espnList = ((espn && espn.players) || []).map(r => ({ n: OVERRIDES.espn[r.id] || r.n, t: InLeague.toProjTeam(r.t), row: r }));
    const wl = waiverLevel(projP), owner = {}, slot = {};
    Object.keys(rosters).forEach(t => rosters[t].forEach(x => { owner[x.fid] = t; slot[x.fid] = x.slot; }));
    const fids = Object.keys(owner).concat(Object.keys(L.fxStatus).filter(f => !(f in owner) && (L.fxStatus[f] === 'FA' || L.fxStatus[f] === 'WW')));
    const players = [], byKey = new Map(), noProj = [];
    fids.forEach(fid => {
      const info = (fxPlayers && fxPlayers[fid]) || { name: fid, team: '', position: '' };
      const name = OVERRIDES.fx[fid] || info.name;
      const pm = matchTo(projList, name, info.team), es = matchTo(espnList, name, info.team);
      const actual = es && es.row.gp > 0 ? { gp: es.row.gp, line: espnLine(es.row) } : null;
      let src, line, g, pos, n, t, adp;
      if (pm) { const q = projP[pm.id]; src = 'proj'; line = q.line; g = q.g; pos = q.pos; n = q.n; t = q.t; adp = q.adp; }
      else {
        src = actual ? 'actual' : 'waiver'; line = actual ? actual.line : wl.line; g = wl.g;
        pos = String(info.position || '').replace(/,/g, '/'); n = swapName(info.name); t = InLeague.toProjTeam(info.team); adp = null;
      }
      if (!(fid in owner) && src === 'waiver') return;   // available players with no line at all are not worth listing
      const pp = { key: fid, n, t, pos, line, g, src, actual, adp, owner: owner[fid] || null, slot: slot[fid] || null, fxStatus: L.fxStatus[fid] || (fid in owner ? 'T' : null) };
      players.push(pp); byKey.set(fid, pp);
      if (fid in owner && src !== 'proj') noProj.push(pp);
    });
    return { players, byKey, unmatched: { noProj, noEspn: players.filter(p => !p.actual).length },
      stats: espn ? { season: espn.season, label: espn.label, fetchedAt: espn.fetchedAt } : null };
  }

  // ---- value scale: season Standard Zscore over the top n by ADP, standardized to mean 0 / SD 1 over that pool ----
  const total = (l, g, ref) => [(l.fgp - ref.pFG) * l.fga * g, (l.ftp - ref.pFT) * l.fta * g, l.tpm * g, l.pts * g, l.reb * g, l.ast * g, l.stl * g, l.blk * g, l.to * g];
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a, m) => Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) || 1;
  const rawValue = (T, ref) => T.reduce((s, v, c) => s + WEIGHTS[c] * (c === 8 ? -1 : 1) * (v - ref.mean[c]) / ref.sd[c], 0);

  function makeValueRef(projPlayers, n) {
    const top = projPlayers.slice().sort((a, b) => (a.adp == null ? 1e9 : a.adp) - (b.adp == null ? 1e9 : b.adp)).slice(0, n || 168);
    const wsum = (f) => top.reduce((s, p) => s + f(p) * p.g, 0);
    const ref = { pFG: wsum(p => p.line.fgp * p.line.fga) / wsum(p => p.line.fga), pFT: wsum(p => p.line.ftp * p.line.fta) / wsum(p => p.line.fta) };
    const seasonT = top.map(p => total(p.line, p.g, ref)), gameT = top.map(p => total(p.line, 1, ref));
    ref.mean = [], ref.sd = [], ref.pgMean = [], ref.pgSd = [];
    for (let c = 0; c < 9; c++) {
      const s = seasonT.map(r => r[c]), g = gameT.map(r => r[c]);
      ref.mean[c] = mean(s); ref.sd[c] = sd(s, ref.mean[c]); ref.pgMean[c] = mean(g); ref.pgSd[c] = sd(g, ref.pgMean[c]);
    }
    const raws = seasonT.map(T => rawValue(T, ref));
    ref.vMean = mean(raws); ref.vSd = sd(raws, ref.vMean);
    return ref;
  }
  const valueZ = (line, g, ref) => (rawValue(total(line, g, ref), ref) - ref.vMean) / ref.vSd;
  // per-game z in each category, positive = good for the team (turnovers flipped)
  const catZ = (line, ref) => total(line, 1, ref).map((v, c) => (c === 8 ? -1 : 1) * (v - ref.pgMean[c]) / ref.pgSd[c]);

  // the player's per-game line with actual stats shrunk toward the projection: actual counts as gp games, projection as K
  function curLine(pp, K) {
    if (!pp.actual) return pp.line;
    const w = pp.actual.gp / (pp.actual.gp + (K == null ? SHRINK_GAMES : K)), a = pp.actual.line, b = pp.line, mix = (x, y) => w * x + (1 - w) * y;
    const fga = mix(a.fga, b.fga), fta = mix(a.fta, b.fta), fgm = mix(a.fgp * a.fga, b.fgp * b.fga), ftm = mix(a.ftp * a.fta, b.ftp * b.fta);
    return { fgp: fga ? fgm / fga : 0, fga, ftp: fta ? ftm / fta : 0, fta, tpm: mix(a.tpm, b.tpm), pts: mix(a.pts, b.pts), reb: mix(a.reb, b.reb),
      ast: mix(a.ast, b.ast), stl: mix(a.stl, b.stl), blk: mix(a.blk, b.blk), to: mix(a.to, b.to) };
  }

  const api = { SHRINK_GAMES, WEIGHTS, OVERRIDES, swapName, projLines, matchTo, buildPool, makeValueRef, valueZ, catZ, curLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InPlayers = api;
})(this);
