// Value of a free roster slot (idea 169, gate src/trade_2x1_gate.txt part A): treated seat runs STATIC_P (core 9 + the best projected free agent
// held all season + 2 stream spots) vs S4 (core 9 + 3 stream spots, 4 adds), S6 (same, 6 adds) and STATIC_H (static pickup ranked by hindsight).
// d = week match share of the arm - STATIC_P, per week from week 1 (and over 2-week blocks), averaged over the 14 seats of each draft.
// Run:   node slot_profile.js --season 2025-26 [--s0 501 --s1 550]     writes results/slotprof_part_<season>.json
//        node slot_profile.js --smoke                                   1 season, 2 drafts, nothing written to slot_profile.json
//        node slot_profile.js --merge                                   all parts -> results/slotprof_<date>.json and slot_profile.json
const fs = require('fs'), path = require('path');
const { resultPath, listResults } = require('./results_path');
const argv = process.argv.slice(2), flag = k => argv.includes('--' + k), val = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const SEASONS = ['2022-23', '2023-24', '2024-25', '2025-26'], FROM = 1, NW = 25;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const se = a => (a.length > 1 ? sd(a) / Math.sqrt(a.length) : NaN);
const trimmed = (a, f = 0.1) => { const s = a.slice().sort((x, y) => x - y), k = Math.floor(s.length * f); return mean(s.slice(k, s.length - k)); };

function run(season, s0, s1, smoke) {
  const FIT = require('./games_fit.json'), DATA = require('./bt_data.json');
  const f = FIT[season]; DATA[season].players.forEach(p => { p.g = Math.min(82, Math.max(1, f.a + f.b * p.g)); });   // as bt_real does
  const { draft, setup } = require('./backtest.js'), { scoreLeague, weekShares, blockShares } = require('./stream_sim.js');
  const world = { '2022-23': 'hs', '2023-24': 'hs', '2024-25': 'avg', '2025-26': 'bbm' }[season];
  // arm 23 (bt_real.js): logistic k=2 value blend, Punt Off
  const cfg = { puntMode: 'auto', basis: 'total', missW: 1, ilSpots: 3, pickBy: 'model', sdModel: 'v2', scarZ: 'off', scarP: 'off', poBoost: 'light', order: '3rr', scoring: 'h2h', field: 'average',
    slideEngine: false, realAdp: true, proj: world, oppProj: world, puntMode: 'off', slide: { value: 'blend', fit: 'look2', alpha: 0.5, mid: 1.5, k: 2 } };
  const OPP = { trueSd: 'v2', mix: { model: 2, punt: 2, sharp: 4, sharpW: 0.5 } };
  const rank = setup(season, cfg).P.slice().sort((a, b) => b.board - a.board).map(p => p.pid);   // projected value, like the app's valueZ
  const drafts = [], t0 = Date.now();
  for (let seed = s0; seed <= s1; seed++) {
    const ro = draft(season, 1 + (seed % 14), seed, cfg, OPP);
    const sh = { w: {}, b: {} }, cat = [], zero = [];
    const acc = { w: {}, b: {}, cat: Array.from({ length: NW }, () => new Array(11).fill(0)) };
    for (let seat = 0; seat < 14; seat++) {
      const arms = {};
      for (const [k, mode, adds] of [['P', 'static', 4], ['H', 'static_h', 4], ['S4', 'stream', 4], ['S6', 'stream', 6]]) {
        const res = scoreLeague(season, ro, { seed, target: true, slotArm: { team: seat, mode, from: FROM, adds, rank } });
        arms[k] = { w: weekShares(res.weekTot)[seat], b: blockShares(res.weekTot, 2)[seat], tot: res.weekTot[seat] };
      }
      for (const k of ['S4', 'S6', 'H']) for (const [u, n] of [['w', NW], ['b', NW - 1]]) {
        const a = (acc[u][k] = acc[u][k] || new Array(n).fill(0));
        for (let w = 0; w < n; w++) { const x = arms[k][u][w], y = arms.P[u][w]; if (x != null && y != null) a[w] += (x - y) / 14; }
      }
      for (let w = 0; w < NW; w++) arms.S4.tot[w].forEach((x, c) => { acc.cat[w][c] += (x - arms.P.tot[w][c]) / 14; });
      zero.push(arms.S4.w[0] === arms.P.w[0] && arms.H.w[0] === arms.P.w[0] && arms.S6.w[0] === arms.P.w[0]);
    }
    drafts.push({ seed, w: acc.w, b: acc.b, cat: acc.cat, v1: zero.every(Boolean) });
    if (smoke || (seed - s0) % 5 === 4) console.error(season, seed, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  return { season, s0, s1, from: FROM, nweeks: NW, drafts };
}

function summarize(parts) {
  const dr = parts.flatMap(p => p.drafts.map(d => ({ ...d, season: p.season }))), seasons = [...new Set(dr.map(d => d.season))];
  const perDraft = (k, u, ws, sel = () => true) => dr.filter(sel).map(d => mean(ws.map(w => d[u][k][w]).filter(x => x != null && !isNaN(x))));
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const W = range(FROM, 24), cells = (u, k, sel = () => true) => seasons.flatMap(s => W.filter(w => u === 'w' || w <= 23).map(w => {
    const v = dr.filter(d => d.season === s && sel(d)).map(d => d[u][k][w]); return { season: s, w, mean: mean(v) * 100, se: se(v.map(x => x * 100)), n: v.length };
  }));
  const level = (u, k, sel) => { const c = cells(u, k, sel).filter(x => !isNaN(x.mean)), m = c.map(x => x.mean), t = trimmed(m), un = mean(m);
    const big = c.slice().sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean)).slice(5).map(x => x.mean);
    const pd = perDraft(k, u, u === 'w' ? W : W.filter(w => w <= 23), sel).map(x => x * 100);
    return { trimmed: t, untrimmed: un, se: se(pd), pooled: mean(pd), extremeFail: Math.abs(un - t) > 0.25 * Math.abs(t) || mean(big) < 0.5 * un, cells: c.length }; };
  const block = (k, ws, sel) => perDraft(k, 'w', ws, sel).map(x => x * 100);
  const E = range(1, 8), M = range(9, 15), L = range(16, 24);
  const Dof = (sel) => { const e = block('S4', E, sel), l = block('S4', L, sel), d = e.map((x, i) => l[i] - x); return { E: mean(e), M: mean(block('S4', M, sel)), L: mean(l), D: mean(d), se: se(d) }; };
  const half = (lo, hi) => d => d.seed >= lo && d.seed <= hi;
  const v2 = dr.map(d => mean(W.map(w => d.w.S6[w] - d.w.S4[w])) * 100);
  const bySeason = seasons.map(s => ({ season: s, ...Dof(d => d.season === s) }));
  return { n_drafts: dr.length, seasons, V1_week0_exact: dr.every(d => d.v1), V2_S6_minus_S4: { mean: mean(v2), se: se(v2) },
    S4_minus_P: { weeks: level('w', 'S4'), blocks2: level('b', 'S4'), H1: level('w', 'S4', half(501, 525)), H2: level('w', 'S4', half(526, 550)) },
    S4_minus_H_diag: level('w', 'H'), S6_minus_P: level('w', 'S6'), D_pooled: Dof(() => true), D_H1: Dof(half(501, 525)), D_H2: Dof(half(526, 550)),
    D_by_season: bySeason, L_gt_E_seasons: bySeason.filter(x => x.L > x.E).length, units: 'Win M points per matchup (100 x match share)' };
}

if (flag('merge')) {
  const parts = listResults(/^slotprof_part_.*\.json$/).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const summary = summarize(parts), date = new Date().toISOString().slice(0, 10);
  const wk = (u, k) => Array.from({ length: 24 }, (_, w) => { if (w < FROM) return null; const v = parts.flatMap(p => p.drafts.map(d => d[u][k][w])).filter(x => x != null && !isNaN(x)).map(x => x * 100); return v.length ? { mean: mean(v), se: se(v), n: v.length } : null; });
  const w1 = wk('w', 'S4'), b1 = wk('b', 'S4');
  const weeks = w1.map((c, w) => c && { w, s: c.mean, s14: b1[w] ? b1[w].mean : null, se: c.se, n: c.n }).filter(Boolean);
  fs.writeFileSync(resultPath(`slotprof_${date}.json`), JSON.stringify({ summary, parts }));
  fs.writeFileSync(path.join(__dirname, 'slot_profile.json'), JSON.stringify({ version: 1, made: date, source: 'slot_profile.js, gate src/trade_2x1_gate.txt', form: 'measured', arm: 'S4-STATIC_P', adds: 4,
    unit: 'Win M points per matchup', weeks }));
  console.log(JSON.stringify(summary, null, 1));
} else if (flag('smoke')) {
  const part = run('2025-26', 501, 502, true), s = summarize([part]);
  const finite = part.drafts.every(d => d.w.S4.slice(FROM, 24).every(Number.isFinite));
  console.log(JSON.stringify({ finite, v1: s.V1_week0_exact, S4_minus_P: s.S4_minus_P.weeks, V2: s.V2_S6_minus_S4, D: s.D_pooled }, null, 1));
} else {
  const season = val('season', SEASONS[3]), s0 = +val('s0', 501), s1 = +val('s1', 550);
  fs.writeFileSync(resultPath(`slotprof_part_${season}.json`), JSON.stringify(run(season, s0, s1, false)));
}
