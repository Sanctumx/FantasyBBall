// Realistic league scoring: daily lineups (10 active of 12), 2 IL spots, 4 adds a week used on the 2 weakest roster spots.
const DAILY = require('./bt_daily.json'), DATA = require('./bt_data.json');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const N = 14;
function perGameValue(players) {
  // z-sum of per-game production across the pool (FG/FT as excess makes), used to rank streamers and bench choices
  const f = p => [ (p.fgp - 0.47) * p.fga, (p.ftp - 0.78) * p.fta, p.tpm, p.pts, p.reb, p.ast, p.stl, p.blk, -p.to ];
  const X = players.map(f), n = X.length, m = [], s = [];
  for (let c = 0; c < 9; c++) { m[c] = X.reduce((a, x) => a + x[c], 0) / n; s[c] = Math.sqrt(X.reduce((a, x) => a + (x[c] - m[c]) ** 2, 0) / n) || 1; }
  const v = {}; players.forEach((p, i) => { v[p.pid] = X[i].reduce((a, x, c) => a + (x - m[c]) / s[c], 0); }); return v;
}
function scoreLeague(season, rosters, opts = {}) {
  const active = opts.active ?? 10, il = opts.il ?? 2, adds = opts.adds ?? 4, seed = opts.seed ?? 1;
  const { daily, ndays } = DAILY[season]; const nweeks = Math.ceil(ndays / 7);
  const players = DATA[season].players, val = perGameValue(players);
  const byDay = {}; for (const pid in daily) { const m = new Map(); daily[pid].forEach(r => m.set(r[0], r.slice(1))); byDay[pid] = m; }
  const gamesIn = (pid, d0, d1) => { const m = byDay[pid]; if (!m) return 0; let g = 0; for (let d = d0; d < d1; d++) if (m.has(d)) g++; return g; };
  const drafted = new Set(rosters.flat());
  const fa = players.map(p => p.pid).filter(pid => !drafted.has(pid));
  // each team: 10 core players kept, 2 weakest drafted players become streaming spots
  const teams = rosters.map(ro => { const s = ro.slice().sort((a, b) => val[b] - val[a]); const keep = adds > 0 ? s.slice(0, ro.length - 2) : s; return { core: keep, ilOn: [], ilRep: new Map() }; });
  const r = rng(seed * 31 + 7);
  const weekTot = Array.from({ length: N }, () => Array.from({ length: nweeks }, () => new Array(11).fill(0)));
  const held = new Set();   // free agents currently on someone's roster as IL fill-ins
  for (let w = 0; w < nweeks; w++) {
    const d0 = w * 7, mid = d0 + 4, d1 = Math.min(ndays, d0 + 7);
    const order = [...Array(N).keys()].sort(() => r() - 0.5);
    const claimed = [new Set(), new Set()];
    const lineups = Array.from({ length: N }, () => [[], []]);   // players on roster for each half-week
    for (const t of order) {
      const T = teams[t]; let left = adds;
      // IL: a core player with no games last week and none this week goes to IL (max il); best free agent fills his spot
      for (const pid of T.core) {
        const out = gamesIn(pid, Math.max(0, d0 - 7), d0) === 0 && gamesIn(pid, d0, d1) === 0 && w > 0;
        if (out && !T.ilOn.includes(pid) && T.ilOn.length < il && left > 0) {
          const cand = fa.filter(x => !held.has(x)).sort((a, b) => val[b] - val[a])[0];
          if (cand != null) { T.ilOn.push(pid); T.ilRep.set(pid, cand); held.add(cand); left--; }
        } else if (!out && T.ilOn.includes(pid)) { T.ilOn = T.ilOn.filter(x => x !== pid); held.delete(T.ilRep.get(pid)); T.ilRep.delete(pid); }
      }
      const base = T.core.filter(pid => !T.ilOn.includes(pid)).concat([...T.ilRep.values()]);
      // streaming: remaining adds over the 2 open spots, half-weeks Mon-Thu and Fri-Sun; pick among the 15 best available by games then value
      const slots = adds > 0 ? 2 : 0; const plan = [[0, 0], [0, 0]];
      let a = left; for (let h = 0; h < 2 && a > 0; h++) for (let sl = 0; sl < slots && a > 0; sl++) { plan[sl][h] = 1; a--; }
      for (let h = 0; h < 2; h++) {
        const [s0, s1] = h === 0 ? [d0, mid] : [mid, d1];
        const roster = base.slice();
        for (let sl = 0; sl < slots; sl++) {
          if (!plan[sl][h] && h === 1 && plan[sl][0]) { roster.push(lineups[t][0][base.length + sl]); continue; }   // keep the Mon-Thu streamer
          if (!plan[sl][h]) continue;
          const pool = fa.filter(x => !held.has(x) && !claimed[h].has(x)).sort((x, y) => val[y] - val[x]).slice(0, 15);
          const pick = pool.sort((x, y) => gamesIn(y, s0, s1) - gamesIn(x, s0, s1) || val[y] - val[x])[0];
          if (pick != null) { claimed[h].add(pick); if (h === 0) claimed[1].add(pick); roster.push(pick); }
        }
        lineups[t][h] = roster;
      }
    }
    // daily scoring with an active-slot cap
    for (let t = 0; t < N; t++) for (let d = d0; d < d1; d++) {
      const roster = lineups[t][d < mid ? 0 : 1].filter(x => x != null);
      let playing = roster.filter(pid => byDay[pid] && byDay[pid].has(d));
      if (playing.length > active) playing = playing.sort((a, b) => val[b] - val[a]).slice(0, active);
      playing.forEach(pid => { const s = byDay[pid].get(d); for (let c = 0; c < 11; c++) weekTot[t][w][c] += s[c]; });
    }
  }
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  const wins = new Array(N).fill(0); let games = 0;
  for (let w = 0; w < nweeks; w++) {
    if (weekTot.every(t => t[w][5] === 0)) continue; games++;
    const cs = weekTot.map(t => cats(t[w]));
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b) { let wa = 0, wb = 0; for (let c = 0; c < 9; c++) { if (cs[a][c] > cs[b][c]) wa++; else if (cs[a][c] < cs[b][c]) wb++; } wins[a] += wa > wb ? 1 : wa === wb ? 0.5 : 0; }
  }
  return { rates: wins.map(x => x / (games * (N - 1))), weekTot };
}
module.exports = { scoreLeague };
if (require.main === module) {
  const { draft, score } = require('./backtest.js');
  const ro = draft('2025-26', 7, 2, { puntMode: 'auto' });
  const a = score('2025-26', ro), b = scoreLeague('2025-26', ro);
  console.log('all-12 scoring me', a[6].toFixed(3), '| realistic scoring me', b.rates[6].toFixed(3));
  const g = b.weekTot.map(t => t.reduce((s, w) => s + w[5], 0)); console.log('season points per team (realistic):', g.map(x => Math.round(x / 1000) + 'k').join(' '));
}
