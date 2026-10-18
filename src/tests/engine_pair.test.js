// Per-category pair probability exposed by evaluate (League page, 2026-10-18)
const test = require('node:test'), assert = require('node:assert');
const E = require('../engine.js'), PLAYERS = require('../players.json');

const CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, basis: 'total', ilSpots: 3, field: 'average', fieldZ: 'std',
  puntMode: 'off', puntLock: '', catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0 };
function fullDraft() {
  const P = E.prepPlayers(PLAYERS), ctx = E.buildContext(P, CFG);
  const order = P.slice().sort((a, b) => (a.ftx || 999) - (b.ftx || 999)).map(p => p.id);
  const picks = order.slice(0, 168);
  return { P, ctx, res: E.evaluate(P, ctx, CFG, { picks }) };
}

test('catProb matches myChance for your team', () => {
  const { res } = fullDraft(), me = res.teams[0];
  assert.strictEqual(typeof res.catProb, 'function');
  for (let c = 0; c < 9; c++) {
    let m = 0; res.teams.forEach(B => { if (B !== me) m += res.catProb(me, B, c) / 13; });
    assert.ok(Math.abs(m - res.myChance[c]) < 1e-12, 'category ' + c);
  }
});

test('catProb of A over B and B over A sum to 1', () => {
  const { res } = fullDraft(), [A, B] = [res.teams[2], res.teams[9]];
  for (let c = 0; c < 9; c++) assert.ok(Math.abs(res.catProb(A, B, c) + res.catProb(B, A, c) - 1) < 1e-9);
});
