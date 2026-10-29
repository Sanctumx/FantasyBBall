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
