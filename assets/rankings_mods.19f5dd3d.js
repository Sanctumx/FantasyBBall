// In-season league calendar (2026-10-20): Fantrax league/roster/standings parsing, matchup periods, team-code mapping and
// the expected games a roster plays in a window (from the daily tip-off times in sched_days.json).
(function (root) {
  'use strict';
  const HOUR = 3600e3, DAY = 24 * HOUR, LOCAL = 6 * HOUR;   // local day = UTC − 6 h, as sched_b2b.py

  // 'YYYY-MM-DDTHH:MM:SS(.f)?±HHMM' → ms. Parsed by hand so every browser agrees.
  function parseFxDate(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?([+-])(\d\d)(\d\d)$/.exec(String(s));
    if (!m) return NaN;
    const off = (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60000;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off;
  }

  function parseLeague(info) {
    const ti = info.teamInfo || {};
    const teams = Object.keys(ti).map(id => ({ id, name: ti[id].name, short: ti[id].shortName }));
    // a period ends at hh:mm:59, the next one starts a second later, so end is exclusive: end = last second + 1 s
    const periods = (info.scoringPeriods || []).map(p => ({ n: p.number, start: parseFxDate(p.startDate), end: parseFxDate(p.endDate) + 1000 }))
      .sort((a, b) => a.n - b.n);
    const matchups = {};
    (info.matchups || []).forEach(m => {
      const pairs = (m.matchupList || []).filter(x => x.away && x.home && x.away.id && x.home.id).map(x => [x.away.id, x.home.id]);
      if (pairs.length && pairs.length === (m.matchupList || []).length) matchups[m.period] = pairs;
    });
    // Regular season = the matchup periods that carry real team ids (1-15 in this league). Fantrax also states
    // playoffs.lastRegularSeasonPeriod (17), but its matchups from 16 on are playoff seeds / TBD, so the ids win (ruling, Task 2).
    const withIds = Object.keys(matchups).map(Number);
    const lastRegular = withIds.length ? Math.max.apply(null, withIds) : 0;
    const ri = info.rosterInfo || {};
    const fxStatus = {}, eligible = {};
    Object.keys(info.playerInfo || {}).forEach(id => { fxStatus[id] = info.playerInfo[id].status; eligible[id] = info.playerInfo[id].eligiblePos; });
    return { teams, periods, matchups, lastRegular, statedLastRegular: info.playoffs && info.playoffs.lastRegularSeasonPeriod, maxActive: ri.maxTotalActivePlayers, maxPlayers: ri.maxTotalPlayers, fxStatus, eligible, season: info.seasonYear };
  }

  const SLOT = { ACTIVE: 'ACTIVE', RESERVE: 'RESERVE', INJURED_RESERVE: 'IR' };
  function parseRosters(body) {
    const out = {};
    Object.keys((body && body.rosters) || {}).forEach(t => {
      out[t] = (body.rosters[t].rosterItems || []).map(x => ({ fid: x.id, slot: SLOT[x.status] || 'RESERVE' }));
    });
    return out;
  }
  function parseStandings(arr) {
    const out = {};
    (arr || []).forEach(r => { out[r.teamId] = { rank: r.rank, record: r.points }; });
    return out;
  }

  // the regular-season period containing now (before the first period → 1; after the last regular period → null)
  function currentPeriod(L, nowMs) {
    const reg = L.periods.filter(p => p.n <= L.lastRegular);
    if (!reg.length) return null;
    if (nowMs < reg[0].start) return reg[0].n;
    const p = reg.find(q => nowMs >= q.start && nowMs < q.end);
    return p ? p.n : null;
  }
  function opponentOf(L, teamId, n) {
    const pair = (L.matchups[n] || []).find(x => x[0] === teamId || x[1] === teamId);
    return pair ? (pair[0] === teamId ? pair[1] : pair[0]) : null;
  }
  const regularFrom = (L, n) => { const out = []; for (let k = n; k <= L.lastRegular; k++) out.push(k); return out; };

  // Fantrax and ESPN team codes → the codes players.json and sched.json use
  const TEAM_MAP = { GS: 'GSW', NO: 'NOR', NOP: 'NOR', NY: 'NYK', SA: 'SAS', PHX: 'PHO', UTAH: 'UTA', WSH: 'WAS' };
  const TEAMS = 'ATL BKN BOS CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOR NYK OKC ORL PHI PHO POR SAC SAS TOR UTA WAS'.split(' ');
  function toProjTeam(code) {
    const c = String(code || '').trim().toUpperCase();
    const m = TEAM_MAP[c] || c;
    return TEAMS.includes(m) ? m : '';
  }

  const localDay = ms => new Date(ms - LOCAL).toISOString().slice(0, 10);
  const dayStart = day => Date.parse(day + 'T00:00:00Z') + LOCAL;
  // Fantrax's last day of a period: its end is 18:59:59 ET on the day after (the next period starts at 19:00), so labels stop a day earlier
  const periodLast = per => localDay(per.end - DAY - 1);
  const periodDays = per => { const out = []; for (let t = dayStart(localDay(per.start)); localDay(t) <= periodLast(per); t += DAY) out.push(localDay(t)); return out; };
  const nextDayStart = ms => dayStart(localDay(ms)) + DAY;
  // New York calendar date of an instant, the date ESPN files a game under; the months ('YYYY-MM') a period touches
  const NY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const nyDay = ms => { const o = {}; NY_FMT.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; }); return o.year + '-' + o.month + '-' + o.day; };
  function periodMonths(per, back) {
    const a = nyDay(per.start).slice(0, 7), b = nyDay(per.end - 1).slice(0, 7), out = [a];
    if (b !== a) out.push(b);
    if (back) out.unshift(new Date(Date.UTC(+a.slice(0, 4), +a.slice(5) - 2, 1)).toISOString().slice(0, 7));   // the month before, for the games just before the week
    return out;
  }

  // Expected games for each roster entry {t: team code, a: availability 0-1, from, to (ms, [from, to))}: the team's tip-offs
  // in the window, each worth a. On a local day where the entries' combined value exceeds maxActive (only that many
  // players can start), that day's contributions are scaled down to maxActive.
  // `used` {local day: players already counted that day} lowers the cap of a partly played day.
  function rosterGames(entries, DAYS, maxActive, used) {
    const G = (DAYS && DAYS.games) || DAYS || {};
    const hits = entries.map(e => (G[e.t] || []).map(s => s * 1000).filter(ms => ms >= e.from && ms < e.to).map(ms => [localDay(ms), e.a]));
    const sum = {};
    hits.forEach(h => h.forEach(([d, a]) => { sum[d] = (sum[d] || 0) + a; }));
    return hits.map(h => h.reduce((acc, [d, a]) => { const cap = Math.max(0, maxActive - ((used && used[d]) || 0)); return acc + a * (sum[d] > cap ? cap / sum[d] : 1); }, 0));
  }

  const api = { parseFxDate, parseLeague, parseRosters, parseStandings, currentPeriod, opponentOf, regularFrom, toProjTeam, localDay, dayStart, nextDayStart, nyDay, periodLast, periodDays, periodMonths, rosterGames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InLeague = api;
})(this);

// In-season player pool (2026-10-20): the one projection loader, Fantrax / ESPN → players.json name matching, each
// rostered or available player's line, and the value scale the in-season tools share. Pure; browser and Node.
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), Shared = root.Shared || require('./shared.js'), InLeague = root.InLeague || require('./inseason_league.js');

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
      return { id: i, n: r.n, t: r.t, pos: r.p, g: q.g, m: q.m, line: lineOf(q), adp: r.ftx != null ? r.ftx : (r.adp != null ? r.adp : null), rk: r.rk, src: r.src };
    });
  }

  // the item of list ({n, t}) a Fantrax / ESPN name means, or null
  function matchTo(list, name, team) { return Shared.findListed(list, swapName(name), InLeague.toProjTeam(team)); }

  const espnLine = r => ({ fgp: r.fga ? r.fgm / r.fga : 0, fga: r.fga, ftp: r.fta ? r.ftm / r.fta : 0, fta: r.fta, tpm: r.tpm, pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, to: r.to });

  // the average of the 15 lowest-ranked projected players, as League.sourceFromFantrax counts unknown players
  function waiverLevel(projP) {
    const tail = projP.filter(q => q.src !== 'hs').sort((a, b) => b.rk - a.rk).slice(0, 15), avg = f => tail.reduce((s, q) => s + f(q), 0) / tail.length;
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
    // each projection and each ESPN row goes to one Fantrax player: the rostered one, then the one whose team matches
    const matches = fids.map(fid => {
      const info = (fxPlayers && fxPlayers[fid]) || { name: fid, team: '', position: '' }, name = OVERRIDES.fx[fid] || info.name;
      return { fid, info, pm: matchTo(projList, name, info.team), es: matchTo(espnList, name, info.team) };
    });
    ['pm', 'es'].forEach(f => {
      const by = new Map();
      matches.forEach(m => { if (m[f]) { if (!by.has(m[f])) by.set(m[f], []); by.get(m[f]).push(m); } });
      by.forEach((ms, item) => {
        const score = m => (m.fid in owner ? 2 : 0) + (m.info.team && InLeague.toProjTeam(m.info.team) === item.t ? 1 : 0);
        const best = ms.reduce((a, b) => (score(b) > score(a) ? b : a));
        ms.forEach(m => { if (m !== best) m[f] = null; });
      });
    });
    matches.forEach(({ fid, info, pm, es }) => {
      const actual = es && es.row.gp > 0 ? { gp: es.row.gp, line: espnLine(es.row), min: es.row.min } : null;
      let src, line, g, pos, n, t, adp, mpg = null, pid = null;
      if (pm) { const q = projP[pm.id]; src = 'proj'; line = q.line; g = q.g; pos = q.pos; n = q.n; t = q.t; adp = q.adp; pid = pm.id; mpg = q.m == null ? null : q.m; }
      else {
        src = actual ? 'actual' : 'waiver'; line = actual ? actual.line : wl.line; g = wl.g;
        pos = String(info.position || '').replace(/,/g, '/'); n = swapName(info.name); t = InLeague.toProjTeam(info.team); adp = null;
        mpg = actual && actual.min != null ? actual.min : null;
      }
      if (!(fid in owner) && src === 'waiver') return;   // available players with no line at all are not worth listing
      const pp = { key: fid, n, t, pos, line, g, mpg, src, actual, adp, pid, owner: owner[fid] || null, slot: slot[fid] || null, fxStatus: L.fxStatus[fid] || (fid in owner ? 'T' : null) };
      players.push(pp); byKey.set(fid, pp);
      if (fid in owner && src !== 'proj') noProj.push(pp);
    });
    return { players, byKey, unmatched: { noProj, noEspn: players.filter(p => !p.actual).length },
      stats: espn ? { season: espn.season, label: espn.label, fetchedAt: espn.fetchedAt } : null };
  }

  // ---- board Zscore (the draft board's Zscore column) for players with a projection: type 'classic' (Standard), 'adj'
  // (ROTO-Adjusted) or 'h2h' (H2H-Adjusted); basis 'total' (Season), 'pergame' or 'mix'. Default league, Average projections, TO x0.5.
  const Z_CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, ilSpots: 3, field: 'easy', fieldZ: 'std', puntMode: 'off',
    puntLock: '', catW: WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0 };
  const zCache = new WeakMap();
  function zTable(PLAYERS, basis) {
    let by = zCache.get(PLAYERS); if (!by) zCache.set(PLAYERS, by = {});
    if (!by[basis]) {
      const P = Eng.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, 'avg'))));
      Eng.buildContext(P, Object.assign({}, Z_CFG, { basis }));
      const o = { classic: [], adj: [], h2h: [] };
      P.forEach((p, i) => { o.classic[i] = p.zCl.z[0]; o.adj[i] = p.z[0]; o.h2h[i] = p.zH ? p.zH.z[0] : p.z[0]; });
      by[basis] = o;
    }
    return by[basis];
  }
  const zscoreOf = (PLAYERS, pp, type, basis) => (pp.pid == null ? null : zTable(PLAYERS, basis || 'total')[type || 'classic'][pp.pid]);

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

  const api = { SHRINK_GAMES, WEIGHTS, OVERRIDES, swapName, espnLine, projLines, waiverLevel, matchTo, buildPool, zscoreOf, makeValueRef, valueZ, catZ, curLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InPlayers = api;
})(this);

// Points mode (#137): fantasy points of a stat line and its variance, in the engine's own units. Pure; browser and Node.
// A player's FP per game is m = sum of weight x stat over the 11 point stats (fgm = fgp x fga, ftm = ftp x fta, as in prepPlayers).
// Variances use the engine's per-stat fits plus the within-player per-game correlations measured by points_fit.js.
// The engine view (below) puts one FP total in category slot FP_SLOT so Engine.evaluate runs unchanged.
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js');
  const V = Eng.VARS;
  const STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'fgm', 'fga', 'ftm', 'fta'];
  // pooled within-player per-game correlation, STATS order (logs3.csv, 2023-24 to 2025-26, 723 player-seasons; points_fit.js)
  const RHO = [[1,0.266792,0.158245,0.132771,0.078307,0.105515,0.661442,0.936542,0.746937,0.45797,0.450334],[0.266792,1,0.19313,0.07668,0.120267,0.130567,0.096615,0.259927,0.332803,0.149784,0.164514],[0.158245,0.19313,1,0.110404,0.049083,0.086772,0.086326,0.152083,0.180555,0.075083,0.077246],[0.132771,0.07668,0.110404,1,0.031628,0.070447,0.0623,0.131739,0.151708,0.059698,0.066785],[0.078307,0.120267,0.049083,0.031628,1,0.037035,0.037042,0.073029,0.084922,0.046119,0.048935],[0.105515,0.130567,0.086772,0.070447,0.037035,1,0.054546,0.094183,0.098167,0.069185,0.074498],[0.661442,0.096615,0.086326,0.0623,0.037042,0.054546,1,0.574231,0.431381,0.047454,0.050242],[0.936542,0.259927,0.152083,0.131739,0.073029,0.094183,0.574231,1,0.77874,0.165897,0.178942],[0.746937,0.332803,0.180555,0.151708,0.084922,0.098167,0.431381,0.77874,1,0.194198,0.204821],[0.45797,0.149784,0.075083,0.059698,0.046119,0.069185,0.047454,0.165897,0.194198,1,0.943422],[0.450334,0.164514,0.077246,0.066785,0.048935,0.074498,0.050242,0.178942,0.204821,0.943422,1]];
  // variance / mean of the four stats the engine has no fit for (points_fit.js; the same method gives the engine's 7: reb 1.336, to 1.022)
  const DISP = { fgm: 1.225, fga: 1.406, ftm: 2.004, fta: 2.182 };
  const ENG_IX = { tpm: 2, pts: 3, reb: 4, ast: 5, stl: 6, blk: 7, to: 8 };   // slot of the engine's own per-game variance

  // per-game stats of a line (raw or prepped); shooting made = percentage x attempts, 0 when there are no attempts
  function statsOf(l) {
    const num = v => v > 0 || v < 0 ? +v : 0, fga = num(l.fga), fta = num(l.fta);
    return { pts: num(l.pts), reb: num(l.reb), ast: num(l.ast), stl: num(l.stl), blk: num(l.blk), to: num(l.to), tpm: num(l.tpm),
      fgm: fga > 0 ? num(l.fgp) * fga : 0, fga, ftm: fta > 0 ? num(l.ftp) * fta : 0, fta };
  }
  const wOf = w => STATS.map(k => (w && +w[k]) || 0);
  function perGame(l, w) { const s = statsOf(l), a = wOf(w); return STATS.reduce((t, k, i) => t + a[i] * s[k], 0); }
  const quad = (a, v) => { let t = 0; for (let i = 0; i < 11; i++) { if (!a[i]) continue; for (let j = 0; j < 11; j++) if (a[j]) t += a[i] * a[j] * RHO[i][j] * v[i] * v[j]; } return Math.max(0, t); };
  // game-to-game variance of one game's FP
  function pgVar(l, w) {
    const s = statsOf(l), ev = Eng.perGameVar(Object.assign({}, l, s, { fgp: s.fga > 0 ? s.fgm / s.fga : 0, ftp: s.fta > 0 ? s.ftm / s.fta : 0 }));
    const sd = STATS.map(k => Math.sqrt(ENG_IX[k] != null ? ev[ENG_IX[k]] : DISP[k] * s[k]));
    return quad(wOf(w), sd);
  }
  // projection error of a season's FP at g games: the engine's 12% per counting stat, correlated by the same rho
  function projVar(l, g, w) { const s = statsOf(l); return Math.pow(V.PROJ_SD * g, 2) * quad(wOf(w), STATS.map(k => s[k])); }
  // weekly variance: games in a week x per-game variance + variance of the games count x m squared
  function weekVar(l, g, w) { const m = perGame(l, w); return (V.GPW * g / 82) * pgVar(l, w) + m * m * V.VAR_GAMES; }
  const key = w => wOf(w).join(',');


  // ---------- the engine view: one FP total in category slot FP_SLOT, zeros elsewhere ----------
  // Engine.evaluate then runs unchanged: its single-category chance for FP_SLOT is the normal chance one weekly total beats another,
  // and Win M = 100 x gainC[FP_SLOT]. Never read gainM (it runs over 9 slots with 8 tied).
  const FP_SLOT = 3;
  const WEEKS = Eng.WEEKS;

  // team noise in the units of ctx.idioNoise / loadS / h2hNoise, from the engine's own 80 simulated ADP drafts
  // (the draws, SIGMA_G2 factor and formulas of the engine's scaleFor, for the FP total only)
  function noise(P, ctx, cfg, w) {
    const sims = Eng.draftSims(P, cfg), N = cfg.teams, teamsN = sims.length * N;
    const m = P.map(p => perGame(p, w)), WV = P.map((p, i) => weekVar(p, p.gUse, w));
    let s1 = 0, s2 = 0, wpg = 0, wsum = 0, picks = 0;
    sims.forEach(sim => sim.forEach(team => team.forEach(i => { s1 += m[i]; s2 += m[i] * m[i]; wpg += WV[i] - m[i] * m[i] * V.VAR_GAMES; wsum += WV[i]; picks++; })));
    const nT = picks / teamsN, S1 = s1 / teamsN, S2 = s2 / teamsN, PGv = wpg / teamsN, nk = cfg.noiseK != null ? +cfg.noiseK : 1;
    const idio = Math.max(1e-9, PGv + V.SIGMA_G2 * Math.max(0, S2 - S1 * S1 / nT));
    return { idio: 2 * idio * WEEKS * WEEKS * nk, load: S1 / nT * WEEKS, h2h: 2 * (wsum / teamsN) * WEEKS * WEEKS * nk };
  }

  // mean per-game FP of the free-agent tier, the engine's pgRepl for FP: ADP ranks N*R+1 .. N*R+20
  function replFP(P, cfg, w) {
    const byAdp = P.slice().sort((a, b) => Eng.adpOf(a, cfg.adpSrc) - Eng.adpOf(b, cfg.adpSrc));
    const fa = byAdp.slice(Math.min(byAdp.length - 1, cfg.teams * cfg.roster), Math.min(byAdp.length, cfg.teams * cfg.roster + 20));
    return fa.reduce((t, p) => t + perGame(p, w), 0) / (fa.length || 1);
  }

  // P: prepped players after Engine.buildContext(P, cfg) (they carry gUse); returns copies for Engine.evaluate
  function engineView(P, ctx, cfg, w) {
    const rep = replFP(P, cfg, w), nz = noise(P, ctx, cfg, w);
    const view = P.map(p => {
      const m = perGame(p, w), x = new Float64Array(Eng.NC), pv = new Float64Array(Eng.NC);
      x[FP_SLOT] = m * p.gUse + Math.max(0, V.SEASON_G - p.gUse) * ctx.ilFill * rep;
      pv[FP_SLOT] = projVar(p, p.gUse, w);
      return Object.assign({}, p, { x, pv, fieldV: x[FP_SLOT], boardRaw: x[FP_SLOT] });
    });
    const vctx = Object.assign({}, ctx), set = (a, v) => { const o = new Float64Array(Eng.NC); o[FP_SLOT] = v; return o; };
    vctx.idioNoise = set(0, nz.idio); vctx.loadS = set(0, nz.load); vctx.h2hNoise = set(0, nz.h2h);
    vctx.pgRepl = set(0, rep); vctx.streamK = new Float64Array(Eng.NC).fill(1);
    return { P: view, ctx: vctx };
  }

  // a stat line at `games` season games as a team-total entry (IL fill off): the points version of Engine.entryVec
  function entry(l, games, ctx, w) {
    const x = new Float64Array(Eng.NC), pv = new Float64Array(Eng.NC);
    x[FP_SLOT] = perGame(l, w) * games; pv[FP_SLOT] = projVar(l, games, w);
    return { x, pv };
  }

  // ---------- Rankings table in points ----------
  // rows as Rankings.projSource gives them ({pid, g, gp?, line}). Per game: FP per game. Season: FP per game x games (gp when the
  // source has it). Mix: FP per game x the midpoint of g and G0 (x gp/g, so a partial season stays on the Season scale), where G0 is the mean g of the top teams x roster players by Season
  // points: the same halfway point the engine uses (every stat is linear in games). Rows with no games go last with z null.
  function table(rows, w, o) {
    const N = o.teams || 14, R = o.roster || 12, K = N * R, basis = ['pergame', 'total', 'mix'].includes(o.basis) ? o.basis : 'total';
    const live = rows.filter(r => r.g > 0).map(r => ({ pid: r.pid, fpg: perGame(r.line, w), g: r.g, gp: r.gp != null ? r.gp : r.g }));
    const dead = rows.filter(r => !(r.g > 0));
    const season = live.slice().sort((a, b) => b.fpg * b.gp - a.fpg * a.gp || a.pid - b.pid).slice(0, K);
    const G0 = season.length ? season.reduce((t, r) => t + r.g, 0) / season.length : 0;
    const zOf = r => basis === 'pergame' ? r.fpg : basis === 'mix' ? r.fpg * (r.g + G0) / 2 * (r.gp / r.g) : r.fpg * r.gp;
    const out = live.map(r => ({ pid: r.pid, z: zOf(r), fpg: r.fpg, cats: null, inPool: false })).sort((a, b) => b.z - a.z || a.pid - b.pid);
    out.slice(0, K).forEach(r => { r.inPool = true; });
    return out.concat(dead.map(r => ({ pid: r.pid, z: null, fpg: null, cats: null, inPool: false })));
  }

  const api = { table, FP_SLOT, noise, engineView, entry, STATS, RHO, DISP, statsOf, perGame, pgVar, projVar, weekVar, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Points = api;
})(this);

// Rankings core (2026-10-21): per-game lines from any source → Zscore table. Pure; browser and Node.
// Rule (user, 2026-10-21): a source's Zscore is calculated on the top X players by H2H-adjusted value within that source,
// X = teams × roster size, re-ranked until the pool settles. No ADP or roster pool, so a last-week table is relative to
// last-week lines. The engine is only called, never changed (the Model pick and Win do not see any of this).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), Points = root.Points || require('./points_core.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), InLeague = root.InLeague || require('./inseason_league.js'), Shared = root.Shared || require('./shared.js'), LeagueStore = root.LeagueStore || require('./league_store.js');

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
    let P = Eng.prepPlayers(live.map(r => Object.assign({}, r.line, { g: r.g, ftx: r.ftx !== undefined ? r.ftx : (rank.get(r.pid) || null) })));
    let ctx = Eng.buildContext(P, cfg);
    const n0 = P.length, pts = o.points ? Points.FP_SLOT : -1;   // points mode: one FP total in a category slot (points_core.engineView)
    if (o.points) { const v = Points.engineView(P, ctx, cfg, o.points); P = v.P; ctx = v.ctx; }
    const cOf = p => pts < 0 ? p.gain * 100 : null, mOf = p => pts < 0 ? p.gainM * 100 : p.gainC[pts] * 100;
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
      const base = ai < 0 ? { c: pts < 0 ? 0 : null, m: 0 } : { c: cOf(P[ai]), m: mOf(P[ai]) };
      return { g: P.slice(0, n0).map(p => ({ c: cOf(p), m: mOf(p) })), base };
    };
    const rep = new Map(), avg = new Map(), put = (r, pid) => { const i = idx.get(pid), v = r.g[i]; rep.set(pid, v); avg.set(pid, { c: pts < 0 ? v.c - r.base.c : null, m: v.m - r.base.m }); };
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

  const api = { WEIGHTS, TYPES, PO_LAMBDA, cfgFor, projSource, seasonSource, windowSource, ownersOf, table, playoffGames, withPlayoffs, winStart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Rankings = api;
})(this);

