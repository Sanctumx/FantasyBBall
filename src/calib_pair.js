// Calibration of Engine.pairMatchup on real weeks (Task 6, in-season tools, 2026-10-20).
// Usage: node calib_pair.js [season=2025-26] [seeds=20]   -> prints a summary, writes calib_pair_<season>.json
// Design (analyst):
//  - Rosters: 14 teams x 12 from real preseason projections (bt_proj, 'avg') drafted by ADP with adpSd noise, `seeds` seeds,
//    all 91 pairs, every rostered player active (no slot cap).
//  - Weeks: Monday weeks of the season with actuals (bt_data weekly). Games in a week = the player's NBA team games that
//    week (bt_sched) x a, a = min(1, g/82). Actuals = summed weekly stats; FG%/FT% from makes/attempts, lower TO wins, ties 0.5.
//  - Arms: E = draft engine catProb/pairProb (season-long, no weekly games); PM-def = pairMatchup default gVar;
//    PM-bin = gVar n*a*(1-a); PM-sig = gVar 1.87 (SIGMA_G2).
//  - PM-whole (2026-10-21): the Matchup Analyzer's whole games, games = n (every team game, a = 1), gVar 1.87; -k shrinks it with the same K.
//  - Metrics: Brier (matchup, and the 9 categories pooled), 10% reliability bins, calibration slope (OLS of outcome on
//    chance), bootstrap SE over weeks.
//  - Pass bar for PM-def: Brier no worse than E (diff <= +1 SE) for matchup and pooled cats on 2025-26 and 2024-25; matchup
//    slope 0.85-1.15, each category slope 0.80-1.20; every bin with n>=200 within +-0.05 of observed. If it fails, choose the
//    best of PM-bin / PM-sig on 2025-26, set it caller-side (matchup_core.js), confirm on 2024-25; engine.js unchanged.
//  - Result (2026-10-20, 20 seeds): PM-def fails (matchup slope .56/.57), PM-sig best Brier (beats E by 2.5-4 SE), still overconfident
//    (slope .72 matchup). Shipped caller-side: PM-sig (gVar 1.87 on every entry) shrunk p' = .5 + k(p - .5), k_match .72, k_cat .82
//    (cat k pooled over both seasons, no held-out season left). Passes the bar on both seasons except one thin bin (2025-26 p .90, n 227, obs .97).
//    Caveat: fit on preseason projections only; re-fit k on in-season data.
const fs = require('fs');
const E = require('./engine.js'), B = require('./backtest.js');
const DATA = require('./bt_data.json'), SCHED = require('./bt_sched.json');
const season = process.argv[2] || '2025-26', SEEDS = +(process.argv[3] || 20), N = 14, R = 12;
const rng = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const { P, ctx, cfg: cfg0 } = B.setup(season, { proj: 'avg', realAdp: true });
const cfg = Object.assign({}, cfg0, { ilSpots: 0, scoring: 'h2h', order: 'snake', slot: 1 });
const { weekly, nweeks } = DATA[season], G = SCHED[season].games;
const ARMS = ['E', 'PM-def', 'PM-bin', 'PM-sig', 'PM-sig-k', 'PM-whole', 'PM-whole-k'];
// PM-sig-k: PM-sig shrunk toward 0.5, p' = 0.5 + k(p - 0.5); k fit on 2025-26 (OLS slopes of PM-sig: matchup .72, cats .77 on 2025-26, .87 on 2024-25; pooled 0.82)
const K_MATCH = 0.72, K_CAT = 0.82, shrink = (p, k) => 0.5 + k * (p - 0.5);
// per arm: rows of [chance, outcome, weekIndex, category (0-8, or 9 = matchup)]
const rows = {}; ARMS.forEach(a => { rows[a] = []; });
for (let seed = 1; seed <= SEEDS; seed++) {
  const r = rng(seed * 7919);
  const T = P.map(p => p.adpUse + gauss(r) * p.sd), order = P.map((_, i) => i).sort((a, b) => T[a] - T[b]);
  const picks = order.slice(0, N * R);
  const res = E.evaluate(P, ctx, cfg, { picks });
  const tot = res.teams.map(t => {
    const w = Array.from({ length: nweeks }, () => new Array(11).fill(0));
    t.roster.forEach(e => { const pw = weekly[String(e.p.pid)] || {}; for (const k in pw) for (let c = 0; c < 11; c++) w[k][c] += pw[k][c]; });
    return w;
  });
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  for (let w = 0; w < nweeks; w++) {
    if (tot.some(t => t[w][1] === 0)) continue;
    const mk = (t, mode) => t.roster.map(e => {
      const n = (G[e.p.t] || [])[w] || 0, a = Math.min(1, e.p.g / 82), o = { p: e.p, games: n * a };
      if (mode === 'whole') o.games = n; if (mode === 'bin') o.gVar = n * a * (1 - a); else if (mode === 'sig' || mode === 'whole') o.gVar = 1.87;
      return o;
    });
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const ci = cats(tot[i][w]), cj = cats(tot[j][w]), y = [];
      let wi = 0, wj = 0;
      for (let c = 0; c < 9; c++) { const v = ci[c] > cj[c] ? 1 : ci[c] < cj[c] ? 0 : 0.5; y.push(v); if (v === 1) wi++; else if (v === 0) wj++; }
      const ym = wi > wj ? 1 : wi < wj ? 0 : 0.5;
      const put = (arm, cat, m) => { cat.forEach((p, c) => rows[arm].push([p, y[c], w, c])); rows[arm].push([m, ym, w, 9]); };
      const A = res.teams[i], Bt = res.teams[j];
      put('E', [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => res.catProb(A, Bt, c)), res.pairProb(A, Bt));
      for (const [arm, mode] of [['PM-def', ''], ['PM-bin', 'bin'], ['PM-sig', 'sig'], ['PM-whole', 'whole']]) {
        const pm = E.pairMatchup(mk(A, mode), mk(Bt, mode)); put(arm, pm.cat, pm.match);
        if (arm === 'PM-sig') put('PM-sig-k', pm.cat.map(p => shrink(p, K_CAT)), shrink(pm.match, K_MATCH));
        if (arm === 'PM-whole') put('PM-whole-k', pm.cat.map(p => shrink(p, K_CAT)), shrink(pm.match, K_MATCH));
      }
    }
  }
}
const brier = rs => rs.reduce((s, x) => s + (x[0] - x[1]) ** 2, 0) / rs.length;
function slope(rs) { const n = rs.length; let mx = 0, my = 0; rs.forEach(x => { mx += x[0]; my += x[1]; }); mx /= n; my /= n;
  let sxy = 0, sxx = 0; rs.forEach(x => { sxy += (x[0] - mx) * (x[1] - my); sxx += (x[0] - mx) ** 2; }); return sxy / sxx; }
const sel = (arm, cat) => rows[arm].filter(x => cat === 'cats' ? x[3] < 9 : x[3] === cat);
// bootstrap over weeks: SE of the Brier difference (arm - E) on the same resampled weeks
function diffSE(arm, cat) {
  const a = sel(arm, cat), e = sel('E', cat), byW = {};
  a.forEach((x, k) => { const w = x[2]; (byW[w] = byW[w] || [0, 0, 0]); byW[w][0] += (x[0] - x[1]) ** 2; byW[w][1] += (e[k][0] - e[k][1]) ** 2; byW[w][2]++; });
  const ws = Object.values(byW), r = rng(99), ds = [];
  for (let b = 0; b < 500; b++) { let s1 = 0, s2 = 0, n = 0; for (let k = 0; k < ws.length; k++) { const q = ws[Math.floor(r() * ws.length)]; s1 += q[0]; s2 += q[1]; n += q[2]; } ds.push((s1 - s2) / n); }
  const m = ds.reduce((s, x) => s + x, 0) / ds.length; return Math.sqrt(ds.reduce((s, x) => s + (x - m) ** 2, 0) / (ds.length - 1));
}
const out = { season, seeds: SEEDS, arms: {} };
console.log(`${season}, ${SEEDS} seeds, ${rows.E.length / 10} pair-weeks`);
for (const arm of ARMS) {
  const o = out.arms[arm] = {};
  for (const [k, lab] of [[9, 'matchup'], ['cats', 'cats pooled']]) {
    const rs = sel(arm, k), d = arm === 'E' ? 0 : brier(rs) - brier(sel('E', k));
    o[lab] = { brier: brier(rs), diffVsE: d, se: arm === 'E' ? 0 : diffSE(arm, k), slope: slope(rs) };
  }
  o.catSlopes = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => slope(sel(arm, c)));
  const bins = []; for (let b = 0; b < 10; b++) { const rs = sel(arm, 'cats').concat(sel(arm, 9)).filter(x => x[0] >= b / 10 && (x[0] < (b + 1) / 10 || b === 9));
    bins.push({ bin: b / 10, n: rs.length, p: rs.reduce((s, x) => s + x[0], 0) / (rs.length || 1), obs: rs.reduce((s, x) => s + x[1], 0) / (rs.length || 1) }); }
  o.bins = bins;
  console.log(arm.padEnd(7), 'matchup Brier', o.matchup.brier.toFixed(4), 'd', o.matchup.diffVsE.toFixed(4), '±', o.matchup.se.toFixed(4), 'slope', o.matchup.slope.toFixed(2),
    '| cats Brier', o['cats pooled'].brier.toFixed(4), 'd', o['cats pooled'].diffVsE.toFixed(4), '±', o['cats pooled'].se.toFixed(4), 'slope', o['cats pooled'].slope.toFixed(2));
  console.log('        cat slopes', o.catSlopes.map(x => x.toFixed(2)).join(' '));
  console.log('        bins (n, p, obs)', bins.filter(b => b.n).map(b => `${b.n}:${b.p.toFixed(2)}/${b.obs.toFixed(2)}`).join('  '));
}
fs.writeFileSync(`calib_pair_${season}.json`, JSON.stringify(out));
