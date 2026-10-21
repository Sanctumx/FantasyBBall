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
    const id = (fx && fx.leagueId) || (typeof ins.leagueId === 'string' && ins.leagueId) || (saved[0] && saved[0].id) || null;
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

  const NO_LEAGUE_HTML = 'Load a league in <a href="settings.html">Settings</a> to use this tab.';
  const api = { KEYS, LEAGUE_DEF, LEAGUE_KEYS, LU_MAX, SLOT_OK, slotElig, slotName, lineupSlots, normalize, load, save, local,
    savedLeagues, rememberLeague, renameLeague, forgetLeague, defaultTeam, pickTeam, NO_LEAGUE_HTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LeagueStore = api;
})(this);
