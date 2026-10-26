// Engine.entryVec (2026-10-26): the category vector and projection variance of one stat line at g games, exactly as buildContext
// gives them to a pool player (IL fill off). The Team tab builds its team entries from it.
const test = require('node:test'), assert = require('node:assert');
const Eng = require('../engine.js'), R = require('../rankings_core.js'), PLAYERS = require('../players.json');

const rows = R.projSource(PLAYERS, 'avg').filter(r => r.g > 0).slice(0, 220);
const cfg = R.cfgFor({ teams: 14, roster: 12, ilSpots: 0 });
const P = Eng.prepPlayers(rows.map((r, i) => Object.assign({}, r.line, { g: r.g, ftx: i + 1 })));
const ctx = Eng.buildContext(P, cfg);

test('entryVec equals the pool player vector and projection variance with IL fill off', () => {
  [0, 5, 40, 150].forEach(i => {
    const e = Eng.entryVec(rows[i].line, ctx, rows[i].g);
    for (let c = 0; c < Eng.NC; c++) {
      assert.ok(Math.abs(e.x[c] - P[i].x[c]) < 1e-9, i + ' x ' + c);
      assert.ok(Math.abs(e.pv[c] - P[i].pv[c]) < 1e-9, i + ' pv ' + c);
    }
  });
});

test('entryVec: counting stats are linear in games, projection variance is quadratic', () => {
  const l = rows[3].line, a = Eng.entryVec(l, ctx, 20), b = Eng.entryVec(l, ctx, 40);
  for (let c = 0; c < Eng.NC; c++) {
    assert.ok(Math.abs(b.x[c] - 2 * a.x[c]) < 1e-9);
    assert.ok(Math.abs(b.pv[c] - 4 * a.pv[c]) < 1e-9);
  }
});
