// The league every page shares (2026-10-20): league settings and the loaded Fantrax league live in one stored object that
// Settings writes and Draft, League, Matchup and Trade read. Also the per-league memory (saved leagues, your team) and the
// one-time migration from the keys the pages used before. Pure functions over get/set callbacks, so Node can test them.
(function (root) {
  'use strict';
  const KEYS = { settings: 'courtside-settings-v1', board: 'courtside-board-v1', leagues: 'courtside-leagues-v1', inseason: 'courtside-inseason-v1' };
  // league settings only; slot, order and draft field belong to a draft and stay on the Draft page
  const LEAGUE_DEF = { teams: 14, roster: 12, scoring: 'h2h', cats: 9, asb: 'merged', poStart: 18, poFmt: '2-2-2', ilSpots: 3, luSplit: true, luC: 2, luG: 3, luF: 3, luGC: 0, luFC: 0, luU: 2 };
  const LEAGUE_KEYS = Object.keys(LEAGUE_DEF).concat('luFx');
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
      scoring: oneOf(s.scoring, ['roto', 'h2h', 'most'], LEAGUE_DEF.scoring), cats: oneOf(s.cats, [8, 9], LEAGUE_DEF.cats),
      asb: oneOf(s.asb, ['merged', 'separate'], LEAGUE_DEF.asb), poStart: intIn(s.poStart, 10, 25, LEAGUE_DEF.poStart),
      poFmt: oneOf(s.poFmt, ['1-1-1', '1-1-2', '1-2-2', '2-2-2'], LEAGUE_DEF.poFmt), ilSpots: intIn(s.ilSpots, 0, 4, LEAGUE_DEF.ilSpots),
      luSplit: typeof s.luSplit === 'boolean' ? s.luSplit : LEAGUE_DEF.luSplit };
    Object.keys(LU_MAX).forEach(k => { o[k] = intIn(s[k], 0, LU_MAX[k], LEAGUE_DEF[k]); });
    if (Array.isArray(s.luFx) && s.luFx.length && s.luFx.every(x => typeof x === 'string' && slotElig(x).length)) o.luFx = s.luFx.slice();
    return o;
  }

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
    const entry = { id, name: keep ? l[i].name : name || (i >= 0 ? l[i].name : 'League ' + id), custom: keep || undefined, myTeam: myTeam != null ? myTeam : (i >= 0 ? l[i].myTeam : null), used: Date.now() };
    if (i >= 0) l[i] = entry; else l.push(entry);
    set(KEYS.leagues, JSON.stringify(l));
  }
  function renameLeague(get, set, id, name) {
    const l = readLeagues(get), i = l.findIndex(x => x.id === id); if (i < 0 || !name) return;
    l[i] = Object.assign({}, l[i], { name, custom: true }); set(KEYS.leagues, JSON.stringify(l));
  }
  const forgetLeague = (get, set, id) => set(KEYS.leagues, JSON.stringify(readLeagues(get).filter(x => x.id !== id)));
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

  const NO_LEAGUE_HTML = 'Load a league in <a href="settings.html">Settings</a> to use this tab.';
  const api = { KEYS, LEAGUE_DEF, LEAGUE_KEYS, LU_MAX, SLOT_OK, slotElig, slotName, lineupSlots, normalize, load, save, local,
    savedLeagues, rememberLeague, renameLeague, forgetLeague, defaultTeam, pickTeam, NO_LEAGUE_HTML,
    fxSlots, applyFantrax, teamsOf, weekPlan, playoffRounds, clampPoStart, withAsb, fxDraftPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LeagueStore = api;
})(this);
