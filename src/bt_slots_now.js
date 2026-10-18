// Do lineup slots bind with the current board (arm 23 settings, real projections, the user's format)? 2026-10-18 re-check.
process.chdir('/root/FantasyBBall/src');
const DATA = require('/root/FantasyBBall/src/bt_data.json'), FIT = require('/root/FantasyBBall/src/games_fit.json'), POS = require('/root/FantasyBBall/src/bt_pos.json');
const season = process.argv[2]; const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
const { draft } = require('/root/FantasyBBall/src/backtest.js'); const { scoreLeague } = require('/root/FantasyBBall/src/stream_sim.js');
const SLOTS = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'U', 'U'];
const world = { '2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm' }[season];
const base = { puntMode: 'off', basis: 'total', missW: 1, ilSpots: 3, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'light', order: '3rr', scoring: 'h2h', field: 'average',
  slideEngine: false, slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 }, realAdp: true, proj: world, oppProj: world };
const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
let all = [0, 0], me = [0, 0], worst = 0, dr = [];
for (const slot of [1, 7, 14]) for (let seed = 145; seed <= 148; seed++) {
  const ro = draft(season, slot, seed, base, OPP);
  const a = scoreLeague(season, ro, { seed, target: true, il: 3 }), b = scoreLeague(season, ro, { seed, target: true, il: 3, slots: SLOTS, pos: POS });
  for (let t = 0; t < 14; t++) { all[0] += a.played[t]; all[1] += b.played[t]; worst = Math.max(worst, 1 - b.played[t] / a.played[t]); }
  me[0] += a.played[slot - 1]; me[1] += b.played[slot - 1]; dr.push(100 * (b.rates[slot - 1] - a.rates[slot - 1]));
}
console.log(season, 'games lost: all teams', (100 * (1 - all[1] / all[0])).toFixed(2) + '%', '| board', (100 * (1 - me[1] / me[0])).toFixed(2) + '%', '| worst team', (100 * worst).toFixed(1) + '%', '| board matchup change', (dr.reduce((x, y) => x + y, 0) / dr.length).toFixed(2), 'pts');
