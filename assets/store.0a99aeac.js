// The league every page shares (2026-10-20): league settings and the loaded Fantrax league live in one stored object that
// Settings writes and Draft, League, Matchup and Trade read. Also the per-league memory (saved leagues, your team) and the
// one-time migration from the keys the pages used before. Pure functions over get/set callbacks, so Node can test them.
(function (root) {
  'use strict';
  const KEYS = { settings: 'courtside-settings-v1', board: 'courtside-board-v1', leagues: 'courtside-leagues-v1', inseason: 'courtside-inseason-v1', manual: 'courtside-manual-v1' };
  // league settings only; slot, order and draft field belong to a draft and stay on the Draft page
  // Points leagues (2026-10-26, #137): fantasy points per stat, kept with the other league settings; a draft never stores them
  const POINT_STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'tpm', 'fgm', 'fga', 'ftm', 'fta'];
  const POINT_LABELS = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', to: 'Turnovers', tpm: '3-pointers made', fgm: 'FG made', fga: 'FG attempted', ftm: 'FT made', fta: 'FT attempted' };
  const PT_MAX = 100;
  const LEAGUE_DEF = { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3, luSplit: true, luC: 2, luG: 3, luF: 3, luGC: 0, luFC: 0, luU: 2,
    pointVals: POINT_STATS.reduce((o, k) => { o[k] = 0; return o; }, {}) };
  const LEAGUE_KEYS = Object.keys(LEAGUE_DEF).filter(k => k !== 'pointVals').concat('luFx');
  const LU_MAX = { luC: 4, luG: 6, luF: 6, luGC: 3, luFC: 3, luU: 10 };
  // Lineup slots: which positions each starting slot takes (U = Util, anyone)
  const SLOT_OK = { PG: ['PG'], SG: ['SG'], SF: ['SF'], PF: ['PF'], C: ['C'], G: ['PG', 'SG'], F: ['SF', 'PF'], U: ['PG', 'SG', 'SF', 'PF', 'C'] };
  // a slot may combine positions (Fantrax 'G/C', 'F/C'): eligible if any part is
  const slotElig = sl => [...new Set(String(sl).split('/').flatMap(x => SLOT_OK[x] || []))];
  const slotName = sl => sl === 'U' ? 'UTIL' : sl;
  // Starting slots from the Lineup dropdowns: C, G, F and UTIL amounts; with PG SG SF PF on, G n = PG + SG + (n − 2) G and
  // F n = SF + PF + (n − 2) F (one slot of a kind = plain G / F). A Fantrax list (luFx) wins.
  function lineupSlots(c) {
    if (Array.isArray(c.luFx) && c.luFx.length) return c.luFx.slice();
    const sp = c.luSplit !== false, out = [];
    const grp = (n, a, b, g) => { if (sp && n >= 2) { out.push(a, b); for (let k = 2; k < n; k++) out.push(g); } else for (let k = 0; k < n; k++) out.push(g); };
    grp(c.luG, 'PG', 'SG', 'G'); grp(c.luF, 'SF', 'PF', 'F'); for (let k = 0; k < c.luC; k++) out.push('C');
    for (let k = 0; k < (c.luGC || 0); k++) out.push('G/C'); for (let k = 0; k < (c.luFC || 0); k++) out.push('F/C'); for (let k = 0; k < c.luU; k++) out.push('U');
    return out;
  }

  const intIn = (v, lo, hi, d) => Number.isInteger(v) && v >= lo && v <= hi ? v : d;
  const oneOf = (v, list, d) => list.includes(v) ? v : d;
  // league settings from anything saved: a valid value is kept, an invalid one becomes the default
  function normalize(s) {
    s = s || {};
    const o = {
      teams: intIn(s.teams, 4, 20, LEAGUE_DEF.teams), roster: intIn(s.roster, 8, 25, LEAGUE_DEF.roster),
      scoring: oneOf(s.scoring, ['roto', 'h2h', 'most', 'points'], LEAGUE_DEF.scoring), cats: oneOf(s.cats, [8, 9], LEAGUE_DEF.cats),
      asb: oneOf(s.asb, ['merged', 'separate'], LEAGUE_DEF.asb), poStart: intIn(s.poStart, 10, 25, LEAGUE_DEF.poStart),
      poFmt: oneOf(s.poFmt, ['1-1-1', '1-1-2', '1-2-2', '2-2-2'], LEAGUE_DEF.poFmt), ilSpots: intIn(s.ilSpots, 0, 4, LEAGUE_DEF.ilSpots),
      luSplit: typeof s.luSplit === 'boolean' ? s.luSplit : LEAGUE_DEF.luSplit, pointVals: {} };
    const pv = s.pointVals && typeof s.pointVals === 'object' ? s.pointVals : {};
    POINT_STATS.forEach(k => { o.pointVals[k] = typeof pv[k] === 'number' && isFinite(pv[k]) && Math.abs(pv[k]) <= PT_MAX ? pv[k] : 0; });
    Object.keys(LU_MAX).forEach(k => { o[k] = intIn(s[k], 0, LU_MAX[k], LEAGUE_DEF[k]); });
    if (Array.isArray(s.luFx) && s.luFx.length && s.luFx.every(x => typeof x === 'string' && slotElig(x).length)) o.luFx = s.luFx.slice();
    return o;
  }

  // same league settings: the lineup is compared as the slot list it produces, so a missing luFx equal to the dropdowns is no difference
  const sameLeague = (a, b) => LEAGUE_KEYS.every(k => k === 'luFx' || JSON.stringify(a[k]) === JSON.stringify(b[k])) && JSON.stringify(lineupSlots(a)) === JSON.stringify(lineupSlots(b));

  const parse = (get, key) => { try { return JSON.parse(get(key) || 'null'); } catch (e) { return null; } };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  const local = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ---- saved leagues (the Fantrax leagues this browser has connected) ----
  const readLeagues = get => { const l = parse(get, KEYS.leagues); return Array.isArray(l) ? l.filter(x => x && x.id) : []; };
  const savedLeagues = get => readLeagues(get).sort((a, b) => (b.used || 0) - (a.used || 0));
  function rememberLeague(get, set, id, name, myTeam) {
    const l = readLeagues(get), i = l.findIndex(x => x.id === id);
    // a name the user typed (custom) is kept when Fantrax sends its own on reconnect
    const keep = i >= 0 && l[i].custom;
    const entry = { id, name: keep ? l[i].name : name || (i >= 0 ? l[i].name : 'League ' + id), custom: keep || undefined, myTeam: myTeam != null ? myTeam : (i >= 0 ? l[i].myTeam : null), used: Date.now(), manual: i >= 0 && l[i].manual || undefined };
    if (i >= 0 && l[i].scoring) { entry.scoring = l[i].scoring; entry.pointVals = l[i].pointVals; }
    if (i >= 0) l[i] = entry; else l.push(entry);
    set(KEYS.leagues, JSON.stringify(l));
  }
  function renameLeague(get, set, id, name) {
    const l = readLeagues(get), i = l.findIndex(x => x.id === id); if (i < 0 || !name) return;
    l[i] = Object.assign({}, l[i], { name, custom: true }); set(KEYS.leagues, JSON.stringify(l));
  }
  function forgetLeague(get, set, id) {
    set(KEYS.leagues, JSON.stringify(readLeagues(get).filter(x => x.id !== id)));
    const m = readManual(get); if (id in m) { delete m[id]; set(KEYS.manual, JSON.stringify(m)); }
  }
  // scoring and point values belong to the league: kept on its saved record, restored on Load (a record from before this is category scoring)
  function leagueScoring(get, id) {
    const x = readLeagues(get).find(y => y.id === id); if (!x) return null;
    const n = normalize(Object.assign({}, LEAGUE_DEF, { scoring: x.scoring, pointVals: x.pointVals }));
    return { scoring: n.scoring, pointVals: n.pointVals };
  }
  function setLeagueScoring(get, set, id, settings) {
    const l = readLeagues(get), i = l.findIndex(x => x.id === id); if (i < 0) return;
    l[i] = Object.assign({}, l[i], { scoring: settings.scoring, pointVals: settings.pointVals }); set(KEYS.leagues, JSON.stringify(l));
  }
  const defaultTeam = (get, id) => { const x = readLeagues(get).find(y => y.id === id); return x && x.myTeam != null ? x.myTeam : null; };
  // the team a tab shows: its own remembered pick, else the Settings default, else the first team
  const pickTeam = (remembered, ids, fallback) => ids.includes(remembered) ? remembered : ids.includes(fallback) ? fallback : ids[0];

  // ---- the store ----
  // First visit after this change: build the store from the keys the pages used before (never written here; pages save it).
  function migrate(get) {
    const board = obj(parse(get, KEYS.board)) || {}, ins = obj(parse(get, KEYS.inseason)) || {}, saved = savedLeagues(get), fx = obj(board.fx);
    const settings = normalize(Object.assign({}, LEAGUE_DEF, obj(board.cfg) ? LEAGUE_KEYS.reduce((o, k) => { if (k in board.cfg) o[k] = board.cfg[k]; return o; }, {}) : {}));
    const id = (fx && fx.leagueId) || (typeof ins.leagueId === 'string' && saved.some(x => x.id === ins.leagueId) && ins.leagueId) || (saved[0] && saved[0].id) || null;
    let league = null;
    if (id) {
      const rec = saved.find(x => x.id === id), same = fx && fx.leagueId === id && Array.isArray(fx.order);
      league = { id, name: rec ? rec.name : 'League ' + id, teams: same ? fx.order.map(t => ({ id: t, name: (obj(fx.names) && fx.names[t]) || t })) : [], loadedAt: null };
    }
    return { settings, league, note: '', migrated: true };
  }
  function load(get) {
    const st = obj(parse(get, KEYS.settings));
    if (!st || !obj(st.settings)) return migrate(get);
    const lg = obj(st.league);
    return { settings: normalize(Object.assign({}, LEAGUE_DEF, st.settings)), league: lg && lg.id ? { id: lg.id, name: lg.name, teams: Array.isArray(lg.teams) ? lg.teams : [], loadedAt: lg.loadedAt == null ? null : lg.loadedAt } : null, note: typeof st.note === 'string' ? st.note : '', migrated: false };
  }
  const save = (set, st) => set(KEYS.settings, JSON.stringify({ v: 1, settings: st.settings, league: st.league || null, note: st.note || '' }));

  // ---- Fantrax league -> settings ----
  // Fantrax rosterInfo.positionConstraints → slot list: G2 / G3 are extra G rows, Flx / Util = U, a count per row (maxActive)
  function fxSlots(league) {
    const pc = league && league.rosterInfo && league.rosterInfo.positionConstraints; if (!pc || typeof pc !== 'object') return null;
    const out = [];
    for (const [k, v] of Object.entries(pc)) {
      const n = Math.max(0, Math.min(10, Math.round(+(v && v.maxActive) || 0)));
      const parts = k.toUpperCase().replace(/[\s+&-]+/g, '/').split('/').map(x => x.replace(/\d+$/, '')).flatMap(x => /^(FLX|FLEX|UTIL|UT|U)$/.test(x) ? ['U'] : SLOT_OK[x] ? [x] : (x.match(/PG|SG|SF|PF|G|F|C/g) || [x]));
      const sl = [...new Set(parts)].join('/');
      if (!sl.split('/').every(x => SLOT_OK[x])) continue;
      for (let i = 0; i < n; i++) out.push(sl);
    }
    const rank = sl => { const i = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C'].indexOf(sl); return i >= 0 ? i : sl === 'U' ? 9 : 8; };
    out.sort((x, y) => rank(x) - rank(y));
    return out.length ? out.slice(0, 20) : null;
  }
  const LU_COUNT = [['luC', x => x === 'C'], ['luG', x => ['PG', 'SG', 'G'].includes(x)], ['luF', x => ['SF', 'PF', 'F'].includes(x)], ['luGC', x => x === 'G/C'], ['luFC', x => x === 'F/C'], ['luU', x => x === 'U']];
  // What Load changes: team count, roster size and lineup slots (Fantrax's public league data has no scoring, categories, IL or
  // playoff start). Everything else in the settings stays as the user set it.
  function applyFantrax(settings, league) {
    const s = Object.assign({}, settings), changes = [], was = lineupSlots(settings);
    const n = Object.keys((league && league.teamInfo) || {}).length;
    if (n) { const t = Math.min(20, Math.max(4, n)); if (t !== s.teams) changes.push('Teams ' + s.teams + ' → ' + t); s.teams = t; }
    const ri = league && league.rosterInfo && +league.rosterInfo.maxTotalPlayers;
    if (ri) { const r = Math.min(25, Math.max(8, Math.round(ri))); if (r !== s.roster) changes.push('Roster size ' + s.roster + ' → ' + r); s.roster = r; }
    const sl = fxSlots(league);
    if (sl) {
      s.luFx = sl; s.luSplit = sl.some(x => ['PG', 'SG', 'SF', 'PF'].includes(x));
      LU_COUNT.forEach(f => { s[f[0]] = Math.min(LU_MAX[f[0]], sl.filter(f[1]).length); });
      if (was.join(' ') !== sl.join(' ')) changes.push('Lineup ' + sl.map(slotName).join(' '));
    }
    return { settings: s, changes, note: changes.length ? 'Updated from Fantrax: ' + changes.join(' · ') + '.' : 'Settings already match Fantrax.' };
  }
  // every team of the league with its record, by name
  function teamsOf(league, standings) {
    const rec = {}; (Array.isArray(standings) ? standings : []).forEach(r => { if (r && r.teamId) rec[r.teamId] = r.points; });
    return Object.values((league && league.teamInfo) || {}).filter(t => t && t.id).map(t => ({ id: t.id, name: t.name || t.id, record: rec[t.id] }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  }

  // ---- manual leagues (2026-10-26): a league typed or pasted in (Yahoo has no sync yet) ----
  // Stored whole in KEYS.manual; manualAnswers() turns one into the answers Fantrax would give, so the pages read it unchanged.
  const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const YAHOO_TEAM = { PHX: 'PHO', NOP: 'NOR', NO: 'NOR', GS: 'GSW', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
  const readManual = get => obj(parse(get, KEYS.manual)) || {};
  const manualLeague = (get, id) => { const m = readManual(get)[id]; return obj(m) ? m : null; };
  const newManualId = () => 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Yahoo lineup slots → the starting-slot list, bench count and IL count; tokens it does not know are handed back
  function parseSlotList(text) {
    const luFx = [], unknown = []; let bn = 0, il = 0;
    String(text || '').split(/[\s,]+/).filter(Boolean).forEach(w => {
      const x = w.toUpperCase();
      if (['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'G/C', 'F/C'].includes(x)) luFx.push(x);
      else if (['UTIL', 'UT', 'U'].includes(x)) luFx.push('U');
      else if (['BN', 'BE', 'BENCH'].includes(x)) bn++;
      else if (x === 'IL' || x === 'IL+') il++;
      else if (x !== 'NA') unknown.push(w);
    });
    return { luFx, bn, il, unknown };
  }
  // the Lineup dropdown values a slot list stands for (as Load sets them)
  function slotSettings(luFx) {
    const o = { luFx: luFx.slice(), luSplit: luFx.some(x => ['PG', 'SG', 'SF', 'PF'].includes(x)) };
    LU_COUNT.forEach(f => { o[f[0]] = Math.min(LU_MAX[f[0]], luFx.filter(f[1]).length); });
    return o;
  }
  // The text of a Yahoo "Starting Rosters" page (every team, slot by slot) → teams, the lineup, bench and IL counts.
  // Per team: the line before "Pos" is its name; a slot line is followed by the player's name and then "BKN - PG,SG".
  function parseYahooRosters(text) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.trim()), teams = [];
    const SLOT = /^(PG|SG|G|SF|PF|F|C|UTIL|BN|IL\+?|NA)$/i, INFO = /^([A-Z]{2,4}) - ([A-Z]{1,2}(?:,[A-Z]{1,2})*)$/;
    let prev = '', cur = null, luFx = [], bn = 0, il = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]; if (!ln) continue;
      if (ln === 'Pos' && lines[i + 1] === 'Player') { cur = { name: prev, players: [], starters: [], bn: 0, il: 0 }; teams.push(cur); i++; continue; }
      if (cur && SLOT.test(ln)) {
        let j = i + 1; while (j < lines.length && !lines[j]) j++;
        let k = j + 1, m = null; while (k < lines.length && k <= j + 4 && !(m = INFO.exec(lines[k]))) k++;
        if (!m) { prev = ln; continue; }
        const slot = ln.toUpperCase(), isIl = slot.startsWith('IL');
        cur.players.push({ n: lines[j], t: YAHOO_TEAM[m[1]] || m[1], p: m[2].replace(/,/g, '/'), il: isIl });
        if (isIl) cur.il++; else if (slot === 'BN') cur.bn++; else if (slot !== 'NA') cur.starters.push(slot === 'UTIL' ? 'U' : slot);
        i = k; continue;
      }
      prev = ln;
    }
    const kept = teams.filter(t => t.players.length);
    kept.forEach(t => { if (t.starters.length > luFx.length) luFx = t.starters; bn = Math.max(bn, t.bn); il = Math.max(il, t.il); });
    return { teams: kept.map(t => ({ name: t.name, players: t.players })), luFx, bn, il };
  }
  // a new manual league from parsed rosters (parseYahooRosters); `mine` is the index of your team
  function makeManual(name, parsed, mine, base) {
    const n = parsed.teams.length, roster = parsed.luFx.length + parsed.bn;
    const settings = normalize(Object.assign({}, LEAGUE_DEF, base, { teams: Math.min(20, Math.max(4, n)), roster: Math.min(25, Math.max(8, roster)), ilSpots: parsed.il }, parsed.luFx.length ? slotSettings(parsed.luFx) : {}));
    return { v: 1, id: newManualId(), name, manual: true, settings, myTeam: 't' + ((mine >= 0 && mine < n ? mine : 0) + 1), updatedAt: Date.now(),
      teams: parsed.teams.map((t, i) => ({ id: 't' + (i + 1), name: t.name, players: t.players.map(p => ({ n: p.n, t: p.t || '', p: p.p || '', il: !!p.il })) })) };
  }
  const manualPid = n => 'm:' + normName(n);
  // the circle method: every team meets every other once per N − 1 rounds (an odd league rests one team a round)
  function roundRobin(ids) {
    const a = ids.slice(), rounds = []; if (a.length % 2) a.push(null);
    for (let r = 0; r < a.length - 1; r++) {
      const pairs = []; for (let i = 0; i < a.length / 2; i++) if (a[i] && a[a.length - 1 - i]) pairs.push([a[i], a[a.length - 1 - i]]);
      rounds.push(pairs); a.splice(1, 0, a.pop());
    }
    return rounds;
  }
  // Without a Fantrax schedule: the season's weeks as scoring periods (days end at local midnight, UTC−6 as elsewhere) and the
  // regular season up to the playoff start as a round robin in team order. Estimated; the pages say so.
  function manualSchedule(ML, SCHED) {
    const plan = weekPlan(SCHED, ML.settings.asb), day = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const iso = ms => new Date(ms).toISOString().slice(0, 10), last = Math.max(1, Math.min(plan.count, ML.settings.poStart - 1));
    const scoringPeriods = plan.starts.slice(0, plan.count).map((s, i) => {
      const next = i + 1 < plan.count ? day(plan.starts[i + 1]) : day(s) + 7 * 864e5;
      return { number: i + 1, startDate: s + 'T00:00:00.0-0600', endDate: iso(next - 864e5) + 'T23:59:59.0-0600' };
    });
    const rounds = roundRobin(ML.teams.map(t => t.id)), nm = {}; ML.teams.forEach(t => { nm[t.id] = { name: t.name, id: t.id, shortName: t.name.slice(0, 3) }; });
    const matchups = [];
    for (let n = 1; n <= last; n++) matchups.push({ period: n, matchupList: rounds[(n - 1) % rounds.length].map(p => ({ away: nm[p[0]], home: nm[p[1]] })) });
    return { scoringPeriods, matchups, playoffs: { lastRegularSeasonPeriod: last } };
  }
  // the league as the Worker would answer: what=league, rosters, standings and the player list (never cached; see fx_cache)
  function manualAnswers(ML, SCHED) {
    const teamInfo = {}, rosters = {}, players = {};
    ML.teams.forEach(t => {
      teamInfo[t.id] = { division: 'Manual', name: t.name, id: t.id, shortName: t.name.slice(0, 3) };
      rosters[t.id] = { teamName: t.name, rosterItems: t.players.map(p => { players[manualPid(p.n)] = { name: p.n, team: p.t, position: p.p }; return { id: manualPid(p.n), position: p.p, status: p.il ? 'INJURED_RESERVE' : 'ACTIVE' }; }) };
    });
    const sch = SCHED ? manualSchedule(ML, SCHED) : { scoringPeriods: [], matchups: [] };
    return { league: Object.assign({ teamInfo, rosterInfo: { maxTotalPlayers: ML.settings.roster }, playerInfo: {} }, sch),
      rosters: { period: 1, rosters }, standings: [], players };
  }
  // for FxCache.create({ manual }): the answers of a saved manual league, null for anything else
  const manualHook = (get, sched) => (what, id) => { const ML = id ? manualLeague(get, id) : null; return ML ? manualAnswers(ML, sched ? sched() : null)[what] || null : null; };
  function saveManual(get, set, ML) {
    const m = readManual(get); m[ML.id] = ML; set(KEYS.manual, JSON.stringify(m));
    rememberLeague(get, set, ML.id, ML.name, ML.myTeam);
    const l = readLeagues(get), i = l.findIndex(x => x.id === ML.id);
    l[i] = Object.assign({}, l[i], { name: ML.name, manual: true }); set(KEYS.leagues, JSON.stringify(l));
  }
  const exportLeague = ML => JSON.stringify({ app: 'courtside-draft-kit', kind: 'league', version: 1, exportedAt: new Date().toISOString(), league: ML }, null, 1);
  // a league file → { league, exists, error }; the league is cleaned up (settings normalized, team ids t1.., a fresh id if it is not ours)
  function parseLeagueImport(text, existingIds) {
    const fail = error => ({ error, league: null, exists: false });
    let f; try { f = JSON.parse(text); } catch (e) { return fail('That file is not JSON.'); }
    if (!obj(f) || f.kind !== 'league') return fail('That file is not a Courtside league.');
    if (f.version !== 1) return fail('That league file is version ' + f.version + '; this page reads version 1.');
    const L = obj(f.league); if (!L || !Array.isArray(L.teams)) return fail('The file has no teams.');
    if (L.teams.length < 2 || L.teams.length > 20) return fail('A league needs 2 to 20 teams; this file has ' + L.teams.length + '.');
    const settings = normalize(Object.assign({}, LEAGUE_DEF, obj(L.settings))), seen = {}, names = {};
    const teams = [];
    for (let i = 0; i < L.teams.length; i++) {
      const t = obj(L.teams[i]), nm = t && typeof t.name === 'string' ? t.name.trim() : '';
      if (!nm) return fail('Team ' + (i + 1) + ' has no name.');
      if (names[nm.toLowerCase()]) return fail('Two teams are called "' + nm + '".');
      names[nm.toLowerCase()] = 1;
      const ps = Array.isArray(t.players) ? t.players.filter(p => obj(p) && typeof p.n === 'string' && p.n.trim()) : [];
      if (ps.length > settings.roster + settings.ilSpots) return fail(nm + ' has ' + ps.length + ' players; the roster holds ' + (settings.roster + settings.ilSpots) + '.');
      for (const p of ps) { const k = normName(p.n); if (seen[k]) return fail(p.n + ' is on both ' + seen[k] + ' and ' + nm + '.'); seen[k] = nm; }
      teams.push({ id: 't' + (i + 1), name: nm, players: ps.map(p => ({ n: p.n.trim(), t: String(p.t || ''), p: String(p.p || ''), il: !!p.il })), was: t.id });
    }
    const mine = teams.find(t => t.was === L.myTeam);
    const id = typeof L.id === 'string' && /^m-[a-z0-9]+$/.test(L.id) ? L.id : newManualId();
    const league = { v: 1, id, name: typeof L.name === 'string' && L.name.trim() ? L.name.trim() : 'Manual league', manual: true, settings, myTeam: mine ? mine.id : 't1', updatedAt: Date.now(),
      teams: teams.map(t => ({ id: t.id, name: t.name, players: t.players })) };
    return { error: null, league, exists: (existingIds || []).includes(id) };
  }
  const copyLeague = ML => Object.assign({}, ML, { id: newManualId(), name: ML.name + ' (2)', updatedAt: Date.now() });

  // ---- schedule (the season's weeks and the playoffs), as on the board ----
  const ASB_WEEK = 18;
  function weekPlan(SCHED, asb) {
    const n = SCHED.weeks.length, starts = SCHED.weeks.slice(), idx = [];
    for (let w = 0; w < n; w++) idx.push([w]);
    if (asb === 'merged') { idx.splice(ASB_WEEK - 1, 2, [ASB_WEEK - 1, ASB_WEEK]); starts.splice(ASB_WEEK, 1); }
    return { idx, starts, count: idx.length };
  }
  function playoffRounds(SCHED, s) {
    const plan = weekPlan(SCHED, s.asb), lens = s.poFmt.split('-').map(Number), rounds = [];
    let w = s.poStart;
    for (const L of lens) { const ws = []; for (let i = 0; i < L; i++, w++) if (w <= plan.count) ws.push(w); rounds.push(ws); }
    return { plan, rounds, fits: w - 1 <= plan.count };
  }
  const clampPoStart = (s, SCHED) => Object.assign({}, s, { poStart: Math.max(10, Math.min(weekPlan(SCHED, s.asb).count, s.poStart)) });
  // switching the All-Star break shifts the playoff start by the merged week
  const withAsb = (s, asb) => Object.assign({}, s, { asb, poStart: s.poStart + (asb === s.asb ? 0 : asb === 'merged' ? -1 : 1) });

  // ---- a league's draft -> picks for the Draft board ----
  function fxDraftPlan(draft, teams, roster, league) {
    const d = draft || {}, order = d.draftOrder && d.draftOrder.length ? d.draftOrder : Object.keys((league && league.teamInfo) || {}), N = order.length;
    if (!N) return { order, items: [], skipped: 0, error: 'This league has no teams or draft order yet.' };
    if (N !== teams) return { order, items: [], skipped: 0, error: 'Settings say ' + teams + ' teams; this league\'s draft has ' + N + '. Load the league again in Settings.' };
    const items = []; let skipped = 0;
    for (const p of (d.draftPicks || []).filter(x => x && x.round)) {
      const k = p.pickInRound ? (p.round - 1) * N + (p.pickInRound - 1) : p.pick - 1;
      if (!(k >= 0 && k < teams * roster)) { skipped++; continue; }
      items.push({ k, t: order.indexOf(p.teamId), fid: p.playerId || null });
    }
    return { order, items, skipped, error: null };
  }

  const isPoints = s => !!s && s.scoring === 'points';
  // a saved draft's league keys over the defaults; the point values stay the league's
  const draftSettings = (current, cfg) => normalize(Object.assign({}, LEAGUE_DEF, LEAGUE_KEYS.reduce((o, k) => { if (cfg && k in cfg) o[k] = cfg[k]; return o; }, {}), { pointVals: current && current.pointVals }));
  const POINTS_NOTE_HTML = 'Points leagues aren\'t supported on this tab yet. Scoring is set to points in <a href="settings.html">Settings</a>. Rankings and Team work in points leagues.';
  const NO_LEAGUE_HTML = 'Load a league in <a href="settings.html">Settings</a> to use this tab.';
  const api = { leagueScoring, setLeagueScoring, KEYS, LEAGUE_DEF, LEAGUE_KEYS, LU_MAX, SLOT_OK, slotElig, slotName, lineupSlots, sameLeague, normalize, load, save, local, POINT_STATS, POINT_LABELS, PT_MAX, isPoints, draftSettings, POINTS_NOTE_HTML,
    savedLeagues, rememberLeague, renameLeague, forgetLeague, defaultTeam, pickTeam, NO_LEAGUE_HTML,
    manualLeague, saveManual, manualHook, parseSlotList, slotSettings, parseYahooRosters, makeManual, manualAnswers, exportLeague, parseLeagueImport, copyLeague,
    fxSlots, applyFantrax, teamsOf, weekPlan, playoffRounds, clampPoStart, withAsb, fxDraftPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LeagueStore = api;
})(this);
