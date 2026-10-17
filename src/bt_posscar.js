// Position wait cost (user's position scarcity, 2026-10-17): λ × (extra drop in the best player at a needed role from now
// to my next pick, vs all players). Scored with the user's lineup slots enforced (PG SG G SF PF F C C Util Util) so an empty
// or weak role costs games. Standard setup otherwise. Run: node bt_posscar.js <season> <s0> <s1>
const DATA = require('./bt_data.json'), POS = require('./bt_pos.json');
for (const s in DATA) DATA[s].players.forEach(p => { p.p = POS[p.pid] || 'SF'; });   // positions before the board reads them
const { draft } = require('./backtest.js'); const { scoreLeague } = require('./stream_sim.js');
const SLOTS = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'C', 'U', 'U'];
const [season, s0, s1] = [process.argv[2], +process.argv[3], +process.argv[4]], out = [];
const base = { puntMode: 'auto', basis: 'mix', ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off' };
const arms = [['off', {}], ['λ 0.5', { posScar: 0.5 }], ['λ 1', { posScar: 1 }], ['λ 2', { posScar: 2 }]];
for (const [name, c] of arms) {
  const rows = [], t0 = Date.now();
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, slot, seed, Object.assign({}, base, c), { trueSd: 'v2' });
    const sc = scoreLeague(season, ro, { seed, target: true, slots: SLOTS, pos: POS });
    rows.push({ season, slot, seed, me: sc.rates[slot - 1], played: sc.played[slot - 1], roster: ro[slot - 1].slice().sort().join(',') });
  }
  out.push({ name, rows }); require('fs').writeFileSync('bt_posscar_' + season + '_' + s0 + '-' + s1 + '.json', JSON.stringify(out));
  console.log(season, name, (rows.reduce((a, r) => a + r.me, 0) / rows.length).toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
