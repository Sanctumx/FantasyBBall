// #158 re-fit of K_MATCH (the Matchup Analyzer's match shrink for a LATER week), analyst design 2026-10-29.
// Usage: node --max-old-space-size=4096 calib_kmatch.js [seeds=20] [season,season=2025-26,2024-25,2023-24,2022-23] [firstSeed=81]
//   -> results_calib_kmatch.txt, calib_kmatch.json (SMOKE=1 also prints the report).
// Why a new script: #157 line P measured the Team tab's forecaster (one average week x remaining weeks, STD blend). K_MATCH is used
// only by matchup_core.scoreSegments on the fractional-games path: Engine.pairMatchup on the week's own games x min(1, g/82), gVar 1.87,
// preseason projection lines, no recent-play filter (the IL stand-in only touches the current period). That forecast is rebuilt here for
// every outcome week of the calib_pair league (14 teams x 12, ADP draft with noise seed*7919, all 91 pairs, all 12 active).
// Rosters are frozen and lines are preseason, so the forecast for week w does not depend on a checkpoint: the fit is per season over
// all weeks, with k by week bucket printed. The #146 live .55 and line P's .77-.84 are other forecasters and do not enter the verdict.
// Rules fixed before any result (verdict()): KEEP .78 if pooled k > .75, > .72 + 2 SE, 3 of 4 seasons > .75 and Brier(.78) - Brier(.72)
// <= 0; REVERT .72 if pooled k <= .75, < .78 - 2 SE and 3 of 4 seasons <= .75; else INCONCLUSIVE (.78 stays as an unconfirmed order).
// Pooled k = inverse-variance mean of the seasons, SE = the larger of its own SE and the spread of the seasons / 2. A season's SE is
// the larger of the outcome-week and draft-seed cluster bootstraps (calib_ros_stats.kSE).

// games of the NBA team in week w x availability, as segGames' fractional path counts them
const pfGames = (rows, w, g) => ((rows && rows[w]) || 0) * Math.min(1, g / 82);

function pooled(ss) {
  const wts = ss.map(s => 1 / (s.se * s.se)), sw = wts.reduce((a, b) => a + b, 0), k = ss.reduce((a, s, i) => a + wts[i] * s.k, 0) / sw;
  const m = ss.reduce((a, s) => a + s.k, 0) / ss.length, sd = ss.length > 1 ? Math.sqrt(ss.reduce((a, s) => a + (s.k - m) ** 2, 0) / (ss.length - 1)) : 0;
  return { k, se: Math.max(Math.sqrt(1 / sw), sd / 2) };
}

// per = { seasons: [{ k, se }], dBrier: mean over seasons of Brier(.78) - Brier(.72) }
function verdict(per) {
  const p = pooled(per.seasons), above = per.seasons.filter(s => s.k > 0.75).length, below = per.seasons.filter(s => s.k <= 0.75).length;
  const need = Math.ceil(per.seasons.length * 0.75);
  if (p.k > 0.75 && p.k > 0.72 + 2 * p.se && above >= need && per.dBrier <= 0) return { call: 'KEEP .78', pooled: p };
  if (p.k <= 0.75 && p.k < 0.78 - 2 * p.se && below >= need) return { call: 'REVERT .72', pooled: p, note: p.k < 0.72 - 2 * p.se ? 'pooled k is more than 2 SE below .72: open a new row, go no lower without live evidence' : undefined };
  return { call: 'INCONCLUSIVE', pooled: p };
}
module.exports = { pfGames, pooled, verdict };

if (require.main === module) {
  const fs = require('fs');
  const E = require('./engine.js'), B = require('./backtest.js'), S = require('./calib_ros_stats.js');
  const DATA = require('./bt_data.json'), SCHED = require('./bt_sched.json');
  const SEEDS = +(process.argv[2] || 20), SEASONS = (process.argv[3] || '2025-26,2024-25,2023-24,2022-23').split(','), SEED0 = +(process.argv[4] || 81), N = 14, R = 12, SMOKE = !!process.env.SMOKE;
  const PSRC = { '2025-26': 'bbm', '2024-25': 'bbm', '2023-24': 'hs', '2022-23': 'hs' };   // as calib_ros.js
  const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  const T0 = Date.now(); let done = 0;
  const OUT = [], log = s => OUT.push(s), f2 = x => x.toFixed(2), f4 = x => (x < 0 ? '' : ' ') + x.toFixed(4);

  function build(season) {
    const { P, ctx, cfg: cfg0 } = B.setup(season, { proj: PSRC[season] || 'avg', realAdp: true });
    const cfg = Object.assign({}, cfg0, { ilSpots: 0, scoring: 'h2h', order: 'snake', slot: 1 });
    const { weekly, nweeks } = DATA[season], G = SCHED[season].games, cols = { p: [], y: [], wk: [], sd: [] };
    for (let seed = SEED0; seed < SEED0 + SEEDS; seed++) {
      done++;
      if (done > 1) { const el = (Date.now() - T0) / 1000, left = Math.round(el / (done - 1) * (SEEDS * SEASONS.length - done + 1)); process.stdout.write('\rEstimated time remaining: ' + Math.floor(left / 60) + ' min ' + String(left % 60).padStart(2, '0') + ' s   '); }
      const r = S.rng(seed * 7919), T = P.map(p => p.adpUse + gauss(r) * p.sd), order = P.map((_, i) => i).sort((a, b) => T[a] - T[b]), picks = order.slice(0, N * R);
      const res = E.evaluate(P, ctx, cfg, { picks });
      const tot = res.teams.map(t => {
        const w = Array.from({ length: nweeks }, () => new Array(11).fill(0));
        t.roster.forEach(e => { const pw = weekly[String(e.p.pid)] || {}; for (const k in pw) for (let c = 0; c < 11; c++) w[k][c] += pw[k][c]; });
        return w;
      });
      for (let w = 0; w < nweeks; w++) {
        if (tot.some(t => t[w][1] === 0)) continue;
        const ent = res.teams.map(t => t.roster.map(x => ({ p: x.p, games: pfGames(G[x.p.t], w, x.p.g), gVar: 1.87 })));
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
          const pm = E.pairMatchup(ent[i], ent[j]), ci = cats(tot[i][w]), cj = cats(tot[j][w]); let wi = 0, wj = 0;
          for (let c = 0; c < 9; c++) { if (ci[c] > cj[c]) wi++; else if (ci[c] < cj[c]) wj++; }
          cols.p.push(pm.match); cols.y.push(wi > wj ? 1 : wi < wj ? 0 : 0.5); cols.wk.push(w); cols.sd.push(seed);
        }
      }
    }
    if (cols.wk.some(v => v > 255) || cols.sd.some(v => v > 255)) throw new Error('calib_kmatch: week or seed above 255 would wrap in a Uint8Array');
    const n = cols.y.length;
    return { season, D: { n, y: Float32Array.from(cols.y), wk: Uint8Array.from(cols.wk), sd: Uint8Array.from(cols.sd), cat: new Uint8Array(n).fill(9), ck: new Uint8Array(n), p: { PF: Float32Array.from(cols.p) } } };
  }

  const R_ = SEASONS.map(build), M = { kind: 'M' }, A = k => ({ src: 'PF', kM: k, kC: k });
  log(`#158 K_MATCH re-fit  ${new Date().toISOString().slice(0, 10)}  seeds ${SEED0}-${SEED0 + SEEDS - 1}  seasons ${SEASONS.join(', ')}  (fractional-games pairMatchup, preseason lines, matchup rows)`);
  const per = { seasons: [], dBrier: 0 }, out = {};
  for (const r of R_) {
    const ks = S.kSE(r.D, 'PF', M), d = S.diffSE(r.D, A(0.78), A(0.72), M), buckets = [[0, 5], [6, 13], [14, 24]];
    per.seasons.push({ k: ks.k, se: ks.se }); per.dBrier += d.d / R_.length;
    const bk = buckets.map(([a, b]) => `weeks ${a + 1}-${b + 1}: ${f2(S.fitK(r.D, 'PF', { kind: 'M', f: i => r.D.wk[i] >= a && r.D.wk[i] <= b }))}`).join('  ');
    out[r.season] = { k: ks.k, se: ks.se, seWeek: ks.seWeek, seSeed: ks.seSeed, dBrier: d.d, dSE: d.se, rows: r.D.n };
    log(`${r.season}: k* ${f2(ks.k)} +-${f2(ks.se)} (week ${f2(ks.seWeek)}, seed ${f2(ks.seSeed)})  Brier(.78)-Brier(.72) ${f4(d.d)} +-${d.se.toFixed(4)}  rows ${r.D.n}`);
    log(`   by week: ${bk}   Brier at k .72 ${f4(S.brier(r.D, A(0.72), M))}, .78 ${f4(S.brier(r.D, A(0.78), M))}, 1 ${f4(S.brier(r.D, A(1), M))}`);
  }
  per.dBrier = per.seasons.length ? per.dBrier : 0;
  const V = verdict(per);
  log(`\n== Verdict (rules fixed in the header of calib_kmatch.js before any result; the analyst judges)`);
  log(`pooled k ${f2(V.pooled.k)} +-${f2(V.pooled.se)}, mean Brier(.78)-Brier(.72) ${f4(per.dBrier)}: ${V.call}${V.note ? ' (' + V.note + ')' : ''}`);
  fs.writeFileSync('results_calib_kmatch.txt', OUT.join('\n') + '\n');
  fs.writeFileSync('calib_kmatch.json', JSON.stringify({ seeds: SEEDS, seed0: SEED0, seasons: out, pooled: V.pooled, dBrier: per.dBrier, verdict: V.call }));
  if (SMOKE) console.log('\n' + OUT.join('\n'));
  process.exit(0);
}
