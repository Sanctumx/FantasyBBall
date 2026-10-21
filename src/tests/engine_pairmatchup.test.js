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

// ---------- known so-far totals (opts.known = [teamA, teamB]) ----------
const K0 = () => ({ fgm: 0, fga: 0, ftm: 0, fta: 0, tpm: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 });
const K = o => Object.assign(K0(), o);

test('known totals of zero change nothing', () => {
  const A = roster(0), B = roster(20);
  assert.deepStrictEqual(E.pairMatchup(A, B, { known: [K0(), K0()] }), E.pairMatchup(A, B));
});

test('a fully known week gives exactly 0, 0.5 or 1', () => {
  const kA = K({ fgm: 40, fga: 80, ftm: 20, fta: 30, tpm: 10, pts: 200, reb: 60, ast: 40, stl: 10, blk: 5, to: 20 });
  const kB = K({ fgm: 40.004, fga: 80, ftm: 15, fta: 30, tpm: 10, pts: 190, reb: 60, ast: 45, stl: 8, blk: 5, to: 25 });
  const r = E.pairMatchup([], [], { known: [kA, kB] });
  // FG% A below B by 5e-5 -> 0; FT% 1; 3PM tie .5; PTS 1; REB tie .5; AST 0; STL 1; BLK tie .5; TO fewer wins -> 1
  assert.deepStrictEqual(r.cat, [0, 1, 0.5, 1, 0.5, 0, 1, 0.5, 1]);
  assert.ok(Math.abs(r.match - 1) < 1e-8);   // 4 wins, 2 losses, 3 ties (quadrature weights sum to 1 within 1e-9)
});

test('a fully known 7-2 week is a certain matchup win', () => {
  const kA = K({ fgm: 41, fga: 80, ftm: 20, fta: 30, tpm: 11, pts: 200, reb: 61, ast: 40, stl: 10, blk: 6, to: 20 });
  const kB = K({ fgm: 40, fga: 80, ftm: 15, fta: 30, tpm: 10, pts: 190, reb: 60, ast: 45, stl: 11, blk: 5, to: 25 });
  const r = E.pairMatchup([], [], { known: [kA, kB] });
  assert.deepStrictEqual(r.cat, [1, 1, 1, 1, 1, 0, 0, 1, 1]);
  assert.ok(Math.abs(r.match - 1) < 1e-8);
});

test('a known points lead raises the points chance; a known turnover excess lowers the turnover chance', () => {
  const A = roster(0), B = roster(0), base = E.pairMatchup(A, B, { known: [K0(), K0()] });
  const up = E.pairMatchup(A, B, { known: [K({ pts: 30, to: 8 }), K0()] });
  assert.ok(up.cat[3] > base.cat[3] + 0.05);
  assert.ok(up.cat[8] < base.cat[8] - 0.05);
});

test('known makes and attempts join the percentage: mean and scale', () => {
  const A = [{ p: line({ fga: 10, fgp: 0.5 }), games: 2 }], B = roster(0);
  const r = E.pairMatchup(A, B, { known: [K({ fgm: 30, fga: 40 }), K0()] });
  assert.ok(Math.abs(r.mu[0][0] - (30 + 10) / (40 + 20)) < 1e-12);
  // same mean over many more known attempts is more certain
  const few = E.pairMatchup(A, B, { known: [K({ fgm: 3, fga: 4 }), K0()] }), many = E.pairMatchup(A, B, { known: [K({ fgm: 300, fga: 400 }), K0()] });
  assert.ok(many.cat[0] > few.cat[0]);
});

test('with known totals A over B and B over A still sum to 1', () => {
  const A = roster(0), B = roster(20), kA = K({ pts: 25, fgm: 20, fga: 50, to: 6 }), kB = K({ pts: 40, fgm: 22, fga: 45, to: 3 });
  const ab = E.pairMatchup(A, B, { known: [kA, kB] }), ba = E.pairMatchup(B, A, { known: [kB, kA] });
  assert.ok(Math.abs(ab.match + ba.match - 1) < 1e-9);
  for (let c = 0; c < 9; c++) assert.ok(Math.abs(ab.cat[c] + ba.cat[c] - 1) < 1e-9, 'category ' + c);
});

// Pinned outputs (2026-10-21), taken before pairTeam read per-game variance directly: the refactor must not move them.
test('pinned: match and category chances for fixed rosters', () => {
  const K = { fgm: 50, fga: 100, ftm: 30, fta: 40, tpm: 20, pts: 200, reb: 80, ast: 50, stl: 10, blk: 8, to: 25 };
  const g = (f, games, gVar) => roster(f, games).map(e => (gVar ? Object.assign(e, { gVar }) : e));
  const cases = [
    [E.pairMatchup(g(0, GPW), g(20, GPW)), 0.9027538202673898, [0.8600165337100699, 0.17212909512685737, 0.36014855031189674, 0.922105638183381, 0.9505797851586295, 0.8156063635439517, 0.8280199260938866, 0.8837761674880944, 0.24007073584910316]],
    [E.pairMatchup(g(0, 2, 1.87 * 0.6), g(20, 2, 1.87 * 0.6), { known: [K, K] }), 0.7773766296854765, [0.7903616347268934, 0.2643316537412148, 0.4089863159691628, 0.7935052199244379, 0.8358475096023001, 0.7036331460567212, 0.7404087644058901, 0.7892897963570975, 0.3282115848515674]],
    [E.pairMatchup(g(5, 3), g(30, 2), { cats: 8, projErr: false }), 0.9970808520443767, [0.5476901441489197, 0.5279484380053852, 0.9785160220314796, 0.9996913902281157, 0.986359105083596, 0.9999406852879629, 0.9715172589656685, 0.8410462964421621, null]],
  ];
  cases.forEach(([r, match, cat], i) => {
    assert.ok(Math.abs(r.match - match) < 1e-12, 'match ' + i);
    cat.forEach((x, c) => { if (x == null) assert.strictEqual(r.cat[c], null); else assert.ok(Math.abs(r.cat[c] - x) < 1e-12, 'case ' + i + ' cat ' + c); });
  });
});
