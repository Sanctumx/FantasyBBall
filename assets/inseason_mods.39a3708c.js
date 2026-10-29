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
  // With a value `v` on every entry the best players fill the night first, so only the worst ones are cut (Team tab Plays %).
  function rosterGames(entries, DAYS, maxActive, used) {
    const G = (DAYS && DAYS.games) || DAYS || {};
    const hits = entries.map(e => (G[e.t] || []).map(s => s * 1000).filter(ms => ms >= e.from && ms < e.to).map(ms => [localDay(ms), e.a]));
    if (entries.length && entries.every(e => e.v != null)) {
      const left = {}, out = entries.map(() => 0);
      entries.map((_, i) => i).sort((a, b) => (entries[b].v - entries[a].v) || (a - b)).forEach(i => hits[i].forEach(([d, a]) => {
        if (left[d] == null) left[d] = Math.max(0, maxActive - ((used && used[d]) || 0));
        const take = Math.min(a, left[d]); left[d] -= take; out[i] += take;
      }));
      return out;
    }
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
  // g games of `line` plus G - g games of `fill` (a player who misses games is replaced by the team's worst player for them)
  const valueZFill = (line, g, fill, G, ref) => { const a = total(line, g, ref), b = total(fill, Math.max(0, G - g), ref); return (rawValue(a.map((v, c) => v + b[c]), ref) - ref.vMean) / ref.vSd; };
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

  const api = { SHRINK_GAMES, WEIGHTS, OVERRIDES, swapName, espnLine, projLines, waiverLevel, matchTo, buildPool, zscoreOf, makeValueRef, valueZ, valueZFill, catZ, curLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InPlayers = api;
})(this);

// Weekly Matchup Analyzer core (2026-10-20): projects a team's matchup week from expected games, and ranks single waiver adds.
// Pure; browser and Node. Chances come from Engine.pairMatchup with games variance GVAR on every entry, shrunk toward 0.5
// (calibrated on 2024-26 weeks, src/calib_pair.js; refit k on in-season projections).
(function (root) {
  'use strict';
  const Engine = root.Engine || require('./engine.js'), InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js');

  // K_MATCH / K_CAT: fractional games of a later week (Matchup Analyzer), fitted weekly. The rest-of-season k is WinK.SHRINK (Team, Rankings, Trade)
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

  const api = { nightValue, GVAR, K_MATCH, K_CAT, KW_MATCH, KW_CAT, segGames, makeCtx, outSet, teamSegments, scoreSegments, projectWeek, weekStatus, boxLines, addFrom, lowestValue, simpleAdds, addPlan };
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
  // The Team tab (ctx.teamTab, set by TeamView.sourceCtx; the Trade Analyzer's and Rankings' plain ctxs never carry it): Reserve is only a
  // parking place and counts for nothing; IL counts only on the seasonal bases, where availability (avail) scales its games
  const countedSlots = ctx => !ctx || !ctx.teamTab ? COUNTED : ctx.basis === 'pergame' ? ['active'] : ['active', 'il'];
  const counted = (state, ctx) => { const c = countedSlots(ctx); return state.order.filter(k => c.includes(state.slots[k])); };
  // share of the team's games a player is there for: Per game compares everyone at peak non-injury performance (1), the seasonal basis uses
  // his projected games (g/82), Mix halfway; a plain ctx has no availability
  const avail = (ctx, pp) => {
    if (!ctx || !ctx.teamTab || ctx.basis === 'pergame') return 1;
    const a = Math.min(1, pp.g / 82);
    return ctx.basis === 'mix' ? (1 + a) / 2 : a;
  };

  // rows: parseRosters entries [{ fid, slot }] for my team
  function initState(rows) {
    const slots = {}, order = [];
    rows.forEach(x => { slots[x.fid] = FROM_FANTRAX[x.slot] || 'reserve'; order.push(x.fid); });
    return { slots, order, moves: [] };
  }

  // the Team tab's starting state: Courtside Active = the league's active + bench (Fantrax RESERVE), IR is il; there is no Reserve until a player is parked
  function tabState(rows) {
    const s = initState(rows);
    s.order.forEach(k => { if (s.slots[k] === 'reserve') s.slots[k] = 'active'; });
    return s;
  }

  function moveSlot(state, key, slot) {
    if (!(key in state.slots)) throw new Error('player not on the preview roster: ' + key);
    if (!SLOTS.includes(slot)) throw new Error('unknown slot: ' + slot);
    return { slots: Object.assign({}, state.slots, { [key]: slot }), order: state.order.slice(), moves: state.moves || [] };
  }

  // any number of players out and in; incoming players start in the reserve. state.moves records each swap ({ out, in }) so the Team tab
  // can hand the players I send out to the teams the incoming ones came from (TeamWin.received); an empty swap records nothing
  function applySwap(state, outKeys, inKeys) {
    outKeys.forEach(k => { if (!(k in state.slots)) throw new Error('player not on the preview roster: ' + k); });
    if (new Set(outKeys).size !== outKeys.length || new Set(inKeys).size !== inKeys.length) throw new Error('duplicate player in swap');
    inKeys.forEach(k => { if (k in state.slots && !outKeys.includes(k)) throw new Error('player already on the roster: ' + k); });
    const slots = Object.assign({}, state.slots), out = new Set(outKeys);
    outKeys.forEach(k => { delete slots[k]; });
    inKeys.forEach(k => { slots[k] = 'reserve'; });
    const moves = (state.moves || []).concat(outKeys.length && inKeys.length ? [{ out: outKeys.slice(), in: inKeys.slice() }] : []);
    return { slots, order: state.order.filter(k => !out.has(k)).concat(inKeys.filter(k => !state.order.includes(k) || out.has(k))), moves };
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
  function playsPct(ctx, state, o) {
    if (ctx.teamTab) return tabPlays(ctx, state, o);
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

  // one player's games over the window with no nightly cap (the games his own team's schedule allows him), under the same rule as playsPct
  // (`to`, ms, cuts the window short: a dropped player's games up to his leave time)
  function soloGames(ctx, key, to) {
    const pp = ctx.pool.byKey.get(key), w = window(ctx);
    if (!ctx.teamTab || ctx.basis === 'pergame') return windowGames(ctx, [key], null)[0];
    return InLeague.rosterGames([{ t: pp.t, a: avail(ctx, pp), from: w.from, to: to != null ? Math.min(to, w.to) : w.to }], ctx.DAYS, ctx.L.maxActive, null)[0];
  }

  // The availability of a typical player in the league: the median of avail over the rostered players who are not on IR (cached per ctx).
  // Per game and plain ctxs have none (avail is 1)
  const typMemo = new WeakMap();
  function typicalAvail(ctx) {
    if (!ctx || !ctx.teamTab || ctx.basis === 'pergame') return 1;
    if (typMemo.has(ctx)) return typMemo.get(ctx);
    const a = ctx.pool.players.filter(p => p.owner && p.slot !== 'IR').map(p => avail(ctx, p)).sort((x, y) => x - y), n = a.length;
    const med = n ? (a[Math.floor((n - 1) / 2)] + a[Math.ceil((n - 1) / 2)]) / 2 : 1;
    typMemo.set(ctx, med);
    return med;
  }

  // An IL player on the timeline (user 2026-10-29; there are no return dates yet): his projected games (avail) carry both his current absence
  // and the generic chance of missing games later that every player has, so only the part of his missed games above a typical player's goes up
  // front. He is out for the first nOut of his team's games in the window (until tRet, ms), then plays at rate a, which keeps his total at
  // avail x GL. -> { nOut, tRet, a }; a real return date would replace nOut / tRet
  function ilReturn(ctx, key) {
    const pp = ctx.pool.byKey.get(key), w = window(ctx), a0 = avail(ctx, pp), aT = typicalAvail(ctx), G = (ctx.DAYS && ctx.DAYS.games) || ctx.DAYS || {};
    const times = (G[pp.t] || []).map(s => s * 1000).filter(ms => ms >= w.from && ms < w.to).sort((x, y) => x - y), gl = times.length;
    // the cap keeps the rate after the return at 1 or below, so rounding never costs him games
    const nOut = Math.min(Math.floor(gl * (1 - a0) + 1e-9), aT > 0 ? Math.round(gl * Math.max(0, 1 - a0 / aT)) : 0);
    return { nOut, tRet: nOut ? (times[nOut] != null ? times[nOut] : w.to) : w.from, a: gl > nOut ? Math.min(1, a0 * gl / (gl - nOut)) : 0 };
  }

  // Plays % on the Team tab (ctx.teamTab): Reserve is parked and plays 0%, never hypo. Per game: Active players claim the nights as above
  // (everyone is there for every team game; IL gets none). Seasonal bases: Active players are there for avail(g) of the team's games and an IL
  // player from his return (ilReturn) on; one call fills the nights best value first, capped per night at the league's active limit
  // (InLeague.rosterGames). So the cover plays until the IL player is back and whoever is worst by value then loses nights. When the roster
  // would exceed the league's player limit (maxPlayers) once the IL players are back, the Reserve players go first and then counted players
  // in order of o.rank(key) (lower goes first; ties by nightValue, then key; the caller ranks by Win M contribution, TeamWin.dropRank).
  // The j-th drop leaves at the j-th time a spot is missing (each IL return past the limit; already over it, the window start), and that
  // row carries drop: leaveMs. A dropped IL player never plays. o.extra = rosterGames items that sit on the roster too (count against the
  // limit, never dropped, not returned). pct is the lineup share of the games a player is there for, so availability (which GL carries) is
  // not counted twice
  function tabPlays(ctx, state, o) {
    o = o || {};
    const w = window(ctx), byKey = ctx.pool.byKey, res = {}, c = countedSlots(ctx), keys = state.order.filter(k => c.includes(state.slots[k])), extra = o.extra || [];
    const done = (k, played, a, drop) => { const gl = gamesLeft(ctx, byKey.get(k).t); res[k] = { gl, played, pct: gl && a > 0 ? played / (gl * a) : gl ? 0 : null }; if (drop != null) res[k].drop = drop; };
    state.order.forEach(k => { if (!c.includes(state.slots[k])) done(k, 0, 1); });
    if (ctx.basis === 'pergame') windowGames(ctx, keys, null).forEach((g, i) => done(keys[i], g, 1));
    else {
      const il = keys.filter(k => state.slots[k] === 'il'), ret = {}, v = k => Matchup.nightValue(ctx, byKey.get(k));
      il.forEach(k => { ret[k] = ilReturn(ctx, k); });
      const lim = ctx.L.maxPlayers, parked = state.order.filter(k => state.slots[k] === 'reserve').length;
      const onRoster = state.order.filter(k => state.slots[k] !== 'il').length + extra.length - parked;   // the players on the roster now, Reserve ones aside
      const need = typeof lim === 'number' && il.length ? Math.max(0, onRoster + il.length - lim) : 0;
      const nDrop = o.noDrop ? 0 : Math.max(need, o.force || 0);   // o.noDrop: everyone stays; o.force: at least that many go, at the first return (the window's middle with no IL player) - TeamWin.dropRank's trial runs
      if (nDrop && typeof o.rank !== 'function') throw new Error('tabPlays: the roster is over the player limit, o.rank is needed to choose who is dropped');
      const rk = o.rank, order = !nDrop ? keys : keys.slice().sort((x, y) => (rk(x) === rk(y) ? 0 : rk(x) < rk(y) ? -1 : 1) || (v(x) - v(y)) || (x < y ? -1 : x > y ? 1 : 0));
      const dropped = new Set(order.slice(0, nDrop)), keptRet = il.filter(k => !dropped.has(k)).map(k => ret[k].tRet).sort((x, y) => x - y);
      const s = Number.isFinite(lim) ? lim - onRoster : Infinity, times = s >= 0 ? keptRet.slice(s) : new Array(-s).fill(w.from).concat(keptRet), leave = {}, outs = order.slice(0, nDrop).filter(k => !il.includes(k));
      while (times.length < outs.length) times.unshift(keptRet.length ? keptRet[0] : w.from + (w.to - w.from) / 2);   // only a forced drop is short of a time
      outs.forEach((k, j) => { leave[k] = times[j]; });
      il.forEach(k => { if (dropped.has(k)) leave[k] = w.from; });   // a dropped IL player never plays: he left at the start
      const items = keys.map(k => il.includes(k)
        ? (dropped.has(k) ? { t: byKey.get(k).t, a: 0, v: v(k), from: w.from, to: w.from } : { t: byKey.get(k).t, a: ret[k].a, v: v(k), from: ret[k].tRet, to: w.to })
        : { t: byKey.get(k).t, a: avail(ctx, byKey.get(k)), v: v(k), from: w.from, to: leave[k] != null ? leave[k] : w.to });
      InLeague.rosterGames(items.concat(extra), ctx.DAYS, ctx.L.maxActive, null).forEach((g, i) => { if (i < keys.length) done(keys[i], g, avail(ctx, byKey.get(keys[i])), leave[keys[i]]); });
    }
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

  const api = { SLOTS, COUNTED, countedSlots, counted, avail, windowGames, soloGames, typicalAvail, ilReturn, initState, tabState, moveSlot, applySwap, window, gamesLeft, seasonGamesLeft, playsPct, weightedZ, teamLine, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Team = api;
})(typeof self !== 'undefined' ? self : this);

// The one shrink every Win C / Win M display reads (#139, #147): Team, Rankings and the Trade Analyzer. Display only, never in the Model pick.
// Fitted leave-one-season-out on 3 seasons of rest-of-season forecasts (calib_ros_k.js): pooled k 0.43 match, 0.65 per category; shipped at
// 0.6 / 0.75 (user, 2026-10-26) because the backtest keeps draft rosters and preseason lines, so the live app is likely less overconfident.
(function (root) {
  'use strict';
  const SHRINK = { match: 0.6, cat: 0.75 };
  const shrink = (p, k) => 0.5 + k * (p - 0.5);
  const api = { SHRINK, shrink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WinK = api;
})(typeof self !== 'undefined' ? self : this);

// Team tab win numbers (#131 PR 2, 2026-10-25; moved onto the Rankings / Draft-tab engine 2026-10-26): the matrix of the previewed
// roster against every other team, each player's Win C / Win M contribution, and the player-list module scores. Pure; browser and
// Node. Nothing here changes the saved league, ctx or the pool. Every team's players get their remaining Plays % games per
// average week (mine and every opponent's, with the nightly cap), turned into season-equivalent games (x WEEKS) and summed into
// one forecast per team with Engine.entryVec; Engine.evaluate then gives every pairing's category and match chances, with the
// engine's own noise (SIGMA_G2 games variance); the chances are then pulled toward 0.5 by SHRINK (#139).
// Units follow Rankings: m = Win M points (100 x the change in the match chance), c = Win C hundredths (100 x the change in
// the summed category chances, averaged over the opponents).
(function (root) {
  'use strict';
  const Eng = root.Engine || require('./engine.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), Team = root.Team || require('./team_core.js'), Pts = root.Points || require('./points_core.js'), WinK = root.WinK || require('./win_k.js');
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
      by[bk] = engCtxFrom(list.map(p => Object.assign({}, p.line, { g: p.g })), N, R, nc, w);
    }
    return by[bk];
  }

  // the engine context of a list of stat lines (with g) in draft order: N teams of R players, nc categories. engCtx's body, shared with calib_ros.js
  function engCtxFrom(lines, N, R, nc, w) {
    const P = Eng.prepPlayers(lines.map((p, i) => Object.assign({}, p, { ftx: i + 1 })));
    const cfg = { teams: N, roster: R, slot: 1, order: '3rr', scoring: 'h2h', cats: nc, ilSpots: 0, field: 'easy', fieldZ: 'std', puntMode: 'off', puntLock: '',
      catW: InPlayers.WEIGHTS.slice(), adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0, basis: 'total' };
    const cx = Eng.buildContext(P, cfg);
    return w ? { ctx: Pts.engineView(P, cx, cfg, w).ctx, cfg, w } : { ctx: cx, cfg };
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

  // a Team.initState for another team from its Fantrax slots; IL players and the excluded keys (players I brought in) are left out;
  // recv = the players it receives in a previewed trade [{ key, slot }] (see received), who join in the slot they take
  // The Team tab (ctx.teamTab) keeps his IL players (they count on the seasonal bases) and his bench is Active, as on my side (Team.tabState)
  function oppState(ctx, teamId, exclude, recv) {
    const byKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;   // the received players join in key order, as the cache key sorts them
    if (ctx.teamTab) {
      const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f))).map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
      (recv || []).slice().sort(byKey).forEach(r => rows.push({ fid: r.key, slot: ctx.pool.byKey.get(r.key).slot === 'IR' ? 'IR' : 'ACTIVE' }));
      return Team.tabState(rows);
    }
    const rows = ctx.roster[teamId].filter(f => !(exclude && exclude.has(f)) && ctx.pool.byKey.get(f).slot !== 'IR').map(f => ({ fid: f, slot: ctx.pool.byKey.get(f).slot }));
    (recv || []).filter(r => ctx.pool.byKey.get(r.key).slot !== 'IR').sort(byKey).forEach(r => rows.push({ fid: r.key, slot: r.slot === 'active' ? 'ACTIVE' : 'RESERVE' }));
    return Team.initState(rows);
  }

  // D3 (user 2026-10-26): a candidate I bring in from an opponent's roster leaves that team, and the team receives the player I send out
  // (a previewed trade; state.moves records each swap). One opponent among the incoming players gets every outgoing player: the first take
  // the vacated slots in order, the rest go to the reserve. Incoming players from several opponents pair with the outgoing ones in order
  // (extras go to nobody). Free agents send nothing back, a vacated IL slot becomes the reserve, and a player who is back on my preview
  // roster is not received. -> { teamId: [{ key, slot: 'active' | 'reserve' }] }
  // The swaps are replayed with each player's current holder, so a swap-back or a later trade of a received player moves him again.
  // trade -> { recv, gone }: recv as above; gone = every opponent player not on his original team now (they leave that team's side)
  function trade(ctx, state) {
    const slotOf = k => ctx.pool.byKey.get(k).slot === 'ACTIVE' ? 'active' : 'reserve', loc = new Map(), slots = new Map(), pools = k => (ctx.pool.byKey.get(k) || {}).owner;
    const at = k => loc.has(k) ? loc.get(k) : (pools(k) || null);
    (state.moves || []).forEach(m => {
      const ins = m.in.map(k => { const o = at(k); return o && o !== ctx.me && ctx.roster[o] ? { o, slot: slotOf(k) } : null; }), found = ins.filter(Boolean), owners = [...new Set(found.map(x => x.o))], to = m.out.map(() => null);
      if (owners.length === 1) m.out.forEach((k, i) => { to[i] = { t: owners[0], slot: i < found.length ? found[i].slot : 'reserve' }; });
      else if (owners.length) m.out.forEach((k, i) => { if (ins[i]) to[i] = { t: ins[i].o, slot: ins[i].slot }; });
      m.in.forEach(k => loc.set(k, ctx.me));
      m.out.forEach((k, i) => loc.set(k, to[i] ? to[i].t : null));
      m.out.forEach((k, i) => { if (to[i]) slots.set(k, to[i].slot); });
    });
    const recv = {}, gone = new Set();
    loc.forEach((h, k) => {
      const own = pools(k);
      if (h && h !== ctx.me && h !== own) (recv[h] = recv[h] || []).push({ key: k, slot: slots.get(k) || 'reserve' });
      if (h !== own && own && own !== ctx.me && ctx.roster[own]) gone.add(k);
    });
    Object.values(recv).forEach(r => r.forEach(x => gone.add(x.key)));
    return { recv, gone };
  }
  const received = (ctx, state) => trade(ctx, state).recv;
  const goneKeys = (ctx, state) => [...trade(ctx, state).gone].sort();

  // Team.playsPct with the drop order of team o.tid (default mine): when the IL players' return pushes the roster over the player limit, the
  // players with the lowest Win M contribution go (dropRank). o: tid, cats, points, e (the engine context when the caller has it), noDrop
  function plays(ctx, state, o) {
    o = o || {};
    if (!ctx.teamTab || ctx.basis === 'pergame' || o.noDrop) return Team.playsPct(ctx, state, { noDrop: o.noDrop });
    let rank = null;
    return Team.playsPct(ctx, state, { extra: o.extra, rank: k => (rank || (rank = dropRank(ctx, o.tid != null ? o.tid : ctx.me, o)))(k) });   // built only if a player has to go
  }

  // The drop order of team tid on the Team tab (IL timeline, user 2026-10-29: drop by Win M contribution): rank(k) = minus the team's mean match
  // chance (the category chance of the points total for points leagues) when k is the one dropped from its saved roster at the first IL
  // return, so the lowest rank costs the least Win M. It is the realized chance, not the loss from removing him altogether: that one would
  // drop an IL player (who then never plays) before a weak healthy player who still plays until the return, and the team would end up
  // worse (Paragua: Ingram out would have cost 1.5 Win M points against dropping Keldon Johnson). The field's saved rosters are taken whole,
  // nobody dropped. A player off the saved roster (a candidate, a trade arrival) ranks Infinity and is never dropped. With several drops at
  // once the order is each player's cost as the single drop. Memoised per ctx, team, weeks, categories, point values and basis.
  // o: cats, points, e. -> rank(key)
  const dropMemos = new WeakMap();
  function dropRank(ctx, tid, o) {
    o = o || {};
    const Wk = weeksLeft(ctx), nc = o.cats === 8 ? 8 : 9, pts = o.points;
    if (!(Wk > 0) || !ctx.teamTab || ctx.basis === 'pergame' || !ctx.roster[tid]) return () => 0;
    let memo = dropMemos.get(ctx); if (!memo) dropMemos.set(ctx, memo = new Map());
    const id = [tid, Wk, nc, pts ? Pts.key(pts) : '', ctx.basis].join('|');
    if (!memo.has(id)) {
      const e = o.e || engCtx(ctx, nc, pts), F = Pts.FP_SLOT, none = { noDrop: true };
      const field = Object.keys(ctx.roster).filter(t => t !== tid).map(t => teamVec(e, side(ctx, oppState(ctx, t), Wk, none))), saved = oppState(ctx, tid);
      const meanOf = vec => {
        const out = evalVecs(e, [vec].concat(field));
        return field.reduce((s, _, j) => s + (e.w ? out.catProb(out.teams[0], out.teams[j + 1], F) : shr(out.pairProb(out.teams[0], out.teams[j + 1]), SHRINK.match)), 0) / (field.length || 1);
      };
      const u = new Map();
      Team.counted(saved, ctx).forEach(k => u.set(k, -meanOf(teamVec(e, sideOf(ctx, saved, Team.playsPct(ctx, saved, { force: 1, rank: x => (x === k ? -1 : 0) }), Wk)))));
      memo.set(id, k => (u.has(k) ? u.get(k) : Infinity));
    }
    return memo.get(id);
  }

  // my side's options from a matrix opts (cats, points)
  const sideOpts = opts => ({ cats: opts && opts.cats, points: opts && opts.points });

  // pairMatchup entries for the active and reserve players: games = Plays % games per average week (hypothetical rows never count)
  // o: see plays (tid defaults to mine)
  function side(ctx, state, W, o) {
    return sideOf(ctx, state, plays(ctx, state, o), W);
  }
  const sideOf = (ctx, state, r, W) => {
    const c = Team.countedSlots(ctx);
    return state.order.filter(k => c.includes(state.slots[k]) && !r[k].hypo)
      .map(k => ({ key: k, p: ctx.pool.byKey.get(k).line, games: r[k].played / W }));
  };

  // ctx must be treated as immutable (the cache is keyed on the object; makeCtx builds a new one per change)
  // opponents' forecasts are the same for every previewed roster that removes the same players from them, so they are cached per ctx
  const memos = new WeakMap();
  function oppTeam(ctx, e, nc, tid, exclude, W, recv) {   // e carries the point values, so the memo key must too
    let memo = memos.get(ctx);
    if (!memo) { memo = new Map(); memos.set(ctx, memo); }
    const gone = ctx.roster[tid].filter(f => exclude.has(f)).sort(), id = tid + '|' + gone.join(',') + '|' + (recv || []).map(r => r.key + ':' + r.slot).sort().join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '');
    if (!memo.has(id)) memo.set(id, teamVec(e, side(ctx, oppState(ctx, tid, exclude, recv), W, { tid, cats: nc, points: e.w, e })));
    return memo.get(id);
  }

  // my previewed roster against every other team. -> { weeks, teams: [{ id, cat[9], match, winC }], mean: { cat, match, winC } }
  // (cat entries beyond the league's category count are null). opts: cats 9 | 8. Players I hold leave their old team's side, and the
  // teams my candidates came from receive the players I send out (received).
  function matrix(ctx, state, opts) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return { weeks: 0, teams: [], mean: null };
    const t = trade(ctx, state);
    return matrixOf(ctx, side(ctx, state, W, sideOpts(opts)), new Set(state.order.concat([...t.gone])), W, Object.assign({}, opts, { recv: t.recv }));
  }

  // the matrix for any set of my entries [{ p, games, sign? }] (games per average week, W = weeks left); `exclude` = the keys that left
  // their old team's side (everyone on my roster, and a candidate I bring in)
  // Shrink toward 50%, fitted leave-one-season-out on 3 seasons of rest-of-season forecasts (#139, calib_ros_k.js): pooled k 0.43 match,
  // 0.65 per category (one k per category did not beat one k); unshrunk was about twice too confident. Shipped at 0.6 / 0.75 (user, 2026-10-26):
  // the backtest keeps draft rosters and preseason lines, so the live app is likely less overconfident. opts.shrink overrides.
  const SHRINK = WinK.SHRINK, shr = WinK.shrink;
  function matrixOf(ctx, mine, exclude, W, o) {
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster).filter(t => t !== ctx.me);
    const tv = [teamVec(e, mine)].concat(ids.map(id => oppTeam(ctx, e, nc, id, exclude, W, o && o.recv && o.recv[id])));
    const out = evalVecs(e, tv);
    if (e.w) {   // one points total: the match chance is the single-slot chance (not shrunk: the k was fitted on categories); no category or Win C numbers
      const F = Pts.FP_SLOT, teams = ids.map((id, i) => ({ id, cat: null, match: out.catProb(out.teams[0], out.teams[i + 1], F), winC: null, ppw: tv[i + 1].mu[F] / Eng.WEEKS }));
      return { weeks: W, teams, mean: { cat: null, match: teams.reduce((s, t) => s + t.match, 0) / (teams.length || 1), winC: null, ppw: tv[0].mu[F] / Eng.WEEKS } };   // ppw = points in an average week
    }
    const k = (o && o.shrink) || SHRINK;
    const teams = ids.map((id, i) => {
      const A = out.teams[0], B = out.teams[i + 1], cat = Array.from({ length: 9 }, (_, c) => c >= nc ? null : shr(out.catProb(A, B, c), k.cat));
      return { id, cat, match: shr(out.pairProb(A, B), k.match), winC: cat.reduce((s, v) => s + (v == null ? 0 : v), 0) };
    });
    const avg = f => teams.reduce((s, t) => s + f(t), 0) / (teams.length || 1);
    return { weeks: W, teams, mean: { cat: Array.from({ length: 9 }, (_, c) => (c >= nc ? null : avg(t => t.cat[c]))), match: avg(t => t.match), winC: avg(t => t.winC) } };
  }

  // The ctx the Trade Analyzer scores on (#151, user 2026-10-27): the Team tab's rules on the Season basis (Reserve parked, IL players
  // count at their availability g/82), as the Team tab and Rankings do. A shallow copy so Team.* see the flags; cached per ctx and basis
  // (never one per call: engCtx and lwMemos are keyed on the original ctx and rebuilding them per candidate would be ~2000 engine builds)
  const tabViews = new WeakMap();
  function tabView(ctx, basis) {
    const b = basis || 'total';
    if (ctx.teamTab && ctx.basis === b) return ctx;
    let by = tabViews.get(ctx); if (!by) tabViews.set(ctx, by = {});
    return by[b] || (by[b] = Object.assign({}, ctx, { teamTab: true, basis: b }));
  }

  // The state of team t holding the fantrax ids `fids` (a trade's roster), as the Team tab opens it (Team.tabState): its players keep their
  // Fantrax slots, the bench is Active and an IR player stays IL; he counts at his availability g/82 of the team's games (the seasonal basis).
  // Incoming players join like oppState's received ones (IR stays IR, the rest Active). They are sorted, so the slots do not depend on
  // the order of `fids` (the leagueWin memo key sorts them)
  function tradeState(ctx, t, fids) {
    const keep = new Set(fids), was = new Set(ctx.roster[t]), slotOf = f => ctx.pool.byKey.get(f).slot === 'IR' ? 'IR' : 'ACTIVE';
    const rows = ctx.roster[t].filter(f => keep.has(f)).map(f => ({ fid: f, slot: slotOf(f) }));
    fids.filter(f => !was.has(f)).sort().forEach(f => rows.push({ fid: f, slot: slotOf(f) }));
    return Team.tabState(rows);
  }

  // Every team's chance against every other team with the rosters R (fantrax ids per team; default the saved ones), rest of season, from one
  // Engine.evaluate run: the forecaster the Team tab shows, with the same SHRINK. -> { W, ids, P } with P[i][j] = team i's match chance
  // against team j (null on the diagonal); opts.rows (team ids) fills only those rows. null with no weeks left.
  // opts: cats 9 | 8, points, shrink, basis (default 'total': the Team tab's Season rules, tabView). Team forecasts are cached per ctx
  // (team, its roster, weeks, categories, point values, basis)
  const lwMemos = new WeakMap();
  function leagueWin(ctx, R, o) {
    const W = weeksLeft(ctx);
    if (!(W > 0)) return null;
    const nc = o && o.cats === 8 ? 8 : 9, e = engCtx(ctx, nc, o && o.points), ids = Object.keys(ctx.roster), rows = new Set((o && o.rows) || ids), k = (o && o.shrink) || SHRINK;
    const tv = tabView(ctx, o && o.basis);
    let memo = lwMemos.get(ctx); if (!memo) lwMemos.set(ctx, memo = new Map());
    const vecs = ids.map(t => {
      const id = t + '|' + (R || ctx.roster)[t].slice().sort().join(',') + '|' + W + '|' + nc + '|' + (e.w ? Pts.key(e.w) : '') + '|' + tv.basis;
      if (!memo.has(id)) memo.set(id, teamVec(e, side(tv, tradeState(ctx, t, (R || ctx.roster)[t]), W, { tid: t, cats: nc, points: o && o.points, e })));
      return memo.get(id);
    });
    const out = evalVecs(e, vecs), F = Pts.FP_SLOT;
    const P = ids.map((a, i) => !rows.has(a) ? null : ids.map((b, j) => i === j ? null : e.w ? out.catProb(out.teams[i], out.teams[j], F) : shr(out.pairProb(out.teams[i], out.teams[j]), k.match)));
    return { W, ids, P };
  }

  // one Engine.evaluate run with one entry per team (vecs from teamVec); out.teams[i] is vecs[i], then out.pairProb / out.catProb
  function evalVecs(e, vecs) {
    const pl = vecs.map((t, i) => ({ id: i, x: t.mu, pv: t.v, adpUse: 1, sd: 1, adpE: 1, sdE: 1, fieldV: 0, boardRaw: 0 }));
    return Eng.evaluate(pl, e.ctx, Object.assign({}, e.cfg, { teams: pl.length, roster: 1, slot: 1 }), { picks: pl.map((_, i) => i), owner: pl.map((_, i) => i) });
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
      const ap = (opts.ap) || avgParts(ctx, state, base.weeks, opts);
      if (ap) { const own = Team.countedSlots(ctx).includes(state.slots[k]); return own ? gain(base, avgOwn(ctx, state, ap, k, opts)) : Object.assign(gain(avgCandidate(ctx, state, ap, k, opts), base), { hypo: true }); }
    }
    // a player who does not count (IL; on the Team tab also Reserve, and IL on Per game) is scored as the one more player he would be: the plain
    // ctx adds him to the reserve, the Team tab to Active
    const s = state.slots[k], counted = Team.countedSlots(ctx).includes(s), without = Team.applySwap(state, [k], []);
    return counted ? gain(base, matrix(ctx, without, opts)) : Object.assign(gain(matrix(ctx, Team.moveSlot(state, k, ctx.teamTab ? 'active' : 'reserve'), opts), base), { hypo: true });
  }

  // the made-up average player of Vs average (user 2026-10-26). n = my counted players, tot = their games per week, M = the Active spots
  // (ctx.L.maxActive), mean = the games-weighted mean line with tot / M games (so his totals are one M-th of the team's), share = the games my
  // counted players get out of the games their own team schedules allow, with no nightly cap (the team's average lineup share).
  // -> null with no counted player or no games
  function avgParts(ctx, state, W, opts) {
    const r = plays(ctx, state, sideOpts(opts)), mine = sideOf(ctx, state, r, W), n = mine.length, tot = mine.reduce((a, e) => a + e.games, 0), M = ctx.L.maxActive || n;
    const allowed = Team.counted(state, ctx).reduce((a, k) => a + Team.soloGames(ctx, k, r[k].drop), 0);   // each player alone: no nightly cap; a dropped one only until he leaves
    if (!n || !(tot > 0) || !(allowed > 0)) return null;
    return { W, mine, n, tot, M, plays: r, share: tot * W / allowed, mean: { p: Team.teamLine(mine.map(e => ({ line: e.p, pct: e.games })), tot), games: tot / M } };
  }

  // a player not counted on my team replaces the average player: current team - average + him, his games times the share
  function avgCandidate(ctx, state, ap, key, opts) {
    const g = Team.soloGames(ctx, key) / ap.W * ap.share;
    const mine = ap.mine.concat(Object.assign({}, ap.mean, { sign: -1 }), { p: ctx.pool.byKey.get(key).line, games: g });
    const t = trade(ctx, state);
    return matrixOf(ctx, mine, new Set(state.order.concat([...t.gone])).add(key), ap.W, Object.assign({}, opts, { recv: t.recv }));
  }

  // my counted player replaced by an average-line player who gets the games his slot allows, as a candidate does (avgCandidate): his games
  // times the team's share, not the games he plays, so a player who never plays costs what his slot would hold (user 2026-10-29, reverses #138's
  // "keeps his games") and the list and the roster agree
  // A player who is dropped at an IL return (non-IL) is replaced by an average player who cannot be dropped, so the drop moves on to the
  // next-ranked player (the roster is the same size): without that he would read far below the replacement for games he never plays.
  // The average player counts against the player limit but takes no nightly slot (a: 0 item); the rest of the team is replayed without D
  function avgOwn(ctx, state, ap, key, opts) {
    const pk = ap.plays && ap.plays[key], isDrop = pk && pk.drop != null, il = state.slots[key] === 'il';
    const t = trade(ctx, state), g = Team.soloGames(ctx, key, il && isDrop ? pk.drop : undefined) / ap.W * ap.share, so = sideOpts(opts);   // a dropped IL player never plays: 0 games, as in avgParts
    const dropped = !il && isDrop;
    let mine = ap.mine.filter(x => x.key !== key);
    if (dropped) {
      const w = Team.window(ctx), without = Team.applySwap(state, [key], []), A0 = { t: ctx.pool.byKey.get(key).t, a: 0, v: 0, from: w.from, to: w.from };
      mine = sideOf(ctx, without, plays(ctx, without, Object.assign({ extra: [A0] }, so)), ap.W);
    }
    return matrixOf(ctx, mine.concat(Object.assign({}, ap.mean, { games: g })), new Set(state.order.concat([...t.gone])), ap.W, Object.assign({}, opts, { recv: t.recv }));
  }

  // points my counted players produce in an average remaining week: sum of FP per game x Plays % games per week
  function pointsPerWeek(ctx, state, w) {
    const Wk = weeksLeft(ctx); if (!(Wk > 0)) return 0;
    return side(ctx, state, Wk, { points: w }).reduce((t, e) => t + Pts.perGame(e.p, w) * e.games, 0);
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
    if (o.baseline === 'avg') { const ap = avgParts(ctx, state, base.weeks, mo); return ap ? { base, ap, mo, avg: true } : null; }
    const pw = o.pw || playerWin(ctx, state, mo), counted = Team.counted(state, ctx);
    if (!counted.length) return null;
    // The replacement level is the counted player with the lowest contribution who plays and is not on IL: a candidate takes his slot. An IL
    // player cannot be it (a healthy candidate cannot take an IL slot) and neither can a player who never plays (nothing to replace, so he
    // would read 0 and every other row would be measured from a player who is worth nothing) and neither can one who is dropped at an IL
    // return (a candidate does not take a slot that is closing); they read below it instead. With no such player
    // every counted player is a candidate
    const pl = plays(ctx, state, sideOpts(mo)), playing = k => pl[k] && pl[k].played > 0;
    const pool = counted.filter(k => state.slots[k] !== 'il' && playing(k) && pl[k].drop == null), cand = pool.length ? pool : counted;
    const worst = cand.reduce((a, b) => pw[b].m < pw[a].m ? b : a), ref = pw[worst], wSlot = state.slots[worst];
    return { base, pw, worst, grp: [worst], ref, wSlot, mo, off: { c: o.points ? null : 0, m: 0, dCat: o.points ? null : new Array(9).fill(0) }, avg: false };
  }

  // the preview with `key` in the worst player's slot (Active when that is the Reserve), scored against the current team
  function swapScore(ctx, state, su, cx, key) {
    const s0 = key in state.slots ? Team.applySwap(state, su.grp, []) : Team.applySwap(state, su.grp, [key]);
    return gain(matrix(cx, Team.moveSlot(s0, key, swapSlot(ctx, s0, su.wSlot)), su.mo), su.base);
  }
  // The slot a candidate takes in the worst player's place. Active claims nights before the Reserve, so a Reserve slot would score him on leftovers.
  // Plain ctx: the worst's slot (Active for a Reserve one). Team tab: Active while it has room under the roster limit, else the IL slot the worst
  // vacated on the seasonal bases (the slot Apply swap gives him, TeamView.apply), so the list and the roster after Apply agree
  function swapSlot(ctx, s0, wSlot) {
    if (!ctx.teamTab) return wSlot === 'reserve' ? 'active' : wSlot;
    const max = ctx.L.maxPlayers || ctx.L.maxActive, n = s0.order.filter(k => s0.slots[k] === 'active').length;
    return n >= max && wSlot === 'il' && Team.countedSlots(ctx).includes('il') ? 'il' : 'active';
  }

  function moduleRow(ctx, state, su, key) {
    const own = key in state.slots, s = own ? state.slots[key] : null, owner = own ? ctx.me : ((ctx.pool.byKey.get(key) || {}).owner || null), cur = 100 * su.base.mean.match;
    if (su.avg) {
      const counted = own && Team.countedSlots(ctx).includes(s), a = counted ? avgOwn(ctx, state, su.ap, key, su.mo) : avgCandidate(ctx, state, su.ap, key, su.mo), g = counted ? gain(su.base, a) : gain(a, su.base);
      return { key, owner, dM: g.m, dC: g.c, dCat: g.dCat, old: counted ? cur - g.m : cur, new: counted ? cur : cur + g.m };
    }
    const pw = su.pw, zero = () => su.mo.points ? null : new Array(9).fill(0);
    let r;
    const vs = (a, b) => ({ c: sub(a.c, b.c), m: a.m - b.m, dCat: subV(a.dCat, b.dCat) });
    if (su.grp.includes(key)) r = { c: su.mo.points ? null : 0, m: 0, dCat: zero() };
    else if (own && Team.countedSlots(ctx).includes(s)) r = vs(pw[key], su.ref);
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

  const api = { SHRINK, engCtx, engCtxFrom, teamVec, plays, dropRank, evalVecs, tabView, tradeState, leagueWin, pointsPerWeek, weeksLeft, oppState, received, goneKeys, side, matrix, matrixOf, avgParts, playerGain, playerWin, moduleSetup, moduleRow, moduleSort, moduleScores };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TeamWin = api;
})(typeof self !== 'undefined' ? self : this);

// Trade core (2026-10-20): rest-of-season Win M for a roster change, perceived player value and trade likelihood.
// Pure; browser and Node. Builds on matchup_core (a team's week vs its real opponent) and inseason_players (value scale).
(function (root) {
  'use strict';
  const InLeague = root.InLeague || require('./inseason_league.js'), InPlayers = root.InPlayers || require('./inseason_players.js'), TeamWin = root.TeamWin || require('./team_win.js');

  // winM was 0.1 on the old pairMatchup scale; #147 moved dB to the TeamWin forecaster, where dB is larger, so 0.1 x 0.672 (a fit of old dB on new dB over
  // the 2145 one-for-one candidates of the fixture league, scratch script fit_winm.js) keeps the likelihood moving with dB as much as before.
  // #151 moved dB onto the Team tab's Season rules (IL at g/82, bench Active): the same fit of the 2145 candidates, dB(#147) on dB(#151), gave slope 0.922
  // (R2 0.785), so 0.07 x 0.922 = 0.065
  const TRADE_W = { cur: 0.4, proj: 0.3, adp: 0.3, shrinkGames: 20, slope: 2.0, winM: 0.065, tagGap: 0.5, bias: -0.75 };   // bias: a manager wants to come out ahead, so an even-looking swap is not a coin flip

  // Rest-of-season Win M with the rosters as given (fids per team): the Team tab's forecaster (TeamWin.leagueWin, one Engine.evaluate run, the
  // shared WinK.SHRINK on every term), the mean over every other team weighted equally (user, 2026-10-26: until playoff odds are in).
  // On the Team tab's Season rules (#151): IL players count at their availability g/82, the bench is Active. opts: cats, points, shrink as TeamWin.leagueWin. -> { mean, opps: [{ opp, p }] }, mean null with no weeks left
  function rosMeans(ctx, roster, teams, opts) {
    const none = { mean: null, opps: [] }, lw = ctx.cur == null ? null : TeamWin.leagueWin(ctx, roster, Object.assign({}, opts, { rows: teams })), out = {};
    teams.forEach(t => {
      if (!lw) { out[t] = none; return; }
      const row = lw.P[lw.ids.indexOf(t)], opps = lw.ids.map((o, j) => ({ opp: o, p: row[j] })).filter(x => x.opp !== t);
      out[t] = { mean: opps.length ? opps.reduce((s, x) => s + x.p, 0) / opps.length : null, opps };
    });
    return out;
  }
  const rosWinM = (ctx, roster, teamId, opts) => rosMeans(ctx, roster, [teamId], opts)[teamId];
  const optKey = o => o ? JSON.stringify([o.cats, o.points, o.shrink, o.basis]) : '';

  // projected players' values, best first (the ADP-implied value of a rank)
  function projValues(ctx) {
    if (!ctx._projVals) ctx._projVals = ctx.pool.players.filter(p => p.src === 'proj').map(p => InPlayers.valueZ(p.line, p.g, ctx.ref)).sort((a, b) => b - a);
    return ctx._projVals;
  }
  // an IL player's season value: his projected games (which already hold the time he misses) at his line, the rest of the season at the
  // line of his owner's worst non-IL player (user, 2026-10-26; the receiving team's in a trade, user 2026-10-27); everyone else is valued over his own games
  const FULL_G = 82;
  function worstLine(ctx, owner) {
    const c = ctx._worst = ctx._worst || {};
    if (!(owner in c)) {
      const ps = (ctx.roster[owner] || []).map(f => ctx.pool.byKey.get(f)).filter(p => p.slot !== 'IR').sort((a, b) => InPlayers.valueZ(a.line, a.g, ctx.ref) - InPlayers.valueZ(b.line, b.g, ctx.ref));
      c[owner] = ps.length ? ps[0].line : null;
    }
    return c[owner];
  }
  // fillOwner: the team whose worst player fills the rest (default his owner; in a trade the team that receives him, #153)
  function seasonZ(ctx, pp, line, fillOwner) {
    const fill = pp.slot === 'IR' && pp.g < FULL_G ? worstLine(ctx, fillOwner || pp.owner) : null;
    return fill ? InPlayers.valueZFill(line, pp.g, fill, FULL_G, ctx.ref) : InPlayers.valueZ(line, pp.g, ctx.ref);
  }
  function perceived(ctx, pp, fillOwner) {
    const proj = seasonZ(ctx, pp, pp.line, fillOwner), cur = seasonZ(ctx, pp, InPlayers.curLine(pp, TRADE_W.shrinkGames), fillOwner);
    const vals = projValues(ctx), rank = Math.max(1, Math.min(vals.length, Math.round(pp.adp == null ? 168 : pp.adp)));
    const adp = vals[rank - 1];
    return { cur, proj, adp, pv: TRADE_W.cur * cur + TRADE_W.proj * proj + TRADE_W.adp * adp, rv: proj };
  }

  function baseline(ctx, t, opts) {
    const ro = ctx._ros = ctx._ros || {}, k = t + '#' + optKey(opts);
    return ro[k] === undefined ? (ro[k] = rosWinM(ctx, ctx.roster, t, opts).mean) : ro[k];
  }
  // aGets: fids A receives from B; bGets: fids B receives from A. dA, dB in percentage points of rest-of-season Win M (opts: see rosMeans).
  function evaluateTrade(ctx, { a, b, aGets, bGets }, opts) {
    if (a === b) throw new Error('A trade needs two different teams');
    const ra = new Set(ctx.roster[a]), rb = new Set(ctx.roster[b]);
    aGets.forEach(f => { if (!rb.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); if (bGets.includes(f)) throw new Error('Player ' + f + ' is on both sides'); });
    bGets.forEach(f => { if (!ra.has(f)) throw new Error('Player ' + f + ' is not on the giving team'); });
    const R = Object.assign({}, ctx.roster);
    R[a] = ctx.roster[a].filter(f => !bGets.includes(f)).concat(aGets);
    R[b] = ctx.roster[b].filter(f => !aGets.includes(f)).concat(bGets);
    // a side left with more non-IL players than the limit drops its worst ones (#153); a team already over it is not charged for the trade
    const nonIR = f => ctx.pool.byKey.get(f).slot !== 'IR', val = f => { const p = ctx.pool.byKey.get(f); return InPlayers.valueZ(p.line, p.g, ctx.ref); };
    const capDrops = t => {
      const over = R[t].filter(nonIR).length - Math.max(ctx.L.maxPlayers || 0, ctx.roster[t].filter(nonIR).length);
      return ctx.L.maxPlayers > 0 && over > 0 ? R[t].filter(nonIR).sort((x, y) => val(x) - val(y) || (x < y ? -1 : 1)).slice(0, over) : [];
    };
    const drops = { [a]: capDrops(a), [b]: capDrops(b) };
    R[a] = R[a].filter(f => !drops[a].includes(f)); R[b] = R[b].filter(f => !drops[b].includes(f));
    // one league run gives both sides; cached per (the two changed rosters, options)
    const sig = t => R[t].slice().sort().join(','), cache = ctx._rosCache = ctx._rosCache || new Map(), key = a + '#' + sig(a) + '|' + b + '#' + sig(b) + '|' + optKey(opts);
    if (!cache.has(key)) { const m = rosMeans(ctx, R, [a, b], opts); cache.set(key, [m[a].mean, m[b].mean]); }
    const after = cache.get(key), dA = 100 * (after[0] - baseline(ctx, a, opts)), dB = 100 * (after[1] - baseline(ctx, b, opts));
    // B's view of the swap: an IL player is filled by B's worst player on either side (the fill swaps with him)
    const pvSum = fs => fs.reduce((s, f) => s + perceived(ctx, ctx.pool.byKey.get(f), b).pv, 0);
    const gapB = pvSum(bGets) - pvSum(aGets);
    return { dA, dB, total: dA + dB, likelihood: 1 / (1 + Math.exp(-(TRADE_W.slope * gapB + TRADE_W.winM * dB + TRADE_W.bias))), gapB, multi: aGets.length !== bGets.length, drops };
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

