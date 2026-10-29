// Early-season availability for the Team tab forecast (#144, 2026-10-29; design: docs/superpowers/specs/2026-10-29-early-availability-design.md). Pure.
// Daily rows (bt_daily.json) are [day, fgm, fga, ftm, fta, fg3m, pts, reb, ast, stl, blk, tov, min]; checkpoint w0 (0-based start of week w0) cuts at day 7 * w0,
// so week w covers days 7w .. 7w + 6 (alignCheck tests that against bt_sched). A 0-minute row is not a game.
const KW = require('./calib_kwl.js');
const MIN_COL = 12, GRID = Array.from({ length: 83 }, (_, i) => i);

// shrunk games-played rate: (gp + n0 s) / (tg + n0), s = min(1, g / 82) the projected share; n0 = 0 is the raw rate (tg = 0 falls back to s); n0 = Infinity is s
function rate(gp, tg, g, n0) {
  const s = Math.min(1, g / 82);
  if (n0 === Infinity) return s;
  if (n0 === 0 && tg === 0) return s;
  return Math.min(1, (gp + n0 * s) / (tg + n0));
}

// team games in weeks [0, w0) and [w0, nweeks)
const tgAt = (games, w0) => (games || []).slice(0, w0).reduce((s, x) => s + (x || 0), 0);
const tgAfter = (games, w0, nweeks) => (games || []).slice(w0, nweeks).reduce((s, x) => s + (x || 0), 0);

// per team and week with games: the most daily rows any listed player has in days 7w..7w+6 against the team's scheduled games (over = more rows than games)
function alignCheck(players, dailyByPid, G, nweeks) {
  const best = {};
  for (const p of players) {
    const wk = {};
    for (const r of dailyByPid[String(p.pid)] || []) if (r[MIN_COL] > 0) { const w = Math.floor(r[0] / 7); if (w < nweeks) wk[w] = (wk[w] || 0) + 1; }
    const b = best[p.t] = best[p.t] || {};
    for (const w in wk) b[w] = Math.max(b[w] || 0, wk[w]);
  }
  let cells = 0, over = 0, exact = 0;
  for (const t of Object.keys(G)) for (let w = 0; w < nweeks; w++) {
    const games = G[t][w] || 0; if (!games) continue;
    const m = ((best[t] || {})[w]) || 0; cells++; if (m > games) over++; else if (m === games) exact++;
  }
  return { cells, over, exact };
}

// games played before the checkpoint
function gpAt(rows, w0) { let n = 0; for (const r of rows || []) if (r[0] <= 7 * w0 - 1 && r[MIN_COL] > 0) n++; return n; }

// one player at one checkpoint for the n0 fit: games and team games before it, and the same after it (the rest of the season)
function makeAvailSample(p, rows, G, w0, nweeks) {
  const cut = 7 * w0; let gpAfter = 0;
  for (const r of rows || []) if (r[0] >= cut && r[MIN_COL] > 0) gpAfter++;
  const recent = (rows || []).some(r => r[0] >= cut - 14 && r[0] <= cut - 1);   // the harness's IR stand-in (calib_ros.js)
  return { gp: gpAt(rows, w0), tg: tgAt(G[p.t], w0), g: p.g, gpAfter, tgAfter: tgAfter(G[p.t], w0, nweeks), recent, w0 };
}

// integer n0 (0..82) minimising sum tgAfter * (a - gpAfter / tgAfter)^2
function fitN0(samples) {
  let bn = 0, bl = Infinity;
  for (const n0 of GRID) {
    let l = 0;
    for (const s of samples) if (s.tgAfter > 0) { const e = rate(s.gp, s.tg, s.g, n0) - s.gpAfter / s.tgAfter; l += s.tgAfter * e * e; }
    if (l < bl) { bl = l; bn = n0; }
  }
  return bn;
}
// n0 for a build of season A (null = the held-out season itself) with season T held out, fitted on the other seasons only
function n0For(bySeason, all, A, T, fit) {
  return (fit || fitN0)([].concat(...KW.nestedPool(all, A, T).map(s => bySeason[s])));
}

const binsOk = bins => bins.every(b => b.n < 200 || Math.abs(b.p - b.obs) <= 0.05 + 1e-9);

// ---- gates (fixed in the design before any result); every d is a paired difference R minus the comparator, negative = R better ----
// A1 (Per game, early): R beats W by >= 2 SE in every primary season, category d <= 0 in each
const gateA1 = (m, c) => m.every(x => x.d <= -2 * x.se) && c.every(x => x.d <= 0);
// A2 (Total, early): R beats G0 by >= 1 SE in every primary season
const gateA2 = m => m.every(x => x.d <= -x.se);
// A3 (no harm, weeks 8/12/16): every R-minus-comparator d (W and G0, matchup and category, each season) strictly below +1 SE
const gateA3 = ds => ds.every(x => x.d < x.se);
// A4 (calibration, early): R's held-out matchup slope no further from 1 than W's, bins pass
const gateA4 = x => Math.abs(x.slopeR - 1) <= Math.abs(x.slopeW - 1) && x.binsOk;
// A5 (confirm): harness 2022-23 early d strictly below 0; live replay periods 2-4 d at or below 0
const gateA5Harness = x => x.d < 0;
const gateA5Live = ds => ds.every(x => x.d <= 0);

// the games a roster player contributes to the forecast under each arm. whole = scheduled games per average remaining week; recent = the harness's IR stand-in
// (a daily row in the 14 days before the checkpoint); share = min(1, g / 82); a / a0 = the shrunk and the raw games-played rate
function gamesFor(arm, { recent, whole, share, a, a0 }) {
  switch (arm) {
    case 'W': return recent ? whole : 0;
    case 'G0': return whole * share;
    case 'R': return whole * a;
    case 'RIL': return recent ? whole * a : 0;
    case 'R0': return whole * a0;
    default: throw new Error('unknown arm ' + arm);
  }
}

module.exports = { rate, tgAt, tgAfter, alignCheck, gpAt, makeAvailSample, fitN0, n0For, binsOk, gateA1, gateA2, gateA3, gateA4, gateA5Harness, gateA5Live, gamesFor };
