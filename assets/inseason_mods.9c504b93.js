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

// Weekly Matchup Analyzer core (2026-10-20): projects a team's matchup week from expected games, and ranks single waiver adds.
// Pure; browser and Node. Chances come from Engine.pairMatchup with games variance GVAR on every entry, shrunk toward 0.5
// (calibrated on 2024-26 weeks, src/calib_pair.js; refit k on in-season projections).
(function (root) {
  'use strict';
  const Engine = root.Engine || require('./engine.js'), InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js');

  const GVAR = 1.87, K_MATCH = 0.72, K_CAT = 0.82;
  // whole games with the recent-play filter (outSet) calibrate looser than the fractional ones (calib_pair.js PM-act, 2025-26 / 2024-25: ideal k .83 matchup, .85 categories)
  const KW_MATCH = 0.83, KW_CAT = 0.85;
  const shrink = (p, k) => p == null ? p : 0.5 + k * (p - 0.5);

  const periodOf = (L, n) => L.periods.find(p => p.n === n);

  function makeCtx({ L, pool, DAYS, rosters, me, nowMs, ref, box, nightOf }) {
    const roster = {};
    Object.keys(rosters).forEach(t => { roster[t] = rosters[t].map(x => x.fid); });
    const projected = pool.players.filter(p => p.src === 'proj');
    const ctx = { L, pool, DAYS, me, nowMs, cur: InLeague.currentPeriod(L, nowMs), ref: ref || InPlayers.makeValueRef(projected.map(p => ({ adp: p.adp, g: p.g, line: p.line }))), roster };
    const per = periodOf(L, ctx.cur);
    ctx.curEnd = per ? per.end : 0; ctx.out = outSet(ctx, box); ctx.box = box;
    if (nightOf) ctx.nightOf = nightOf;   // points leagues: who plays a crowded night, by the player's own value (the Matchup Analyzer never sets it)
    return ctx;
  }

  // Players who sat out their team's last 3 boxed games are out for the rest of the current week: a player who is playing now most
  // likely plays his next 3-4 games. A player with no box line at all counts as out too (a failed name match would count him out as well). A team with fewer than 3 boxed games is not judged.
  function outSet(ctx, files) {
    const games = {}, seen = new Map(), out = new Set();
    (files || []).filter(Boolean).forEach(f => {
      const mi = f.cols.indexOf('min');
      Object.keys(f.games || {}).forEach(id => {
        const g = f.games[id];
        Object.keys(g.teams).forEach(abbr => {
          const t = InLeague.toProjTeam(abbr) || abbr, ids = new Set();
          g.teams[abbr].forEach(l => { if (l[mi + 1] > 0) { ids.add(l[0]); seen.set(l[0], { id: l[0], n: InPlayers.OVERRIDES.espn[l[0]] || (f.names || {})[l[0]] || String(l[0]), t }); } });
          (games[t] || (games[t] = [])).push({ d: g.d, ids });
        });
      });
    });
    const list = Array.from(seen.values());
    const keys = [].concat(...Object.keys(ctx.roster).map(tid => ctx.roster[tid]), ctx.pool.players.filter(p => !p.owner && (p.fxStatus === 'FA' || p.fxStatus === 'WW')).map(p => p.key));
    keys.forEach(key => {
      const p = ctx.pool.byKey.get(key), recent = (games[p.t] || []).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0).slice(-3), m = recent.length >= 3 && InPlayers.matchTo(list, p.n, p.t);
      if (recent.length >= 3 && (!m || !recent.some(g => g.ids.has(m.id)))) out.add(key);
    });
    return out;
  }

  // whole-period window; IR players sit out only in the current period
  function teamSegments(ctx, teamId, n, keys) {
    const per = periodOf(ctx.L, n), list = keys || ctx.roster[teamId].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR');
    return list.map(key => ({ key, from: per.start, to: per.end }));
  }

  // games per segment. Default (Trade Analyzer): expected games, availability g/82 per team game, capped per local day at the
  // league's active-player limit. whole (Matchup Analyzer): each real team game in the window counts 1, and on a night with more
  // players than the limit (less the `used` slots) only the best per-game players play
  function segGames(ctx, segs, used, whole) {
    if (!whole) {
      const pp = segs.map(s => ctx.pool.byKey.get(s.key));
      return InLeague.rosterGames(segs.map((s, i) => ({ t: pp[i].t, a: Math.min(1, pp[i].g / 82), from: s.from, to: s.to })), ctx.DAYS, ctx.L.maxActive, used);
    }
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, pp = segs.map(s => ctx.pool.byKey.get(s.key)), byDay = {}, out = segs.map(() => 0);
    segs.forEach((s, i) => (ctx.out && ctx.out.has(s.key) && s.from < ctx.curEnd ? [] : G[pp[i].t] || []).map(x => x * 1000).filter(ms => ms >= s.from && ms < s.to).forEach(ms => {
      const d = InLeague.localDay(ms);
      (byDay[d] || (byDay[d] = [])).push(i);
    }));
    Object.keys(byDay).forEach(d => {
      const cap = Math.max(0, ctx.L.maxActive - ((used && used[d]) || 0));
      byDay[d].map(i => ({ i, v: nightValue(ctx, pp[i]) })).sort((a, b) => b.v - a.v || a.i - b.i).slice(0, cap).forEach(x => { out[x.i] += 1; });
    });
    return out;
  }
  function scoreSegments(ctx, segsA, segsB, whole) {
    const side = segs => {
      const g = segGames(ctx, segs, null, whole);
      return { games: g.reduce((s, x) => s + x, 0), entries: segs.map((s, i) => ({ p: ctx.pool.byKey.get(s.key).line, games: g[i], gVar: GVAR })) };
    };
    const A = side(segsA), B = side(segsB), r = Engine.pairMatchup(A.entries, B.entries);
    return { mu: r.mu, cat: r.cat.map(p => shrink(p, whole ? KW_CAT : K_CAT)), match: shrink(r.match, whole ? KW_MATCH : K_MATCH), games: [A.games, B.games] };
  }
  function projectWeek(ctx, teamId, n) {
    const opp = InLeague.opponentOf(ctx.L, teamId, n);
    if (!opp) return { opp: null };
    return Object.assign({ opp }, scoreSegments(ctx, teamSegments(ctx, teamId, n), teamSegments(ctx, opp, n), n === ctx.cur));
  }

  // ---- week status: box-score totals so far + the games still to play (idea 118, 2026-10-21) ----
  const KCOLS = ['fgm', 'fga', 'ftm', 'fta', 'tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
  const zeroK = () => { const k = {}; KCOLS.forEach(c => { k[c] = 0; }); return k; };
  const kOf = (k0, r) => k0 + (1 - k0) * (1 - r);   // shrink eases to 1 as the week ends (r = share of the week's games still to play)

  // monthly stats/box-YYYY-MM.json objects → the period's lines per player and each team's latest game date (ESPN abbreviations mapped)
  function boxLines(files, per) {
    const from = InLeague.nyDay(per.start), to = InLeague.nyDay(per.end - 1), players = new Map(), lastDay = {};
    (files || []).filter(Boolean).forEach(f => Object.keys(f.games || {}).forEach(id => {
      const g = f.games[id];
      if (g.d < from || g.d > to) return;
      Object.keys(g.teams).forEach(abbr => {
        const t = InLeague.toProjTeam(abbr) || abbr;
        if (!lastDay[t] || g.d > lastDay[t]) lastDay[t] = g.d;
        g.teams[abbr].forEach(l => {
          const v = {}; f.cols.forEach((c, i) => { v[c] = l[i + 1]; });
          if (!(v.min > 0)) return;
          const a = players.get(l[0]) || { id: l[0], n: InPlayers.OVERRIDES.espn[l[0]] || (f.names || {})[l[0]] || String(l[0]), t, d: '', lines: [] };
          if (g.d >= a.d) { a.d = g.d; a.t = t; }
          a.lines.push({ d: g.d, v }); players.set(l[0], a);
        });
      });
    }));
    return { players, lastDay };
  }
  // the instant after a team's latest boxed game tipped off (the period's start when it has none yet)
  function cutoffOf(ctx, bx, team, per) {
    const day = bx.lastDay[team];
    if (!day) return per.start;
    const tip = ((ctx.DAYS.games || ctx.DAYS)[team] || []).map(s => s * 1000).find(ms => InLeague.nyDay(ms) === day);
    return Math.max(per.start, (tip != null ? tip : Date.parse(day + 'T00:00:00Z') + 28 * 3600e3) + 1);
  }

  // Both teams' status for period n: so-far totals (box lines of the current non-IR roster, at most maxActive players per day),
  // the rest of the week projected from each team's own cutoff, and chances for the final result. FG% / FT% come from summed makes and
  // attempts. Variance of the remaining games scales with the share of games left; the shrink eases from K to 1 with that share.
  function weekStatus(ctx, files, teamId, n) {
    const opp = InLeague.opponentOf(ctx.L, teamId, n);
    if (!opp) return { opp: null };
    return Object.assign({ opp }, statusCore(ctx, files, teamSegments(ctx, teamId, n), teamSegments(ctx, opp, n), n));
  }
  // the status of any two segment lists (a roster with moves applied, say): a player added after the period began carries no
  // box lines (they were played for another team). Box lines and name matches are cached per context.
  function statusCore(ctx, files, segsA, segsB, n) {
    const per = periodOf(ctx.L, n), cache = ctx.statusCache || (ctx.statusCache = {});
    const c = cache[n] && cache[n].files === files ? cache[n] : (cache[n] = { files, bx: boxLines(files, per), match: new Map() }), bx = c.bx;
    const list = c.list || (c.list = Array.from(bx.players.values()).map(p => ({ n: p.n, t: p.t, id: p.id })));
    const side = segs => {
      const pp = segs.map(s => ctx.pool.byKey.get(s.key)), known = zeroK(), byDay = {}, own = {};
      pp.forEach((p, i) => {
        if (segs[i].from > per.start) return;   // relies on every real roster segment starting at per.start: only hypothetical adds start later
        if (!c.match.has(p.key)) { const m = InPlayers.matchTo(list, p.n, p.t); c.match.set(p.key, m && bx.players.get(m.id)); }
        const b = c.match.get(p.key);
        if (b) b.lines.forEach(l => (byDay[l.d] || (byDay[l.d] = [])).push({ p, v: l.v }));
      });
      Object.keys(byDay).forEach(d => byDay[d].sort((a, b) => nightValue(ctx, b.p) - nightValue(ctx, a.p)).slice(0, ctx.L.maxActive).forEach(x => KCOLS.forEach(c => { known[c] += x.v[c] || 0; (own[x.p.key] || (own[x.p.key] = zeroK()))[c] += x.v[c] || 0; })));
      const rest = segs.map((s, i) => ({ key: s.key, from: Math.max(s.from, cutoffOf(ctx, bx, pp[i].t, per)), to: s.to }));
      // a night partly played keeps its lineup limit: players already counted that day use up slots
      const used = {}; Object.keys(byDay).forEach(d => { used[d] = Math.min(ctx.L.maxActive, byDay[d].length); });
      const whole = segGames(ctx, segs, null, true), left = segGames(ctx, rest, used, true);
      const players = segs.map((sg, i) => {
        const p = pp[i], k = own[p.key] || zeroK(), g = left[i], l = p.line;
        const cur = [k.fga ? k.fgm / k.fga : 0, k.fta ? k.ftm / k.fta : 0, k.tpm, k.pts, k.reb, k.ast, k.stl, k.blk, k.to];
        const fga = k.fga + l.fga * g, fta = k.fta + l.fta * g;
        const proj = [fga ? (k.fgm + l.fgp * l.fga * g) / fga : 0, fta ? (k.ftm + l.ftp * l.fta * g) / fta : 0, k.tpm + l.tpm * g, k.pts + l.pts * g, k.reb + l.reb * g, k.ast + l.ast * g, k.stl + l.stl * g, k.blk + l.blk * g, k.to + l.to * g];
        return { key: p.key, n: p.n, pos: p.pos, t: p.t, games: g, cur, proj, out: !!(ctx.out && ctx.out.has(p.key)) };
      });
      return { players, known, wholeG: whole.reduce((a, x) => a + x, 0), leftG: left.reduce((a, x) => a + x, 0),
        entries: segs.map((s, i) => ({ p: pp[i].line, games: left[i], gVar: GVAR * Math.min(1, whole[i] > 0 ? left[i] / whole[i] : 1) })) };
    };
    const A = side(segsA), B = side(segsB), r = Engine.pairMatchup(A.entries, B.entries, { known: [A.known, B.known] });
    const rest = Engine.pairMatchup(A.entries, B.entries).mu, share = A.wholeG + B.wholeG > 0 ? (A.leftG + B.leftG) / (A.wholeG + B.wholeG) : 1;
    const started = share < 1 || A.known.pts + B.known.pts + A.known.fga + B.known.fga > 0;
    return { started, cat: r.cat.map(p => shrink(p, kOf(KW_CAT, share))), match: shrink(r.match, kOf(KW_MATCH, share)), mu: r.mu, total: r.mu, rest,
      known: [A.known, B.known], games: [A.leftG, B.leftG], share, roster: [A.players, B.players] };
  }

  // the add tools' scorer: the current week counts the box scores so far (as the headline does), any other week is the whole-week projection
  function scoreWeek(ctx, segsA, segsB, n) {
    if (n !== ctx.cur || !ctx.box || !ctx.box.length) return scoreSegments(ctx, segsA, segsB, true);
    const s = statusCore(ctx, ctx.box, segsA, segsB, n);
    return { cat: s.cat, match: s.match, mu: s.mu, games: s.games };
  }

  function addFrom(ctx, n) {
    const per = periodOf(ctx.L, n);
    return n === ctx.cur ? Math.max(per.start, InLeague.nextDayStart(ctx.nowMs)) : per.start;
  }

  const valueOf = (ctx, pp) => InPlayers.valueZ(pp.line, pp.g, ctx.ref);
  // who plays on a crowded night: the better per-game player (a full 82-game season at his line), games played drop out
  const nightValue = (ctx, pp) => ctx.nightOf ? ctx.nightOf(pp) : InPlayers.valueZ(pp.line, 82, ctx.ref);
  // keep: player keys on the team that are never dropped
  function lowestValue(ctx, teamId, k, keep) {
    const kept = new Set(keep || []);
    return ctx.roster[teamId].map(f => ctx.pool.byKey.get(f)).filter(p => p.slot !== 'IR' && !kept.has(p.key)).sort((a, b) => valueOf(ctx, a) - valueOf(ctx, b)).slice(0, k);
  }

  // keep: my player keys never offered as drops. Every add paired with each of the `drops` lowest-value players (or the open spot), best Win M switches first
  function simpleAdds(ctx, n, { limit = 20, drops = 5, keep } = {}) {
    const per = periodOf(ctx.L, n), opp = InLeague.opponentOf(ctx.L, ctx.me, n);
    if (!opp) return [];
    const mine = teamSegments(ctx, ctx.me, n), oppSegs = teamSegments(ctx, opp, n), from = addFrom(ctx, n);
    const base = scoreWeek(ctx, mine, oppSegs, n), baseG = segGames(ctx, mine, null, true);
    const active = ctx.roster[ctx.me].filter(f => ctx.pool.byKey.get(f).slot !== 'IR').length;
    const dropList = active < ctx.L.maxPlayers ? [null] : lowestValue(ctx, ctx.me, drops, keep);
    if (!dropList.length) return [];   // full roster and every player kept: no add can be made
    const opts = dropList.map(drop => {
      const di = drop ? mine.findIndex(s => s.key === drop.key) : -1;
      const kept = drop ? mine.map((s, i) => i === di ? { key: s.key, from: s.from, to: Math.max(s.from, Math.min(s.to, from)) } : s) : mine;
      return { drop, kept, lost: drop ? baseG[di] - segGames(ctx, kept, null, true)[di] : 0 };
    });
    // every add against the lowest-value drop first; the best 20 adds are then tried against the other drops
    const score = (add, { drop, kept, lost }) => {
      const segs = kept.concat([{ key: add.key, from, to: per.end }]), g = segGames(ctx, segs, null, true), games = g[g.length - 1];
      if (!(games > 0)) return null;
      const r = scoreWeek(ctx, segs, oppSegs, n);
      return { add, drop, games, lost, match: r.match, dMatch: r.match - base.match, dCat: r.cat.map((p, c) => p - base.cat[c]) };
    };
    const first = ctx.pool.players.filter(add => !add.owner && (add.fxStatus === 'FA' || add.fxStatus === 'WW') && from < per.end).map(add => score(add, opts[0])).filter(Boolean);
    const rows = first.slice();
    first.sort((a, b) => b.dMatch - a.dMatch).slice(0, 20).forEach(r => opts.slice(1).forEach(o => { const x = score(r.add, o); if (x) rows.push(x); }));
    return rows.sort((a, b) => b.dMatch - a.dMatch).slice(0, limit);
  }

  // ---- waiver add plan (current week) ----
  // My segments after applying moves {day ms, add key, drop key|null} in list order.
  function applyMoves(ctx, n, moves) {
    const per = periodOf(ctx.L, n), segs = teamSegments(ctx, ctx.me, n);
    moves.forEach(m => {
      if (m.drop) { const s = segs.filter(x => x.key === m.drop && x.to > m.t).pop(); s.to = Math.max(s.from, m.t); }
      segs.push({ key: m.add, from: m.t, to: per.end });
    });
    return segs;
  }
  // Is the move set legal? Drops come from the droppable set or earlier adds, a roster spot must be open for an add with no drop,
  // and nobody is added twice.
  function legalMoves(ctx, n, moves, droppable) {
    const held = new Set(ctx.roster[ctx.me].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR')), addedAt = new Map();
    for (const m of moves.slice().sort((a, b) => a.t - b.t)) {
      if (addedAt.has(m.add) || held.has(m.add)) return false;
      if (m.drop) {
        if (!held.has(m.drop) || !(droppable.has(m.drop) || (addedAt.has(m.drop) && addedAt.get(m.drop) < m.t))) return false;
        held.delete(m.drop);
      } else if (held.size >= ctx.L.maxPlayers) return false;
      held.add(m.add); addedAt.set(m.add, m.t);
    }
    return true;
  }

  function addPlan(ctx, { addsLeft = 4, candidates = 30, droppable, periods, keep } = {}) {
    const L = ctx.L, n = ctx.cur;
    if (periods && !(periods.length === 1 && periods[0] === n)) return { start: null, end: null, moves: [], droppable: [], note: 'Plans cover the current week only' };
    const per = periodOf(L, n), opp = InLeague.opponentOf(L, ctx.me, n);
    const drops = lowestValue(ctx, ctx.me, droppable == null ? L.maxPlayers - L.maxActive : Math.min(droppable, L.maxPlayers - L.maxActive), keep), dropSet = new Set(drops.map(p => p.key));
    const oppSegs = opp ? teamSegments(ctx, opp, n) : [], score = moves => scoreWeek(ctx, applyMoves(ctx, n, moves), oppSegs, n).match;
    const start = opp ? score([]) : null, plan = { start, end: start, moves: [], droppable: drops, note: null };
    if (!opp) return plan;
    const days = []; for (let t = addFrom(ctx, n); t < per.end; t += 24 * 3600e3) days.push(t);
    const cands = simpleAdds(ctx, n, { limit: candidates, keep, drops: Math.min(5, droppable == null ? Infinity : droppable) }).map(r => r.add), moves = [];
    let cur = start;
    for (let round = 0; round < addsLeft; round++) {
      let best = null;
      const dropKeys = Array.from(dropSet).concat(moves.map(m => m.add), [null]);
      cands.forEach(add => days.forEach(t => dropKeys.forEach(d => {
        const m = { t, add: add.key, drop: d }, trial = moves.concat([m]);
        if (!legalMoves(ctx, n, trial, dropSet)) return;
        const p = score(trial);
        if (!best || p > best.p) best = { m, p };
      })));
      if (!best || best.p - cur <= 1e-4) break;
      moves.push(best.m); cur = best.p;
      plan.moves.push({ period: n, day: InLeague.localDay(best.m.t), add: ctx.pool.byKey.get(best.m.add), drop: best.m.drop ? ctx.pool.byKey.get(best.m.drop) : null, match: cur });
    }
    plan.end = cur;
    return plan;
  }

  const api = { GVAR, K_MATCH, K_CAT, KW_MATCH, KW_CAT, segGames, makeCtx, outSet, teamSegments, scoreSegments, projectWeek, weekStatus, boxLines, addFrom, lowestValue, simpleAdds, addPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Matchup = api;
})(this);

// Trade core (2026-10-20): rest-of-season Win M for a roster change, perceived player value and trade likelihood.
// Pure; browser and Node. Builds on matchup_core (a team's week vs its real opponent) and inseason_players (value scale).
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Matchup = root.Matchup || require('./matchup_core.js');

  const TRADE_W = { cur: 0.4, proj: 0.3, adp: 0.3, shrinkGames: 20, slope: 2.0, winM: 0.1, tagGap: 0.5, bias: -0.75 };   // bias: a manager wants to come out ahead, so an even-looking swap is not a coin flip

  // mean Win M over the remaining regular-season matchups with the rosters as given (fids per team, IR rule as in the current week);
  // the current week counts whole scheduled games, later weeks expected games (g/82)
  function rosWinM(ctx, roster, teamId) {
    if (ctx.cur == null) return { mean: null, periods: [] };
    const segs = (t, n) => Matchup.teamSegments(ctx, t, n, roster[t].filter(f => n !== ctx.cur || ctx.pool.byKey.get(f).slot !== 'IR'));
    const periods = [];
    InLeague.regularFrom(ctx.L, ctx.cur).forEach(n => {
      const opp = InLeague.opponentOf(ctx.L, teamId, n);
      if (opp) periods.push({ n, opp, p: Matchup.scoreSegments(ctx, segs(teamId, n), segs(opp, n), n === ctx.cur).match });
    });
    return { mean: periods.length ? periods.reduce((s, x) => s + x.p, 0) / periods.length : null, periods };
  }

  // projected players' values, best first (the ADP-implied value of a rank)
  function projValues(ctx) {
    if (!ctx._projVals) ctx._projVals = ctx.pool.players.filter(p => p.src === 'proj').map(p => InPlayers.valueZ(p.line, p.g, ctx.ref)).sort((a, b) => b - a);
    return ctx._projVals;
  }
  function perceived(ctx, pp) {
    const proj = InPlayers.valueZ(pp.line, pp.g, ctx.ref), cur = InPlayers.valueZ(InPlayers.curLine(pp, TRADE_W.shrinkGames), pp.g, ctx.ref);
    const vals = projValues(ctx), rank = Math.max(1, Math.min(vals.length, Math.round(pp.adp == null ? 168 : pp.adp)));
    const adp = vals[rank - 1];
    return { cur, proj, adp, pv: TRADE_W.cur * cur + TRADE_W.proj * proj + TRADE_W.adp * adp, rv: proj };
  }

  function baseline(ctx, t) {
    ctx._ros = ctx._ros || {};
    return ctx._ros[t] === undefined ? (ctx._ros[t] = rosWinM(ctx, ctx.roster, t).mean) : ctx._ros[t];
  }
  // aGets: fids A receives from B; bGets: fids B receives from A. dA, dB in percentage points of rest-of-season Win M.
  function evaluateTrade(ctx, { a, b, aGets, bGets }) {
    if (a === b) throw new Error('A trade needs two different teams');
    const ra = new Set(ctx.roster[a]), rb = new Set(ctx.roster[b]);
    aGets.forEach(f => { if (!rb.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); if (bGets.includes(f)) throw new Error('Player ' + f + ' is on both sides'); });
    bGets.forEach(f => { if (!ra.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); });
    const R = Object.assign({}, ctx.roster);
    R[a] = ctx.roster[a].filter(f => !bGets.includes(f)).concat(aGets);
    R[b] = ctx.roster[b].filter(f => !aGets.includes(f)).concat(bGets);
    // rest-of-season matchups are cached per (team, the two changed rosters)
    const sig = t => R[t].slice().sort().join(','), cache = ctx._rosCache = ctx._rosCache || new Map(), sab = sig(a) + '|' + sig(b);
    const mean = t => { const k = t + '#' + sab; if (!cache.has(k)) cache.set(k, rosWinM(ctx, R, t).mean); return cache.get(k); };
    const dA = 100 * (mean(a) - baseline(ctx, a)), dB = 100 * (mean(b) - baseline(ctx, b));
    const pvSum = fs => fs.reduce((s, f) => s + perceived(ctx, ctx.pool.byKey.get(f)).pv, 0);
    const gapB = pvSum(bGets) - pvSum(aGets);
    return { dA, dB, total: dA + dB, likelihood: 1 / (1 + Math.exp(-(TRADE_W.slope * gapB + TRADE_W.winM * dB + TRADE_W.bias))), gapB, multi: aGets.length !== bGets.length };
  }

  // ---- finder ----
  const oneForOne = (ctx, give, target, team) => {
    const r = evaluateTrade(ctx, { a: ctx.me, b: team, aGets: [target.key], bGets: [give.key] }), v = perceived(ctx, target);
    return { give, target, team, likelihood: r.likelihood, dA: r.dA, dB: r.dB, total: r.total, buyLow: v.rv - v.pv >= TRADE_W.tagGap };
  };
  const byValue = (a, b) => b.dA * b.likelihood - a.dA * a.likelihood;
  // every one-for-one trade for one of my players (myKey) with every other team's player, helpful or not, unfiltered; 'any' offers each of my players
  function tradeCandidates(ctx, myKey) {
    const gives = myKey === 'any' ? ctx.roster[ctx.me] : [myKey], rows = [];
    gives.forEach(g => {
      const give = ctx.pool.byKey.get(g);
      Object.keys(ctx.roster).forEach(t => {
        if (t === ctx.me) return;
        ctx.roster[t].forEach(f => rows.push(oneForOne(ctx, give, ctx.pool.byKey.get(f), t)));
      });
    });
    return rows;
  }
  // minLikelihood is 0-1; minDA and minDB are Win M points. The filters run before the limit.
  function filterTrades(rows, { limit = 25, minLikelihood = 0, minDA = -Infinity, minDB = -Infinity } = {}) {
    return rows.filter(r => r.likelihood >= minLikelihood && r.dA >= minDA && r.dB >= minDB).sort(byValue).slice(0, limit);
  }
  // Text box input. Likelihood: "50%", "0.5" or "50" (above 1 means percent; a bare 1 is 100%). Win M points: "2", "2%".
  // Blank is no limit (null); anything else that is not a number is invalid (undefined).
  function parseFilter(kind, text) {
    const t = String(text == null ? '' : text).trim().toLowerCase().replace('％', '%').replace(/^(-?\d+),(\d+)/, '$1.$2');
    if (t === '' || t === 'any') return null;
    const m = /^(-?\d*\.?\d+)\s*(%|percent|pcts?|pts?|points?)?$/.exec(t);
    if (!m) return undefined;
    const v = parseFloat(m[1]);
    if (kind === 'lik') { const f = (m[2] && /^(%|percent|pcts?)$/.test(m[2])) || v > 1 ? v / 100 : v; return f >= 0 && f <= 1 ? f : undefined; }
    return v;
  }
  // Saved candidates (the page keeps them in the browser so a reload does not search again): compact rows, rebuilt from the pool
  const packCandidates = rows => rows.map(r => [r.give.key, r.target.key, r.team, r.likelihood, r.dA, r.dB, r.total, r.buyLow ? 1 : 0]);
  function unpackCandidates(packed, pool) {
    const out = [];
    packed.forEach(([g, t, team, likelihood, dA, dB, total, bl]) => {
      const give = pool.byKey.get(g), target = pool.byKey.get(t);
      if (give && target) out.push({ give, target, team, likelihood, dA, dB, total, buyLow: !!bl });
    });
    return out;
  }
  // What the candidates depend on: both sides' rosters, my team, the current period, the day, the weights and a model version
  function candSig(ctx, day, version) {
    const ros = Object.keys(ctx.roster).sort().map(t => t + ':' + ctx.roster[t].slice().sort().join(',')).join(';');
    let h = 0; const str = [ros, ctx.me, ctx.cur, day, version, JSON.stringify(TRADE_W)].join('|');
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return day + ':' + ctx.me + ':' + ctx.cur + ':' + (h >>> 0).toString(36) + ':' + str.length;
  }
  const findTrades = (ctx, myKey, opts) => filterTrades(tradeCandidates(ctx, myKey), Object.assign({ minDA: 1e-9 }, opts));   // by default only trades that help me
  function sellHighBuyLow(ctx, { limit = 8, targets = 3, candidates = null } = {}) {
    const tag = (pp, sign) => { const v = perceived(ctx, pp); return { player: pp, gap: sign * (v.pv - v.rv) }; };
    const mine = ctx.roster[ctx.me].map(f => tag(ctx.pool.byKey.get(f), 1)).filter(x => x.gap >= TRADE_W.tagGap).sort((a, b) => b.gap - a.gap).slice(0, limit);
    const sellHigh = mine.map(x => ({ player: x.player, gap: x.gap, trades: candidates ? filterTrades(candidates(x.player.key), { limit: targets, minDA: 1e-9 }) : findTrades(ctx, x.player.key, { limit: targets }) }));
    const theirs = [];
    Object.keys(ctx.roster).forEach(t => { if (t !== ctx.me) ctx.roster[t].forEach(f => { const x = tag(ctx.pool.byKey.get(f), -1); if (x.gap >= TRADE_W.tagGap) theirs.push(Object.assign(x, { team: t })); }); });
    const buyLow = theirs.sort((a, b) => b.gap - a.gap).slice(0, limit).map(x => ({
      player: x.player, gap: x.gap,
      trades: (candidates ? [].concat.apply([], ctx.roster[ctx.me].map(f => candidates(f).filter(r => r.target.key === x.player.key && r.dA > 0))) : ctx.roster[ctx.me].map(f => oneForOne(ctx, ctx.pool.byKey.get(f), x.player, x.team)).filter(r => r.dA > 0)).sort(byValue).slice(0, targets)
    }));
    return { sellHigh, buyLow };
  }

  const api = { TRADE_W, rosWinM, perceived, evaluateTrade, tradeCandidates, filterTrades, parseFilter, packCandidates, unpackCandidates, candSig, findTrades, sellHighBuyLow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trade = api;
})(this);

