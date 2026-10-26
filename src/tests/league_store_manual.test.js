const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const S = require('../league_store.js');
const YAHOO = fs.readFileSync(path.join(__dirname, 'fixtures', 'yahoo_starting_rosters.txt'), 'utf8');
const mem = () => { const m = {}; return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, m }; };

test('parseSlotList maps Yahoo slots to the lineup, bench and IL', () => {
  const r = S.parseSlotList('PG SG G SF PF F C C Util Util BN BN BN IL IL');
  assert.deepStrictEqual(r.luFx, ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'U', 'U']);
  assert.deepStrictEqual([r.bn, r.il, r.unknown], [3, 2, []]);
  const s = S.slotSettings(r.luFx);
  assert.deepStrictEqual([s.luC, s.luG, s.luF, s.luU, s.luSplit], [2, 3, 3, 2, true]);
  assert.deepStrictEqual(S.parseSlotList('PG, G/C UT IL+ NA XX').luFx, ['PG', 'G/C', 'U']);
  assert.deepStrictEqual(S.parseSlotList('PG, G/C UT IL+ NA XX').unknown, ['XX']);
});

test('parseYahooRosters reads every team of the Starting Rosters page', () => {
  const r = S.parseYahooRosters(YAHOO);
  assert.deepStrictEqual(r.teams.map(t => t.name), ['Los Laguneros', 'Droppin’Dimes']);
  assert.deepStrictEqual(r.teams.map(t => t.players.length), [15, 4]);
  assert.deepStrictEqual(r.teams[0].players[0], { n: 'Egor Dëmin', t: 'BKN', p: 'PG/SG', il: false });
  assert.strictEqual(r.teams[0].players[9].n, 'Day\'Ron Sharpe');
  assert.deepStrictEqual(r.teams[0].players.filter(p => p.il).map(p => p.n), ['AJ Dybantsa', 'Paolo Banchero']);
  assert.deepStrictEqual(r.luFx, ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'U', 'U']);
  assert.deepStrictEqual([r.bn, r.il], [3, 2]);
  assert.strictEqual(S.parseYahooRosters('nothing here').teams.length, 0);
});

test('Yahoo team codes become the projection codes', () => {
  const r = S.parseYahooRosters('T \n\nPos\nPlayer\nPG\t\nA B\nA BNote\nPHX - PG\n1\nSG\t\nC D\nC DNote\nNOP - SG\n1\nG\t\nE F\nE FNote\nUTAH - PG\n1\n');
  assert.deepStrictEqual(r.teams[0].players.map(p => p.t), ['PHO', 'NOR', 'UTA']);
});

test('makeManual builds a league from the page and manualAnswers speaks Fantrax', () => {
  const ML = S.makeManual('Yahoo 50157', S.parseYahooRosters(YAHOO), 0);
  assert.ok(/^m-/.test(ML.id)); assert.strictEqual(ML.manual, true);
  assert.deepStrictEqual([ML.settings.teams, ML.settings.roster, ML.settings.ilSpots], [4, 13, 2]);   // teams floor at 4
  assert.deepStrictEqual(ML.teams.map(t => t.id), ['t1', 't2']);
  const a = S.manualAnswers(ML);
  assert.deepStrictEqual(Object.keys(a.league.teamInfo), ['t1', 't2']);
  assert.strictEqual(a.league.teamInfo.t1.name, 'Los Laguneros');
  assert.strictEqual(a.league.rosterInfo.maxTotalPlayers, 13);
  assert.strictEqual(a.league.rosterInfo.positionConstraints, undefined);
  const items = a.rosters.rosters.t1.rosterItems;
  assert.strictEqual(items.length, 15);
  assert.deepStrictEqual(items[0], { id: 'm:egor demin', position: 'PG/SG', status: 'ACTIVE' });
  assert.deepStrictEqual(items.filter(x => x.status === 'INJURED_RESERVE').map(x => x.id), ['m:aj dybantsa', 'm:paolo banchero']);
  assert.deepStrictEqual(a.standings, []);
  assert.deepStrictEqual(a.players['m:egor demin'], { name: 'Egor Dëmin', team: 'BKN', position: 'PG/SG' });
});

test('saved manual leagues: list, load, forget cascade', () => {
  const st = mem(), ML = S.makeManual('Yahoo', S.parseYahooRosters(YAHOO), 0);
  S.saveManual(st.get, st.set, ML);
  assert.strictEqual(S.manualLeague(st.get, ML.id).name, 'Yahoo');
  assert.strictEqual(S.manualLeague(st.get, 'nope'), null);
  const rec = S.savedLeagues(st.get).find(x => x.id === ML.id);
  assert.deepStrictEqual([rec.manual, rec.myTeam], [true, 't1']);
  S.saveManual(st.get, st.set, Object.assign({}, ML, { name: 'Yahoo 2' }));
  assert.strictEqual(S.savedLeagues(st.get).length, 1);
  assert.strictEqual(S.savedLeagues(st.get)[0].name, 'Yahoo 2');
  S.forgetLeague(st.get, st.set, ML.id);
  assert.strictEqual(S.manualLeague(st.get, ML.id), null);
  assert.strictEqual(S.savedLeagues(st.get).length, 0);
});

test('export and import round trip, with every check', () => {
  const ML = S.makeManual('Yahoo', S.parseYahooRosters(YAHOO), 0), file = S.exportLeague(ML);
  const ok = S.parseLeagueImport(file, [ML.id]);
  assert.strictEqual(ok.error, null); assert.deepStrictEqual(ok.league.teams, ML.teams); assert.strictEqual(ok.exists, true);
  assert.strictEqual(S.parseLeagueImport(file, []).exists, false);
  const bad = f => S.parseLeagueImport(JSON.stringify(f(JSON.parse(file))), []).error;
  assert.ok(S.parseLeagueImport('not json', []).error);
  assert.ok(bad(f => { f.kind = 'draft'; return f; }));
  assert.ok(bad(f => { f.version = 2; return f; }));
  assert.ok(bad(f => { f.league.teams[1].name = f.league.teams[0].name; return f; }));
  assert.ok(bad(f => { f.league.teams[1].players.push(f.league.teams[0].players[0]); return f; }));
  const foreign = JSON.parse(file); foreign.league.id = 'abc123'; assert.ok(/^m-/.test(S.parseLeagueImport(JSON.stringify(foreign), []).league.id));
  const copy = S.copyLeague(ML); assert.notStrictEqual(copy.id, ML.id); assert.strictEqual(copy.name, 'Yahoo (2)');
});

test('manualHook answers for a saved manual league only', () => {
  const st = mem(), ML = S.makeManual('Yahoo', S.parseYahooRosters(YAHOO), 0); S.saveManual(st.get, st.set, ML);
  const h = S.manualHook(st.get);
  assert.strictEqual(h('league', ML.id).teamInfo.t2.name, 'Droppin’Dimes');
  assert.ok(h('players', ML.id)['m:egor demin']); assert.deepStrictEqual(h('standings', ML.id), []);
  assert.strictEqual(h('league', 'abc123'), null); assert.strictEqual(h('players', undefined), null); assert.strictEqual(h('draft', ML.id), null);
});
test('changing the loaded manual league settings and team is kept with the league', () => {
  const st = mem(), ML = S.makeManual('Yahoo', S.parseYahooRosters(YAHOO), 0); S.saveManual(st.get, st.set, ML);
  S.saveManual(st.get, st.set, Object.assign({}, ML, { settings: S.normalize(Object.assign({}, ML.settings, { scoring: 'roto' })), myTeam: 't2' }));
  assert.strictEqual(S.manualLeague(st.get, ML.id).settings.scoring, 'roto');
  assert.strictEqual(S.defaultTeam(st.get, ML.id), 't2');
});

test('a manual league gets an estimated round-robin schedule from the season weeks', () => {
  const SCHED = require('../sched.json'), IL = require('../inseason_league.js');
  const ML = S.makeManual('Y', S.parseYahooRosters(YAHOO), 0); ML.teams = ['a', 'b', 'c', 'd'].map((n, i) => ({ id: 't' + (i + 1), name: n, players: [] }));
  const a = S.manualAnswers(ML, SCHED), L = IL.parseLeague(a.league), po = ML.settings.poStart;
  assert.strictEqual(L.periods.length, S.weekPlan(SCHED, ML.settings.asb).count);
  assert.deepStrictEqual([L.periods[0].n, L.lastRegular, a.league.playoffs.lastRegularSeasonPeriod], [1, po - 1, po - 1]);
  assert.ok(L.periods[0].start < L.periods[0].end && L.periods[0].end <= L.periods[1].start);
  assert.strictEqual(new Date(L.periods[0].start).toISOString().slice(0, 10), SCHED.weeks[0]);
  const seen = {};
  for (let n = 1; n <= po - 1; n++) {
    const ids = L.matchups[n].flat().sort(); assert.deepStrictEqual(ids, ['t1', 't2', 't3', 't4']);
    if (n <= 3) L.matchups[n].forEach(p => { seen[p.slice().sort().join('-')] = 1; });
    assert.strictEqual(IL.opponentOf(L, 't1', n) !== null, true);
  }
  assert.strictEqual(Object.keys(seen).length, 6);          // three rounds: everyone meets everyone once
  assert.strictEqual(a.league.matchups.length, po - 1);
  assert.deepStrictEqual(S.manualAnswers(ML).league.matchups, []);   // no schedule given: none
});
test('an odd number of teams rests one team each week', () => {
  const SCHED = require('../sched.json'), IL = require('../inseason_league.js');
  const ML = S.makeManual('Y', S.parseYahooRosters(YAHOO), 0); ML.teams = ['a', 'b', 'c'].map((n, i) => ({ id: 't' + (i + 1), name: n, players: [] }));
  const L = IL.parseLeague(S.manualAnswers(ML, SCHED).league);
  assert.ok(L.matchups[1].length === 1 && L.matchups[2].length === 1);
  assert.notDeepStrictEqual(L.matchups[1].flat().sort(), L.matchups[2].flat().sort());
});
