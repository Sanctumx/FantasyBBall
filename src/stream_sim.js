// Realistic league scoring: daily lineups (10 active of 12), 2 IL spots, opts.adds a week (default 4) used on the 2 weakest roster spots.
// adds 0: all 12 drafted players kept, no IL fill-ins. adds > 4: the 2 spots are streamed daily (adds ≥ 14 = unlimited).
const DAILY = require('./bt_daily.json'), DATA = require('./bt_data.json');
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const N = 14;
function perGameValue(players) {
  // z-sum of per-game production across the pool (FG/FT as excess makes), used to rank streamers and bench choices
  const f = p => [ (p.fgp - 0.47) * p.fga, (p.ftp - 0.78) * p.fta, p.tpm, p.pts, p.reb, p.ast, p.stl, p.blk, -p.to ];
  const X = players.map(f), n = X.length, m = [], s = [];
  for (let c = 0; c < 9; c++) { m[c] = X.reduce((a, x) => a + x[c], 0) / n; s[c] = Math.sqrt(X.reduce((a, x) => a + (x[c] - m[c]) ** 2, 0) / n) || 1; }
  const v = {}, zc = {}; players.forEach((p, i) => { zc[p.pid] = X[i].map((x, c) => (x - m[c]) / s[c]); v[p.pid] = zc[p.pid].reduce((a, x) => a + x, 0); }); v.zc = zc; return v;
}
// Lineup slots: G = PG/SG, F = SF/PF, U = anyone. Players go in by value; each one is placed if any assignment of the
// players already in can make room for him (augmenting path), which is optimal for this kind of slot matching.
const SLOT_OK = { PG: ['PG'], SG: ['SG'], SF: ['SF'], PF: ['PF'], C: ['C'], G: ['PG', 'SG'], F: ['SF', 'PF'], U: ['PG', 'SG', 'SF', 'PF', 'C'] };
function fillSlots(players, slots, pos) {
  const elig = pid => { const ps = String((pos && pos[pid]) || 'SF').split('/'); return slots.map(sl => SLOT_OK[sl].some(x => ps.includes(x))); };
  const holder = new Array(slots.length).fill(-1), E = [], inn = [];
  const tryPlace = (i, seen) => { for (let k = 0; k < slots.length; k++) if (E[i][k] && !seen[k]) { seen[k] = 1; if (holder[k] < 0 || tryPlace(holder[k], seen)) { holder[k] = i; return true; } } return false; };
  players.forEach((pid, i) => { E[i] = elig(pid); if (tryPlace(i, new Array(slots.length).fill(0))) inn.push(pid); });
  return inn;
}
function scoreLeague(season, rosters, opts = {}) {
  // opts.target: stream for the categories each team is losing or close in (by totals so far), not generic value
  const active = opts.active ?? 10, il = opts.il ?? 2, adds = opts.adds ?? 4, seed = opts.seed ?? 1, target = !!opts.target;
  // opts.slots: daily lineup slots (e.g. ['PG','SG','G','SF','PF','F','C','C','U','U']) filled from opts.pos eligibility; default: any 10
  const slots = opts.slots || null, played = new Array(N).fill(0);
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
    // streaming periods: Mon-Thu / Fri-Sun, or daily when adds allow more than 4 a week (opts.periods overrides)
    const H = opts.periods ?? (adds > 4 ? 7 : 2);
    const bnd = H === 2 ? [d0, mid, d1] : Array.from({ length: H + 1 }, (_, i) => Math.min(d1, d0 + Math.round(i * 7 / H)));
    const perOf = d => { let h = 0; while (h < H - 1 && d >= bnd[h + 1]) h++; return h; };
    // opts.trades: [{ w, me?, other, give: [pid], get: [pid] }] swaps core players between two teams at the start of week w
    for (const tr of opts.trades || []) if (tr.w === w) {
      const a = teams[tr.me ?? opts.me], b = teams[tr.other];
      const swap = (T, out, inn) => { if (out.some(x => !T.core.includes(x))) throw new Error('trade: a traded player is not in the core'); T.core = T.core.filter(x => !out.includes(x)).concat(inn).sort((x, y) => val[y] - val[x]); };
      swap(a, tr.give, tr.get); swap(b, tr.get, tr.give);
    }
    const order = [...Array(N).keys()].sort(() => r() - 0.5);
    const claimed = Array.from({ length: H }, () => new Set());
    const lineups = Array.from({ length: N }, () => Array.from({ length: H }, () => []));   // players on roster for each period
    // targeted streaming: per team, weight 1 on categories where it ranks outside the top third so far, 0.25 where it leads
    const catW = Array.from({ length: N }, () => new Array(9).fill(1));
    if (target && w > 0) {
      const sumTo = weekTot.map(tw => { const a = new Array(11).fill(0); for (let k = 0; k < w; k++) tw[k].forEach((x, c) => { a[c] += x; }); return a; });
      const cv = sumTo.map(a => [a[1] ? a[0] / a[1] : 0, a[3] ? a[2] / a[3] : 0, a[4], a[5], a[6], a[7], a[8], a[9], -a[10]]);
      for (let c = 0; c < 9; c++) { const ord = [...Array(N).keys()].sort((x, y) => cv[y][c] - cv[x][c]); ord.forEach((t, rk) => { catW[t][c] = rk < Math.floor(N / 3) ? 0.25 : 1; }); }
    }
    const tval = (t, pid) => { const z = val.zc[pid]; if (!target || !z) return val[pid]; let s2 = 0; for (let c = 0; c < 9; c++) s2 += catW[t][c] * z[c]; return s2; };
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
      const slots = adds > 0 ? 2 : 0; const plan = [new Array(H).fill(0), new Array(H).fill(0)], cur = [null, null];
      let a = left; for (let h = 0; h < H && a > 0; h++) for (let sl = 0; sl < slots && a > 0; sl++) { plan[sl][h] = 1; a--; }
      for (let h = 0; h < H; h++) {
        const s0 = bnd[h], s1 = bnd[h + 1];
        const roster = base.slice();
        for (let sl = 0; sl < slots; sl++) {
          if (!plan[sl][h]) { if (cur[sl] != null) roster.push(cur[sl]); continue; }   // keep the earlier streamer
          const pool = fa.filter(x => !held.has(x) && !claimed[h].has(x)).sort((x, y) => tval(t, y) - tval(t, x)).slice(0, 15);
          let pick = pool.sort((x, y) => gamesIn(y, s0, s1) - gamesIn(x, s0, s1) || tval(t, y) - tval(t, x))[0];
          // opts.streamPick (team opts.me only): may return another pid from ctx.pool; null/undefined keeps the baseline pick
          if (opts.streamPick && t === opts.me && pick != null) { const hp = opts.streamPick({ t, w, h, s0, s1, roster: roster.slice(), pool: pool.slice(), baseline: pick, val, gamesIn, catW: catW[t] }); if (hp != null) { if (!pool.includes(hp)) throw new Error('streamPick must return a pid from ctx.pool'); pick = hp; } }
          if (pick != null) { for (let k = h; k < H; k++) claimed[k].add(pick); roster.push(pick); cur[sl] = pick; }
        }
        lineups[t][h] = roster;
      }
    }
    // daily scoring with an active-slot cap
    for (let t = 0; t < N; t++) for (let d = d0; d < d1; d++) {
      const roster = lineups[t][perOf(d)].filter(x => x != null);
      let playing = roster.filter(pid => byDay[pid] && byDay[pid].has(d));
      // opts.lineupRank (team opts.me only): returns the playing pids in the order to fill the lineup; null keeps the value order
      const ranked = () => {
        const hr = opts.lineupRank && t === opts.me ? opts.lineupRank({ t, w, d, playing: playing.slice(), roster, val }) : null;
        if (hr == null) return playing.sort((a, b) => val[b] - val[a]);
        if (hr.length !== playing.length || hr.some(x => !playing.includes(x))) throw new Error('lineupRank must return a permutation of ctx.playing');
        return hr.slice();
      };
      if (slots) playing = fillSlots(ranked(), slots, opts.pos);
      else if (playing.length > active) playing = ranked().slice(0, active);
      played[t] += playing.length;
      if (opts.rankLog) { const ps = new Set(playing); roster.slice().sort((a, b) => val[b] - val[a]).forEach((pid, k) => { const L = opts.rankLog; L.has[k] = (L.has[k] || 0) + (byDay[pid] && byDay[pid].has(d) ? 1 : 0); L.played[k] = (L.played[k] || 0) + (ps.has(pid) ? 1 : 0); }); }
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
  return { rates: wins.map(x => x / (games * (N - 1))), weekTot, played };
}
module.exports = { scoreLeague };
if (require.main === module) {
  const { draft, score } = require('./backtest.js');
  const ro = draft('2025-26', 7, 2, { puntMode: 'auto' });
  const a = score('2025-26', ro), b = scoreLeague('2025-26', ro);
  console.log('all-12 scoring me', a[6].toFixed(3), '| realistic scoring me', b.rates[6].toFixed(3));
  const g = b.weekTot.map(t => t.reduce((s, w) => s + w[5], 0)); console.log('season points per team (realistic):', g.map(x => Math.round(x / 1000) + 'k').join(' '));
}
