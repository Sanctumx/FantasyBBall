/* DraftDesk-style snake draft engine. Pure functions over state; no DOM. */
(function (root) {
  'use strict';
  const CATS = [
    { k: 'fg', l: 'FG%' }, { k: 'ft', l: 'FT%' }, { k: 'tpm', l: '3PM' },
    { k: 'pts', l: 'PTS' }, { k: 'reb', l: 'REB' }, { k: 'ast', l: 'AST' },
    { k: 'stl', l: 'ST' }, { k: 'blk', l: 'BLK' }, { k: 'to', l: 'TO' }
  ];
  const NC = 9, TO = 8;
  const PUNT_BETA = 1.5;       // how hard your future picks lean toward a strategy's fit (tuned by backtest)
  const PUNT_TAU = 0.005;      // softmax temperature on strategy win chance (tuned by backtest)
  const PUNT_SYN_PAIRS = 8;    // synergy pairs Auto may blend
  const PUNT_TOPK = 8;         // strategies that get a full Gain pass in Auto
  const WEEKS = 24;           // season split into weekly matchups
  const GPW = 3.45;           // average games per NBA team per week
  const VAR_GAMES = 0.55;
  const SEASON_G = 80;        // games a fantasy roster spot can fill in a season
  const STREAM_G = 100;       // games a streaming spot fills in a season (streamers chosen for games)
  const SIGMA_G2 = 1.87;      // weekly variance of one rostered player's games, from 2024-26 logs (team gap sd 6.7 / 12 players)
  const GH_Z = [-2.8569700139, -1.3556261800, 0, 1.3556261800, 2.8569700139];   // Gauss-Hermite nodes for N(0,1)
  const GH_W = [0.0112574113, 0.2220759220, 0.5333333333, 0.2220759220, 0.0112574113];     // variance of a player's games in a week
  const UNKNOWN_ADP = 175;

  // ---------- math ----------
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---------- players ----------
  function prepPlayers(raw) {
    return raw.map((p, i) => {
      const g = p.g;
      return Object.assign({}, p, {
        id: i,
        fgm: p.fgp * p.fga * g, fgaT: p.fga * g,
        ftm: p.ftp * p.fta * g, ftaT: p.fta * g,
        tot: { tpm: p.tpm * g, pts: p.pts * g, reb: p.reb * g, ast: p.ast * g, stl: p.stl * g, blk: p.blk * g, to: p.to * g }
      });
    });
  }

  function adpOf(p, src) {
    const a = p.adp, f = p.ftx;
    if (src === 'ftx') return f != null ? f : UNKNOWN_ADP;
    if (src === 'blend') {
      if (a != null && f != null) return (a + f) / 2;
      return a != null ? a : (f != null ? f : UNKNOWN_ADP);
    }
    return a != null ? a : (f != null ? f : UNKNOWN_ADP);
  }
  function adpSd(p, src) {
    const adp = adpOf(p, src);
    let sd = 0.9 + 0.13 * adp;
    if (src === 'blend' && p.adp != null && p.ftx != null) { const d = (p.adp - p.ftx) / 2; sd = Math.sqrt(sd * sd + d * d); }
    if (adp === UNKNOWN_ADP) sd = Math.max(sd, 25);
    return sd;
  }

  // Category vector (bigger is always better). Percentages are "excess makes" over the pool average.
  function vec(p, ctx, g) {
    const v = new Float64Array(NC);
    v[0] = (p.fgp - ctx.pFG) * p.fga * g;
    v[1] = (p.ftp - ctx.pFT) * p.fta * g;
    v[2] = p.tpm * g; v[3] = p.pts * g; v[4] = p.reb * g; v[5] = p.ast * g;
    v[6] = p.stl * g; v[7] = p.blk * g; v[8] = -p.to * g;
    return v;
  }
  // Projection error variance per player, season units.
  function projVar(p, g) {
    const v = new Float64Array(NC);
    v[0] = Math.pow(0.015 * p.fga * g, 2); v[1] = Math.pow(0.02 * p.fta * g, 2);
    const ks = ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'];
    ks.forEach((k, j) => { v[j + 2] = Math.pow(0.12 * p[k] * g, 2); });
    return v;
  }
  // Weekly noise variance per player (one week, per-week units).
  function weekVar(p, ctx, g) {
    const G = GPW * g / 82;
    const v = new Float64Array(NC);
    const fgEx = p.fgp * p.fga - ctx.pFG * p.fga, ftEx = p.ftp * p.fta - ctx.pFT * p.fta;
    // Per-game variances fitted on 2023-24 to 2025-26 game logs (723 player-seasons, 25+ games, 20+ mpg)
    v[0] = G * p.fga * p.fgp * (1 - p.fgp) * 0.932 + fgEx * fgEx * VAR_GAMES;
    v[1] = G * p.fta * p.ftp * (1 - p.ftp) * 1.115 + ftEx * ftEx * VAR_GAMES;
    const pg = { tpm: [p.tpm, 1.154 * p.tpm], pts: [p.pts, 5.38 * Math.pow(Math.max(p.pts, 0), 0.78)], reb: [p.reb, 1.336 * p.reb], ast: [p.ast, 1.251 * p.ast], stl: [p.stl, 1.066 * p.stl], blk: [p.blk, 1.109 * p.blk], to: [p.to, 1.022 * p.to] };
    ['tpm', 'pts', 'reb', 'ast', 'stl', 'blk', 'to'].forEach((k, j) => { const [m, vv] = pg[k]; v[j + 2] = G * vv + m * m * VAR_GAMES; });
    return v;
  }

  // Category weights: cfg.catW[c] (0 = punt, 1 = normal); older saves may only have cfg.punt.
  function catWeights(cfg) {
    const w = new Array(NC).fill(1);
    if (Array.isArray(cfg.catW)) for (let c = 0; c < NC; c++) { const v = +cfg.catW[c]; w[c] = isFinite(v) && v >= 0 ? v : 1; }
    else if (Array.isArray(cfg.punt)) cfg.punt.forEach(c => { w[c] = 0; });
    if (cfg.cats !== 9) w[TO] = 0;
    return w;
  }

  // ---------- draft order ----------
  function teamAt(pick, N, order) {
    const r = Math.floor(pick / N), i = pick % N;
    let rev;
    if (order === '3rr') rev = r === 0 ? false : (r === 1 ? true : r % 2 === 0);
    else rev = r % 2 === 1;
    return rev ? N - 1 - i : i;
  }

  // ---------- league context (pool averages, Board scaling, weekly noise) ----------
  // One pass of simulated ADP drafts for a given games function: pool averages and team spread.
  function scaleFor(players, cfg, ctx, gOf) {
    const N = cfg.teams, R = cfg.roster, src = cfg.adpSrc;
    const X = players.map(p => { const x = vec(p, ctx, gOf(p)); if (ctx.ilFill && ctx.pgRepl) { const miss = Math.max(0, SEASON_G - gOf(p)) * ctx.ilFill; for (let c = 0; c < NC; c++) x[c] += miss * ctx.pgRepl[c]; } return x; });
    const WV = players.map(p => weekVar(p, ctx, gOf(p)));
    const PG = players.map(p => vec(p, ctx, 1));   // per-game category vector (signed, TO negative)
    const r = rng(1234 + N * 31 + R);
    const SIMS = 80;
    const sum = new Float64Array(NC), sq = new Float64Array(NC), wsum = new Float64Array(NC), dsum = new Float64Array(NC);
    const s1 = new Float64Array(NC), s2 = new Float64Array(NC), wpg = new Float64Array(NC); let rN = 0;
    let teamsN = 0, dN = 0;
    for (let s = 0; s < SIMS; s++) {
      const draws = players.map((p, i) => ({ i, t: adpOf(p, src) + gauss(r) * adpSd(p, src) })).sort((a, b) => a.t - b.t);
      const tot = Array.from({ length: N }, () => new Float64Array(NC));
      const wk = Array.from({ length: N }, () => new Float64Array(NC));
      const picks = Math.min(N * R, draws.length);
      for (let k = 0; k < picks; k++) {
        const t = teamAt(k, N, cfg.order), i = draws[k].i;
        for (let c = 0; c < NC; c++) { tot[t][c] += X[i][c]; wk[t][c] += WV[i][c]; dsum[c] += X[i][c];
          const m = PG[i][c]; s1[c] += m; s2[c] += m * m; wpg[c] += WV[i][c] - m * m * VAR_GAMES; }
        dN++; rN++;
      }
      for (let t = 0; t < N; t++) { for (let c = 0; c < NC; c++) { sum[c] += tot[t][c]; sq[c] += tot[t][c] * tot[t][c]; wsum[c] += wk[t][c]; } teamsN++; }
    }
    const avgX = Array.from(dsum, v => v / dN);
    const teamSd = Array.from(sum, (v, c) => { const m = v / teamsN; return Math.sqrt(Math.max(1e-9, sq[c] / teamsN - m * m)); });
    const teamWeekVar = Array.from(wsum, v => v / teamsN);
    // Zscore sums each category's z times its weight; weight 0 = punted
    const W = catWeights(cfg);
    const boards = X.map(x => {
      const bc = new Float64Array(NC); let b = 0;
      for (let c = 0; c < NC; c++) { bc[c] = (x[c] - avgX[c]) / teamSd[c]; b += bc[c] * W[c]; }
      const worst = []; for (let c = 0; c < NC; c++) if (W[c] > 0) worst.push(c);
      worst.sort((a, b2) => bc[a] * W[a] - bc[b2] * W[b2]);
      const d = i => worst[i] != null ? bc[worst[i]] * W[worst[i]] : 0;
      let raw = 0; for (let c = 0; c < NC; c++) if (c !== TO || cfg.cats === 9) raw += bc[c];
      return { b, raw, bc, z: [b, b - d(0), b - d(0) - d(1)], drop: worst.slice(0, 2) };
    });
    // Shared games factor: a team's weekly total in every category moves with how many player-games it gets.
    // Per team: loading = average per-game production, factor variance = n * SIGMA_G2, rest is per-category noise.
    const nT = rN / teamsN, corr = { n: nT, load: new Float64Array(NC), idio: new Float64Array(NC), sigD2: nT * SIGMA_G2 };
    for (let c = 0; c < NC; c++) {
      const S1 = s1[c] / teamsN, S2 = s2[c] / teamsN, PGv = wpg[c] / teamsN;
      corr.load[c] = S1 / nT;
      corr.idio[c] = Math.max(1e-9, PGv + SIGMA_G2 * Math.max(0, S2 - S1 * S1 / nT));
    }
    return { X, WV, avgX, teamSd, teamWeekVar, boards, corr };
  }

  // ---------- league context (pool averages, Board scaling, weekly noise) ----------
  // cfg.basis: 'total' values season totals (projected games count); 'pergame' gives every player
  // the same games, so value comes from per-game production only.
  function buildContext(players, cfg) {
    const N = cfg.teams, R = cfg.roster, src = cfg.adpSrc;
    const byAdp = players.slice().sort((a, b) => adpOf(a, src) - adpOf(b, src));
    const pool = byAdp.slice(0, Math.min(players.length, N * R));
    let fgm = 0, fga = 0, ftm = 0, fta = 0, gs = 0;
    pool.forEach(p => { fgm += p.fgm; fga += p.fgaT; ftm += p.ftm; fta += p.ftaT; gs += p.g; });
    const ctx = { pFG: fgm / fga, pFT: ftm / fta, G0: gs / pool.length, basis: ['pergame', 'mix'].includes(cfg.basis) ? cfg.basis : 'total' };
    const G0 = ctx.G0;
    // Replacement level: per-game production of the best players left after the draft (the free-agent tier)
    { const fa = byAdp.slice(Math.min(byAdp.length - 1, N * R), Math.min(byAdp.length, N * R + 20)); ctx.pgRepl = new Float64Array(NC);
      fa.forEach(p => { const v = vec(p, ctx, 1); for (let c = 0; c < NC; c++) ctx.pgRepl[c] += v[c] / fa.length; }); }
    // IL spots: games a player misses are partly filled by a replacement on your roster (share grows with IL spots)
    ctx.ilFill = Math.min(0.9, 0.35 * (+cfg.ilSpots || 0));
    const tot = scaleFor(players, cfg, ctx, p => p.g);
    const pg = scaleFor(players, cfg, ctx, () => G0);
    // Mix: halfway between season and per game. Every category is linear in games, so the
    // midpoint of the two games counts gives exactly the average of the two stat lines.
    const gOf = ctx.basis === 'pergame' ? (() => G0) : ctx.basis === 'mix' ? (p => (p.g + G0) / 2) : (p => p.g);
    const act = ctx.basis === 'pergame' ? pg : ctx.basis === 'mix' ? scaleFor(players, cfg, ctx, gOf) : tot;
    players.forEach((p, i) => {
      p.x = act.X[i]; p.wv = act.WV[i]; p.pv = projVar(p, gOf(p));
      p.board = act.boards[i].b; p.boardRaw = act.boards[i].raw; p.boardC = act.boards[i].bc; p.z = act.boards[i].z; p.zDrop = act.boards[i].drop;
    });
    ctx.avgX = act.avgX; ctx.teamSd = act.teamSd; ctx.teamWeekVar = act.teamWeekVar;
    ctx.h2hNoise = ctx.teamWeekVar.map(v => 2 * v * WEEKS * WEEKS);
    ctx.corr = act.corr;
    ctx.idioNoise = Array.from(act.corr.idio, v => 2 * v * WEEKS * WEEKS);          // season units, per pair
    ctx.gapSd = Math.sqrt(2 * act.corr.sigD2);                                      // weekly games gap between two teams
    ctx.loadS = Array.from(act.corr.load, l => l * WEEKS);                           // season units per game of gap
    const rankBy = (key, out) => players.slice().sort((a, b) => b[key] - a[key]).forEach((p, i) => { p[out] = i + 1; });
    rankBy('board', 'boardRank');
    players.forEach(p => { p.zRank = [0, 0, 0]; });
    [0, 1, 2].forEach(d => players.slice().sort((a, b) => b.z[d] - a.z[d]).forEach((p, i) => { p.zRank[d] = i + 1; }));
    players.forEach(p => { p.adpUse = adpOf(p, src); p.sd = adpSd(p, src); p.edge = p.adpUse - p.boardRank; });
    ctx.swing = ctx.teamWeekVar.map((v, c) => Math.sqrt(2 * v) / (ctx.teamSd[c] / WEEKS));
    // Punt synergy: correlation of category z among the players likely to be drafted. Pairs where weakness
    // in one category goes with weakness in the other let you stack the same player type.
    {
      const nc = cfg.cats === 9 ? NC : NC - 1;
      const pl = players.slice().sort((a, b) => a.adpUse - b.adpUse).slice(0, Math.min(players.length, N * R));
      const n = pl.length, m = [], sd = [];
      for (let c = 0; c < nc; c++) { m[c] = pl.reduce((s, p) => s + p.boardC[c], 0) / n; sd[c] = Math.sqrt(pl.reduce((s, p) => s + (p.boardC[c] - m[c]) ** 2, 0) / n) || 1; }
      const pairs = [];
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) pairs.push([a, b, pl.reduce((s, p) => s + (p.boardC[a] - m[a]) * (p.boardC[b] - m[b]), 0) / n / sd[a] / sd[b]]);
      const r = {}; pairs.forEach(([a, b, v]) => { r[a + '_' + b] = v; });
      const tri = [];
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) for (let c = b + 1; c < nc; c++) tri.push([a, b, c, (r[a + '_' + b] + r[a + '_' + c] + r[b + '_' + c]) / 3]);
      ctx.synPairs = pairs.sort((x, y) => y[2] - x[2]);
      ctx.synTriples = tri.sort((x, y) => y[3] - x[3]);
    }
    return ctx;
  }

  // ---------- punt strategies ----------
  // Common punt builds (category indexes: 0 FG%, 1 FT%, 2 3PM, 3 PTS, 4 REB, 5 AST, 6 ST, 7 BLK, 8 TO)
  const PUNT_COMMON = [[5, 8], [4, 7], [1, 2], [1, 8], [1, 5], [0, 8], [0, 4], [3, 8], [2, 5],
    [0, 4, 7], [1, 5, 8], [1, 2, 5], [2, 5, 8], [5, 6, 8], [0, 3, 8], [1, 2, 8], [0, 1, 8]];
  const PUNT_SET = 'all';
  function strategiesFor(cfg, ctx) {
    const nc = cfg.cats === 9 ? NC : NC - 1;
    const L = CATS.map(c => c.l);
    const mk = pr => ({ id: 'p' + pr.join('_'), label: 'Punt ' + pr.map(c => L[c]).join(' + '), punt: pr, size: pr.length });
    const out = [{ id: 'none', label: 'No punt', punt: [], size: 0 }];
    for (let c = 0; c < nc; c++) out.push({ id: 'p' + c, label: 'Punt ' + L[c], punt: [c], size: 1 });
    const set = cfg.puntSet || PUNT_SET;
    // Auto only blends the strategies marked auto: no punt, single punts and the top synergy pairs.
    // Backtests: blending all 130 doubles and triples chased strategies that only looked good by chance.
    const AUTO_PAIRS = ['p5_8', 'p4_7', 'p1_2'];
    out.forEach(s => { s.auto = true; });
    if (set === 'basic') { [[5, 8], [4, 7], [1, 2]].forEach(pr => { if (pr.every(c => c < nc)) out.push(Object.assign(mk(pr), { auto: true })); }); return out; }
    // 'synPtT': singles + top P synergy pairs + top T synergy triples (e.g. syn8t2)
    if (set.startsWith('syn') && ctx && ctx.synPairs) {
      const [P2, T3] = set.slice(3).split('t').map(x => +x || 0);
      ctx.synPairs.slice(0, P2).forEach(([a, b]) => out.push(Object.assign(mk([a, b]), { auto: true })));
      ctx.synTriples.slice(0, T3).forEach(([a, b, c]) => out.push(Object.assign(mk([a, b, c]), { auto: true })));
      return out;
    }
    else if (set === 'common') PUNT_COMMON.forEach(pr => { if (pr.every(c => c < nc)) out.push(mk(pr)); });
    else {
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) out.push(mk([a, b]));
      for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++) for (let c = b + 1; c < nc; c++) out.push(mk([a, b, c]));
    }
    // Auto blends single punts plus the 8 most synergistic pairs from the current projections
    // (backtest: slightly ahead of fixed classic pairs; adding triples did not help)
    const autoPairs = ctx && ctx.synPairs ? ctx.synPairs.slice(0, PUNT_SYN_PAIRS).map(([a, b]) => 'p' + a + '_' + b) : AUTO_PAIRS;
    out.forEach(s => { if (s.size === 2 && autoPairs.includes(s.id)) s.auto = true; });
    if (cfg.puntAutoAll) out.forEach(s => { s.auto = true; });
    return out;
  }

  // ---------- availability ----------
  function survive(p, pick) { return 1 - Phi((pick - 0.5 - (p.adpE != null ? p.adpE : p.adpUse)) / (p.sdE != null ? p.sdE : p.sd)); }
  function availProb(p, from, to) {
    if (to <= from) return 1;
    const s0 = survive(p, from); if (s0 < 1e-9) return 0;
    return Math.min(1, survive(p, to) / s0);
  }

  // ---------- live evaluation ----------
  // state: { picks: Array(N*R) of player id | null }
  function evaluate(players, ctx, cfg, state) {
    const N = cfg.teams, R = cfg.roster, me = cfg.slot - 1, total = N * R;
    const nc = cfg.cats === 9 ? NC : NC - 1;
    const taken = new Set(state.picks.filter(v => v != null));
    // Opponents who draft with this board (cfg.oppBoard of the other teams) pick by board value, not ADP.
    // Each player's expected draft slot blends his ADP with where his value ranks among players left.
    {
      const cur0 = state.picks.indexOf(null), cur = cur0 < 0 ? total : cur0;
      const f = Math.min(1, Math.max(0, (+cfg.oppBoard || 0) / Math.max(1, N - 1)));
      players.forEach(p => { p.adpE = p.adpUse; p.sdE = p.sd; });
      if (f > 0) {
        const left = players.filter(p => !taken.has(p.id)).sort((a, b) => b.boardRaw - a.boardRaw);
        left.forEach((p, i) => {
          const bAdp = cur + 1 + i, sb = 0.8 + 0.08 * i;
          p.adpE = (1 - f) * p.adpUse + f * bAdp;
          p.sdE = Math.sqrt((1 - f) * p.sd * p.sd + f * sb * sb + f * (1 - f) * Math.pow(p.adpUse - bAdp, 2));
        });
      }
    }
    const avail = players.filter(p => !taken.has(p.id)).sort((a, b) => a.adpE - b.adpE);

    const unfilled = [];
    for (let k = 0; k < total; k++) if (state.picks[k] == null) unfilled.push(k);
    const current = unfilled.length ? unfilled[0] : total; // 0-based pick on the clock
    // state.owner (optional): team index per pick from the host site, so traded picks land on the right team
    const tAt = k => (state.owner && state.owner[k] != null) ? state.owner[k] : teamAt(k, N, cfg.order);
    const myUnfilled = unfilled.filter(k => tAt(k) === me);
    const p1 = myUnfilled.length ? myUnfilled[0] : null;
    const p2 = myUnfilled.length > 1 ? myUnfilled[1] : null;

    // typical player at the j-th upcoming pick
    const M = unfilled.length;
    const typMean = [], typVar = [], typPv = [];
    const A = avail.length;
    for (let j = 0; j < M; j++) {
      const mean = new Float64Array(NC), vr = new Float64Array(NC), pv = new Float64Array(NC);
      if (A === 0) { typMean.push(mean); typVar.push(vr); typPv.push(pv); continue; }
      const c0 = Math.min(j, A - 1), w = 1.5 + 0.12 * j;
      const lo = Math.max(0, Math.floor(c0 - 3 * w)), hi = Math.min(A - 1, Math.ceil(c0 + 3 * w));
      let ws = 0;
      for (let i = lo; i <= hi; i++) {
        const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2)); ws += wt;
        const x = avail[i].x, q = avail[i].pv;
        for (let c = 0; c < NC; c++) { mean[c] += wt * x[c]; pv[c] += wt * q[c]; }
      }
      for (let c = 0; c < NC; c++) { mean[c] /= ws; pv[c] /= ws; }
      for (let i = lo; i <= hi; i++) {
        const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2)), x = avail[i].x;
        for (let c = 0; c < NC; c++) vr[c] += wt * Math.pow(x[c] - mean[c], 2);
      }
      for (let c = 0; c < NC; c++) vr[c] /= ws;
      typMean.push(mean); typVar.push(vr); typPv.push(pv);
    }
    const jOf = new Map(); unfilled.forEach((k, j) => jOf.set(k, j));

    // team forecasts
    const teams = Array.from({ length: N }, (_, t) => ({ t, mu: new Float64Array(NC), v: new Float64Array(NC), roster: [], left: 0 }));
    for (let k = 0; k < total; k++) {
      const t = tAt(k), T = teams[t];
      const pid = state.picks[k];
      if (pid != null) {
        const p = players[pid]; T.roster.push({ pick: k, p });
        for (let c = 0; c < NC; c++) { T.mu[c] += p.x[c]; T.v[c] += p.pv[c]; }
      } else {
        const j = jOf.get(k); T.left++;
        for (let c = 0; c < NC; c++) { T.mu[c] += typMean[j][c]; T.v[c] += 2 * typVar[j][c] + typPv[j][c]; }
      }
    }
    const noise = cfg.scoring === 'roto' ? new Float64Array(NC) : ctx.h2hNoise;
    const corrOn = cfg.scoring !== 'roto' && cfg.corr !== 'off' && ctx.corr;
    // marginal category win chance: with the games factor its full variance is idiosyncratic + factor
    const margNoise = corrOn ? ctx.idioNoise.map((v, c) => v + Math.pow(ctx.loadS[c] * ctx.gapSd, 2)) : noise;
    const winP = (a, av, b, bv, c) => Phi((a[c] - b[c]) / Math.sqrt(av[c] + bv[c] + margNoise[c] + 1e-9));

    // standings & my category chances
    // Matchup win chance: categories are independent given the weekly games gap, so average over the gap
    function pairMatch(a, av, b, bv) {
      if (!corrOn) { const ps = []; for (let c = 0; c < nc; c++) ps.push(winP(a, av, b, bv, c)); return matchProb(ps); }
      let M = 0; const ps = new Array(nc);
      for (let k = 0; k < GH_Z.length; k++) {
        const g = GH_Z[k] * ctx.gapSd;
        for (let c = 0; c < nc; c++) ps[c] = Phi((a[c] - b[c] + ctx.loadS[c] * g) / Math.sqrt(av[c] + bv[c] + ctx.idioNoise[c] + 1e-9));
        M += GH_W[k] * matchProb(ps);
      }
      return M;
    }
    function matchProb(ps) { // ps over nc categories -> P(win matchup) with ties counted half
      let dist = [1];
      for (const q of ps) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; }
      let w = 0; for (let i = 0; i < dist.length; i++) { if (2 * i > nc) w += dist[i]; else if (2 * i === nc) w += 0.5 * dist[i]; }
      return w;
    }
    const standings = teams.map(A_ => {
      let roto = 0, cats = 0, match = 0;
      for (let c = 0; c < nc; c++) roto += 1;
      teams.forEach(B => {
        if (B === A_) return;
        const ps = [];
        for (let c = 0; c < nc; c++) { const q = winP(A_.mu, A_.v, B.mu, B.v, c); ps.push(q); roto += q; cats += q; }
        match += pairMatch(A_.mu, A_.v, B.mu, B.v);
      });
      return { t: A_.t, roto, cats: cats / (N - 1), match };
    });
    const meT = teams[me];
    const myChance = new Float64Array(NC);
    teams.forEach(B => { if (B === meT) return; for (let c = 0; c < NC; c++) myChance[c] += winP(meT.mu, meT.v, B.mu, B.v, c) / (N - 1); });

    // gains
    // Matchup win chance against each other team: more categories won than lost, ties count half
    const myMatch = teams.filter(B => B !== meT).map(B => {
      const ps = []; for (let c = 0; c < nc; c++) ps.push(winP(meT.mu, meT.v, B.mu, B.v, c));
      return { t: B.t, p: pairMatch(meT.mu, meT.v, B.mu, B.v) };
    });
    const out = { current, p1, p2, unfilled, avail, teams, standings, myChance, myMatch, rows: [], pairProb: (A, B) => pairMatch(A.mu, A.v, B.mu, B.v) };
    if (p1 == null) { players.forEach(p => { p.gain = 0; p.gainM = 0; p.gainC = new Float64Array(NC); }); return out; }
    const j1 = jOf.get(p1);
    // Baseline: the slot filled by a replacement-level player (best of what is left once the draft ends),
    // so Gain reads as how much a player raises your chances over leaving the pick to waivers.
    const rep = new Float64Array(NC), repPv = new Float64Array(NC);
    { const c0 = Math.min(M, A - 1), lo = Math.max(0, c0 - 4), hi = Math.min(A - 1, c0 + 4); let n = 0;
      for (let i = lo; i <= hi; i++) { n++; for (let c = 0; c < NC; c++) { rep[c] += avail[i].x[c]; repPv[c] += avail[i].pv[c]; } }
      for (let c = 0; c < NC; c++) { rep[c] /= n; repPv[c] /= n; } }
    // With weekly adds, the slot you are filling is worth at least a streaming spot all season
    if ((+cfg.weeklyAdds || 0) > 0 && ctx.pgRepl) { const sg = STREAM_G * Math.min(1, (+cfg.weeklyAdds) / 4); for (let c = 0; c < NC; c++) rep[c] = Math.max(rep[c], ctx.pgRepl[c] * sg); }
    const opps = teams.filter(T => T !== meT);
    const cand = avail.concat([...taken].map(id => players[id]));
    const L = cand.length;
    // Gains for one forecast of my team: meMu/meV is my full forecast, slot* is what it assumed at my next pick,
    // mask[c] = 1 for categories that count toward Gain C (0 = punted under a strategy)
    function gainsFor(meMu, meV, slotMean, slotVar, slotPv, mask) {
      const baseMu = meMu.slice(), baseV = meV.slice();
      for (let c = 0; c < NC; c++) { baseMu[c] += rep[c] - slotMean[c]; baseV[c] += repPv[c] - slotPv[c] - 2 * slotVar[c]; }
      // baseline probabilities and (for most-cats) how often each category decides the week
      const baseP = opps.map(B => { const a = new Float64Array(NC); for (let c = 0; c < NC; c++) a[c] = winP(baseMu, baseV, B.mu, B.v, c); return a; });
      // Gain M baseline: chance of winning the whole matchup (more categories than the opponent, ties count half)
      const baseMatch = opps.map(B => pairMatch(baseMu, baseV, B.mu, B.v));
      let piv = null, pivScale = 1;
      if (cfg.scoring === 'most') {
        piv = baseP.map(ps => {
          const arr = new Float64Array(NC);
          for (let c = 0; c < nc; c++) {
            const others = []; for (let d = 0; d < nc; d++) if (d !== c) others.push(ps[d]);
            // P(win | c won) - P(win | c lost)
            let dist = [1];
            for (const q of others) { const nd = new Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); dist = nd; }
            const win = add => { let w = 0; for (let i = 0; i < dist.length; i++) { const k = i + add; if (2 * k > nc) w += dist[i]; else if (2 * k === nc) w += 0.5 * dist[i]; } return w; };
            arr[c] = win(1) - win(0);
          }
          return arr;
        });
        let s = 0, n = 0; piv.forEach(a => { for (let c = 0; c < nc; c++) { s += a[c]; n++; } }); pivScale = s / n || 1;
      }
      const G = new Float64Array(L), GM = new Float64Array(L), GC = new Float64Array(L * NC);
      const mu = new Float64Array(NC), v = new Float64Array(NC), q = new Array(nc);
      for (let i = 0; i < L; i++) {
        const p = cand[i];
        for (let c = 0; c < NC; c++) { mu[c] = baseMu[c] - rep[c] + p.x[c]; v[c] = baseV[c] - repPv[c] + p.pv[c]; }
        let gm = 0;
        opps.forEach((B, oi) => {
          for (let c = 0; c < nc; c++) {
            q[c] = winP(mu, v, B.mu, B.v, c);
            let d = q[c] - baseP[oi][c];
            if (piv) d *= piv[oi][c] / pivScale;
            GC[i * NC + c] += d / opps.length;
          }
          gm += (pairMatch(mu, v, B.mu, B.v) - baseMatch[oi]) / opps.length;
        });
        // Gain C counts every scoring category equally (user category weights only affect Zscore)
        let g = 0; for (let c = 0; c < nc; c++) { if (!mask[c]) GC[i * NC + c] = 0; g += GC[i * NC + c]; }
        G[i] = g; GM[i] = gm;
      }
      return { G, GM, GC };
    }
    const allOn = new Array(NC).fill(1);
    let res0 = gainsFor(meT.mu, meT.v, typMean[j1], typVar[j1], typPv[j1], allOn);

    // ---------- punt strategies ----------
    // For each strategy, my open picks are forecast as players near their ADP, tilted toward players
    // who fit it (weight × exp(β · Zscore without the punted categories)). V = my average matchup win
    // chance if I follow it. Punt-aware Gain blends each strategy's Gain by softmax(V / τ), or uses the locked one.
    const beta = cfg.puntBeta != null ? cfg.puntBeta : PUNT_BETA, tau = cfg.puntTau != null ? cfg.puntTau : PUNT_TAU;
    const strats = strategiesFor(cfg, ctx);
    const myJ = myUnfilled.map(k => jOf.get(k));
    const myDrafted = { mu: new Float64Array(NC), v: new Float64Array(NC) };
    teams[me].roster.forEach(r => { for (let c = 0; c < NC; c++) { myDrafted.mu[c] += r.p.x[c]; myDrafted.v[c] += r.p.pv[c]; } });
    function tiltedSlot(j, zOf) {
      const mean = new Float64Array(NC), vr = new Float64Array(NC), pv = new Float64Array(NC);
      if (A === 0) return { mean, vr, pv };
      const c0 = Math.min(j, A - 1), w = 1.5 + 0.12 * j;
      const lo = Math.max(0, Math.floor(c0 - 3 * w)), hi = Math.min(A - 1, Math.ceil(c0 + 3 * w));
      const wts = []; let ws = 0, zmax = -Infinity;
      for (let i = lo; i <= hi; i++) zmax = Math.max(zmax, zOf(avail[i]));
      for (let i = lo; i <= hi; i++) { const wt = Math.exp(-0.5 * Math.pow((i - c0) / w, 2) + beta * (zOf(avail[i]) - zmax)); wts.push(wt); ws += wt; }
      for (let i = lo; i <= hi; i++) { const wt = wts[i - lo] / ws, x = avail[i].x, qv = avail[i].pv; for (let c = 0; c < NC; c++) { mean[c] += wt * x[c]; pv[c] += wt * qv[c]; } }
      for (let i = lo; i <= hi; i++) { const wt = wts[i - lo] / ws, x = avail[i].x; for (let c = 0; c < NC; c++) vr[c] += wt * Math.pow(x[c] - mean[c], 2); }
      return { mean, vr, pv };
    }
    const stratRes = strats.map(S => {
      const mask = new Array(NC).fill(1); S.punt.forEach(c => { mask[c] = 0; });
      const zOf = p => { let z = 0; for (let c = 0; c < nc; c++) if (mask[c]) z += p.boardC[c]; return z; };
      const mu = myDrafted.mu.slice(), v = myDrafted.v.slice();
      let slot1 = null;
      myJ.forEach(j => {
        const s = tiltedSlot(j, zOf);
        for (let c = 0; c < NC; c++) { mu[c] += s.mean[c]; v[c] += 2 * s.vr[c] + s.pv[c]; }
        if (j === j1) slot1 = s;
      });
      let V = 0; const catP = new Float64Array(NC); opps.forEach(B => { const ps = []; for (let c = 0; c < nc; c++) { const q = winP(mu, v, B.mu, B.v, c); ps.push(q); catP[c] += q / opps.length; } V += pairMatch(mu, v, B.mu, B.v) / opps.length; });
      return { S, mask, mu, v, slot1, V, catP };
    });
    const mode = cfg.puntMode || 'off';
    const lockId = cfg.puntLock || '';
    let wts = null;
    if (mode !== 'off' || lockId) {
      if (lockId && strats.some(S => S.id === lockId)) wts = stratRes.map(r => r.S.id === lockId ? 1 : 0);
      else { const vmax = Math.max(...stratRes.filter(r => r.S.auto).map(r => r.V)); const e = stratRes.map(r => r.S.auto ? Math.exp((r.V - vmax) / tau) : 0); const es = e.reduce((a, b) => a + b, 0); wts = e.map(x => x / es); }
      const G = new Float64Array(L), GM = new Float64Array(L), GC = new Float64Array(L * NC);
      // only the strongest strategies get a full Gain pass (the rest carry negligible weight)
      const keep = new Set(wts.map((w, k) => [w, k]).sort((a, b) => b[0] - a[0]).slice(0, PUNT_TOPK).map(x => x[1]));
      wts = wts.map((w, k) => keep.has(k) && w >= 1e-4 ? w : 0);
      stratRes.forEach((r, k) => {
        if (wts[k] < 1e-4) return;
        const g = gainsFor(r.mu, r.v, r.slot1.mean, r.slot1.vr, r.slot1.pv, r.mask);
        for (let i = 0; i < L; i++) { G[i] += wts[k] * g.G[i]; GM[i] += wts[k] * g.GM[i]; }
        for (let i = 0; i < L * NC; i++) GC[i] += wts[k] * g.GC[i];
      });
      const ws = wts.reduce((a, b, k) => a + (b >= 1e-4 ? b : 0), 0) || 1;
      for (let i = 0; i < L; i++) { G[i] /= ws; GM[i] /= ws; } for (let i = 0; i < L * NC; i++) GC[i] /= ws;
      res0 = { G, GM, GC };
    }
    out.strategies = stratRes.map((r, k) => ({ id: r.S.id, label: r.S.label, punt: r.S.punt, size: r.S.size, auto: !!r.S.auto, V: r.V, catP: Array.from(r.catP), w: wts ? wts[k] : null })).sort((a, b) => b.V - a.V);
    out.puntActive = !!wts;
    for (let i = 0; i < L; i++) { const p = cand[i]; p.gain = res0.G[i]; p.gainM = res0.GM[i]; p.gainC = res0.GC.slice(i * NC, i * NC + NC); }

    // availability for my next two picks (1-based pick numbers)
    const cur1 = current + 1, p1n = p1 + 1, p2n = p2 != null ? p2 + 1 : null;
    for (const p of avail) {
      p.thereAt = availProb(p, cur1, p1n);
      p.lastsTo = p2n != null ? availProb(p, cur1, p2n) : null;
      p.lastsFromP1 = p2n != null ? availProb(p, p1n, p2n) : null;
      let safe = cur1, gone = null;
      for (let q = cur1; q <= total; q++) { const a = availProb(p, cur1, q); if (a >= 0.8) safe = q; if (gone == null && a <= 0.2) { gone = q; break; } }
      p.safeUntil = safe; p.goneBy = gone;
    }

    // ---------- scarcity ----------
    // Category: value lost in each category between the best players available now and the ones
    // likely left at your following pick. Position: lineup slots teams still need at each position
    // versus good players left who can fill them. Both are indexes with 1 = average.
    {
      const POS = ['PG', 'SG', 'SF', 'PF', 'C'];
      const NEED = { PG: 1.5, SG: 1.5, SF: 1.5, PF: 1.5, C: 2 };
      const cats = []; for (let c = 0; c < NC; c++) if (c !== TO || cfg.cats === 9) cats.push(c);
      const byVal = avail.slice().sort((a, b) => b.boardRaw - a.boardRaw);   // unweighted: weights only affect Zscore
      const gap = p2 != null ? Math.max(4, unfilled.indexOf(p2)) : N;
      // rank the players who will still be drafted by each category on its own
      const pool = byVal.slice(0, Math.max(gap + 20, Math.min(byVal.length, unfilled.length)));
      const drop = {}; let dsum = 0;
      cats.forEach(c => {
        const vals = pool.map(p => Math.max(0, p.boardC[c])).sort((a, b) => b - a);
        const mean = (a, b) => { const s = vals.slice(a, b); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; };
        drop[c] = Math.max(0.02, mean(0, 6) - mean(gap, gap + 6)); dsum += drop[c];
      });
      const catIdx = {}; cats.forEach(c => { catIdx[c] = drop[c] / (dsum / cats.length); });
      // positions: remaining need across all teams vs supply among the players who will be drafted
      const elig = p => { const ps = String(p.p || '').split('/').filter(x => NEED[x] != null); return ps.length ? ps : ['SF']; };
      const need = {}; POS.forEach(P => { need[P] = 0; });
      teams.forEach(T => {
        const have = {}; POS.forEach(P => { have[P] = 0; });
        T.roster.forEach(r => { const ps = elig(r.p); ps.forEach(P => { have[P] += 1 / ps.length; }); });
        POS.forEach(P => { need[P] += Math.max(0, NEED[P] - have[P]); });
      });
      const supply = {}; POS.forEach(P => { supply[P] = 0; });
      byVal.slice(0, Math.max(N, unfilled.length)).forEach(p => { const ps = elig(p); ps.forEach(P => { supply[P] += 1 / ps.length; }); });
      const ratio = {}; let rsum = 0;
      POS.forEach(P => { ratio[P] = (need[P] + 0.5) / Math.max(1, supply[P]); rsum += ratio[P]; });
      const posIdx = {}; POS.forEach(P => { posIdx[P] = ratio[P] / (rsum / POS.length); });
      out.scarcity = { catIdx, posIdx };
      // Separate settings and multipliers for category (Zscore) and position scarcity
      // Strength: Off 0%, Light 25%, Medium 50%, Strong 75%, Very strong 100% of the score
      const lamOf = v => ({ light: 0.25, medium: 0.5, strong: 0.75, vstrong: 1 })[v] || 0;
      const lamZ = lamOf(cfg.scarZ), lamP = lamOf(cfg.scarP);
      // taken players get scarcity too, so their stats still show when Hide taken is off
      for (const p of avail.concat([...taken].map(id => players[id]))) {
        let w = 0, ws = 0;
        cats.forEach(c => { const v = Math.max(0, p.boardC[c]); w += v * (catIdx[c] - 1); ws += v; });
        const sc = ws > 0 ? Math.max(-0.5, Math.min(0.5, w / ws)) : 0;
        const sp = Math.max(-0.5, Math.min(0.5, Math.max(...elig(p).map(P => posIdx[P])) - 1));
        p.scarCat = sc; p.scarPos = sp; p.scar = (sc + sp) / 2;
        p.scarMultZ = Math.max(0.5, Math.min(1.5, 1 + lamZ * sc));
        p.scarMultP = Math.max(0.5, Math.min(1.5, 1 + lamP * sp));
        p.scarMult = p.scarMultZ * p.scarMultP;
        // playoff boost (p.poMult, set by the page from the NBA schedule) stacks on top of scarcity
        const m = p.scarMult * (p.poMult || 1);
        if (m !== 1) {
          p.gain *= m; p.gainM *= m;
          if (p.gainC) for (let c = 0; c < NC; c++) p.gainC[c] *= m;
        }
      }
    }

    // model pick order: the chosen metric (Gain or Gain M) now plus what is likely left at the following pick
    // Zscore option: the Zscore version currently shown (0 / −1 / −2), same look-ahead in Zscore units
    if (cfg.orderBy === 'z') avail.forEach(p => { p.zSel = p.z[cfg.zdrop || 0] * (p.scarMult || 1) * (p.poMult || 1); });
    // The Model pick always uses Gain M (matchup win chance), whatever # order by is set to
    const mk = 'gainM';
    const ordKey = cfg.orderBy === 'gainM' ? 'gainM' : cfg.orderBy === 'z' ? 'zSel' : 'gain';
    // Value of planning to take him at your next pick = his metric × the chance he is still there.
    const there = p => (p.thereAt == null ? 1 : p.thereAt);
    const val = p => p[mk] * there(p);
    const byGain = avail.slice().sort((a, b) => val(b) - val(a));
    const K = Math.min(10, byGain.length);
    const backToBack = p2 != null && unfilled.indexOf(p2) === unfilled.indexOf(p1) + 1;
    byGain.forEach(p => { p.score = val(p); });
    if (p2 != null) {
      // look-ahead: best player likely left at the following pick if you take this one now
      const look = avail.slice().sort((a, b) => b[mk] - a[mk]).slice(0, 30);
      const tail = look.length ? look[look.length - 1][mk] : 0;
      for (let i = 0; i < K; i++) {
        const cand = byGain[i];
        let mass = 1, E = 0;
        for (const o of look) {
          if (o === cand) continue;
          const q = backToBack ? there(o) : (o.lastsTo == null ? 0 : o.lastsTo);
          E += mass * q * o[mk]; mass *= (1 - q);
          if (mass < 1e-4) break;
        }
        E += mass * tail;
        cand.score = there(cand) * (cand[mk] + E);
      }
    }
    // Model pick (under the hood): best expected value counting availability and the following pick.
    const top = byGain.slice(0, K).sort((a, b) => b.score - a.score);
    out.modelPick = top.length ? top[0].id : null;
    // The # column is a plain ranking by the chosen metric.
    const order = avail.slice().sort((a, b) => b[ordKey] - a[ordKey]);
    order.forEach((p, i) => { p.order = i + 1; });
    taken.forEach(id => { players[id].order = null; });
    out.order = order;
    return out;
  }

  const api = { strategiesFor, catWeights, CATS, NC, TO, WEEKS, prepPlayers, buildContext, evaluate, teamAt, adpOf, adpSd, Phi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(this);
