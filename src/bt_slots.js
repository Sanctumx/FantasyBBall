// Do lineup slots bind? (2026-10-17) Board-drafted leagues scored with your slots (PG SG G SF PF F C C Util Util) vs any 10.
// Reports the share of player-games lost to slot conflicts for every team and for the board's team. Positions: bt_pos.json.
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js'); const POS = require('./bt_pos.json');
const SLOTS = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'U', 'U'];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const season = process.argv[2]; let all = [0, 0], me = [0, 0], dr = [];
for (const slot of [1, 7, 14]) for (let seed = 1; seed <= 4; seed++) {
  const ro = draft(season, slot, seed, base, { trueSd: 'v2' });
  const a = scoreLeague(season, ro, { seed, target: true }), b = scoreLeague(season, ro, { seed, target: true, slots: SLOTS, pos: POS });
  all[0] += a.played.reduce((x, y) => x + y, 0); all[1] += b.played.reduce((x, y) => x + y, 0);
  me[0] += a.played[slot - 1]; me[1] += b.played[slot - 1];
  dr.push(100 * (b.rates[slot - 1] - a.rates[slot - 1]));
  // per team loss spread
}
console.log(season, 'games lost to slots: all teams', (100 * (1 - all[1] / all[0])).toFixed(2) + '%', '| board team', (100 * (1 - me[1] / me[0])).toFixed(2) + '%',
  '| board win rate change', (dr.reduce((x, y) => x + y, 0) / dr.length).toFixed(2));
