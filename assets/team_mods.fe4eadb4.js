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
    const s = statsOf(l), ev = Eng.perGameVar(Object.assign({}, l, { fga: s.fga, fta: s.fta, fgp: s.fga > 0 ? s.fgm / s.fga : 0, ftp: s.fta > 0 ? s.ftm / s.fta : 0 }));
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
  // source has it). Mix: FP per game x the midpoint of g and G0, where G0 is the mean g of the top teams x roster players by Season
  // points: the same halfway point the engine uses (every stat is linear in games). Rows with no games go last with z null.
  function table(rows, w, o) {
    const N = o.teams || 14, R = o.roster || 12, K = N * R, basis = ['pergame', 'total', 'mix'].includes(o.basis) ? o.basis : 'total';
    const live = rows.filter(r => r.g > 0).map(r => ({ pid: r.pid, fpg: perGame(r.line, w), g: r.g, gp: r.gp != null ? r.gp : r.g }));
    const dead = rows.filter(r => !(r.g > 0));
    const season = live.slice().sort((a, b) => b.fpg * b.gp - a.fpg * a.gp || a.pid - b.pid).slice(0, K);
    const G0 = season.length ? season.reduce((t, r) => t + r.g, 0) / season.length : 0;
    const zOf = r => basis === 'pergame' ? r.fpg : basis === 'mix' ? r.fpg * (r.g + G0) / 2 : r.fpg * r.gp;
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

// Team tab core (#131, 2026-10-25): preview roster state and swaps. Pure; browser and Node. Nothing here touches the saved league.
// Slots: active, reserve, il. Fantrax RESERVE is the reserve (it fills the nights Active leaves open, so it counts); IL does not count.
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), Matchup = root.Matchup || require('./matchup_core.js'),
    Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Shared = root.Shared || require('./shared.js');
  const SLOTS = ['active', 'reserve', 'il'];
  const FROM_FANTRAX = { ACTIVE: 'active', RESERVE: 'reserve', IR: 'il' };
  // the slots that count in the team's stats, Win C and Win M
  const COUNTED = ['active', 'reserve'];
  const counted = state => state.order.filter(k => COUNTED.includes(state.slots[k]));

  // rows: parseRosters entries [{ fid, slot }] for my team
  function initState(rows) {
    const slots = {}, order = [];
    rows.forEach(x => { slots[x.fid] = FROM_FANTRAX[x.slot] || 'reserve'; order.push(x.fid); });
    return { slots, order };
  }

  function moveSlot(state, key, slot) {
    if (!(key in state.slots)) throw new Error('player not on the preview roster: ' + key);
    if (!SLOTS.includes(slot)) throw new Error('unknown slot: ' + slot);
    return { slots: Object.assign({}, state.slots, { [key]: slot }), order: state.order.slice() };
  }

  // any number of players out and in; incoming players start in the reserve
  function applySwap(state, outKeys, inKeys) {
    outKeys.forEach(k => { if (!(k in state.slots)) throw new Error('player not on the preview roster: ' + k); });
    if (new Set(outKeys).size !== outKeys.length || new Set(inKeys).size !== inKeys.length) throw new Error('duplicate player in swap');
    inKeys.forEach(k => { if (k in state.slots && !outKeys.includes(k)) throw new Error('player already on the roster: ' + k); });
    const slots = Object.assign({}, state.slots), out = new Set(outKeys);
    outKeys.forEach(k => { delete slots[k]; });
    inKeys.forEach(k => { slots[k] = 'reserve'; });
    return { slots, order: state.order.filter(k => !out.has(k)).concat(inKeys.filter(k => !state.order.includes(k) || out.has(k))) };
  }

  // remaining regular season: from now to the end of the last regular period (schedule times are in seconds, ctx times in ms)
  function window(ctx) {
    const last = ctx.L.periods.find(p => p.n === ctx.L.lastRegular);
    return { from: ctx.nowMs, to: last ? last.end : ctx.nowMs };
  }

  // team games left in the window; says nothing about Plays %
  function gamesLeft(ctx, team) {
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, w = window(ctx);
    return (G[team] || []).filter(s => s * 1000 >= w.from && s * 1000 < w.to).length;
  }

  // team games from now to the end of the NBA schedule (past the league's last regular week); the GL column reads this
  function seasonGamesLeft(ctx, team) {
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {};
    return (G[team] || []).filter(s => s * 1000 >= ctx.nowMs).length;
  }

  // games per key over the window. segGames zeroes an "out" player's segment when it starts before ctx.curEnd, which is meant
  // for the rest of the current week only, so the window is cut at curEnd and the two parts are summed
  function windowGames(ctx, keys, used) {
    const w = window(ctx), cut = Math.min(Math.max(ctx.curEnd || 0, w.from), w.to), seg = (key, from, to) => ({ key, from, to });
    if (cut <= w.from || cut >= w.to) return Matchup.segGames(ctx, keys.map(k => seg(k, w.from, w.to)), used, true);
    const a = Matchup.segGames(ctx, keys.map(k => seg(k, w.from, cut)), used, true), b = Matchup.segGames(ctx, keys.map(k => seg(k, cut, w.to)), used, true);
    return a.map((x, i) => x + b[i]);
  }

  // Plays % over the window: active players claim the nightly slots first (best per-game players when over the limit), the
  // reserve takes what is left; IL rows show what they would get as one more reserve player (hypo: true, so teamLine
  // leaves them out). Roster order breaks ties. -> { key: { gl, played, pct, hypo? } }; pct is null when the team has no games left
  function playsPct(ctx, state) {
    const w = window(ctx), by = slot => state.order.filter(k => state.slots[k] === slot);
    const G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {}, byKey = ctx.pool.byKey, max = ctx.L.maxActive;
    const act = by('active'), bench = by('reserve'), res = {};
    const done = (k, played, hypo) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl ? played / gl : null }; if (hypo) res[k].hypo = true; };
    const gA = windowGames(ctx, act, null), count = {}, used = {};
    act.forEach((k, i) => {
      done(k, gA[i]);
      const out = ctx.out && ctx.out.has(k);
      (G[byKey.get(k).t] || []).map(s => s * 1000).filter(ms => ms >= w.from && ms < w.to && !(out && ms < ctx.curEnd)).forEach(ms => { const d = InLeague.localDay(ms); count[d] = (count[d] || 0) + 1; });
    });
    Object.keys(count).forEach(d => { used[d] = Math.min(max, count[d]); });
    const gB = windowGames(ctx, bench, used);
    bench.forEach((k, i) => done(k, gB[i]));
    by('il').forEach(k => {
      const g = windowGames(ctx, bench.concat(k), used);
      done(k, g[g.length - 1], true);
    });
    return res;
  }

  // Zscore with a 0-1 weight per category (punt lens): the Rankings Zscore is sum(cats[c] x base weight[c]); weights default to 1
  // nCats = the league's category count (9 or 8; turnovers carry no weight in 8), as in Rankings.table
  function weightedZ(cats, weights, nCats) {
    const W = Eng.catWeights({ catW: InPlayers.WEIGHTS, cats: nCats || 9 });
    return cats.reduce((s, v, c) => s + v * W[c] * (weights && weights[c] != null ? weights[c] : 1), 0);
  }

  // my team's per-game line: entries [{ line, pct, hypo }] (pct = Plays %, null counts for nothing; hypo rows are left out); counting stats are
  // sum(pct x stat) / slots, the percentages come from summed makes and attempts
  function teamLine(entries, slots) {
    const S = { fga: 0, fgm: 0, fta: 0, ftm: 0, tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 };
    entries.forEach(e => {
      if (e.hypo) return;
      const p = e.pct || 0, l = e.line;
      S.fga += p * l.fga; S.fgm += p * l.fga * l.fgp; S.fta += p * l.fta; S.ftm += p * l.fta * l.ftp;
      ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'].forEach(k => { S[k] += p * l[k]; });
    });
    const out = { fgp: S.fga ? S.fgm / S.fga : 0, fga: S.fga / slots, ftp: S.fta ? S.ftm / S.fta : 0, fta: S.fta / slots };
    ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'].forEach(k => { out[k] = S[k] / slots; });
    return out;
  }

  // type-ahead matcher: accent- and case-insensitive; every typed word must start a word of the name or sit inside one.
  // Names with a matching word start come first; list order breaks ties. -> up to `limit` items of `list` (items have .n)
  function search(list, query, limit) {
    const q = Shared.norm(query).split(/\s+/).filter(Boolean);
    if (!q.length) return [];
    const hits = [[], []];
    list.forEach(x => {
      const n = Shared.norm(x.n), words = n.split(/\s+/);
      if (!q.every(t => n.includes(t))) return;
      hits[q.every(t => words.some(w => w.startsWith(t))) ? 0 : 1].push(x);
    });
    return hits[0].concat(hits[1]).slice(0, limit || 50);
  }

  const api = { SLOTS, COUNTED, counted, windowGames, initState, moveSlot, applySwap, window, gamesLeft, seasonGamesLeft, playsPct, weightedZ, teamLine, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this);

// Team tab win numbers (#131 PR 2, 2026-10-25; moved onto the Rankings / Draft-tab engine 2026-10-26): the matrix of the previewed
// roster against every other team, each player's Win C / Win M contribution, and the player-list module scores. Pure; browser and
// Node. Nothing here changes the saved league, ctx or the pool. Every team's players get their remaining Plays % games per
// average week (mine and every opponent's, with the nightly cap), turned into season-equivalent games (x WEEKS) and summed into
// one forecast per team with Engine.entryVec; Engine.evaluate then gives every pairing's category and match chances, with the
// engine's own noise (SIGMA_G2 games variance) and no shrink toward 0.5.
// Units follow Rankings: m = Win M points (100 x the change in the match chance), c = Win C hundredths (100 x the change in
// the summed category chances, averaged over the opponents).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Team = root.Team || require('./team_core.js'), Pts = root.Points || require('./points_core.js');
  const NC = Eng.NC;

  // the engine context of a ctx's player pool: noise and pool averages from simulated drafts of the real league (rostered players
  // first), IL fill off because Plays % already counts the games a player misses. Built once per ctx and category count.
  const ectxs = new WeakMap();
  // Points leagues (#137): w = the point values; the engine view puts one FP total in category slot Points.FP_SLOT and the rest is unchanged.
  function engCtx(ctx, nc, w) {
    let by = ectxs.get(ctx); if (!by) ectxs.set(ctx, by = {});
    const bk = w ? 'p|' + Pts.key(w) : nc;
    if (!by[bk]) {
      const N = Object.keys(ctx.roster).length, R = ctx.L.maxActive, adp = p => p.adp == null ? 1e9 : p.adp;
      const list = ctx.pool.players.filter(p => p.g > 0).sort((a, b) => (a.owner ? 0 : 1) - (b.owner ? 0 : 1) || adp(a) - adp(b));
      const P = Eng.prepPlayers(list.map((p, i) => Object.assign({}, p.line, { g: p.g, ftx: i + 1 })));
      const cfg = { teams: N, roster: R, slot: 1, order: '3rr', scoring: 'h2h', cats: nc, ilSpots: 0, field: 'easy', fieldZ: 'std', puntMode: 'off', puntLock: '',
        catW: InPlayers.WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0, basis: 'total' };
      const cx = Eng.buildContext(P, cfg);
      by[bk] = w ? { ctx: Pts.engineView(P, cx, cfg, w).ctx, cfg, w } : { ctx: cx, cfg };
    }
    return by[bk];
  }

  // one team's forecast: the sum of its entries' category vectors and projection variances. Entries are { p: stat line, games per
  // average week, sign? } (sign -1 takes an entry out of the team).
  function teamVec(e, entries) {
    const mu = new Float64Array(NC), v = new Float64Array(NC);
    entries.forEach(en => {
      const s = en.sign || 1, ev = e.w ? Pts.entry(en.p, en.games * Eng.WEEKS, e.ctx, e.w) : Eng.entryVec(en.p, e.ctx, en.games * Eng.WEEKS);
      for (let c = 0; c < NC; c++) { mu[c] += s * ev.x[c]; v[c] += s * ev.pv[c]; }
    });
    return { mu, v };
  }

  // remaining regular-season weeks: each period counts the share of it that lies in the Team.window
  function weeksLeft(ctx) {
    const w = Team.window(ctx);
    return ctx.L.periods.filter(p => p.n <= ctx.L.lastRegular).reduce((s, p) => s + Math.max(0, Math.min(p.end, w.to) - Math.max(p.start, w.from)) / (p.end - p.start), 0);
  }

  // a Team.initState for another team from its Fantrax slots; IL players and the excluded keys (players I brought in) are left out
  function oppState(ctx, teamId, exclude) {
    const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f)) && ctx.pool.byKey.get(f).slot !== 'IR').map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
    return Team.initState(rows);
  }

  // pairMatchup entries for the active and reserve players: games = Plays % games per average week (hypothetical rows never count)
  function side(ctx, state, W) {
    const r = Team.playsPct(ctx, state);
    return state.order.filter(k => Team.COUNTED.includes(state.slots[k]) && !r[k].hypo)
      .map(k => ({ key: k, p: ctx.pool.byKey.get(k).line, games: r[k].played / W }));
  }

  // ctx must be treated as immutable (the cache is keyed on the object; makeCtx builds a new one per change)
  // opponents' forecasts are the same for every previewed roster that removes the same players from them, so they are cached per ctx
  const memos = new WeakMap();
  function oppTeam(ctx, e, nc, tid, exclude, W) {   // e carries the point values, so the memo key must too
    let memo = memos.get(ctx);
    if (!memo) { memo = new Map(); memos.set(ctx, memo); }
    const gone = ctx.roster[tid].filter(f => exclude.has(f)).sort(), id = tid + '|' + gone.join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '');
    if (!memo.has(id)) memo.set(id, teamVec(e, side(ctx, oppState(ctx, tid, exclude), W)));
    return memo.get(id);
  }

  // my previewed roster against every other team. -> { weeks, teams: [{ id, cat[9], match, winC }], mean: { cat, match, winC } }
  // (cat entries beyond the league's category count are null). opts: cats 9 | 8. Players I hold leave their old team's side.
  function matrix(ctx, state, opts) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return { weeks: 0, teams: [], mean: null };
    return matrixOf(ctx, side(ctx, state, W), new Set(state.order), W, opts);
  }

  // the matrix for any set of my entries [{ p, games, sign? }] (games per average week, W = weeks left); `exclude` = the keys that left
  // their old team's side (everyone on my roster, and a candidate I bring in)
  function matrixOf(ctx, mine, exclude, W, o) {
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster).filter(t => t !== ctx.me);
    const tv = [teamVec(e, mine)].concat(ids.map(id => oppTeam(ctx, e, nc, id, exclude, W)));
    const pl = tv.map((t, i) => ({ id: i, x: t.mu, pv: t.v, adpUse: 1, sd: 1, adpE: 1, sdE: 1, fieldV: 0, boardRaw: 0 }));
    const out = Eng.evaluate(pl, e.ctx, Object.assign({}, e.cfg, { teams: pl.length, roster: 1, slot: 1 }), { picks: pl.map((_, i) => i), owner: pl.map((_, i) => i) });
    if (e.w) {   // one points total: the match chance is the single-slot chance; no category or Win C numbers
      const F = Pts.FP_SLOT, teams = ids.map((id, i) => ({ id, cat: null, match: out.catProb(out.teams[0], out.teams[i + 1], F), winC: null, ppw: tv[i + 1].mu[F] / Eng.WEEKS }));
      return { weeks: W, teams, mean: { cat: null, match: teams.reduce((s, t) => s + t.match, 0) / (teams.length || 1), winC: null, ppw: tv[0].mu[F] / Eng.WEEKS } };   // ppw = points in an average week
    }
    const teams = ids.map((id, i) => {
      const A = out.teams[0], B = out.teams[i + 1], cat = Array.from({ length: 9 }, (_, c) => c >= nc ? null : out.catProb(A, B, c));
      return { id, cat, match: out.pairProb(A, B), winC: cat.reduce((s, v) => s + (v == null ? 0 : v), 0) };
    });
    const avg = f => teams.reduce((s, t) => s + f(t), 0) / (teams.length || 1);
    return { weeks: W, teams, mean: { cat: Array.from({ length: 9 }, (_, c) => (c >= nc ? null : avg(t => t.cat[c]))), match: avg(t => t.match), winC: avg(t => t.winC) } };
  }

  const dCats = (a, b) => a.mean.cat ? a.mean.cat.map((v, c) => v == null ? 0 : 100 * (v - b.mean.cat[c])) : null;
  const gain = (a, b) => ({ c: a.mean.winC == null ? null : 100 * (a.mean.winC - b.mean.winC), m: 100 * (a.mean.match - b.mean.match), dCat: dCats(a, b) });
  const sub = (x, y) => x == null || y == null ? null : x - y, subV = (x, y) => x && y ? x.map((v, c) => v - y[c]) : null;

  // each roster player's contribution to my Win C / Win M: active and reserve = the team minus the team without him (the reserve
  // refills his nights); IL = the team with him in the reserve minus the team (hypo: true). -> { key: { c, m, dCat[9], hypo? } }
  // one player's contribution given the current roster's matrix `base` (playerWin's per-player step, so a page can score one at a time)
  // opts.baseline 'avg' (Vs average): see avgParts; my own Active / Reserve player X = the team minus (the team with X replaced by an average
  // player); my IL player = a candidate. Default 'rep' = the raw contribution.
  function playerGain(ctx, state, k, base, opts) {
    if (!base.mean) return { c: 0, m: 0, dCat: new Array(9).fill(0) };   // (points: the zero gain keeps its category zeros; nothing shows them)
    if (opts && opts.baseline === 'avg') {
      const ap = (opts.ap) || avgParts(ctx, state, base.weeks);
      if (ap) { const own = Team.COUNTED.includes(state.slots[k]); return own ? gain(base, avgOwn(ctx, state, ap, k, opts)) : Object.assign(gain(avgCandidate(ctx, state, ap, k, opts), base), { hypo: true }); }
    }
    const s = state.slots[k], counted = Team.COUNTED.includes(s), without = Team.applySwap(state, [k], []);
    return counted ? gain(base, matrix(ctx, without, opts)) : Object.assign(gain(matrix(ctx, Team.moveSlot(state, k, 'reserve'), opts), base), { hypo: true });
  }

  // the made-up average player of Vs average (user 2026-10-26). n = my counted players, tot = their games per week, M = the Active spots
  // (ctx.L.maxActive), mean = the games-weighted mean line with tot / M games (so his totals are one M-th of the team's), share = the games my
  // counted players get out of the games their own team schedules allow, with no nightly cap (the team's average lineup share).
  // -> null with no counted player or no games
  function avgParts(ctx, state, W) {
    const mine = side(ctx, state, W), n = mine.length, tot = mine.reduce((a, e) => a + e.games, 0), M = ctx.L.maxActive || n;
    const allowed = Team.counted(state).reduce((a, k) => a + Team.windowGames(ctx, [k], null)[0], 0);   // each player alone: no nightly cap
    if (!n || !(tot > 0) || !(allowed > 0)) return null;
    return { W, mine, n, tot, M, share: tot * W / allowed, mean: { p: Team.teamLine(mine.map(e => ({ line: e.p, pct: e.games })), tot), games: tot / M } };
  }

  // a player not counted on my team replaces the average player: current team - average + him, his games times the share
  function avgCandidate(ctx, state, ap, key, opts) {
    const g = Team.windowGames(ctx, [key], null)[0] / ap.W * ap.share;
    const mine = ap.mine.concat(Object.assign({}, ap.mean, { sign: -1 }), { p: ctx.pool.byKey.get(key).line, games: g });
    return matrixOf(ctx, mine, new Set(state.order).add(key), ap.W, opts);
  }

  // my counted player replaced by an average-line player who keeps his games (so a Reserve player is judged on his quality, not his slot)
  function avgOwn(ctx, state, ap, key, opts) {
    const e = ap.mine.find(x => x.key === key);
    return matrixOf(ctx, ap.mine.filter(x => x.key !== key).concat(Object.assign({}, ap.mean, { games: e.games })), new Set(state.order), ap.W, opts);
  }

  // points my counted players produce in an average remaining week: sum of FP per game x Plays % games per week
  function pointsPerWeek(ctx, state, w) {
    const Wk = weeksLeft(ctx); if (!(Wk > 0)) return 0;
    return side(ctx, state, Wk).reduce((t, e) => t + Pts.perGame(e.p, w) * e.games, 0);
  }

  function playerWin(ctx, state, opts) {
    const base = matrix(ctx, state, opts), res = {};
    state.order.forEach(k => { res[k] = playerGain(ctx, state, k, base, opts); });
    return res;
  }

  // Player-list scores for the Team tab module. Baselines: 'rep' = the player replaces my worst Active / Reserve player (lowest Win M
  // contribution); 'avg' = the same minus what an average-player entry in his place would give, as on the Rankings tab (the entry is
  // the mean per-game line of my Active and Reserve players, with the worst player's team schedule). dM / dC are the real changes in my
  // Win M (points) / Win C (hundredths); weights (0-1 per category) only change the sort: by dM when all are 1, else by the weighted
  // sum of the change in each category's chance. My own Active / Reserve players are their contribution minus the worst player's (the
  // worst shows 0); my IL / Reserve players are a swap for the worst, like a candidate.
  // opts: baseline 'rep' | 'avg', weights, cats, k, candidates (keys; default every pool player, my own included)
  // -> [{ key, owner, dM, dC, dCat[], sort }] sorted by sort, highest first (ties keep candidate order)
  // the scoring split in three so a page can score one candidate at a time (TeamView.moduleJob): moduleSetup does the work every row
  // shares (the matrix, each counted player's contribution, the worst player, the average-entry offset) and returns null with no
  // games left or no counted player; moduleRow scores one key; moduleSort orders rows (a copy). Each row also carries old / new, my
  // Win M in points before and after: new = the current Win M + the raw change, old = the current Win M + the baseline offset (0 for
  // 'rep'), so new - old = dM in both baselines.
  // opts.base / opts.pw: the matrix and per-player gains when already computed (a job gets them one piece at a time)
  function moduleSetup(ctx, state, opts) {
    const o = opts || {}, mo = { cats: o.cats, k: o.k, mode: o.mode, points: o.points }, base = o.base || matrix(ctx, state, mo);
    if (!base.mean) return null;
    if (o.baseline === 'avg') { const ap = avgParts(ctx, state, base.weeks); return ap ? { base, ap, mo, avg: true } : null; }
    const pw = o.pw || playerWin(ctx, state, mo), counted = Team.counted(state);
    if (!counted.length) return null;
    const worst = counted.reduce((a, b) => pw[b].m < pw[a].m ? b : a), wSlot = state.slots[worst];
    return { base, pw, worst, wSlot, mo, off: { c: o.points ? null : 0, m: 0, dCat: o.points ? null : new Array(9).fill(0) }, avg: false };
  }

  // the preview with `key` in the worst player's slot (Active when that is the Reserve), scored against the current team
  function swapScore(ctx, state, su, cx, key) {
    const s0 = key in state.slots ? Team.applySwap(state, [su.worst], []) : Team.applySwap(state, [su.worst], [key]);
    return gain(matrix(cx, Team.moveSlot(s0, key, su.wSlot === 'reserve' ? 'active' : su.wSlot), su.mo), su.base);   // Active claims nights before the Reserve, so a Reserve slot would score him on leftovers
  }

  function moduleRow(ctx, state, su, key) {
    const own = key in state.slots, s = own ? state.slots[key] : null, owner = own ? ctx.me : ((ctx.pool.byKey.get(key) || {}).owner || null), cur = 100 * su.base.mean.match;
    if (su.avg) {
      const counted = own && Team.COUNTED.includes(s), a = counted ? avgOwn(ctx, state, su.ap, key, su.mo) : avgCandidate(ctx, state, su.ap, key, su.mo), g = counted ? gain(su.base, a) : gain(a, su.base);
      return { key, owner, dM: g.m, dC: g.c, dCat: g.dCat, old: counted ? cur - g.m : cur, new: counted ? cur : cur + g.m };
    }
    const pw = su.pw, zero = () => su.mo.points ? null : new Array(9).fill(0);
    let r;
    if (key === su.worst) r = { c: su.mo.points ? null : 0, m: 0, dCat: zero() };
    else if (own && Team.COUNTED.includes(s)) r = { c: sub(pw[key].c, pw[su.worst].c), m: pw[key].m - pw[su.worst].m, dCat: subV(pw[key].dCat, pw[su.worst].dCat) };
    else r = swapScore(ctx, state, su, ctx, key);
    return { key, owner, dM: r.m - su.off.m, dC: sub(r.c, su.off.c), dCat: subV(r.dCat, su.off.dCat), old: cur + su.off.m, new: cur + r.m };
  }

  function moduleSort(rows, weights) {
    const weighted = weights && weights.some(w => w != null && w !== 1) && rows.every(r => r.dCat);
    return rows.map((r, i) => Object.assign({}, r, { sort: weighted ? r.dCat.reduce((a, v, c) => a + v * (weights[c] == null ? 1 : weights[c]), 0) : r.dM, i }))
      .sort((a, b) => b.sort - a.sort || a.i - b.i).map(r => { delete r.i; return r; });
  }

  function moduleScores(ctx, state, opts) {
    const o = opts || {}, su = moduleSetup(ctx, state, o);
    if (!su) return [];
    return moduleSort((o.candidates || ctx.pool.players.map(p => p.key)).map(k => moduleRow(ctx, state, su, k)), o.weights);
  }

  const api = { pointsPerWeek, weeksLeft, oppState, side, matrix, matrixOf, avgParts, playerGain, playerWin, moduleSetup, moduleRow, moduleSort, moduleScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamWin = api;
})(typeof self !== 'undefined' ? self : this);

// Team tab page logic (#131 PR 3, 2026-10-25): the roster table rows and team average, the stepwise Win scoring job with its cache, and the
// swap-box helpers. Pure; browser and Node. team.html only draws what this returns. Nothing here touches ctx, the pool or the saved league.
// Plays % is a team-makeup share (who gets a lineup slot each night); GL is projected games left (team games x g/82, which already
// covers injuries and rest), so GL is never multiplied by Plays %. Only the team average and Win always use Plays %; the player rows use
// it only when the "adjust by Plays %" box is checked (opts.adjust).
(function (root) {
  'use strict';
  const Team = root.Team || require('./team_core.js'), TeamWin = root.TeamWin || require('./team_win.js'), Points = root.Points || require('./points_core.js');
  const SLOT_ORDER = Team.SLOTS;
  const COUNT = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];

  // projected remaining games: the team's games to the end of the NBA season times the player's availability (g/82)
  const gamesLeft = (ctx, pp) => Team.seasonGamesLeft(ctx, pp.t) * Math.min(1, pp.g / 82);

  // a per-game line times f; percentages stay, attempts and counting stats scale
  function scaled(line, f) {
    const o = { fgp: line.fgp, ftp: line.ftp, fga: line.fga * f, fta: line.fta * f };
    COUNT.forEach(k => { o[k] = line[k] * f; });
    return o;
  }

  // opts: zCats (pool player -> per-game category Zs[9], or null), weights (0-1 per category), cats (9 | 8), adjust (bool),
  // view 'game' (per game) | 'ros' (per game x GL). -> { groups: [{ slot, rows }], rows, avg, avgZ }
  // row: { key, n, t, pos, slot, gl, mpg, pct, hypo, stat, cats, z }; avg is Team.teamLine over the counted players (Plays % always in),
  // avgZ is the Plays % weighted Z per lineup slot (null without zCats)
  function rows(ctx, state, opts) {
    const o = opts || {}, plays = Team.playsPct(ctx, state), nc = o.cats === 8 ? 8 : 9, slots = ctx.L.maxActive;
    const all = state.order.map(key => {
      const pp = ctx.pool.byKey.get(key), p = plays[key], gl = gamesLeft(ctx, pp), f = o.adjust ? (p.pct == null ? 0 : p.pct) : 1;
      const cats = o.zCats ? o.zCats(pp) : null;
      return { key, n: pp.n, t: pp.t, pos: pp.pos, slot: state.slots[key], gl, mpg: pp.mpg == null ? null : pp.mpg, pct: p.pct, hypo: !!p.hypo,
        stat: scaled(pp.line, (o.view === 'ros' ? gl : 1) * f),
        cats: cats && cats.map(v => v * f), z: cats ? Team.weightedZ(cats.map(v => v * f), o.weights, nc) : null };
    });
    // points leagues (#137): FP of the row's scaled line, so the column follows Per game / Rest of season and the Plays % box
    if (o.points) all.forEach(r => { r.fp = Points.perGame(r.stat, o.points); });
    const groups = SLOT_ORDER.map(slot => ({ slot, rows: all.filter(r => r.slot === slot) }));
    const avg = Team.teamLine(state.order.map(k => ({ line: ctx.pool.byKey.get(k).line, pct: plays[k].pct, hypo: plays[k].hypo })), slots);
    let avgCats = null;
    if (o.zCats) {
      avgCats = Array(9).fill(0);
      state.order.forEach(k => { const p = plays[k], c = o.zCats(ctx.pool.byKey.get(k)); if (!p.hypo && p.pct != null && c) c.forEach((v, i) => { avgCats[i] += p.pct * v / slots; }); });
    }
    const avgZ = avgCats ? Team.weightedZ(avgCats, o.weights, nc) : null;
    return { groups, rows: all, avg, avgZ, avgCats, avgFp: o.points ? Points.perGame(avg, o.points) : null };
  }

  // each category's share of the weighted Z (cats x base weight x user weight), so the parts add up to Team.weightedZ
  function zParts(cats, weights, nc) {
    return cats.map((v, c) => Team.weightedZ(cats.map((x, i) => i === c ? x : 0), weights, nc));
  }

  // ---- Win scoring, one piece per step() so the page stays responsive: the matrix first, then one roster player per step ----
  // -> { done, matrix, players, step() }; step() returns true while there is more to do. players: { key: { c, m, dCat[9], hypo? } }
  function winJob(ctx, state, opts) {
    const keys = state.order.slice();
    let po = opts;   // for 'avg' the average player is built once, not per roster player
    const job = { done: false, matrix: null, players: {}, step() {
      if (job.done) return false;
      if (!job.matrix) { job.matrix = TeamWin.matrix(ctx, state, opts); if (job.matrix.mean && opts && opts.baseline === 'avg') po = Object.assign({}, opts, { ap: TeamWin.avgParts(ctx, state, job.matrix.weeks) }); }
      else {
        const k = keys[Object.keys(job.players).length];
        job.players[k] = TeamWin.playerGain(ctx, state, k, job.matrix, po);
      }
      if (job.matrix && Object.keys(job.players).length === keys.length) job.done = true;
      return true;
    } };
    return job;
  }

  // ---- player list scoring (the Team tab module), in pieces of about `budgetMs` so the page stays responsive ----
  // pieces: the matrix, one raw gain per counted player ('rep' only), the setup, then one candidate row each.
  // opts: baseline 'rep' | 'avg', cats (weights are not an input: they only re-sort, TeamWin.moduleSort). candidates default to the whole pool.
  // -> { done, rows (unsorted, in candidate order), n, total, step(budgetMs, clock) }; step() returns true while it did work
  function moduleJob(ctx, state, opts, candidates) {
    const o = opts || {}, mo = { cats: o.cats, points: o.points }, cand = candidates || ctx.pool.players.map(p => p.key);
    const counted = Team.counted(state);
    let base = null, pw = {}, su = null;
    const job = { done: false, rows: [], n: 0, total: cand.length, step(budgetMs, clock) {
      if (job.done) return false;
      const now = clock || Date.now, t0 = now();
      do {
        if (!base) { base = TeamWin.matrix(ctx, state, mo); if (!base.mean || !counted.length) { job.done = true; break; } }
        else if (o.baseline !== 'avg' && Object.keys(pw).length < state.order.length) { const k = state.order[Object.keys(pw).length]; pw[k] = TeamWin.playerGain(ctx, state, k, base, mo); }
        else if (!su) { su = TeamWin.moduleSetup(ctx, state, Object.assign({}, o, { base, pw })); if (!su) { job.done = true; break; } }
        else { job.rows.push(TeamWin.moduleRow(ctx, state, su, cand[job.n++])); if (job.n >= cand.length) job.done = true; }
      } while (!job.done && now() - t0 < budgetMs);
      return true;
    } };
    return job;
  }

  // the first job that is not done, or null (the page steps one job per tick: roster Win first, then the list)
  const nextJob = jobs => jobs.find(j => j && !j.done) || null;

  // what a change did to the preview roster: keys out, keys in, and slot moves of players who stayed
  function diff(before, after) {
    return { out: before.order.filter(k => !(k in after.slots)), in: after.order.filter(k => !(k in before.slots)),
      moves: after.order.filter(k => k in before.slots && before.slots[k] !== after.slots[k]).map(k => ({ key: k, from: before.slots[k], to: after.slots[k] })) };
  }

  // rows ordered by `val(row)` (a number or a string; null / undefined / NaN = missing, always last), 'asc' or 'desc'; ties keep the input order. A copy.
  function sortRows(rows, val, dir) {
    const sg = dir === 'asc' ? 1 : -1, miss = v => v == null || v !== v;
    return rows.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
      if (miss(a.v) || miss(b.v)) return miss(a.v) - miss(b.v) || a.i - b.i;
      return (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) * sg || a.i - b.i;
    }).map(x => x.r);
  }

  const signature = state => state.order.map(k => k + ':' + state.slots[k]).join('|');

  // finished and half-finished jobs by ctx object, roster and win options (cats); the weights are not an input, so moving a slider never rescores
  function createScorer() {
    const by = new WeakMap();
    const bucket = ctx => { let m = by.get(ctx); if (!m) by.set(ctx, m = new Map()); return m; };
    const keyOf = (state, o) => signature(state) + '#' + (o.cats || '') + '#' + (o.baseline || '') + '#' + (o.points ? Points.key(o.points) : '');
    return {
      get(ctx, state, opts) {
        const m = bucket(ctx), sig = keyOf(state, opts || {});
        if (!m.has(sig)) m.set(sig, winJob(ctx, state, opts));
        return m.get(sig);
      },
      getModule(ctx, state, opts) {
        const m = bucket(ctx), sig = 'module#' + keyOf(state, opts || {});
        if (!m.has(sig)) m.set(sig, moduleJob(ctx, state, opts));
        return m.get(sig);
      } };
  }

  // ---- the list as drawn ----
  const SLOT_LABEL = { active: 'Active', reserve: 'Reserve', il: 'IL' };
  // rows: TeamWin.moduleSort output. opts: owner 'all' | 'fa' | 'me' | team id, query.
  // -> { rows: [{ ...row, n, t, pos, label }], total (after the filters) }; every row is returned. My players sent out of the preview are
  // free agents here ("Sent out"). The search only filters (Team.search would reorder by name match), so the Win M order stays.
  function moduleView(rows, ctx, state, opts) {
    const o = opts || {}, me = ctx.me, teamName = id => ((ctx.L.teams || []).find(t => t.id === id) || {}).name || String(id);
    let list = rows.map(r => {
      const pp = ctx.pool.byKey.get(r.key) || {}, mine = r.key in state.slots, sent = !mine && pp.owner === me;
      const label = mine ? 'You · ' + SLOT_LABEL[state.slots[r.key]] : sent ? 'Sent out' : pp.owner ? teamName(pp.owner) : 'Free agent';
      return Object.assign({}, r, { n: pp.n, t: pp.t, pos: pp.pos, label, _own: mine ? 'me' : (sent || !pp.owner) ? 'fa' : pp.owner });
    });
    if (o.owner && o.owner !== 'all') list = list.filter(r => r._own === o.owner);
    if (o.query) { const hit = new Set(Team.search(list, o.query, Infinity).map(r => r.key)); list = list.filter(r => hit.has(r.key)); }
    return { rows: list.map(r => { const x = Object.assign({}, r); delete x._own; return x; }), total: list.length };
  }

  // ---- drops from the list ----
  // a list player dropped on a roster row takes that player's slot (one of mine: the two trade slots); dropped on a slot group he joins it
  function dropSwap(state, inKey, outKey) {
    if (inKey in state.slots) return Team.moveSlot(Team.moveSlot(state, inKey, state.slots[outKey]), outKey, state.slots[inKey]);
    return Team.moveSlot(Team.applySwap(state, [outKey], [inKey]), inKey, state.slots[outKey]);
  }
  const dropIn = (state, key, slot) => key in state.slots ? Team.moveSlot(state, key, slot) : Team.moveSlot(Team.applySwap(state, [], [key]), key, slot);

  // ---- slots ----
  // a move to another slot; the same slot returns the same state object
  const move = (state, key, slot) => state.slots[key] === slot ? state : Team.moveSlot(state, key, slot);
  // players per slot; over is set only for Active above the league limit
  function slotCounts(state, maxActive) {
    const o = {};
    SLOT_ORDER.forEach(sl => { const n = state.order.filter(k => state.slots[k] === sl).length; o[sl] = { n, over: sl === 'active' && n > maxActive }; });
    return o;
  }

  // ---- swap boxes ----
  const sendOutList = (ctx, state) => state.order.map(k => ctx.pool.byKey.get(k));
  const bringInList = (ctx, state) => ctx.pool.players.filter(p => !(p.key in state.slots));
  const pick = (chips, item) => (item && !chips.some(c => c.key === item.key) ? chips.concat([item]) : chips);
  const apply = (state, outs, ins) => Team.applySwap(state, outs.map(x => x.key), ins.map(x => x.key));

  const api = { gamesLeft, rows, zParts, move, slotCounts, winJob, moduleJob, nextJob, moduleView, diff, sortRows, dropSwap, dropIn, createScorer, signature, sendOutList, bringInList, search: Team.search, pick, apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamView = api;
})(typeof self !== 'undefined' ? self : this);

