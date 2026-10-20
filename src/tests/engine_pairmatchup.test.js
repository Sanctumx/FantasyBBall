// Engine.pairMatchup: two-roster win chances with known games (in-season tools, 2026-10-20)
const test = require('node:test'), assert = require('node:assert');
const E = require('../engine.js'), PLAYERS = require('../players.json');

const CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, basis: 'total', ilSpots: 0, field: 'average', fieldZ: 'std',
  puntMode: 'off', puntLock: '', catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0 };
const P = E.prepPlayers(PLAYERS);
const byAdp = P.slice().sort((a, b) => (a.ftx || 999) - (b.ftx || 999));
const GPW = 3.42;
// Roster of 12 from the ADP order, every player on `games` games.
const roster = (from, games = GPW) => byAdp.slice(from, from + 12).map(p => ({ p, games }));
const line = o => Object.assign({ fga: 10, fgp: 0.5, fta: 4, ftp: 0.8, tpm: 1.5, pts: 15, reb: 5, ast: 3, stl: 1, blk: 0.5, to: 2 }, o);

test('identical rosters are even', () => {
  const r = E.pairMatchup(roster(0), roster(0));
  // Engine.Phi is accurate to about 5e-10 (Phi(0) = 0.5000000005), hence 1e-8.
  assert.ok(Math.abs(r.match - 0.5) < 1e-8);
  r.cat.forEach(x => assert.ok(Math.abs(x - 0.5) < 1e-8));
});

test('A over B and B over A sum to 1', () => {
  const A = roster(0), B = roster(20);
  const ab = E.pairMatchup(A, B), ba = E.pairMatchup(B, A);
  assert.ok(Math.abs(ab.match + ba.match - 1) < 1e-9);
  for (let c = 0; c < 9; c++) assert.ok(Math.abs(ab.cat[c] + ba.cat[c] - 1) < 1e-9, 'category ' + c);
});

test('FG% sign follows the percentages, not volume', () => {
  const A = [{ p: line({ fgp: 0.50, fga: 20 }), games: 3 }], B = [{ p: line({ fgp: 0.48, fga: 5 }), games: 3 }];
  assert.ok(E.pairMatchup(A, B).cat[0] > 0.5);
});

test('a zero-games entry changes nothing', () => {
  const A = roster(0), B = roster(20), a = E.pairMatchup(A, B);
  const b = E.pairMatchup(A.concat([{ p: byAdp[150], games: 0 }]), B);
  const c = E.pairMatchup(A.concat([{ p: byAdp[150], games: 0, gVar: 1.87 }]), B);
  [b, c].forEach(r => {
    assert.ok(Math.abs(r.match - a.match) < 1e-12);
    r.cat.forEach((x, i) => assert.ok(Math.abs(x - a.cat[i]) < 1e-12));
  });
});

test('more games for a scorer raise PTS and lower TO chances', () => {
  const base = roster(0), B = roster(20);
  const more = base.map((e, i) => i === 0 ? { p: e.p, games: 5 } : e);
  const r0 = E.pairMatchup(base, B), r1 = E.pairMatchup(more, B);
  assert.ok(r1.cat[3] > r0.cat[3], 'PTS');
  assert.ok(r1.cat[8] < r0.cat[8], 'TO');
});

test('8-cat ignores turnovers', () => {
  const A = [{ p: line(), games: 3 }, { p: line({ pts: 20 }), games: 3 }], B = [{ p: line(), games: 3 }, { p: line({ pts: 20 }), games: 3 }];
  const A2 = [{ p: line({ to: 1 }), games: 3 }, { p: line({ pts: 20, to: 1 }), games: 3 }];
  const r9 = E.pairMatchup(A2, B), r8 = E.pairMatchup(A2, B, { cats: 8 });
  assert.ok(r9.match > 0.5);
  assert.ok(Math.abs(r8.match - 0.5) < 1e-8);
  assert.strictEqual(r8.cat[8], null);
  assert.strictEqual(r9.cat[8] > 0.5, true);
  assert.ok(Math.abs(E.pairMatchup(A, B, { cats: 8 }).match - 0.5) < 1e-8);
});

test('projErr:false gives more extreme chances', () => {
  const A = roster(0), B = roster(20);
  const withErr = E.pairMatchup(A, B), without = E.pairMatchup(A, B, { projErr: false });
  assert.ok(without.match > withErr.match);
  for (let c = 0; c < 9; c++) assert.ok(Math.abs(without.cat[c] - 0.5) >= Math.abs(withErr.cat[c] - 0.5) - 1e-12, 'category ' + c);
});

test('mu reports team percentages and totals', () => {
  const A = roster(0), B = roster(20), r = E.pairMatchup(A, B);
  let fga = 0, fgm = 0, to = 0, pts = 0;
  A.forEach(e => { fga += e.p.fga * e.games; fgm += e.p.fgp * e.p.fga * e.games; to += e.p.to * e.games; pts += e.p.pts * e.games; });
  assert.ok(Math.abs(r.mu[0][0] - fgm / fga) < 1e-12);
  assert.ok(Math.abs(r.mu[0][8] - to) < 1e-9);
  assert.ok(Math.abs(r.mu[0][3] - pts) < 1e-9);
  assert.strictEqual(r.mu[0].length, 9);
  assert.strictEqual(r.mu[1].length, 9);
});

test('does not modify the player lines', () => {
  const A = roster(0), B = roster(20), before = JSON.stringify([A, B]);
  E.pairMatchup(A, B);
  assert.strictEqual(JSON.stringify([A, B]), before);
});

test('close to the draft engine on a typical week', () => {
  const order = byAdp.map(p => p.id), ctx = E.buildContext(P, CFG);
  const res = E.evaluate(P, ctx, CFG, { picks: order.slice(0, 168) });
  // gVar 1.87 on every entry is the draft engine's own games model, so the comparison is like for like.
  const R = T => T.roster.map(r => ({ p: r.p, games: r.p.g * GPW / 82, gVar: 1.87 }));
  for (const [i, j] of [[0, 5], [1, 12], [6, 7]]) {
    const A = res.teams[i], B = res.teams[j], pm = E.pairMatchup(R(A), R(B));
    for (let c = 0; c < 9; c++) assert.ok(Math.abs(pm.cat[c] - res.catProb(A, B, c)) < 0.05, `teams ${i}v${j} category ${c}`);
    assert.ok(Math.abs(pm.match - res.pairProb(A, B)) < 0.03, `teams ${i}v${j} match`);
  }
});
