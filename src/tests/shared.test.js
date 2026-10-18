// Helpers shared by the Draft Kit and the League page (2026-10-18)
const test = require('node:test'), assert = require('node:assert');
const Shared = require('../shared.js'), E = require('../engine.js'), PLAYERS = require('../players.json');
const P = E.prepPlayers(PLAYERS); P.forEach(p => { p.key = Shared.norm(p.n); });

test('findListed maps Fantrax spellings to the projected player', () => {
  const n = s => (Shared.findListed(P, s, '') || {}).n || null;
  assert.strictEqual(n('Alex Sarr'), 'Alexandre Sarr');
  assert.strictEqual(n('Cameron Johnson'), 'Cam Johnson');
  assert.strictEqual(n('Herbert Jones'), 'Herb Jones');
  assert.strictEqual(n('Luguentz Dort'), 'Lu Dort');
  assert.strictEqual(n('Nikola Jokic'), 'Nikola Jokic');
  assert.strictEqual(n('Real Nobody'), null);
});

test('findListed skips players added as extras', () => {
  const Q = P.concat([Object.assign({}, P[0], { id: P.length, unlisted: true, n: 'Real Nobody', key: 'real nobody' })]);
  assert.strictEqual(Shared.findListed(Q, 'Real Nobody', ''), null);
});

test('projOf average takes FG% from averaged makes over averaged attempts', () => {
  const raw = PLAYERS.find(p => p.hs), o = Shared.projOf(raw, 'avg'), h = raw.hs;
  assert.ok(Math.abs(o.fga - (raw.fga + h.fga) / 2) < 1e-12);
  assert.ok(Math.abs(o.fgp - (raw.fgp * raw.fga + h.fgp * h.fga) / 2 / o.fga) < 1e-12);
  assert.strictEqual(Shared.projOf(raw, 'bbm'), raw);
  assert.strictEqual(Shared.projOf(raw, 'hs'), h);
});

test('toolbar links Draft Kit and League and marks the current page', () => {
  const h = Shared.TOOLBAR_HTML('league');
  assert.match(h, /Draft Kit/);
  assert.match(h, /href="league.html"[^>]*aria-current="page"/);
  assert.doesNotMatch(Shared.TOOLBAR_HTML('kit'), /href="league.html"[^>]*aria-current/);
  assert.ok(typeof Shared.TOOLBAR_CSS === 'string' && Shared.TOOLBAR_CSS.length > 0);
});
