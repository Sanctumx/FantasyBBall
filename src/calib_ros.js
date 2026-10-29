// Rest-of-season calibration of the Team tab's Win M / Win C (#139, 2026-10-26; analyst spec, built by the main session).
// Usage: node --max-old-space-size=4096 calib_ros.js [seeds=20] [season,season=2025-26,2024-25] [firstSeed=1]  -> results_calib_ros.txt, calib_ros.json
// Design:
//  - Rosters and actual weekly results are calib_pair.js's: 14 teams x 12 drafted by ADP with noise (seed*7919), all 91 pairs, all 12 active.
//  - At the start of weeks 4, 8, 12, 16 (0-based 3, 7, 11, 15) one forecast per team is made with the SHIPPED Team tab code
//    (TeamWin.engCtxFrom / teamVec / evalVecs): games per average remaining week x Engine.WEEKS, Engine.evaluate with one entry per team.
//    That forecast is scored against each remaining week's actual result (Win M on the Team tab is the chance of an average week).
//  - Games: whole = the NBA team's scheduled games over the remaining weeks / weeks (no g/82, as Team.windowGames); g82 = the same x min(1, g/82).
//    A player with no daily row in the 14 days before the checkpoint stands in for the IL slot: 0 forecast games (actuals still count him).
//  - Arms: E-ROS (whole, k 1; the shipped Team tab), E-ROS-k, E-ROS-g82, E-ROS-g82-k, E-ROS-mix, E-ROS-mix-k (#150, 2026-10-28: mix = the
//    midpoint of whole and g82 games, x (1 + min(1, g/82)) / 2, as the Mix basis does in engine.js), PM-sig-k (old Team tab: pairMatchup
//    whole games, gVar 1.87, k .72 / .82). Decision rule A-E: see verdict(); #150's shared-k rule is line F.
//  - Caveat: rosters are frozen at the draft and lines are preseason projections even at week 16, so the backtest looks more overconfident
//    than the app and a fitted k is conservative (shrinks too much).
const fs = require('fs');
const E = require('./engine.js'), B = require('./backtest.js'), TW = require('./team_win.js'), S = require('./calib_ros_stats.js');
const DATA = require('./bt_data.json'), SCHED = require('./bt_sched.json'), DAILY = require('./bt_daily.json');
const KWL = process.argv.includes('kwl');   // #156 mode, see the block before the verdict lines G-J below
const SEEDS = +(process.argv[2] || 20), SEASONS = (process.argv[3] || (KWL ? '2025-26,2024-25,2023-24,2022-23' : process.argv.includes('blend') ? '2025-26,2024-25,2023-24' : '2025-26,2024-25')).split(','), SEED0 = +(process.argv[4] || 1), N = 14, R = 12;
const CKS = KWL ? Array.from({ length: 11 }, (_, i) => 2 * i + 1) : [3, 7, 11, 15];   // kwl: the start of weeks 2, 4, ..., 22
let TOTAL_BUILDS = SEASONS.length;
const gauss = r => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
// #145 blend mode (5th argument "blend", or any argument "blend"): sources W (preseason lines, E-ROS), S (season-to-date blend), L (last-30-days
// blend), all on whole games; the n0 of each held-out season is fitted on the other seasons (calib_blend.js). Design: docs/superpowers/specs/2026-10-28-calib-blend-design.md
const BLEND = process.argv.includes('blend') || KWL, CB = require('./calib_blend.js');
// #156 kwl mode: sources W, S (STD), L30, L60, L90; the n0 of a build is { S, L30, L60, L90 } (blend mode: { S, L })
const WINOF = { S: 'STD', L: 'L30', L30: 'L30', L60: 'L60', L90: 'L90' };
const SRC = KWL ? ['W', 'S', 'L30', 'L60', 'L90'] : BLEND ? ['W', 'S', 'L'] : ['W', 'G', 'X', 'PM'];   // whole games, g82 games, mix (midpoint of the two), pairMatchup (whole games, gVar 1.87)
const INF_N0 = { g: Infinity, min: Infinity, fg: Infinity, ft: Infinity };
const PSRC = { '2025-26': 'bbm', '2024-25': 'bbm', '2023-24': 'hs', '2022-23': 'hs' };   // one source per season (the only one 2025-26 and 2023-24 have; 2022-23: 165 of 260 players have one, the rest keep the prior-season line)
const K_MATCH = 0.72, K_CAT = 0.82, T0 = Date.now();
let done = 0;

// the player-level samples of one season for the n0 fit (every projected player, every checkpoint)
function samplesOf(season) {
  const { P } = B.setup(season, { proj: PSRC[season] || 'avg', realAdp: true }), daily = DAILY[season].daily, out = [];
  P.forEach(p => { if (p.g > 0 && p.m > 0) CKS.forEach(w0 => out.push(CB.makeSample(p, daily[String(p.pid)] || [], w0))); });
  return out;
}

// n0 = { S: n0 for the season-to-date blend, L: for the 30-day blend } (blend mode only)
function build(season, n0) {
  const { P, ctx, cfg: cfg0 } = B.setup(season, { proj: PSRC[season] || 'avg', realAdp: true });
  const cfg = Object.assign({}, cfg0, { ilSpots: 0, scoring: 'h2h', order: 'snake', slot: 1 });
  const { weekly, nweeks } = DATA[season], G = SCHED[season].games, daily = DAILY[season].daily;
  const cats = s => [s[1] ? s[0] / s[1] : 0, s[3] ? s[2] / s[3] : 0, s[4], s[5], s[6], s[7], s[8], s[9], -s[10]];
  const cols = { p: Object.fromEntries(SRC.map(s => [s, []])), y: [], wk: [], sd: [], cat: [], ck: [] }, pairWeeks = CKS.map(() => 0), blended = new Map();
  // a roster player's line at checkpoint w0 for mode W (preseason), S or L (blend)
  const lineAt = (p, w0, mode) => {
    if (mode === 'W') return p;
    const key = p.pid + '|' + w0 + '|' + mode; let b = blended.get(key);
    if (!b) blended.set(key, b = CB.blendLine(p, daily[String(p.pid)] || [], w0, WINOF[mode], n0[mode]));
    return b;
  };
  let checks = 0;
  for (let seed = SEED0; seed < SEED0 + SEEDS; seed++) {
    done++; if (done > 1) { const el = (Date.now() - T0) / 1000, left = Math.round(el / (done - 1) * (SEEDS * TOTAL_BUILDS - done + 1)); process.stdout.write(`Estimated time remaining: ${Math.floor(left / 60)} min ${String(left % 60).padStart(2, '0')} s   `); }
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
        const share = Math.min(1, x.p.g / 82);
        return { p: BLEND ? lineAt(x.p, w0, mode) : x.p, games: mode === 'G' ? whole * share : mode === 'X' ? whole * (1 + share) / 2 : whole, gVar: 1.87 };
      });
      const modes = SRC.filter(s => s !== 'PM'), outs = {};
      modes.forEach(s => { outs[s] = TW.evalVecs(e, res.teams.map(t => TW.teamVec(e, entries(t, s)))); });
      const outW = outs.W, ent = res.teams.map(t => entries(t, 'W'));
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const fc = {};
        modes.forEach(s => { const o = outs[s]; fc[s] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => o.catProb(o.teams[i], o.teams[j], c)).concat(o.pairProb(o.teams[i], o.teams[j])); });
        if (!BLEND) { const pm = E.pairMatchup(ent[i], ent[j]); fc.PM = pm.cat.concat(pm.match); }
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
  for (const k of ['wk', 'sd', 'cat', 'ck']) if (cols[k].some(v => v > 255)) throw new Error(`calib_ros: ${k} above 255 would wrap in a Uint8Array`);
  const n = cols.y.length, D = { n, y:Float32Array.from(cols.y), wk: Uint8Array.from(cols.wk), sd: Uint8Array.from(cols.sd), cat: Uint8Array.from(cols.cat), ck: Uint8Array.from(cols.ck), p: {} };
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
  return { n: X.n + Y.n, y: cat(X.y, Y.y), wk: cat(X.wk, Y.wk), sd: cat(X.sd, Y.sd), cat: cat(X.cat, Y.cat), ck: cat(X.ck, Y.ck), p: Object.fromEntries(SRC.map(s => [s, cat(X.p[s], Y.p[s])])) };
};

function report(R_) {
  const results = {};
  log(`#139 rest-of-season calibration  ${new Date().toISOString().slice(0, 10)}  seeds ${SEEDS}  checkpoints (start of weeks) ${CKS.map(c => c + 1).join(', ')}`);
  R_.forEach(r => log(`  ${r.season}: pair-weeks per checkpoint ${r.pairWeeks.join(' / ')}  (rows ${r.D.n}, symmetry failures ${r.checks})`));
  log('Caveat: rosters frozen at the draft and preseason lines even at week 16: the backtest looks more overconfident than the app, so a fitted k shrinks too much.');
  for (const r of R_) {
    const D = r.D, kE = fit(D, 'W'), kG = fit(D, 'G'), kX = fit(D, 'X'), kP = fit(D, 'PM');
    const arms = [['E-ROS', BASE], ['E-ROS-k', A('W', kE.kM, kE.kC)], ['E-ROS-g82', A('G', 1, 1)], ['E-ROS-g82-k', A('G', kG.kM, kG.kC)],
      ['E-ROS-mix', A('X', 1, 1)], ['E-ROS-mix-k', A('X', kX.kM, kX.kC)], ['PM-sig-k', A('PM', K_MATCH, K_CAT)]];
    const res = results[r.season] = { k: { W: kE, G: kG, X: kX, PM: kP }, arms: {} };
    log(`\n== ${r.season}  (k* in sample: E-ROS matchup ${kE.kM.toFixed(2)} cats ${kE.kC.toFixed(2)}; g82 ${kG.kM.toFixed(2)} / ${kG.kC.toFixed(2)}; mix ${kX.kM.toFixed(2)} / ${kX.kC.toFixed(2)})`);
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

// #150 rule F (fixed before the results): one shared k for whole, g82 and mix games if, in every season, each basis's fitted k_M is within
// .05 of whole games' and its fitted-k Brier is within 1 SE of whole games' fitted-k Brier (matchup); otherwise one k per basis.
function sharedK(R_, results) {
  const lines = R_.map(r => {
    const k = results[r.season].k, o = { kind: 'M' }, base = A('W', k.W.kM, k.W.kC);
    const per = ['G', 'X'].map(s => { const d = S.diffSE(r.D, A(s, k[s].kM, k[s].kC), base, o); return { s, gap: Math.abs(k[s].kM - k.W.kM), d: d.d, se: d.se, ok: Math.abs(k[s].kM - k.W.kM) <= 0.05 && Math.abs(d.d) <= d.se }; });
    return { ok: per.every(p => p.ok), text: `${r.season}: ` + per.map(p => `${p.s === 'G' ? 'g82' : 'mix'} k_M gap ${p.gap.toFixed(2)}, Brier d ${p.d.toFixed(4)}+-${p.se.toFixed(4)}`).join('; ') };
  });
  return [`F  one shared k across games bases (#150): ${lines.every(l => l.ok) ? 'YES' : 'NO, fit one k per basis'}`].concat(lines.map(l => '     ' + l.text));
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
  sharedK(R_, results).forEach(l => V.push(l));
  const both = merge(s1.D, s2.D), kb = fit(both, 'W'), r2 = x => Math.round(x * 100) / 100;
  if (A_ok) V.push('KEEP UNSHRUNK');
  else if (B_ok) V.push(`SHIP k_M=${r2(kb.kM)}, k_C=${r2(kb.kC)}`);
  else V.push(`INCONCLUSIVE (C: ${bBrier && bSlope ? 'only the season gap / checkpoint spread failed: open a row for a k that depends on weeks left' : 'held-out Brier, slope or bins failed'}; pooled k would be k_M=${r2(kb.kM)}, k_C=${r2(kb.kC)})`);
  return V;
}

// ---- #145 blend mode: report and verdict lines G-J (rules fixed in the design doc before any result) ----
const n0s = n => ['g', 'min', 'fg', 'ft'].map(k => `${k} ${n[k] === Infinity ? 'inf' : n[k]}`).join(', ');
const NAME = { W: 'E-ROS-k', S: 'STD-k', L: 'L30-k' }, WIN = { S: 'STD', L: 'L30' };

// k for each season's held-out fold: fitted on the other seasons only (every arm on its own forecasts)
function blendFolds(R_) {
  return R_.map(r => {
    const others = R_.filter(x => x !== r).map(x => x.D).reduce(merge), arm = {}, raw = {};
    SRC.forEach(s => { arm[s] = A(s, S.fitK(others, s, { kind: 'M' }), S.fitK(others, s, { kind: 'C' })); raw[s] = A(s, 1, 1); });
    return { season: r.season, D: r.D, arm, raw };
  });
}
const pm4 = d => `${f(d.d)} +-${d.se.toFixed(4)} (wk ${d.seWeek.toFixed(4)}, seed ${d.seSeed.toFixed(4)})`;

function blendReport(R_, samples, FIT, folds) {
  const out = { folds: {}, rmse: {}, playerOk: {}, kIn: {}, kCk: {} };
  log(`#145 blend backtest  ${new Date().toISOString().slice(0, 10)}  seeds ${SEED0}-${SEED0 + SEEDS - 1}  seasons ${SEASONS.join(', ')}  checkpoints (start of weeks) ${CKS.map(c => c + 1).join(', ')}${process.env.N0INF ? '  [N0INF sanity run]' : ''}`);
  log('Frozen rosters and whole games, as #150. n0 and k of each season come from the other seasons only (n0 is fitted on players; the k of a training season used its own held-out n0: a small known leak).');
  for (const r of R_) {
    const D = r.D, fo = folds.find(x => x.season === r.season), S_ = samples[r.season];
    log(`\n== ${r.season}  (rows ${D.n}, pair-weeks per checkpoint ${r.pairWeeks.join(' / ')}, symmetry failures ${r.checks})`);
    for (const m of ['S', 'L']) {
      const ft = FIT[r.season][m], inf = ft.curves.g ? ft.curves.g[ft.curves.g.length - 1][1] : 1;
      log(`n0 ${NAME[m]} (fitted on the other seasons): ${n0s(ft.n0)}${ft.edge.length ? '   AT GRID EDGE: ' + ft.edge.join(',') : ''}`);
      for (const k of ['g', 'min', 'fg', 'ft']) if (ft.curves[k]) { const base = ft.curves[k][ft.curves[k].length - 1][1]; log(`   loss vs inf, n0.${k}: ` + ft.curves[k].map(([v, l]) => `${v === Infinity ? 'inf' : v}:${(l / base).toFixed(3)}`).join(' ')); }
    }
    const mk = { M: { kind: 'M' }, C: { kind: 'C' } };
    out.folds[r.season] = {};
    for (const s of SRC) {
      const a = fo.arm[s], base = fo.arm.W, oM = { kind: 'M' }, oC = { kind: 'C' };
      const dM = s === 'W' ? { d: 0, se: 0, seWeek: 0, seSeed: 0 } : S.diffSE(D, a, base, oM), dC = s === 'W' ? { d: 0, se: 0, seWeek: 0, seSeed: 0 } : S.diffSE(D, a, base, oC);
      const raw = s === 'W' ? { d: 0, se: 0 } : S.diffSE(D, fo.raw[s], fo.raw.W, oM);
      const ck = CKS.map((w0, ci) => s === 'W' ? { d: 0, se: 0 } : S.diffSE(D, a, base, { kind: 'M', ck: ci }));
      const inK = { kM: S.fitK(D, s, oM), kC: S.fitK(D, s, oC) };
      out.folds[r.season][s] = { dM, dC, ck, brierM: S.brier(D, a, oM), brierC: S.brier(D, a, oC), slopeM: S.slope(D, a, oM), slopeC: S.slope(D, a, oC), kHeld: { kM: a.kM, kC: a.kC }, kIn: inK };
      log(`${NAME[s].padEnd(8)} held-out k_M ${a.kM.toFixed(2)} k_C ${a.kC.toFixed(2)} (in-sample ${inK.kM.toFixed(2)} / ${inK.kC.toFixed(2)}) | matchup Brier ${f(out.folds[r.season][s].brierM)} d ${pm4(dM)} slope ${out.folds[r.season][s].slopeM.toFixed(2)} | cats Brier ${f(out.folds[r.season][s].brierC)} d ${pm4(dC)} slope ${out.folds[r.season][s].slopeC.toFixed(2)}`);
      if (s !== 'W') {
        log(`         per checkpoint matchup d vs E-ROS-k: ` + ck.map((c, i) => `wk${CKS[i] + 1} ${f(c.d)}+-${c.se.toFixed(4)}`).join('  ') + `   | unshrunk (k 1) vs E-ROS unshrunk: ${f(raw.d)}+-${raw.se.toFixed(4)}`);
        for (const lab of [['matchup', oM], ['cats', oC]]) log(`         ${lab[0]} bins (n:p/obs) ${S.bins(D, a, lab[1]).filter(b => b.n).map(b => `${b.n}:${b.p.toFixed(2)}/${b.obs.toFixed(2)}`).join('  ')}`);
      }
    }
    // held-out player lines: weighted RMSE by stat and checkpoint, preseason vs each blend; "ok" = the normalized counting-stat loss falls below preseason's
    out.rmse[r.season] = {}; out.playerOk[r.season] = { S: [], L: [] };
    CKS.forEach(w0 => {
      const Sc = S_.filter(x => x.w0 === w0), sp = CB.spreads(Sc), pre = CB.rmse(Sc, 'PRE'), fmt = o => Object.keys(o).map(k => `${k} ${o[k].toFixed(3)}`).join(' ');
      log(`player RMSE wk${w0 + 1} (n ${Sc.length}; no rows before the checkpoint ${Sc.filter(x => !x.std.gp).length}, none after ${Sc.filter(x => !x.rest.gp).length}):`);
      log(`   PRE  ${fmt(pre)}`);
      for (const m of ['S', 'L']) {
        const n0 = FIT[r.season][m].n0, b = CB.rmse(Sc, WIN[m], n0), lb = CB.loss(Sc, n0, WIN[m], sp, 'count'), lp = CB.loss(Sc, INF_N0, WIN[m], sp, 'count');
        out.playerOk[r.season][m].push(lb < lp); log(`   ${WIN[m].padEnd(4)} ${fmt(b)}   counting loss ${(lb / lp).toFixed(3)} of preseason`);
      }
    });
  }
  return out;
}

function blendVerdict(R_, rep, folds) {
  const V = [], seasons = R_.map(r => r.season), pick = (s, f_) => seasons.map(x => rep.folds[x][s][f_]);
  const G = {};
  for (const s of ['S', 'L']) {
    const dM = pick(s, 'dM'), dC = pick(s, 'dC');
    G[s] = { ok: dM.every(d => d.d <= -2 * d.se) && dC.every(d => d.d <= 0), noise: dM.filter(d => Math.abs(d.d) <= d.se).length >= 2 || (dM.some(d => d.d > 0) && dM.some(d => d.d < 0)),
      neg: dM.every(d => d.d < 0), n2: dM.filter(d => d.d <= -2 * d.se).length, player: seasons.every(x => rep.playerOk[x][s].every(Boolean)) };
    V.push(`G  ${NAME[s]} beats E-ROS-k held-out by >=2 SE (max of week and seed SE) in each season, cats d <= 0 in each: ${G[s].ok ? 'PASS' : 'FAIL'}  (matchup ` + seasons.map((x, i) => `${x} ${dM[i].d.toFixed(4)}+-${dM[i].se.toFixed(4)}`).join(', ') + '; cats ' + dC.map(d => d.d.toFixed(4)).join('/') + ')');
  }
  // I: L30 over STD only if >= 1 SE better (paired) on held-out matchup Brier in all 3 seasons
  const dLS = folds.map(fo => S.diffSE(fo.D, fo.arm.L, fo.arm.S, { kind: 'M' })), Ipass = dLS.every(d => d.d <= -d.se), win = Ipass ? 'L' : 'S';
  V.push(`I  L30 over STD (>=1 SE better in every season, paired): ${Ipass ? 'YES' : 'no, use STD'}  (` + seasons.map((x, i) => `${x} ${dLS[i].d.toFixed(4)}+-${dLS[i].se.toFixed(4)}`).join(', ') + ')');
  // H on the chosen window: pooled-checkpoint k_M (each checkpoint on all seasons) spread, and the range of single-season in-sample k_M
  const all = R_.map(r => r.D).reduce(merge), kCk = s => CKS.map((w0, ci) => S.kSE(all, s, { kind: 'M', ck: ci })), kw = kCk('W'), kb = kCk(win);
  const spread = a => Math.max(...a.map(x => x.k)) - Math.min(...a.map(x => x.k)), inK = seasons.map(x => rep.folds[x][win].kIn.kM), range = Math.max(...inK) - Math.min(...inK);
  const unin = kb.some(x => x.se > 0.05), hOk = spread(kb) <= 0.15 && spread(kb) <= spread(kw) / 2 && range <= 0.10, H = unin ? 'UNINFORMATIVE (a checkpoint k* has SE > .05)' : hOk ? 'PASS' : 'FAIL';
  V.push(`H  k stops climbing with weeks (${NAME[win]}): ${H}  pooled k_M by checkpoint ${kb.map(x => x.k.toFixed(2) + '+-' + x.se.toFixed(2)).join(' / ')} (spread ${spread(kb).toFixed(2)} <= .15 and <= half of E-ROS-k's ${spread(kw).toFixed(2)}: ${spread(kb) <= 0.15 && spread(kb) <= spread(kw) / 2}); E-ROS-k ${kw.map(x => x.k.toFixed(2) + '+-' + x.se.toFixed(2)).join(' / ')}; single-season in-sample k_M ${inK.map(x => x.toFixed(2)).join(' / ')} (range ${range.toFixed(2)} <= .10: ${range <= 0.10})`);
  const g = G[win];
  V.push(`J  ${g.ok ? (H === 'PASS' ? 'G pass + H pass: user call on putting the blend in the app lines with one pooled k' : H.startsWith('FAIL') ? 'G pass + H fail: open a k-by-weeks-left row' : 'G pass, H uninformative: more seeds or a confirmation fold on 2022-23 before a decision') : 'G not passed: nothing to decide'}`);
  const cls = g.ok && g.player ? 'REAL EFFECT' : g.noise ? 'NOISE' : (g.neg && !g.player) ? 'SUSPICIOUS (Brier improves, player RMSE does not)' : (g.neg && g.n2 >= 1) ? 'INCONCLUSIVE (d < 0 in all seasons, only ' + g.n2 + ' pass 2 SE: confirm on 2022-23)' : 'NOISE/NONE';
  V.push(`Judged on ${NAME[win]}: ${cls}  (player RMSE better at every checkpoint in every season: ${g.player})`);
  return V;
}

// ---- #156 kwl mode (design: docs/superpowers/specs/2026-10-28-calib-kwl-design.md; gates K-N fixed there before any result) ----
// Per fold (held-out season T): k is fitted on the training seasons' forecasts, each built with an n0 fitted on the seasons other than itself and T
// (nested), and scored on T's forecasts (n0 fitted on the seasons other than T). Forms: K0 one k, K1 k = a + b t (t = days played / 175), Kck per checkpoint.
const LG = require('./calib_lag.js'), { lagBucket, LAG_NAMES } = LG;
const TCK = CKS.map(w0 => 7 * w0 / 175), KINDS = [['M', { kind: 'M' }], ['C', { kind: 'C' }]];
const tab = f => TCK.map(t => f.a + f.b * t);
function lagSums(D, src) {   // matchup rows: sum (p - .5)(y - .5) and sum (p - .5)^2 by lag bucket
  const s = LAG_NAMES.map(() => [0, 0]), p = D.p[src];
  for (let i = 0; i < D.n; i++) if (D.cat[i] === 9) { const b = s[lagBucket(D.wk[i] - CKS[D.ck[i]])], d = p[i] - 0.5; b[0] += d * (D.y[i] - 0.5); b[1] += d * d; }
  return s;
}
function p1Fit(D, src) {   // P1 probit shrink Phi(Phi^-1(p) (a + b t)), in sample on matchup rows, coarse grid; printed only
  const KW = require('./calib_kwl.js'), z = [], y = [], t = []; const p = D.p[src];
  for (let i = 0; i < D.n; i++) if (D.cat[i] === 9) { z.push(KW.normInv(Math.min(0.9999, Math.max(0.0001, p[i])))); y.push(D.y[i]); t.push(TCK[D.ck[i]]); }
  let best = { a: 1, b: 0, brier: Infinity };
  for (let a = 0.3; a <= 1.101; a += 0.1) for (let b = -0.3; b <= 0.701; b += 0.1) {
    let s = 0; for (let i = 0; i < z.length; i++) { const e = KW.normCdf(z[i] * (a + b * t[i])) - y[i]; s += e * e; }
    if (s / z.length < best.brier) best = { a, b, brier: s / z.length };
  }
  return best;
}
// #157 k by lag on matchup cells (calib_lag.js): forms fitted on the training seasons, scored on the held-out season; the cells are kept for later variants
function lagFold(o, cellsOut, trainD, D, s) {
  const F = LG.FEATURES, cTr = LG.cellSums(trainD, s, CKS, TCK), cTe = LG.cellSums(D, s, CKS, TCK), fit = f => LG.fitKX(cTr, f);
  const b = { K0: fit(F.K0), K1: fit(F.K1), KL: fit(F.KL), KLt: fit(F.KLt), KLs: fit(F.KLs) }, kf = n => c => LG.dot(b[n], F[n](c));
  const brier = {}; for (const n of Object.keys(b)) brier[n] = LG.brierCells(cTe, kf(n));
  o.lag = { b, brier, dKL: LG.diffCells(cTe, kf('KL'), kf('K1')), dKLt: LG.diffCells(cTe, kf('KLt'), kf('K1')), bT: { b: b.KLt[5], seB: LG.fitKXSE(cTr, F.KLt, 5) }, k1SeB: LG.fitKXSE(cTr, F.K1, 1),
    k01: LG.kBucket(cTe, 0), k01Train: LG.kBucket(cTr, 0) };
  const pack = cs => cs.map(c => [c.wk, c.ck, c.sd, c.n, c.dd, c.de, c.ee]);
  cellsOut.train = pack(cTr); cellsOut.test = pack(cTe);
}
function kwlMain() {
  const KW = require('./calib_kwl.js'), primary = SEASONS.slice(0, 3), confirm = SEASONS[3], plan = KW.foldPlan(primary, confirm);
  TOTAL_BUILDS = plan.reduce((s, f) => s + f.nTrainBuilds + 1, 0);
  const samples = Object.fromEntries(SEASONS.map(s => [s, samplesOf(s)])), fitCache = new Map();
  const n0Of = pool => { const key = pool.join(); if (!fitCache.has(key)) { const o = {}; for (const [m, win] of [['S', 'STD'], ['L30', 'L30'], ['L60', 'L60'], ['L90', 'L90']]) o[m] = CB.fitOn(samples, pool, { win }); fitCache.set(key, o); } return fitCache.get(key); };
  const n0Of1 = (A, T) => { const f = n0Of(KW.nestedPool(SEASONS, A, T)); return { S: f.S.n0, L30: f.L30.n0, L60: f.L60.n0, L90: f.L90.n0 }; };
  log(`#156 k by weeks left  ${new Date().toISOString().slice(0, 10)}  seeds ${SEED0}-${SEED0 + SEEDS - 1}  seasons ${SEASONS.join(', ')} (${confirm} confirmation only)  checkpoints (start of weeks) ${CKS.map(c => c + 1).join(', ')}`);
  log('Frozen rosters and whole games, as #145. Each training season forecasts with an n0 fitted without it and without the held-out season (nested). t = days played / 175.');
  const FO = {}, LAGS = {}, INA = {}, P1 = {}, CELLS = {};
  for (const fold of plan) {
    const T = fold.test, trainD = fold.train.map(A => build(A, n0Of1(A, T)).D).reduce(merge), r = build(T, n0Of1(null, T)), D = r.D, nT = n0Of(KW.nestedPool(SEASONS, null, T));
    log(`\n== ${T}${fold.confirm ? ' (confirmation: k fitted on all primary seasons)' : ''}  (rows ${D.n}, pair-weeks per checkpoint ${r.pairWeeks.join('/')}, symmetry failures ${r.checks})`);
    for (const m of ['S', 'L30', 'L60', 'L90']) log(`n0 ${m} (fitted on ${KW.nestedPool(SEASONS, null, T).join(', ')}): ${n0s(nT[m].n0)}${nT[m].edge.length ? '   AT GRID EDGE: ' + nT[m].edge.join(',') : ''}`);
    const fo = FO[T] = {}; LAGS[T] = {}; INA[T] = {}; P1[T] = {}; CELLS[T] = {};
    for (const s of SRC) {
      fo[s] = {}; lagFold(fo[s], CELLS[T][s] = {}, trainD, D, s);
      const o = fo[s];
      for (const [kn, oo] of KINDS) {
        const k0 = S.fitK(trainD, s, oo), lin = S.kLinSE(trainD, s, oo, TCK), kck = CKS.map((w, ci) => S.fitK(trainD, s, Object.assign({ ck: ci }, oo)));
        const pick = k => A(s, kn === 'M' ? k : 1, kn === 'C' ? k : 1), a0 = pick(k0), a1 = pick(tab(lin)), aC = pick(kck);
        const star = CKS.map((w, ci) => S.fitK(D, s, Object.assign({ ck: ci }, oo)));
        o[kn] = { k0, lin, kck, brier: { K0: S.brier(D, a0, oo), K1: S.brier(D, a1, oo), Kck: S.brier(D, aC, oo) }, dK1: S.diffSE(D, a1, a0, oo), dCk: S.diffSE(D, aC, a1, oo), kStar: star,
          spreadK0: KW.ratioSpread(star, star.map(() => k0)), spreadK1: KW.ratioSpread(star, tab(lin)), train: { a: lin.a, b: lin.b, seB: lin.seB }, inK1: S.fitKLin(D, s, oo, TCK), slopeK1: S.slope(D, a1, oo) };
        if (s !== 'W') o[kn].dVsW = S.diffSE(D, a1, A('W', kn === 'M' ? tab(fo.W[kn].lin) : 1, kn === 'C' ? tab(fo.W[kn].lin) : 1), oo);
      }
      LAGS[T][s] = lagSums(D, s); P1[T][s] = p1Fit(D, s); INA[T][s] = o.M.inK1.a + 0.5 * o.M.inK1.b;
      const L = o.M, f4 = x => x.toFixed(2);
      log(`${s.padEnd(3)} matchup: K0 k ${f4(L.k0)} | K1 a ${f4(L.lin.a)} b ${f4(L.lin.b)} +-${L.lin.seB.toFixed(2)} | held-out Brier K0 ${L.brier.K0.toFixed(4)} K1 ${L.brier.K1.toFixed(4)} Kck ${L.brier.Kck.toFixed(4)} | K1 vs K0 ${pm4(L.dK1)} | Kck vs K1 ${pm4(L.dCk)} | spread k*/k K0 ${f4(L.spreadK0)} K1 ${f4(L.spreadK1)} | P1 a ${f4(P1[T][s].a)} b ${f4(P1[T][s].b)} Brier ${P1[T][s].brier.toFixed(4)}`);
      log(`    cats: K0 k ${f4(o.C.k0)} | K1 a ${f4(o.C.lin.a)} b ${f4(o.C.lin.b)} +-${o.C.lin.seB.toFixed(2)} | K1 vs K0 ${pm4(o.C.dK1)}`);
      log(`    k* by checkpoint (matchup): ${L.kStar.map(x => x.toFixed(2)).join(' ')}`);
      const G = o.lag, br = n => G.brier[n].toFixed(4);
      log(`    by lag: held-out Brier K0 ${br('K0')} K1 ${br('K1')} KL ${br('KL')} KLt ${br('KLt')} KLs ${br('KLs')} | KL vs K1 ${pm4(G.dKL)} | KLt vs K1 ${pm4(G.dKLt)} | t term b ${f4(G.bT.b)} +-${G.bT.seB.toFixed(2)} (K1 b +-${G.k1SeB.toFixed(2)}) | k by lag (train) ${G.b.KL.slice(0, 5).map(x => x.toFixed(2)).join(' / ')} | lag 0-1 k held-out ${f4(G.k01.k)} +-${G.k01.se.toFixed(2)}`);
    }
    // windows against STD, only at the checkpoints where the window differs from season-to-date, with the held-out k
    fo.win = {};
    for (const [w, days] of [['L30', 30], ['L60', 60], ['L90', 90]]) {
      const mask = CKS.map(w0 => 7 * w0 > days), oo = { kind: 'M', f: i => mask[D.ck[i]] }, Sc = samples[T].filter(x => 7 * x.w0 > days), sp = CB.spreads(Sc);
      const dW = S.diffSE(D, A(w, fo[w].M.k0, 1), A('S', fo.S.M.k0, 1), oo), player = CB.loss(Sc, nT[w].n0, w, sp, 'count') < CB.loss(Sc, nT.S.n0, 'STD', sp, 'count');
      fo.win[w] = { d: dW, player, checkpoints: mask.filter(Boolean).length };
      log(`${w} vs STD at the ${mask.filter(Boolean).length} checkpoints where they differ: matchup d ${pm4(dW)}, player counting loss lower: ${player}`);
    }
  }
  // lag diagnostic: pooled k* by lag (outcome week - checkpoint) on the primary seasons
  const lagK = s => LAG_NAMES.map((n, b) => { let xy = 0, xx = 0; for (const T of primary) { xy += LAGS[T][s][b][0]; xx += LAGS[T][s][b][1]; } return xy / xx; });
  log('\nk* by lag (outcome week - checkpoint), matchup, pooled on the primary seasons, lags ' + LAG_NAMES.join(' / '));
  for (const s of SRC) log(`   ${s.padEnd(3)} ${lagK(s).map(x => x.toFixed(2)).join(' / ')}`);
  // verdict
  const V = [], pf = primary.map(T => FO[T]), cf = FO[confirm], M = KW.gateM(pf.map(f => ({ dW: Object.fromEntries(Object.entries(f.win).map(([w, x]) => [w, { d: x.d, player: x.player }])) })));
  const src = M.pick === 'STD' ? 'S' : M.pick, r2 = x => Math.round(x * 100) / 100;
  V.push(`M  window: ${M.pick}  (windows passing >= 1 SE and lower player loss in all 3 seasons: ${M.passing.join(', ') || 'none'}; ` + ['L30', 'L60', 'L90'].map(w => w + ' ' + pf.map(f => f.win[w].d.d.toFixed(4) + '+-' + f.win[w].d.se.toFixed(4)).join('/')).join('; ') + ')');
  const gate = (name, s, kn) => { const g = KW.gateK(pf.map(f => f[s][kn]), cf[s][kn].dK1); V.push(`K${kn === 'C' ? '_C' : ''} ${name}: ${g.pass ? 'PASS' : 'FAIL'}  (K1 beats K0 by >= 1 SE in each fold: ${g.brier}; b > 0 and >= 2 SE in every training fold: ${g.slope} [b ` + pf.map(f => f[s][kn].train.b.toFixed(2) + '+-' + f[s][kn].train.seB.toFixed(2)).join(' / ') + `]; k*/k spread smaller in 2 of 3: ${g.spread}; ${confirm} d < 0: ${g.conf} [${cf[s][kn].dK1.d.toFixed(4)}+-${cf[s][kn].dK1.se.toFixed(4)}]; K1 vs K0 ` + pf.map(f => f[s][kn].dK1.d.toFixed(4) + '+-' + f[s][kn].dK1.se.toFixed(4)).join(' / ') + ')'); return g; };
  const gM = gate(`k by weeks left on ${M.pick} lines (matchup)`, src, 'M'), gC = gate(`k by weeks left on ${M.pick} lines (category)`, src, 'C'), gW = src === 'W' ? gM : gate('k by weeks left on preseason lines (matchup)', 'W', 'M');
  const gL = KW.gateL(pf.map(f => f[src].M));
  V.push(`L  per-checkpoint k over the straight line (>= 2 SE in every fold): ${gL.pass ? 'YES, use a table' : 'no, use k = a + b t'}  (Kck vs K1 ` + pf.map(f => f[src].M.dCk.d.toFixed(4) + '+-' + f[src].M.dCk.se.toFixed(4)).join(' / ') + ')');
  const gN = KW.gateN(primary.map(T => INA[T][src]));
  V.push(`N  mid-season k level by season ${primary.map(T => T + ' ' + INA[T][src].toFixed(2)).join(', ')} (range ${gN.range.toFixed(2)}): ${gN.uncertain ? 'UNCERTAIN, the level is the user\'s call whatever K says' : 'stable'}`);
  const bSig = pf.every(f => f[src].M.train.b > 0 && f[src].M.train.b >= 2 * f[src].M.train.seB);
  V.push(gM.pass ? `RESULT: K PASS on ${M.pick} lines: candidate k(t) = a + b t pooled over the 3 seasons; STD lines ship only with a blend-lines decision and after #146; the preseason-lines version ${gW.pass ? 'also passes and could ship alone (user call)' : 'does not pass on its own'}` : bSig ? 'RESULT: K fails but b is significant: the climb is real, too small to change Brier; keep one k' : 'RESULT: b not significant in every training fold: close #156 as No');
  // #157 gate O (fixed in the design before any result) and line P
  const gO = KW.gateO(pf.map(f => ({ bT: f[src].lag.bT, dKL: f[src].lag.dKL, k1SeB: f[src].lag.k1SeB })), cf[src].lag.dKL), lagLine = f => f[src].lag;
  V.push(`O  k by lag over the straight line on ${M.pick} lines (t term |b| < 2 SE in every training fold AND KL beats K1 by >= 1 SE held-out in every fold): ${gO.pass ? 'ADOPT k(lag), confirm on fresh seeds after #146' : 'NO'}  (t term b ` + pf.map(f => lagLine(f).bT.b.toFixed(2) + '+-' + lagLine(f).bT.seB.toFixed(2)).join(' / ') + `${gO.unidentified ? ' [b unidentified: SE over twice the K1 SE]' : ''}; KL vs K1 ` + pf.map(f => lagLine(f).dKL.d.toFixed(4) + '+-' + lagLine(f).dKL.se.toFixed(4)).join(' / ') + `; ${confirm} KL vs K1 d < 0: ${gO.conf} [${cf[src].lag.dKL.d.toFixed(4)}+-${cf[src].lag.dKL.se.toFixed(4)}])`);
  V.push(`P  lag 0-1 k (the Team tab's Win M is this week's matchup; shipped 0.60, expected .74-.80) held-out by season on ${M.pick} lines: ` + SEASONS.map(T => T + ' ' + FO[T][src].lag.k01.k.toFixed(2) + '+-' + FO[T][src].lag.k01.se.toFixed(2)).join(', '));
  V.forEach(log);
  fs.writeFileSync('calib_lag_cells.json', JSON.stringify({ seeds: SEEDS, seed0: SEED0, cks: CKS, tck: TCK, fields: ['wk', 'ck', 'sd', 'n', 'dd', 'de', 'ee'], cells: CELLS }));
  fs.writeFileSync('results_calib_kwl.txt', OUT.join('\n') + '\n');
  fs.writeFileSync('calib_kwl.json', JSON.stringify({ seeds: SEEDS, seed0: SEED0, cks: CKS, folds: FO, lags: LAGS, inA: INA, p1: P1, verdict: V }));
  process.exit(0);
}
if (require.main === module && KWL) kwlMain();
else if (require.main === module && BLEND) {
  const samples = Object.fromEntries(SEASONS.map(s => [s, samplesOf(s)])), FIT = {};
  SEASONS.forEach(s => { FIT[s] = {}; for (const [m, win] of [['S', 'STD'], ['L', 'L30']]) FIT[s][m] = process.env.N0INF ? { n0: INF_N0, curves: {}, edge: [] } : CB.fitHoldout(samples, s, { win }); });
  const R_ = SEASONS.map(s => build(s, { S: FIT[s].S.n0, L: FIT[s].L.n0 }));
  if (process.env.N0INF) { // n0 = inf must reproduce E-ROS forecasts bit for bit
    const same = R_.every(r => ['S', 'L'].every(m => r.D.p[m].every((v, i) => v === r.D.p.W[i])));
    log(`SANITY n0 = inf reproduces E-ROS forecasts bit for bit: ${same ? 'PASS' : 'FAIL'}`);
  }
  const folds = blendFolds(R_), rep = blendReport(R_, samples, FIT, folds);
  log('\n== Verdict (rules G-J fixed in docs/superpowers/specs/2026-10-28-calib-blend-design.md before the results)');
  const V = blendVerdict(R_, rep, folds); V.forEach(log);
  fs.writeFileSync('results_calib_blend.txt', OUT.join('\n') + '\n');
  fs.writeFileSync('calib_blend.json', JSON.stringify({ seeds: SEEDS, seed0: SEED0, n0: Object.fromEntries(SEASONS.map(s => [s, { S: FIT[s].S.n0, L: FIT[s].L.n0 }])), report: rep, verdict: V }));
  process.exit(0);
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
