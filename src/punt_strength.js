// How strongly do the board and the backtest's punting opponents punt, compared with real drafters? (2026-10-17)
// Team profile = sum of each drafted player's season category z (boardC), standardized across the 14 teams, as in
// punt_real.py. Reports: punter opponents' punted category; teams with Giannis: teammates' FT%; board team's weakest category.
const DATA = require('./bt_data.json'), FIT = require('./games_fit.json');
const { draft, setup } = require('./backtest.js'); const E = require('./engine.js');
const out = { punter: [], giannisMates: [], giannisBoard: [], boardMin: [], boardFTwithG: [] };
for (const season of ['2022-23', '2023-24', '2024-25', '2025-26']) {
  const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });
  const base = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 2, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'medium' };
  const { P, ctx } = setup(season, base); const byPid = {}; P.forEach(p => { byPid[p.pid] = p; });
  const gi = P.find(p => /Antetokounmpo/.test(p.n) && /Giannis/.test(p.n));
  for (const slot of [1, 4, 7, 10, 14]) for (let seed = 113; seed <= 116; seed++) {
    const info = {};
    const rep = {};
    const ro = draft(season, slot, seed, base, { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 }, onMyPick: null, report: rep });
    const prof = (excl) => ro.map(team => { const s = new Array(9).fill(0); team.forEach(pid => { if (excl && pid === excl) return; const p = byPid[pid]; for (let c = 0; c < 9; c++) s[c] += p.boardC[c]; }); return s; });
    const std = T => { const m = [], sd = []; for (let c = 0; c < 9; c++) { const v = T.map(t => t[c]); m[c] = v.reduce((a, b) => a + b, 0) / v.length; sd[c] = Math.sqrt(v.reduce((a, b) => a + (b - m[c]) ** 2, 0) / v.length) || 1; } return T.map(t => t.map((x, c) => (x - m[c]) / sd[c])); };
    const S = std(prof()), Sx = gi ? std(prof(gi.pid)) : null;
    S[slot - 1] && out.boardMin.push(Math.min(...S[slot - 1]));
    rep.oppPunt.forEach((pc, t) => { if (pc) out.punter.push(pc.reduce((a, c) => a + S[t][c], 0) / pc.length); });
    ro.forEach((team, t) => { if (t !== slot - 1 && !rep.oppPunt[t] && !rep.oppModel[t]) out.boardFTwithG.push(Math.min(...S[t])); });
    if (gi) ro.forEach((team, t) => { if (team.includes(gi.pid)) { (t === slot - 1 ? out.giannisBoard : out.giannisMates).push(Sx[t][1]); } });
  }
}
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) + ' (n ' + a.length + ')' : '–';
console.log('Giannis teams, teammates FT% (sd): opponents', avg(out.giannisMates), '| board team', avg(out.giannisBoard));
console.log('board team weakest category (sd):', avg(out.boardMin), '| non-punting opponents weakest:', avg(out.boardFTwithG));
console.log('punting opponents, punted categories (sd, average over the punt):', avg(out.punter));
