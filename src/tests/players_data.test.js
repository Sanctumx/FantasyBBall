// players.json: BBM rows plus Hashtag-only rows (idea 126)
const test = require('node:test'), assert = require('node:assert');
const PLAYERS = require('../players.json'), Shared = require('../shared.js'), InPlayers = require('../inseason_players.js');
const hsOnly = PLAYERS.filter(p => p.src === 'hs'), bbm = PLAYERS.filter(p => p.src !== 'hs');
const TEAMS = new Set('ATL BKN BOS CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOR NYK OKC ORL PHI PHO POR SAC SAS TOR UTA WAS'.split(' '));

test('Hashtag-only players are added up to Hashtag rank 300', () => {
  assert.ok(hsOnly.length >= 60 && hsOnly.length <= 75, 'count ' + hsOnly.length);
  const mc = hsOnly.find(p => p.n === 'Jared McCain');
  assert.ok(mc, 'McCain present');
  assert.strictEqual(mc.t, 'OKC');
});

test('the 234 BBM rows are unchanged and come first', () => {
  assert.strictEqual(bbm.length, 234);
  assert.ok(PLAYERS.slice(0, 234).every(p => p.src !== 'hs'));
});

test('Hashtag-only rows: valid teams, unique names and ranks, hs equals the top-level line, rank after the BBM rows', () => {
  assert.ok(PLAYERS.every(p => TEAMS.has(p.t)), 'team codes');
  assert.strictEqual(new Set(PLAYERS.map(p => Shared.norm(p.n))).size, PLAYERS.length, 'duplicate names');
  assert.strictEqual(new Set(PLAYERS.map(p => p.rk)).size, PLAYERS.length, 'duplicate rk');
  const maxBbm = Math.max(...bbm.map(p => p.rk));
  hsOnly.forEach(p => {
    assert.ok(p.rk > maxBbm, p.n + ' rk');
    ['g', 'm', 'pts', 'tpm', 'reb', 'ast', 'stl', 'blk', 'fgp', 'fga', 'ftp', 'fta', 'to'].forEach(k => assert.strictEqual(p.hs[k], p[k], p.n + ' ' + k));
    assert.ok(/^[A-Z]{1,2}(\/[A-Z]{1,2})*$/.test(p.p), p.n + ' pos ' + p.p);
  });
});

test('average projection of a Hashtag-only player is its Hashtag line', () => {
  const raw = hsOnly[0], o = Shared.projOf(raw, 'avg');
  ['g', 'pts', 'ast', 'fga'].forEach(k => assert.ok(Math.abs(o[k] - raw.hs[k]) < 1e-9));
});

test('the waiver-level line ignores Hashtag-only players', () => {
  const projP = InPlayers.projLines(PLAYERS, 'avg'), wl = InPlayers.waiverLevel(projP);
  const bbmOnly = InPlayers.waiverLevel(InPlayers.projLines(bbm, 'avg'));
  assert.deepStrictEqual(wl, bbmOnly);
});
