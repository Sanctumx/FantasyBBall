// Rest-of-season calibration of the Team tab's Win M / Win C (#139, 2026-10-26; analyst spec, built by the main session).
// Usage: node --max-old-space-size=4096 calib_ros.js [seeds=20] [season,season=2025-26,2024-25]  -> results_calib_ros.txt, calib_ros.json
// Design:
//  - Rosters and actual weekly results are calib_pair.js's: 14 teams x 12 drafted by ADP with noise (seed*7919), all 91 pairs, all 12 active.
//  - At the start of weeks 4, 8, 12, 16 (0-based 3, 7, 11, 15) one forecast per team is made with the SHIPPED Team tab code
//    (TeamWin.engCtxFrom / teamVec / evalVecs): games per average remaining week x Engine.WEEKS, Engine.evaluate with one entry per team.
//    That forecast is scored against each remaining week's actual result (Win M on the Team tab is the chance of an average week).
//  - Games: whole = the NBA team's scheduled games over the remaining weeks / weeks (no g/82, as Team.windowGames); g82 = the same x min(1, g/82).
//    A player with no daily row in the 14 days before the checkpoint stands in for the IL slot: 0 forecast games (actuals still count him).
//  - Arms: E-ROS (whole, k 1; the shipped Team tab), E-ROS-k, E-ROS-g82, E-ROS-g82-k, PM-sig-k (old Team tab: pairMatchup whole games,
//    gVar 1.87, k .72 / .82). Decision rule A-E: see verdict().
//  - Caveat: rosters are frozen at the draft and lines are preseason projections even at week 16, so the backtest looks more overconfident
//    than the app and a fitted k is conservative (shrinks too much).
const fs = require('fs');
const E = require('./engine.js'), B = require('./backtest.js'), TW = require('./team_win.js'), S = require('./calib_ros_stats.js');
const DATA = require('./bt_data.json'), SCHED = require('./bt_sched.json'), DAILY = require('./bt_daily.json');
const SEEDS = +(process.argv[2] || 20), SEASONS = (process.argv[3] || '2025-26,2024-25').split(','), N = 14, R = 12, CKS = [3, 7, 11, 15];
const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const SRC = ['W', 'G', 'PM'];   // whole games, g82 games, pairMatchup (whole games, gVar 1.87)
const PSRC = { '2025-26': 'bbm', '2024-25': 'bbm', '2023-24': 'hs' };   // one source per season (the only one 2025-26 and 2023-24 have)
const K_MATCH = 0.72, K_CAT = 0.82, T0 = Date.now();
let done = 0;

function build(season) {
  const { P, ctx, cfg: cfg0 } = B.setup(season, { proj: PSRC[season] || 'avg', realAdp: true });
  const cfg = Object.assign({}, cfg0, { ilSpots: 0, scoring: 'h2h', order: 'snake', slot: 1 });
  const { weekly, nweeks } = DATA[season], G = SCHED[season].games, daily = DAILY[season].daily;
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  const cols = { p: { W: [], G: [], PM: [] }, y: [], wk: [], sd: [], cat: [], ck: [] }, pairWeeks = CKS.map(() => 0);
  let checks = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    done++; if (done > 1) { const el = (Date.now() - T0) / 1000, left = Math.round(el / (done - 1) * (SEEDS * SEASONS.length - done + 1)); process.stdout.write(`Estimated time remaining: ${Math.floor(left / 60)} min ${String(left % 60).padStart(2, '0')} s   `); }
    const r = S.rng(seed * 7919);
    const T = P.map(p => p.adpUse + gauss(r) * p.sd), order = P.map((_, i) => i).sort((a, b) => T[a] - T[b]), picks = order.slice(0, N * R);
    const res = E.evaluate(P, ctx, cfg, { picks });
    const tot = res.teams.map(t => {
      const w = Array.from({ length: nweeks }, () => new Array(11).fill(0));
      t.roster.forEach(e => { const pw = weekly[String(e.p.pid)] || {}; for (const k in pw) for (let c = 0; c < 11; c++) w[k][c] += pw[k][c]; });
      return w;
    });
    const used = new Set(picks), rest = P.filter((p, i) => !used.has(i) && p.g > 0).sort((a, b) => a.adpUse - b.adpUse);
    const e = TW.engCtxFrom(picks.map(i => P[i]).filter(p => p.g > 0).concat(rest), N, R, 9);
    CKS.forEach((w0, ci) => {
      const weeks = []; for (let w = w0; w < nweeks; w++) if (!tot.some(t => t[w][1] === 0)) weeks.push(w);
      const nRem = weeks.length;
      if (!nRem) return;
      const recent = pid => (daily[String(pid)] || []).some(x => x[0] >= 7 * w0 - 14 && x[0] <= 7 * w0 - 1);
      const entries = (t, mode) => t.roster.map(x => {
        const rows = G[x.p.t] || [], whole = recent(x.p.pid) ? weeks.reduce((s, w) => s + (rows[w] || 0), 0) / nRem : 0;
        return { p: x.p, games: mode === 'G' ? whole * Math.min(1, x.p.g / 82) : whole, gVar: 1.87 };
      });
      const outW = TW.evalVecs(e, res.teams.map(t => TW.teamVec(e, entries(t, 'W')))), outG = TW.evalVecs(e, res.teams.map(t => TW.teamVec(e, entries(t, 'G'))));
      const ent = res.teams.map(t => entries(t, 'W'));
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const fc = {
          W: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => outW.catProb(outW.teams[i], outW.teams[j], c)).concat(outW.pairProb(outW.teams[i], outW.teams[j])),
          G: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => outG.catProb(outG.teams[i], outG.teams[j], c)).concat(outG.pairProb(outG.teams[i], outG.teams[j]))
        };
        const pm = E.pairMatchup(ent[i], ent[j]); fc.PM = pm.cat.concat(pm.match);
        checks += Math.abs(outW.catProb(outW.teams[i], outW.teams[j], 0) + outW.catProb(outW.teams[j], outW.teams[i], 0) - 1) > 1e-6;
        for (const w of weeks) {
          const ci2 = cats(tot[i][w]), cj = cats(tot[j][w]); let wi = 0, wj = 0;
          for (let c = 0; c < 9; c++) {
            const v = ci2[c] > cj[c] ? 1 : ci2[c] < cj[c] ? 0 : 0.5; if (v === 1) wi++; else if (v === 0) wj++;
            SRC.forEach(s => cols.p[s].push(fc[s][c])); cols.y.push(v); cols.wk.push(w); cols.sd.push(seed); cols.cat.push(c); cols.ck.push(ci);
          }
          SRC.forEach(s => cols.p[s].push(fc[s][9])); cols.y.push(wi > wj ? 1 : wi < wj ? 0 : 0.5); cols.wk.push(w); cols.sd.push(seed); cols.cat.push(9); cols.ck.push(ci);
          pairWeeks[ci]++;
        }
      }
    });
  }
  const n = cols.y.length, D = { n, y: Float32Array.from(cols.y), wk: Uint8Array.from(cols.wk), sd: Uint8Array.from(cols.sd), cat: Uint8Array.from(cols.cat), ck: Uint8Array.from(cols.ck), p: {} };
  SRC.forEach(s => { D.p[s] = Float32Array.from(cols.p[s]); });
  return { D, pairWeeks, checks, season };
}

const f = (x, d = 4) => (x < 0 ? '' : ' ') + x.toFixed(d);
const OUT = []; const log = s => { OUT.push(s); };
const A = (src, kM, kC) => ({ src, kM, kC });
const BASE = A('W', 1, 1);

// fitted k per kind from a season (or both pooled via the combined D)
const fit = (D, src) => ({ kM: S.fitK(D, src, { kind: 'M' }), kC: S.fitK(D, src, { kind: 'C' }) });
const binsOk = (D, a, o) => S.bins(D, a, o).every(b => b.n < 200 || Math.abs(b.p - b.obs) <= 0.05);
const merge = (X, Y) => {
  const cat = (a, b) => { const c = new a.constructor(a.length + b.length); c.set(a); c.set(b, a.length); return c; };
  return { n: X.n + Y.n, y: cat(X.y, Y.y), wk: cat(X.wk, Y.wk), cat: cat(X.cat, Y.cat), ck: cat(X.ck, Y.ck), p: Object.fromEntries(SRC.map(s => [s, cat(X.p[s], Y.p[s])])) };
};

function report(R_) {
  const results = {};
  log(`#139 rest-of-season calibration  ${new Date().toISOString().slice(0, 10)}  seeds ${SEEDS}  checkpoints (start of weeks) ${CKS.map(c => c + 1).join(', ')}`);
  R_.forEach(r => log(`  ${r.season}: pair-weeks per checkpoint ${r.pairWeeks.join(' / ')}  (rows ${r.D.n}, symmetry failures ${r.checks})`));
  log('Caveat: rosters frozen at the draft and preseason lines even at week 16: the backtest looks more overconfident than the app, so a fitted k shrinks too much.');
  for (const r of R_) {
    const D = r.D, kE = fit(D, 'W'), kG = fit(D, 'G'), kP = fit(D, 'PM');
    const arms = [['E-ROS', BASE], ['E-ROS-k', A('W', kE.kM, kE.kC)], ['E-ROS-g82', A('G', 1, 1)], ['E-ROS-g82-k', A('G', kG.kM, kG.kC)], ['PM-sig-k', A('PM', K_MATCH, K_CAT)]];
    const res = results[r.season] = { k: { W: kE, G: kG, PM: kP }, arms: {} };
    log(`\n== ${r.season}  (k* in sample: E-ROS matchup ${kE.kM.toFixed(2)} cats ${kE.kC.toFixed(2)}; g82 ${kG.kM.toFixed(2)} / ${kG.kC.toFixed(2)})`);
    for (const [name, a] of arms) {
      const o = res.arms[name] = {};
      for (const [lab, kind] of [['matchup', 'M'], ['cats', 'C']]) {
        const oo = { kind }, d = name === 'E-ROS' ? { d: 0, se: 0 } : S.diffSE(D, a, BASE, oo);
        o[lab] = { brier: S.brier(D, a, oo), d: d.d, se: d.se, slope: S.slope(D, a, oo), bins: S.bins(D, a, oo) };
      }
      o.catSlopes = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => S.slope(D, a, { kind: c }));
      log(`${name.padEnd(12)} matchup Brier ${f(o.matchup.brier)} d ${f(o.matchup.d)} +-${o.matchup.se.toFixed(4)} slope ${o.matchup.slope.toFixed(2)} | cats Brier ${f(o.cats.brier)} d ${f(o.cats.d)} +-${o.cats.se.toFixed(4)} slope ${o.cats.slope.toFixed(2)}`);
      log(`             cat slopes ${o.catSlopes.map(x => x.toFixed(2)).join(' ')}`);
      for (const lab of ['matchup', 'cats']) log(`             ${lab} bins (n:p/obs) ${o[lab].bins.filter(b => b.n).map(b => `${b.n}:${b.p.toFixed(2)}/${b.obs.toFixed(2)}`).join('  ')}`);
    }
    log(`-- per checkpoint, matchup (Brier, slope, k*)`);
    res.ck = {};
    for (const [name, a] of [['E-ROS', BASE], ['E-ROS-g82', A('G', 1, 1)]]) {
      res.ck[name] = CKS.map((w0, ci) => { const oo = { kind: 'M', ck: ci }; return { week: w0 + 1, brier: S.brier(D, a, oo), slope: S.slope(D, a, oo), k: S.fitK(D, a.src, oo) }; });
      log(`${name.padEnd(12)} ` + res.ck[name].map(c => `wk${c.week}: ${c.brier.toFixed(4)} ${c.slope.toFixed(2)} ${c.k.toFixed(2)}`).join('   '));
    }
  }
  return results;
}

function verdict(R_, results) {
  const [s1, s2] = R_, names = R_.map(r => r.season), V = [];
  const slopeIn = (x, lo, hi) => x >= lo && x <= hi;
  // A: E-ROS passes on every season
  const aLines = R_.map(r => {
    const o = results[r.season].arms['E-ROS'], D = r.D, ck = results[r.season].ck['E-ROS'];
    const ok = slopeIn(o.matchup.slope, .85, 1.15) && slopeIn(o.cats.slope, .85, 1.15) && o.catSlopes.every(x => slopeIn(x, .8, 1.2)) && binsOk(D, BASE, { kind: 'M' }) && binsOk(D, BASE, { kind: 'C' }) && ck.every(c => slopeIn(c.slope, .8, 1.2));
    return { ok, text: `${r.season}: matchup slope ${o.matchup.slope.toFixed(2)}, cats slope ${o.cats.slope.toFixed(2)}, cat slopes ${Math.min(...o.catSlopes).toFixed(2)}-${Math.max(...o.catSlopes).toFixed(2)}, checkpoint matchup slopes ${ck.map(c => c.slope.toFixed(2)).join('/')}, bins ${binsOk(D, BASE, { kind: 'M' }) && binsOk(D, BASE, { kind: 'C' }) ? 'ok' : 'FAIL'}` };
  });
  const A_ok = aLines.every(l => l.ok);
  V.push(`A  keep unshrunk (E-ROS passes both seasons): ${A_ok ? 'PASS' : 'FAIL'}`); aLines.forEach(l => V.push('     ' + l.text));
  if (R_.length < 2) { V.push('B-E need two seasons (holdout); only one given.'); return V.concat(A_ok ? 'KEEP UNSHRUNK' : 'INCONCLUSIVE'); }
  // two-fold holdout: fit k on one season, score on the other
  const folds = [[s1, s2], [s2, s1]].map(([fitS, testS]) => {
    const kW = fit(fitS.D, 'W'), kG = fit(fitS.D, 'G'), D = testS.D, ek = A('W', kW.kM, kW.kC), gk = A('G', kG.kM, kG.kC), pm = A('PM', K_MATCH, K_CAT), o = { kind: 'M' };
    return { fitS: fitS.season, testS: testS.season, kW, ek, gk, pm,
      dE: S.diffSE(D, ek, BASE, o), dG: S.diffSE(D, gk, ek, o), dP: S.diffSE(D, pm, ek, o),
      slope: S.slope(D, ek, o), binsOk: binsOk(D, ek, { kind: 'M' }) && binsOk(D, ek, { kind: 'C' }) };
  });
  V.push('holdout (fit season -> test season): ' + folds.map(x => `${x.fitS}->${x.testS} k_M ${x.kW.kM.toFixed(2)} k_C ${x.kW.kC.toFixed(2)}: d vs E-ROS ${x.dE.d.toFixed(4)}+-${x.dE.se.toFixed(4)}, slope ${x.slope.toFixed(2)}, bins ${x.binsOk ? 'PASS' : 'FAIL'}`).join(' | '));
  const kGap = Math.abs(folds[0].kW.kM - folds[1].kW.kM), spread = Math.max(...R_.map(r => { const ks = results[r.season].ck['E-ROS'].map(c => c.k); return Math.max(...ks) - Math.min(...ks); }));
  const bBrier = folds.every(x => x.dE.d <= -x.dE.se), bSlope = folds.every(x => slopeIn(x.slope, .85, 1.15) && x.binsOk), bGap = kGap <= 0.10, bSpread = spread <= 0.15;
  const B_ok = !A_ok && bBrier && bSlope && bGap && bSpread;
  V.push(`B  ship a caller-side k: ${A_ok ? 'not needed' : B_ok ? 'PASS' : 'FAIL'}  (held-out Brier beats E-ROS by >=1 SE both folds: ${bBrier}; held-out slope .85-1.15 and bins: ${bSlope}; season k_M gap ${kGap.toFixed(2)} <= .10: ${bGap}; checkpoint k_M spread ${spread.toFixed(2)} <= .15: ${bSpread})`);
  const D_ = folds.every(x => x.dG.d <= -2 * x.dG.se);
  V.push(`D  g82 games beat whole games held-out by >=2 SE in both seasons: ${D_ ? 'YES, open a row on the Plays % games definition (user call)' : 'no'}  (` + folds.map(x => `${x.testS} ${x.dG.d.toFixed(4)}+-${x.dG.se.toFixed(4)}`).join(', ') + ')');
  const E_ = folds.every(x => x.dP.d <= -2 * x.dP.se);
  V.push(`E  PM-sig-k beats E-ROS-k held-out by >=2 SE in both seasons: ${E_ ? 'YES, flag to the user (decision 138 chose evaluate)' : 'no'}  (` + folds.map(x => `${x.testS} ${x.dP.d.toFixed(4)}+-${x.dP.se.toFixed(4)}`).join(', ') + ')');
  const both = merge(s1.D, s2.D), kb = fit(both, 'W'), r2 = x => Math.round(x * 100) / 100;
  if (A_ok) V.push('KEEP UNSHRUNK');
  else if (B_ok) V.push(`SHIP k_M=${r2(kb.kM)}, k_C=${r2(kb.kC)}`);
  else V.push(`INCONCLUSIVE (C: ${bBrier && bSlope ? 'only the season gap / checkpoint spread failed: open a row for a k that depends on weeks left' : 'held-out Brier, slope or bins failed'}; pooled k would be k_M=${r2(kb.kM)}, k_C=${r2(kb.kC)})`);
  return V;
}

if (require.main === module) {
  const R_ = SEASONS.map(s => { const r = build(s); return r; });
  const results = report(R_);
  log('\n== Verdict (rule fixed before the results)');
  const V = verdict(R_, results); V.forEach(log);
  fs.writeFileSync('results_calib_ros.txt', OUT.join('\n') + '\n');
  fs.writeFileSync('calib_ros.json', JSON.stringify({ seeds: SEEDS, results, verdict: V }));
}
module.exports = { build, verdict };
