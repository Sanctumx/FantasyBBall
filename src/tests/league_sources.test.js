// League page sources: the Draft Kit's current draft, saved drafts, saved Fantrax leagues (2026-10-18)
const test = require('node:test'), assert = require('node:assert');
const L = require('../league_core.js'), PLAYERS = require('../players.json');

const store = data => ({ getItem: k => (k in data ? data[k] : null) });
const board = { cfg: { teams: 12, roster: 13, slot: 4, order: 'snake', cats: 9, scoring: 'h2h' }, picks: [0, 1, 2].concat(new Array(153).fill(null)), owner: [], extra: [],
  fx: { leagueId: 'abc123', order: ['a', 'b'], names: { a: 'Alpha', b: 'Beta' } } };
const saved = [{ name: 'Mock 1', savedAt: 1, cfg: { teams: 14, roster: 12, slot: 1 }, picks: [5, 6], extra: [] },
  { name: 'Mock 2', savedAt: 2, cfg: { teams: 10, roster: 13, slot: 7 }, picks: [7], extra: [] }];
const leagues = [{ id: 'abc123', name: 'My Home League', myTeam: 'b', used: 3 }];
const full = store({ 'courtside-board-v1': JSON.stringify(board), 'courtside-saved-drafts-v1': JSON.stringify(saved), 'courtside-leagues-v1': JSON.stringify(leagues) });

test('lists the current draft, saved drafts (newest first) and saved leagues', () => {
  const s = L.listSources(full);
  assert.deepStrictEqual(s.map(x => x.id), ['board', 'saved:Mock 2', 'saved:Mock 1', 'fx:abc123']);
  assert.deepStrictEqual(s.map(x => x.kind), ['board', 'saved', 'saved', 'fantrax']);
  assert.strictEqual(s[3].label, 'My Home League');
});

test('no current draft entry when the board has no picks; empty store gives no sources', () => {
  const b2 = Object.assign({}, board, { picks: new Array(156).fill(null) });
  assert.ok(!L.listSources(store({ 'courtside-board-v1': JSON.stringify(b2) })).some(x => x.id === 'board'));
  assert.deepStrictEqual(L.listSources(store({})), []);
  assert.deepStrictEqual(L.listSources(store({ 'courtside-saved-drafts-v1': 'not json' })), []);
});

test('a saved draft keeps its league settings and fills the rest with defaults', () => {
  const s = L.sourceFromStore(full, 'saved:Mock 2');
  assert.strictEqual(s.cfg.teams, 10); assert.strictEqual(s.cfg.roster, 13); assert.strictEqual(s.cfg.slot, 7);
  assert.strictEqual(s.cfg.scoring, 'h2h'); assert.strictEqual(s.cfg.cats, 9);
  assert.deepStrictEqual(s.picks, [7]);
});

test('the current draft takes Fantrax team names when connected', () => {
  const s = L.sourceFromStore(full, 'board');
  assert.strictEqual(s.cfg.teams, 12); assert.strictEqual(s.names[0], 'Alpha'); assert.strictEqual(s.names[1], 'Beta');
});

test('a Fantrax draft maps picks by name, adds unknown players, and names teams', () => {
  const order = Array.from({ length: 14 }, (_, i) => 't' + i);
  const league = { teamInfo: Object.fromEntries(order.map((t, i) => [t, { id: t, name: 'Team ' + String.fromCharCode(65 + i) }])) };
  const draft = { draftOrder: order, draftPicks: [{ round: 1, pick: 1, pickInRound: 1, teamId: 't0', playerId: 'p1' }, { round: 1, pick: 2, pickInRound: 2, teamId: 't1', playerId: 'p2' }, { round: 1, pick: 3, pickInRound: 3, teamId: 't5', playerId: 'p3' }] };
  const fxPlayers = { p1: { name: 'Sarr, Alex', team: 'WAS' }, p2: { name: 'Jokic, Nikola', team: 'DEN' }, p3: { name: 'Nobody, Real', team: 'XXX', position: 'PG' } };
  const s = L.sourceFromFantrax(league, draft, fxPlayers, PLAYERS, {}, 't1');
  assert.strictEqual(s.cfg.teams, 14); assert.strictEqual(s.cfg.slot, 2);
  assert.strictEqual(PLAYERS[s.picks[0]].n, 'Alexandre Sarr'); assert.strictEqual(PLAYERS[s.picks[1]].n, 'Nikola Jokic');
  assert.strictEqual(s.picks[2], PLAYERS.length); assert.strictEqual(s.extra[0].n, 'Real Nobody');
  assert.strictEqual(s.owner[2], 5); assert.strictEqual(s.names[0], 'Team A');
  const R = L.computeLeague(PLAYERS, s, 'avg');
  assert.ok(R.rosters[5].some(p => p.n === 'Real Nobody'));
});

test('a Fantrax league without your team in it still computes when the board slot is past its team count', () => {
  const order = Array.from({ length: 10 }, (_, i) => 'u' + i);
  const draft = { draftOrder: order, draftPicks: [{ round: 1, pick: 1, pickInRound: 1, teamId: 'u0', playerId: 'p2' }] };
  const s = L.sourceFromFantrax({ teamInfo: {} }, draft, { p2: { name: 'Jokic, Nikola', team: 'DEN' } }, PLAYERS, { slot: 12 }, null);
  const R = L.computeLeague(PLAYERS, s, 'avg');
  assert.strictEqual(R.N, 10); assert.ok(R.me >= 0 && R.me < 10);
});

test('a Fantrax league with no teams or draft order is an error, not a made-up league', () => {
  assert.throws(() => L.sourceFromFantrax({ teamInfo: {} }, { draftOrder: [], draftPicks: [] }, {}, PLAYERS, {}, null), /no teams or draft order/);
});
