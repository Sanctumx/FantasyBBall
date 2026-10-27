// #141: cfg.playsRank scales a team's 11th and 12th best entries (by unweighted board value) by Plays % 98.5% / 96%.
const test = require('node:test'), assert = require('node:assert');
const E = require('../../engine.js'), Shared = require('../../shared.js'), PLAYERS = require('../fixtures/golden_players.json');

const CFG = { teams: 14, roster: 12, slot: 1, order: '3rr', scoring: 'h2h', cats: 9, basis: 'total', ilSpots: 3, field: 'average', fieldZ: 'std',
  puntMode: 'off', puntLock: '', catW: [1, 1, 1, 1, 1, 1, 1, 1, 0.5], adpSrc: 'ftx', scarZ: 'off', scarP: 'off', poBoost: 'off', zdrop: 0 };
const F = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.985, 0.96];
const setup = (k, extra) => {
  const P = E.prepPlayers(PLAYERS.map(r => Object.assign({}, r, Shared.projOf(r, 'avg'))));
  const byAdp = PLAYERS.map((p, i) => [p.ftx || 999, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const slot = E.teamAt(k, 14, '3rr'), cfg = Object.assign({}, CFG, { slot: slot + 1 }, extra);
  const ctx = E.buildContext(P, cfg);
  const picks = Array.from({ length: 168 }, (_, j) => j < k ? byAdp[j] : null);
  return { P, cfg, ctx, picks, evalWith: c => E.evaluate(P, ctx, c, { picks }) };
};
// independent reference: sort entries by val (stable), scale ranks 11 and 12
const ref = ents => {
  const s = ents.map((e, i) => [e, i]).sort((a, b) => (b[0].val - a[0].val) || (a[1] - b[1])).map(x => x[0]);
  const mu = new Array(9).fill(0), v = new Array(9).fill(0);
  s.forEach((e, r) => { const f = F[Math.min(r, 11)]; for (let c = 0; c < 9; c++) { mu[c] += f * e.x[c]; v[c] += f * f * e.v[c]; } });
  return { mu, v };
};

test('finished draft: each team is its top 10 plus 98.5% and 96% of the 11th and 12th', () => {
  const s = setup(168, { playsRank: true });
  const out = s.evalWith(s.cfg);
  out.teams.forEach(T => {
    const r = ref(T.roster.map(({ p }) => ({ val: p.boardRaw, x: p.x, v: p.pv })));
    for (let c = 0; c < 9; c++) { assert.ok(Math.abs(T.mu[c] - r.mu[c]) < 1e-9); assert.ok(Math.abs(T.v[c] - r.v[c]) < 1e-9); }
  });
});

test('flag on changes a 12-man roster forecast, a 10-man roster is not affected', () => {
  const a = setup(30), b = setup(30, { playsRank: true });
  const o1 = a.evalWith(a.cfg), o2 = b.evalWith(b.cfg);
  assert.notDeepStrictEqual(Array.from(o1.teams[0].mu), Array.from(o2.teams[0].mu));
  const c = setup(30, { roster: 10 }), d = setup(30, { roster: 10, playsRank: true });
  const p1 = c.evalWith(c.cfg), p2 = d.evalWith(d.cfg);
  p1.teams[3].mu.forEach((x, c) => assert.ok(Math.abs(x - p2.teams[3].mu[c]) < 1e-9 * Math.max(1, Math.abs(x))));
});

test('Gain: the difference between two candidates equals the scaled-team matchup difference', () => {
  const s = setup(29, { playsRank: true });
  const out = s.evalWith(s.cfg), me = s.cfg.slot - 1, T = out.teams[me], opps = out.teams.filter(t => t !== T);
  const ents = T.ents.filter(e => e.slot !== out.p1);
  assert.strictEqual(ents.length, 11);
  const pick = out.avail.filter((_, i) => i === 0 || i === 40 || i === 150);
  const gm = pick.map(p => p.gainM);
  const pm = pick.map(p => { const r = ref(ents.concat([{ val: p.boardRaw, x: p.x, v: p.pv }])); const t = { mu: Float64Array.from(r.mu), v: Float64Array.from(r.v) }; return opps.reduce((a, B) => a + out.pairProb(t, B), 0) / opps.length; });
  assert.ok(Math.abs((gm[0] - gm[2]) - (pm[0] - pm[2])) < 1e-9);
  assert.ok(Math.abs((gm[1] - gm[2]) - (pm[1] - pm[2])) < 1e-9);
});
